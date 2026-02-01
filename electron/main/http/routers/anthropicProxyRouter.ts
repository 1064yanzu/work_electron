/**
 * Anthropic 代理路由
 * 提供 Anthropic 兼容的 /v1/messages API，支持多 Provider 转发
 */
import type { Request, Response } from "express";
import { Router } from "express";
import { Readable } from "node:stream";
import type { DbContext } from "../../db/client";
import { type Logger } from "../../logging/types";
import { loggedFetch } from "../utils/loggedFetch";
import { resolveProviderApiKey } from "../../llm/invoke";
import {
	getOpenAICompatibleAuthHeaders,
	normalizeAnthropicBaseUrl,
	normalizeOpenAICompatibleBaseUrl,
} from "../../llm/providerHttp";

type AgentModelSettingsLike = {
	defaultModelId?: unknown;
	defaultProviderId?: unknown;
	scenarioConfigs?: unknown;
};

type ScenarioModelConfigLike = {
	scenario?: unknown;
	customName?: unknown;
	modelId?: unknown;
	providerId?: unknown;
	enabled?: unknown;
};

const IPO_SUBAGENT_MARKER_RE =
	/<ipo-subagent\b[^>]*scenario="([^"]+)"[^>]*\/>/i;
const IPO_CONVERSATION_MARKER_RE =
	/<ipo-conversation\b[^>]*id="([^"]+)"[^>]*\/>/i;
const IPO_MARKERS_STRIP_RE = /<ipo-(?:subagent|conversation)\b[^>]*\/>/gi;

function coerceString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const s = value.trim();
	return s ? s : null;
}

function collectStringsFromUnknown(
	value: unknown,
	out: string[],
	opts?: { depth?: number; maxDepth?: number; maxItems?: number },
) {
	const depth = opts?.depth ?? 0;
	const maxDepth = opts?.maxDepth ?? 6;
	const maxItems = opts?.maxItems ?? 200;
	if (out.length >= maxItems) return;
	if (depth > maxDepth) return;

	if (typeof value === "string") {
		const s = value.trim();
		if (s) out.push(s);
		return;
	}
	if (!value || typeof value !== "object") return;

	if (Array.isArray(value)) {
		for (const v of value) {
			if (out.length >= maxItems) return;
			collectStringsFromUnknown(v, out, {
				depth: depth + 1,
				maxDepth,
				maxItems,
			});
		}
		return;
	}

	for (const v of Object.values(value as Record<string, unknown>)) {
		if (out.length >= maxItems) return;
		collectStringsFromUnknown(v, out, { depth: depth + 1, maxDepth, maxItems });
	}
}

function collectAnthropicRequestText(
	req: AnthropicRequest,
	opts?: { tailMessages?: number; includeToolUseInputs?: boolean },
): string {
	const chunks: string[] = [];
	const includeToolUseInputs = opts?.includeToolUseInputs === true;
	const sys = (req as any)?.system;
	if (typeof sys === "string" && sys.trim()) chunks.push(sys);
	if (Array.isArray(sys)) {
		for (const b of sys) {
			if (b && typeof b === "object" && (b as any).type === "text") {
				const t = coerceString((b as any).text);
				if (t) chunks.push(t);
			}
		}
	}

	const messagesAll = Array.isArray(req.messages) ? req.messages : [];
	const tail =
		typeof opts?.tailMessages === "number" && opts.tailMessages > 0
			? Math.floor(opts.tailMessages)
			: 0;
	const messages =
		tail > 0 && messagesAll.length > tail
			? messagesAll.slice(-tail)
			: messagesAll;
	for (const m of messages) {
		const content = (m as any)?.content;
		if (typeof content === "string") {
			const t = coerceString(content);
			if (t) chunks.push(t);
			continue;
		}
		if (!Array.isArray(content)) continue;
		for (const block of content) {
			if (!block || typeof block !== "object") continue;
			const type = String((block as any).type || "");
			if (type === "text") {
				const t = coerceString((block as any).text);
				if (t) chunks.push(t);
				continue;
			}
			// 子代理场景标记通常会出现在工具调用（如 Task）的 input/prompt 内，
			// 因此这里也收集 tool_use block 的 input 中的字符串，供场景解析使用。
			if (includeToolUseInputs && type === "tool_use") {
				const name = coerceString((block as any).name);
				if (name) chunks.push(name);
				if ((block as any).input) {
					collectStringsFromUnknown((block as any).input, chunks, {
						maxDepth: 6,
						maxItems: 300,
					});
				}
			}
		}
	}

	return chunks.join("\n");
}

function extractIpoSubagentScenario(req: AnthropicRequest): string | null {
	// 只看 system + 最近几条消息，避免历史消息里的标记“泄漏”导致后续请求被错误覆盖模型。
	const haystack = collectAnthropicRequestText(req, {
		tailMessages: 3,
		includeToolUseInputs: true,
	});
	const match = haystack.match(IPO_SUBAGENT_MARKER_RE);
	const scenario = match?.[1] ? String(match[1]).trim() : "";
	return scenario ? scenario : null;
}

function extractIpoConversationId(req: AnthropicRequest): string | null {
	const haystack = collectAnthropicRequestText(req, { tailMessages: 3 });
	const match = haystack.match(IPO_CONVERSATION_MARKER_RE);
	const id = match?.[1] ? String(match[1]).trim() : "";
	return id ? id : null;
}

function stripIpoMarkersFromString(input: string): string {
	// Remove internal routing/log markers so they don't pollute upstream context.
	return String(input || "").replaceAll(IPO_MARKERS_STRIP_RE, "");
}

function stripIpoMarkersFromUnknown(value: unknown): unknown {
	if (typeof value === "string") return stripIpoMarkersFromString(value);
	if (!value || typeof value !== "object") return value;
	if (Array.isArray(value))
		return value.map((v) => stripIpoMarkersFromUnknown(v));
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		out[k] = stripIpoMarkersFromUnknown(v);
	}
	return out;
}

function stripIpoMarkersFromAnthropicRequest(
	req: AnthropicRequest,
): AnthropicRequest {
	const next: AnthropicRequest = {
		...req,
		messages: Array.isArray(req.messages) ? [...req.messages] : [],
	};

	const sys = (req as any)?.system;
	if (typeof sys === "string") {
		(next as any).system = stripIpoMarkersFromString(sys);
	} else if (Array.isArray(sys)) {
		(next as any).system = sys.map((b: any) => {
			if (
				b &&
				typeof b === "object" &&
				b.type === "text" &&
				typeof b.text === "string"
			) {
				return { ...b, text: stripIpoMarkersFromString(b.text) };
			}
			return b;
		});
	}

	next.messages = (Array.isArray(req.messages) ? req.messages : []).map((m) => {
		const content = (m as any)?.content;
		if (typeof content === "string") {
			return { ...m, content: stripIpoMarkersFromString(content) } as any;
		}
		if (!Array.isArray(content)) return m;
		const cleaned = content.map((block: any) => {
			if (!block || typeof block !== "object") return block;
			if (block.type === "text" && typeof block.text === "string") {
				return { ...block, text: stripIpoMarkersFromString(block.text) };
			}
			if (block.type === "tool_use" && block.input) {
				return { ...block, input: stripIpoMarkersFromUnknown(block.input) };
			}
			return block;
		});
		return { ...m, content: cleaned } as any;
	});

	return next;
}

function pickScenarioModelChoice(
	settings: AgentModelSettingsLike | null,
	scenario: string,
): { modelId: string; providerId?: string } | null {
	if (!settings) return null;
	const requestedScenario = scenario.trim();
	const requestedCustomName = requestedScenario.startsWith("custom:")
		? requestedScenario.slice("custom:".length).trim()
		: requestedScenario;
	const configs = Array.isArray(settings.scenarioConfigs)
		? (settings.scenarioConfigs as ScenarioModelConfigLike[])
		: [];
	for (const c of configs) {
		if (!c || typeof c !== "object") continue;
		const enabled = (c as any).enabled;
		if (enabled === false) continue;

		const configuredScenario = String((c as any).scenario || "").trim();
		const configuredCustomName = coerceString((c as any).customName);

		const scenarioMatched =
			configuredScenario === requestedScenario ||
			// 允许通过 customName 直接引用自定义场景（用于 <ipo-subagent scenario="xxx" />）
			(configuredScenario === "custom" &&
				configuredCustomName &&
				configuredCustomName === requestedCustomName);

		if (!scenarioMatched) continue;
		const modelId = coerceString((c as any).modelId);
		if (!modelId) continue;
		const providerId = coerceString((c as any).providerId) || undefined;
		return { modelId, providerId };
	}
	const fallbackModelId = coerceString(settings.defaultModelId);
	if (!fallbackModelId) return null;
	const fallbackProviderId =
		coerceString(settings.defaultProviderId) || undefined;
	return { modelId: fallbackModelId, providerId: fallbackProviderId };
}

function estimateTokensFromText(text: string): number {
	const s = String(text || "");
	if (!s.trim()) return 0;
	// Rough heuristic:
	// - CJK characters are often close to 1 token each
	// - Other characters average ~4 chars/token
	const cjkMatches = s.match(/[\u4E00-\u9FFF]/g);
	const cjkCount = cjkMatches ? cjkMatches.length : 0;
	const otherCount = Math.max(0, s.length - cjkCount);
	return cjkCount + Math.ceil(otherCount / 4);
}

function estimateAnthropicInputTokens(req: Partial<AnthropicRequest>): number {
	const pieces: string[] = [];
	const text = collectAnthropicRequestText(req as AnthropicRequest);
	if (text) pieces.push(text);
	if (Array.isArray(req.tools)) {
		for (const t of req.tools) {
			if (!t) continue;
			if (typeof (t as any).name === "string")
				pieces.push(String((t as any).name));
			if (typeof (t as any).description === "string")
				pieces.push(String((t as any).description));
			if ((t as any).input_schema) {
				try {
					pieces.push(JSON.stringify((t as any).input_schema));
				} catch {
					// ignore
				}
			}
		}
	}
	return estimateTokensFromText(pieces.join("\n"));
}

let cachedAgentModelSettings: { loadedAt: number; settings: any } | null = null;
const AGENT_MODEL_SETTINGS_CACHE_TTL_MS = 5_000;

async function loadAgentModelSettings(db: DbContext): Promise<any | null> {
	const now = Date.now();
	if (
		cachedAgentModelSettings &&
		now - cachedAgentModelSettings.loadedAt < AGENT_MODEL_SETTINGS_CACHE_TTL_MS
	) {
		return cachedAgentModelSettings.settings;
	}

	const rows = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ?`,
		args: ["agent.model_settings"],
	});
	const raw = rows.rows.length > 0 ? (rows.rows[0].value as unknown) : null;

	let parsed: any = null;
	try {
		if (typeof raw === "string") parsed = JSON.parse(raw);
		else if (raw && typeof raw === "object") parsed = raw;
	} catch {
		parsed = null;
	}

	cachedAgentModelSettings = { loadedAt: now, settings: parsed };
	return parsed;
}

async function resolveSubagentScenarioModel(opts: {
	db: DbContext;
	anthropicReq: AnthropicRequest;
	currentModel: string;
	logger?: Logger;
	requestId?: string;
}): Promise<{ modelId: string; providerId?: string } | null> {
	const scenario = extractIpoSubagentScenario(opts.anthropicReq);
	if (!scenario) return null;

	const settings = (await loadAgentModelSettings(
		opts.db,
	)) as AgentModelSettingsLike;
	const choice = pickScenarioModelChoice(settings, scenario);
	if (!choice?.modelId) return null;
	if (choice.modelId === opts.currentModel) return null;

	opts.logger?.info({
		msg: "anthropic proxy: subagent scenario model override",
		requestId: opts.requestId,
		scenario,
		currentModel: opts.currentModel,
		overrideModel: choice.modelId,
		overrideProviderId: choice.providerId,
	});

	return choice;
}

// 内存文件存储（重启丢失）
const fileStore = new Map<
	string,
	{
		id: string;
		filename?: string;
		media_type?: string;
		size_bytes: number;
		content: Buffer;
		created_at: number;
	}
>();

interface AnthropicMessage {
	role: string;
	content:
	| string
	| Array<{
		type: string;
		text?: string;
		id?: string;
		name?: string;
		input?: unknown;
		tool_use_id?: string;
	}>;
}

interface AnthropicRequest {
	model: string;
	messages: AnthropicMessage[];
	system?: string | Array<{ type: string; text: string }>;
	tools?: Array<{ name: string; description: string; input_schema?: unknown }>;
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
}

/**
 * 创建 Anthropic 代理路由
 */
export function createAnthropicProxyRouter(options?: {
	db?: DbContext;
	logger?: Logger;
}) {
	const router = Router();
	const { db, logger } = options || {};

	// 健康检查
	router.get("/health", (_req: Request, res: Response) => {
		res.json({ ok: true, service: "anthropic-proxy", ts: Date.now() });
	});

	// 模型列表
	router.get("/models", async (_req: Request, res: Response) => {
		try {
			const models: Array<{ type: string; id: string; display_name: string }> =
				[];

			if (db) {
				const rows = await db.client.execute(
					`SELECT models FROM providers WHERE is_enabled = 1`,
				);
				const modelSet = new Set<string>();
				for (const row of rows.rows) {
					try {
						const providerModels = JSON.parse(
							(row.models as string) || "[]",
						) as string[];
						for (const m of providerModels) {
							modelSet.add(m);
						}
					} catch {
						// ignore
					}
				}
				for (const m of modelSet) {
					models.push({ type: "model", id: m, display_name: m });
				}
			} else {
				// 默认模型列表
				models.push(
					{ type: "model", id: "gpt-4o", display_name: "GPT-4o" },
					{ type: "model", id: "gpt-4-turbo", display_name: "GPT-4 Turbo" },
				);
			}

			res.json({ data: models, has_more: false });
		} catch (error) {
			res
				.status(500)
				.json({ error: { type: "api_error", message: String(error) } });
		}
	});

	// 模型详情
	router.get("/models/:id", (req: Request, res: Response) => {
		res.json({
			type: "model",
			id: req.params.id,
			display_name: req.params.id,
			max_tokens: 8192,
		});
	});

	// Token 计数（占位）
	router.post("/messages/count_tokens", (req: Request, res: Response) => {
		try {
			const payload = (req.body || {}) as Partial<AnthropicRequest>;
			const inputTokens = estimateAnthropicInputTokens(payload);
			res.json({ input_tokens: inputTokens });
		} catch {
			res.json({ input_tokens: 0 });
		}
	});

	// Files API
	router.get("/files", (_req: Request, res: Response) => {
		const files = Array.from(fileStore.values()).map((f) => ({
			type: "file",
			id: f.id,
			filename: f.filename,
			media_type: f.media_type,
			size_bytes: f.size_bytes,
			created_at: f.created_at,
		}));
		res.json({ data: files, has_more: false });
	});

	router.post("/files", (_req: Request, res: Response) => {
		// 简化处理：从 body 中读取文件
		const id = `file_${crypto.randomUUID()}`;
		const now = Date.now();

		// 这里应该处理 multipart/form-data，暂时简化
		const file = {
			id,
			filename: "upload",
			media_type: "application/octet-stream",
			size_bytes: 0,
			content: Buffer.from([]),
			created_at: now,
		};
		fileStore.set(id, file);

		res.json({
			type: "file",
			id,
			filename: file.filename,
			media_type: file.media_type,
			size_bytes: file.size_bytes,
			created_at: file.created_at,
		});
	});

	router.get("/files/:id", (req: Request<{ id: string }>, res: Response) => {
		const file = fileStore.get(req.params.id);
		if (!file) {
			return res
				.status(404)
				.json({ error: { type: "not_found", message: "File not found" } });
		}
		res.json({
			type: "file",
			id: file.id,
			filename: file.filename,
			media_type: file.media_type,
			size_bytes: file.size_bytes,
			created_at: file.created_at,
		});
	});

	router.get(
		"/files/:id/content",
		(req: Request<{ id: string }>, res: Response) => {
			const file = fileStore.get(req.params.id);
			if (!file) {
				return res
					.status(404)
					.json({ error: { type: "not_found", message: "File not found" } });
			}
			res.setHeader("Content-Type", "application/binary");
			res.send(file.content);
		},
	);

	router.delete("/files/:id", (req: Request<{ id: string }>, res: Response) => {
		const existed = fileStore.has(req.params.id);
		fileStore.delete(req.params.id);
		if (existed) {
			res.json({ id: req.params.id, deleted: true });
		} else {
			res
				.status(404)
				.json({ error: { type: "not_found", message: "File not found" } });
		}
	});

	// 核心：消息 API
	router.post("/messages", async (req: Request, res: Response) => {
		const anthropicReq = req.body as AnthropicRequest;
		const requestId =
			(typeof (req as any).requestId === "string" && (req as any).requestId) ||
			(typeof req.headers["x-request-id"] === "string" &&
				req.headers["x-request-id"]) ||
			undefined;
		const conversationId =
			(typeof req.headers["x-conversation-id"] === "string" &&
				req.headers["x-conversation-id"].trim()) ||
			extractIpoConversationId(anthropicReq) ||
			undefined;

		if (!db) {
			return res.status(501).json({
				error: {
					type: "not_implemented",
					message: "Database not available for proxy",
				},
			});
		}

		try {
			logger?.info({
				msg: "anthropic proxy request",
				model: anthropicReq.model,
			});

			// 0. 清理内部标记，避免把路由/日志 marker 传给上游 Provider 造成上下文污染
			const cleanedReq = stripIpoMarkersFromAnthropicRequest(anthropicReq);

			// 1. 确定模型
			let model = anthropicReq.model;
			if (!model) {
				const activeRows = await db.client.execute({
					sql: `SELECT value FROM app_config WHERE key = 'active_model'`,
					args: [],
				});
				model =
					activeRows.rows.length > 0
						? (activeRows.rows[0].value as string)
						: "gpt-4o";
			}

			// 1.5 子代理模型策略：通过 subagent prompt 标记映射到用户设置页的场景模型
			// 主模型始终以请求里携带的 model 为准（即用户在输入框选择的模型）。
			const subagentChoice = await resolveSubagentScenarioModel({
				db,
				anthropicReq,
				currentModel: model,
				logger,
				requestId,
			});
			if (subagentChoice?.modelId) {
				model = subagentChoice.modelId;
			}

			// 2. 查找 Provider
			const providerRows = await db.client.execute(
				`SELECT * FROM providers WHERE is_enabled = 1`,
			);
			let provider: {
				id: string;
				provider_type: string;
				api_key?: string;
				api_base?: string;
			} | null = null;

			if (subagentChoice?.providerId) {
				const forced = providerRows.rows.find(
					(r) => String((r as any).id) === subagentChoice.providerId,
				) as any;
				if (forced) {
					provider = {
						id: String(forced.id),
						provider_type: String(forced.provider_type),
						api_key: forced.api_key ? String(forced.api_key) : undefined,
						api_base: forced.api_base ? String(forced.api_base) : undefined,
					};
				} else {
					logger?.warn({
						msg: "anthropic proxy: scenario provider override not found/enabled; falling back to model-based resolution",
						requestId,
						overrideProviderId: subagentChoice.providerId,
						model,
					});
				}
			}

			if (!provider) {
				for (const row of providerRows.rows) {
					const models = JSON.parse((row.models as string) || "[]") as string[];
					if (models.includes(model)) {
						provider = {
							id: row.id as string,
							provider_type: row.provider_type as string,
							api_key: row.api_key as string | undefined,
							api_base: row.api_base as string | undefined,
						};
						break;
					}
				}
			}

			if (!provider) {
				return res.status(400).json({
					error: {
						type: "invalid_request_error",
						message: `No enabled provider found for model: ${model}`,
					},
				});
			}

			// 3. 构建请求并调用
			const resolvedApiKey = await resolveProviderApiKey(
				db,
				provider.id,
				provider.api_key,
			);

			if (anthropicReq.stream) {
				// SSE 流式响应（真实流式转发/翻译）
				res.setHeader("Content-Type", "text/event-stream");
				res.setHeader("Cache-Control", "no-cache");
				res.setHeader("Connection", "keep-alive");
				await callProviderStream(
					{ ...provider, api_key: resolvedApiKey },
					model,
					cleanedReq,
					res,
					logger,
					requestId,
					conversationId,
				);
				return;
			}

			// 4. 返回响应（非流式）
			const result = await callProvider(
				{ ...provider, api_key: resolvedApiKey },
				model,
				cleanedReq,
				logger,
				requestId,
				conversationId,
			);
			res.json(result);
		} catch (error) {
			logger?.error({ msg: "anthropic proxy error", error: String(error) });
			res.status(500).json({
				error: {
					type: "api_error",
					message: error instanceof Error ? error.message : String(error),
				},
			});
		}
	});

	return router;
}

/**
 * 调用 Provider API
 */
async function callProvider(
	provider: { provider_type: string; api_key?: string; api_base?: string },
	model: string,
	anthropicReq: AnthropicRequest,
	logger?: Logger,
	requestId?: string,
	conversationId?: string,
): Promise<AnthropicResponse> {
	const messageId = `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (provider.provider_type === "anthropic") {
		// 直接转发到 Anthropic
		const baseUrl = normalizeAnthropicBaseUrl(
			provider.api_base,
			"https://api.anthropic.com",
		);
		headers["x-api-key"] = provider.api_key || "";
		headers["anthropic-version"] = "2023-06-01";

		const response = await loggedFetch(
			`${baseUrl}/v1/messages`,
			{
				method: "POST",
				headers,
				// Non-streaming request: forward as-is to keep Anthropic response shape intact.
				body: JSON.stringify({ ...anthropicReq, model, stream: false }),
			},
			{
				logger,
				requestId,
				conversationId,
				service: "anthropic-proxy:upstream",
				readResponseBody: false,
			},
		);

		if (!response.ok) {
			throw new Error(`Anthropic API error: ${response.status}`);
		}

		return (await response.json()) as AnthropicResponse;
	}

	// OpenAI 兼容调用
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		provider,
		"https://api.openai.com",
	);
	Object.assign(
		headers,
		getOpenAICompatibleAuthHeaders(provider, provider.api_key),
	);

	// 转换 Anthropic 请求为 OpenAI 格式
	const openaiMessages = translateToOpenAI(anthropicReq);

	// Log tool conversion for debugging
	if (anthropicReq.tools?.length) {
		logger?.info({
			msg: "anthropic proxy: converting tools to OpenAI format",
			toolCount: anthropicReq.tools.length,
			toolNames: anthropicReq.tools.map((t) => t.name),
		});

		// Log each tool's schema for debugging
		for (const tool of anthropicReq.tools) {
			logger?.info({
				msg: "anthropic proxy: tool schema",
				name: tool.name,
				description: tool.description,
				hasInputSchema: !!tool.input_schema,
				inputSchema: tool.input_schema,
			});
		}
	}

	const openaiReq = {
		model,
		messages: openaiMessages,
		temperature: anthropicReq.temperature ?? 0.7,
		max_tokens: anthropicReq.max_tokens ?? 4096,
		tools: anthropicReq.tools?.map((t) => {
			// Ensure input_schema is a valid JSON Schema for OpenAI
			// If no schema is provided, create a proper default with properties
			const inputSchema = t.input_schema || {
				type: "object",
				properties: {},
				additionalProperties: true,
			};

			// Validate schema has required JSON Schema fields
			const validatedSchema = {
				type: "object",
				...inputSchema,
				// Ensure properties exists (required by OpenAI)
				properties: (inputSchema as any).properties || {},
			};

			return {
				type: "function" as const,
				function: {
					name: t.name,
					description: t.description,
					parameters: validatedSchema,
				},
			};
		}),
		tool_choice: anthropicReq.tools?.length ? "auto" : undefined,
		// Force streaming upstream; we will aggregate to JSON for the caller.
		stream: true,
		stream_options: { include_usage: true },
	};

	// Log final OpenAI request
	logger?.info({
		msg: "anthropic proxy: sending to provider",
		model: openaiReq.model,
		messageCount: openaiReq.messages.length,
		hasTools: !!openaiReq.tools,
		toolCount: openaiReq.tools?.length || 0,
	});

	const response = await loggedFetch(
		`${baseUrl}/chat/completions`,
		{
			method: "POST",
			headers,
			body: JSON.stringify(openaiReq),
		},
		{
			logger,
			requestId,
			conversationId,
			service: "anthropic-proxy:upstream",
			readResponseBody: false,
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		logger?.error({
			msg: "anthropic proxy: OpenAI API error",
			status: response.status,
			error: errorText,
		});
		throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
	}

	const contentType = String(response.headers.get("content-type") || "");
	const openaiResp =
		contentType.includes("text/event-stream") && response.body
			? await readOpenAIChatCompletionsStreamAsJson(response.body)
			: ((await response.json()) as OpenAIResponse);

	// Log response for debugging
	logger?.info({
		msg: "anthropic proxy: received OpenAI response",
		choiceCount: openaiResp.choices?.length || 0,
		finishReason: openaiResp.choices?.[0]?.finish_reason,
		hasContent: !!openaiResp.choices?.[0]?.message?.content,
		hasToolCalls: !!openaiResp.choices?.[0]?.message?.tool_calls?.length,
		toolCallCount: openaiResp.choices?.[0]?.message?.tool_calls?.length || 0,
	});

	// 转换回 Anthropic 格式
	return translateToAnthropic(messageId, model, openaiResp);
}

function writeSseEvent(res: Response, event: string, data: unknown) {
	res.write(`event: ${event}\n`);
	res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function emitToolUseBlock(
	res: Response,
	opts: { index: number; id: string; name: string; input: unknown },
) {
	// Emit tool_use with input carried via input_json_delta (SDK expects this shape).
	writeSseEvent(res, "content_block_start", {
		type: "content_block_start",
		index: opts.index,
		content_block: {
			type: "tool_use",
			id: opts.id,
			name: opts.name,
			input: {},
		},
	});

	writeSseEvent(res, "content_block_delta", {
		type: "content_block_delta",
		index: opts.index,
		delta: {
			type: "input_json_delta",
			partial_json: JSON.stringify(opts.input ?? {}),
		},
	});

	writeSseEvent(res, "content_block_stop", {
		type: "content_block_stop",
		index: opts.index,
	});
}

async function readSseStream(
	body: ReadableStream<Uint8Array>,
	onData: (data: string) => void | Promise<void>,
) {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		while (true) {
			const idx = buffer.indexOf("\n\n");
			if (idx === -1) break;
			const raw = buffer.slice(0, idx);
			buffer = buffer.slice(idx + 2);
			const lines = raw.split(/\r?\n/);
			const dataLines = lines
				.filter((l) => l.startsWith("data:"))
				.map((l) => l.slice("data:".length).trimStart());
			const data = dataLines.join("\n").trim();
			if (data) await onData(data);
		}
	}
	const tail = buffer.trim();
	if (tail) {
		const lines = tail.split(/\r?\n/);
		const dataLines = lines
			.filter((l) => l.startsWith("data:"))
			.map((l) => l.slice("data:".length).trimStart());
		const data = dataLines.join("\n").trim();
		if (data) await onData(data);
	}
}

async function readOpenAIChatCompletionsStreamAsJson(
	body: ReadableStream<Uint8Array>,
): Promise<OpenAIResponse> {
	let role: "assistant" | "user" | "system" | "tool" = "assistant";
	let content = "";
	let finishReason = "stop";
	let usage:
		| {
			prompt_tokens: number;
			completion_tokens: number;
			total_tokens: number;
		}
		| undefined;

	const toolCalls = new Map<
		number,
		{ id?: string; name?: string; args: string }
	>();
	let legacyFunctionCall: { name?: string; args: string } | null = null;

	await readSseStream(body, async (data) => {
		if (data === "[DONE]") return;
		let parsed: any = null;
		try {
			parsed = JSON.parse(data);
		} catch {
			return;
		}

		if (parsed?.usage) usage = parsed.usage;

		const choice = parsed?.choices?.[0];
		if (!choice) return;
		if (choice.finish_reason) finishReason = String(choice.finish_reason);

		const delta = choice.delta || {};
		if (typeof delta.role === "string") {
			const r = delta.role as any;
			if (r === "assistant" || r === "user" || r === "system" || r === "tool") {
				role = r;
			}
		}
		if (typeof delta.content === "string") content += delta.content;

		if (Array.isArray(delta.tool_calls)) {
			for (const tc of delta.tool_calls) {
				const idx = typeof tc?.index === "number" ? tc.index : 0;
				const existing = toolCalls.get(idx) || { args: "" };
				if (typeof tc?.id === "string" && tc.id) existing.id = tc.id;
				if (typeof tc?.function?.name === "string" && tc.function.name)
					existing.name = tc.function.name;
				if (
					typeof tc?.function?.arguments === "string" &&
					tc.function.arguments
				) {
					existing.args += tc.function.arguments;
				}
				toolCalls.set(idx, existing);
			}
		}

		// Legacy function_call format (some OpenAI-compatible providers still emit this).
		if (delta.function_call && typeof delta.function_call === "object") {
			if (!legacyFunctionCall) legacyFunctionCall = { args: "" };
			if (
				typeof delta.function_call.name === "string" &&
				delta.function_call.name
			)
				legacyFunctionCall.name = delta.function_call.name;
			if (
				typeof delta.function_call.arguments === "string" &&
				delta.function_call.arguments
			) {
				legacyFunctionCall.args += delta.function_call.arguments;
			}
		}
	});

	const tool_calls: OpenAIToolCall[] = Array.from(toolCalls.entries())
		.sort(([a], [b]) => a - b)
		.map(([, v], i) => ({
			id: v.id || `call_${i}`,
			type: "function" as const,
			function: { name: v.name || "unknown", arguments: v.args || "{}" },
		}));

	let function_call: OpenAIResponse["choices"][0]["message"]["function_call"] =
		undefined;
	const legacy = legacyFunctionCall as { name?: string; args: string } | null;
	if (tool_calls.length === 0 && legacy) {
		function_call = {
			name: legacy.name || "unknown",
			arguments: legacy.args || "{}",
		};
	}

	return {
		choices: [
			{
				message: {
					role,
					content: content.length > 0 ? content : null,
					tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
					function_call,
				},
				finish_reason: finishReason,
			},
		],
		usage,
	};
}

export async function readAnthropicMessageStreamAsJson(
	body: ReadableStream<Uint8Array>,
	opts: { fallbackId: string; fallbackModel: string },
): Promise<AnthropicResponse> {
	let id = opts.fallbackId;
	let model = opts.fallbackModel;
	let stopReason: AnthropicResponse["stop_reason"] = "end_turn";
	let inputTokens = 0;
	let outputTokens = 0;

	const textByIndex = new Map<number, string>();
	const toolByIndex = new Map<
		number,
		{ id: string; name: string; inputJson: string }
	>();
	const content: AnthropicResponse["content"] = [];

	const flushIndex = (index: number) => {
		if (toolByIndex.has(index)) {
			const tool = toolByIndex.get(index)!;
			let input: unknown = {};
			try {
				input = JSON.parse(tool.inputJson || "{}");
			} catch {
				input = tool.inputJson ? { _raw: tool.inputJson } : {};
			}
			content.push({ type: "tool_use", id: tool.id, name: tool.name, input });
			toolByIndex.delete(index);
			return;
		}
		if (textByIndex.has(index)) {
			content.push({ type: "text", text: textByIndex.get(index) || "" });
			textByIndex.delete(index);
		}
	};

	await readSseStream(body, async (data) => {
		let evt: any = null;
		try {
			evt = JSON.parse(data);
		} catch {
			return;
		}
		const t = String(evt?.type || "");
		if (t === "message_start" && evt?.message) {
			if (typeof evt.message.id === "string") id = evt.message.id;
			if (typeof evt.message.model === "string") model = evt.message.model;
			const usage0 = evt.message.usage;
			if (usage0 && typeof usage0.input_tokens === "number")
				inputTokens = usage0.input_tokens;
			return;
		}
		if (t === "content_block_start") {
			const idx = Number(evt.index);
			if (!Number.isFinite(idx)) return;
			const block = evt.content_block || {};
			if (block.type === "text") {
				textByIndex.set(idx, "");
				return;
			}
			if (block.type === "tool_use") {
				toolByIndex.set(idx, {
					id: String(block.id || ""),
					name: String(block.name || ""),
					inputJson: "",
				});
			}
			return;
		}
		if (t === "content_block_delta") {
			const idx = Number(evt.index);
			if (!Number.isFinite(idx)) return;
			const delta = evt.delta || {};
			if (delta.type === "text_delta" && typeof delta.text === "string") {
				textByIndex.set(idx, (textByIndex.get(idx) || "") + delta.text);
				return;
			}
			if (
				delta.type === "input_json_delta" &&
				typeof delta.partial_json === "string"
			) {
				const tool = toolByIndex.get(idx);
				if (!tool) return;
				tool.inputJson += delta.partial_json;
				toolByIndex.set(idx, tool);
				return;
			}
			return;
		}
		if (t === "content_block_stop") {
			const idx = Number(evt.index);
			if (!Number.isFinite(idx)) return;
			flushIndex(idx);
			return;
		}
		if (t === "message_delta") {
			const sr = evt?.delta?.stop_reason;
			if (sr === "end_turn" || sr === "tool_use" || sr === "max_tokens") {
				stopReason = sr;
			}
			const usageN = evt?.usage;
			if (usageN && typeof usageN.output_tokens === "number")
				outputTokens = usageN.output_tokens;
			return;
		}
	});

	// Flush any remaining blocks in index order.
	const remainingIndexes = Array.from(
		new Set([...textByIndex.keys(), ...toolByIndex.keys()]),
	).sort((a, b) => a - b);
	for (const idx of remainingIndexes) flushIndex(idx);

	return {
		id,
		type: "message",
		role: "assistant",
		content,
		model,
		stop_reason: stopReason,
		usage: { input_tokens: inputTokens, output_tokens: outputTokens },
	};
}

async function callProviderStream(
	provider: { provider_type: string; api_key?: string; api_base?: string },
	model: string,
	anthropicReq: AnthropicRequest,
	res: Response,
	logger?: Logger,
	requestId?: string,
	conversationId?: string,
): Promise<void> {
	const messageId = `msg_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

	// Direct Anthropic: proxy SSE as-is
	if (provider.provider_type === "anthropic") {
		const baseUrl = normalizeAnthropicBaseUrl(
			provider.api_base,
			"https://api.anthropic.com",
		);
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"x-api-key": provider.api_key || "",
			"anthropic-version": "2023-06-01",
		};

		const upstream = await loggedFetch(
			`${baseUrl}/v1/messages`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({ ...anthropicReq, model, stream: true }),
			},
			{
				logger,
				requestId,
				conversationId,
				service: "anthropic-proxy:upstream-stream",
				readResponseBody: false,
			},
		);

		if (!upstream.ok) {
			const errorText = await upstream.text();
			logger?.error({
				msg: "anthropic proxy: upstream anthropic stream error",
				status: upstream.status,
				error: errorText,
			});
			writeSseEvent(res, "error", {
				type: "error",
				error: { type: "api_error", message: errorText || "Upstream error" },
			});
			res.end();
			return;
		}
		if (!upstream.body) {
			writeSseEvent(res, "error", {
				type: "error",
				error: { type: "api_error", message: "No upstream body" },
			});
			res.end();
			return;
		}

		// Pipe bytes through (SSE format already correct)
		const nodeStream = Readable.fromWeb(upstream.body as any);
		await new Promise<void>((resolve, reject) => {
			nodeStream.on("error", reject);
			res.on("close", resolve);
			nodeStream.on("end", resolve);
			nodeStream.pipe(res, { end: true });
		});
		return;
	}

	// OpenAI-compatible: stream chat completions and translate to Anthropic SSE
	const openaiMessages = translateToOpenAI(anthropicReq);
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		provider,
		"https://api.openai.com",
	);
	Object.assign(
		headers,
		getOpenAICompatibleAuthHeaders(provider, provider.api_key),
	);

	const openaiReq = {
		model,
		messages: openaiMessages,
		temperature: anthropicReq.temperature ?? 0.7,
		max_tokens: anthropicReq.max_tokens ?? 4096,
		tools: anthropicReq.tools?.map((t) => {
			const inputSchema = t.input_schema || {
				type: "object",
				properties: {},
				additionalProperties: true,
			};
			const validatedSchema = {
				type: "object",
				...inputSchema,
				properties: (inputSchema as any).properties || {},
			};
			return {
				type: "function" as const,
				function: {
					name: t.name,
					description: t.description,
					parameters: validatedSchema,
				},
			};
		}),
		tool_choice: anthropicReq.tools?.length ? "auto" : undefined,
		stream: true,
		stream_options: { include_usage: true },
	};

	logger?.info({
		msg: "anthropic proxy: streaming via openai-compatible provider",
		model,
		messageCount: openaiMessages.length,
		hasTools: !!openaiReq.tools,
		toolCount: openaiReq.tools?.length || 0,
	});

	const upstream = await loggedFetch(
		`${baseUrl}/chat/completions`,
		{
			method: "POST",
			headers,
			body: JSON.stringify(openaiReq),
		},
		{
			logger,
			requestId,
			conversationId,
			service: "anthropic-proxy:upstream-stream",
			readResponseBody: false,
		},
	);

	if (!upstream.ok) {
		const errorText = await upstream.text();
		logger?.error({
			msg: "anthropic proxy: openai stream error",
			status: upstream.status,
			error: errorText,
		});
		writeSseEvent(res, "error", {
			type: "error",
			error: { type: "api_error", message: errorText || "Upstream error" },
		});
		res.end();
		return;
	}
	if (!upstream.body) {
		writeSseEvent(res, "error", {
			type: "error",
			error: { type: "api_error", message: "No upstream body" },
		});
		res.end();
		return;
	}

	const contentType = String(upstream.headers.get("content-type") || "");
	if (!contentType.includes("text/event-stream")) {
		// Provider doesn't actually stream; fallback to non-stream and emit a single delta.
		let openaiResp: OpenAIResponse | null = null;
		try {
			openaiResp = (await upstream.json()) as OpenAIResponse;
		} catch (e) {
			writeSseEvent(res, "error", {
				type: "error",
				error: {
					type: "api_error",
					message: `Upstream did not return SSE and JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
				},
			});
			res.end();
			return;
		}

		const message = translateToAnthropic(messageId, model, openaiResp);

		writeSseEvent(res, "message_start", {
			type: "message_start",
			message: {
				id: message.id,
				type: "message",
				role: "assistant",
				content: [],
				model: message.model,
				usage: { input_tokens: message.usage.input_tokens, output_tokens: 0 },
			},
		});

		message.content.forEach((block, index) => {
			writeSseEvent(res, "content_block_start", {
				type: "content_block_start",
				index,
				content_block:
					block.type === "text" ? { type: "text", text: "" } : block,
			});
			if (block.type === "text") {
				writeSseEvent(res, "content_block_delta", {
					type: "content_block_delta",
					index,
					delta: { type: "text_delta", text: block.text },
				});
			} else if (block.type === "tool_use") {
				writeSseEvent(res, "content_block_delta", {
					type: "content_block_delta",
					index,
					delta: {
						type: "input_json_delta",
						partial_json: JSON.stringify(block.input ?? {}),
					},
				});
			}
			writeSseEvent(res, "content_block_stop", {
				type: "content_block_stop",
				index,
			});
		});

		writeSseEvent(res, "message_delta", {
			type: "message_delta",
			delta: { stop_reason: message.stop_reason },
			usage: { output_tokens: message.usage.output_tokens },
		});
		writeSseEvent(res, "message_stop", { type: "message_stop" });
		res.end();
		return;
	}

	// message_start
	const estimatedInputTokens = estimateAnthropicInputTokens(anthropicReq);
	writeSseEvent(res, "message_start", {
		type: "message_start",
		message: {
			id: messageId,
			type: "message",
			role: "assistant",
			content: [],
			model,
			usage: { input_tokens: estimatedInputTokens, output_tokens: 0 },
		},
	});

	let nextBlockIndex = 0;
	let textBlockIndex: number | null = null;
	let lastUsage:
		| {
			prompt_tokens?: number;
			completion_tokens?: number;
			total_tokens?: number;
		}
		| undefined;
	let pendingStopReason: "tool_use" | "end_turn" | "max_tokens" | null = null;
	let emittedToolUse = false;
	const toolCalls = new Map<
		number,
		{ id?: string; name?: string; args: string }
	>();
	const doneErr = new Error("__OPENAI_STREAM_DONE__");
	let finalized = false;

	const stopTextBlockIfNeeded = () => {
		if (textBlockIndex === null) return;
		writeSseEvent(res, "content_block_stop", {
			type: "content_block_stop",
			index: textBlockIndex,
		});
		textBlockIndex = null;
	};

	const finalize = () => {
		if (finalized || res.writableEnded) return;
		finalized = true;

		stopTextBlockIfNeeded();
		const stopReason = pendingStopReason || "end_turn";

		const usageAny = lastUsage as any;
		const completionTokens =
			typeof usageAny?.completion_tokens === "number"
				? usageAny.completion_tokens
				: typeof usageAny?.output_tokens === "number"
					? usageAny.output_tokens
					: 0;

		writeSseEvent(res, "message_delta", {
			type: "message_delta",
			delta: { stop_reason: stopReason },
			usage: { output_tokens: completionTokens },
		});
		writeSseEvent(res, "message_stop", { type: "message_stop" });
		res.end();
	};

	let streamError: unknown = null;
	try {
		await readSseStream(upstream.body, async (data) => {
			if (res.writableEnded) throw doneErr;
			if (data === "[DONE]") {
				finalize();
				throw doneErr;
			}
			let parsed: any = null;
			try {
				parsed = JSON.parse(data);
			} catch {
				return;
			}
			if (parsed?.usage) lastUsage = parsed.usage;

			const choice = parsed?.choices?.[0];
			const delta = choice?.delta || {};
			const finishReason = choice?.finish_reason as string | null | undefined;

			if (typeof delta?.content === "string" && delta.content.length > 0) {
				if (textBlockIndex === null) {
					textBlockIndex = nextBlockIndex++;
					writeSseEvent(res, "content_block_start", {
						type: "content_block_start",
						index: textBlockIndex,
						content_block: { type: "text", text: "" },
					});
				}
				writeSseEvent(res, "content_block_delta", {
					type: "content_block_delta",
					index: textBlockIndex,
					delta: { type: "text_delta", text: delta.content },
				});
			}

			if (Array.isArray(delta?.tool_calls)) {
				for (const tc of delta.tool_calls) {
					const idx = typeof tc?.index === "number" ? tc.index : 0;
					const existing = toolCalls.get(idx) || { args: "" };
					if (typeof tc?.id === "string" && tc.id) existing.id = tc.id;
					if (typeof tc?.function?.name === "string" && tc.function.name)
						existing.name = tc.function.name;
					if (
						typeof tc?.function?.arguments === "string" &&
						tc.function.arguments
					) {
						existing.args += tc.function.arguments;
					}
					toolCalls.set(idx, existing);
				}
			}

			if (!finishReason) return;

			// 【调试】打印 finishReason 值，帮助定位 error_during_execution 问题
			logger?.info({
				msg: "anthropic proxy: stream finish_reason received",
				requestId,
				finishReason,
				hasToolCalls: toolCalls.size > 0,
			});

			if (finishReason === "tool_calls") {
				stopTextBlockIfNeeded();

				// Emit tool_use blocks
				if (!emittedToolUse) {
					emittedToolUse = true;
					const sorted = [...toolCalls.entries()].sort((a, b) => a[0] - b[0]);
					for (const [_i, tc] of sorted) {
						const toolIndex = nextBlockIndex++;
						let input: unknown = {};
						const rawArgs = String(tc.args || "").trim();
						if (rawArgs) {
							try {
								input = JSON.parse(rawArgs);
							} catch {
								input = { _raw: rawArgs };
							}
						}
						emitToolUseBlock(res, {
							index: toolIndex,
							id: tc.id || `toolu_${crypto.randomUUID().replace(/-/g, "")}`,
							name: tc.name || "Tool",
							input,
						});
					}
				}
				pendingStopReason = "tool_use";
				return;
			}

			if (finishReason === "stop" || finishReason === "length") {
				stopTextBlockIfNeeded();

				// 【关键修复】某些模型（如 Gemini）即使有工具调用也返回 finish_reason="stop"
				// 如果有未发送的工具调用，需要在这里发送它们
				if (toolCalls.size > 0 && !emittedToolUse) {
					emittedToolUse = true;
					const sorted = [...toolCalls.entries()].sort((a, b) => a[0] - b[0]);
					for (const [_i, tc] of sorted) {
						const toolIndex = nextBlockIndex++;
						let input: unknown = {};
						const rawArgs = String(tc.args || "").trim();
						if (rawArgs) {
							try {
								input = JSON.parse(rawArgs);
							} catch {
								input = { _raw: rawArgs };
							}
						}
						emitToolUseBlock(res, {
							index: toolIndex,
							id: tc.id || `toolu_${crypto.randomUUID().replace(/-/g, "")}`,
							name: tc.name || "Tool",
							input,
						});
					}
					pendingStopReason = "tool_use";
					return;
				}

				pendingStopReason =
					finishReason === "length" ? "max_tokens" : "end_turn";
				return;
			}
		});
	} catch (e) {
		if (e !== doneErr) streamError = e;
	}

	if (streamError) {
		const msg =
			streamError instanceof Error ? streamError.message : String(streamError);
		writeSseEvent(res, "error", {
			type: "error",
			error: { type: "api_error", message: msg || "Upstream stream error" },
		});
		res.end();
		return;
	}

	finalize();
}

interface OpenAIResponse {
	choices: Array<{
		message: {
			role: string;
			content: string | null;
			tool_calls?: Array<{
				id: string;
				type: string;
				function: { name: string; arguments: string };
			}>;
			// Legacy single function call format.
			function_call?: { name: string; arguments: string };
		};
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

type OpenAIToolCall = {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
};

type OpenAIChatMessage =
	| { role: "system"; content: string }
	| { role: "user"; content: string }
	| { role: "assistant"; content: string | null; tool_calls?: OpenAIToolCall[] }
	| { role: "tool"; content: string; tool_call_id: string };

interface AnthropicResponse {
	id: string;
	type: "message";
	role: "assistant";
	content: Array<
		| { type: "text"; text: string }
		| { type: "tool_use"; id: string; name: string; input: unknown }
	>;
	model: string;
	stop_reason: "end_turn" | "tool_use" | "max_tokens";
	usage: { input_tokens: number; output_tokens: number };
}

/**
 * 翻译 Anthropic 请求为 OpenAI 格式
 */
function translateToOpenAI(
	anthropicReq: AnthropicRequest,
): OpenAIChatMessage[] {
	const messages: OpenAIChatMessage[] = [];

	// System message
	if (anthropicReq.system) {
		let systemContent = "";
		if (typeof anthropicReq.system === "string") {
			systemContent = anthropicReq.system;
		} else {
			systemContent = anthropicReq.system
				.filter((b) => b.type === "text")
				.map((b) => b.text)
				.join("\n");
		}
		if (systemContent) {
			messages.push({ role: "system", content: systemContent });
		}
	}

	// Messages
	for (const msg of anthropicReq.messages) {
		if (typeof msg.content === "string") {
			if (msg.role === "user" || msg.role === "assistant") {
				messages.push({ role: msg.role, content: msg.content });
			}
		} else {
			// 处理 content blocks
			const textParts: string[] = [];
			const toolCalls: OpenAIToolCall[] = [];
			for (const block of msg.content) {
				if (block.type === "text" && block.text) {
					textParts.push(block.text);
				} else if (block.type === "tool_use" && msg.role === "assistant") {
					const id = typeof block.id === "string" ? block.id : "";
					const name = typeof block.name === "string" ? block.name : "";
					const args = JSON.stringify(block.input ?? {});
					if (id && name) {
						toolCalls.push({
							id,
							type: "function",
							function: { name, arguments: args },
						});
					}
				} else if (block.type === "tool_result" && block.tool_use_id) {
					// tool_result 转为 tool role
					const raw = (block as { content?: unknown }).content;
					const resultContent =
						typeof raw === "string"
							? raw
							: Array.isArray(raw)
								? raw
									.map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
									.join("\n")
								: raw
									? JSON.stringify(raw)
									: "";
					messages.push({
						role: "tool",
						content: resultContent,
						tool_call_id: String(block.tool_use_id),
					});
				}
			}

			const text = textParts.join("\n").trim();
			if (msg.role === "assistant") {
				if (toolCalls.length > 0) {
					messages.push({
						role: "assistant",
						content: text.length > 0 ? text : null,
						tool_calls: toolCalls,
					});
				} else if (text.length > 0) {
					messages.push({ role: "assistant", content: text });
				}
			} else if (msg.role === "user") {
				// User may include tool_result blocks + additional text.
				if (text.length > 0) messages.push({ role: "user", content: text });
			}
		}
	}

	return messages;
}

/**
 * 翻译 OpenAI 响应为 Anthropic 格式
 */
function translateToAnthropic(
	messageId: string,
	model: string,
	openaiResp: OpenAIResponse,
): AnthropicResponse {
	const choice = openaiResp.choices[0];
	const content: AnthropicResponse["content"] = [];

	// 文本内容
	if (choice.message.content) {
		content.push({ type: "text", text: choice.message.content });
	}

	// 工具调用
	if (choice.message.tool_calls) {
		for (const tc of choice.message.tool_calls) {
			let input: unknown = {};
			try {
				input = JSON.parse(tc.function.arguments);
			} catch {
				input = { _raw: tc.function.arguments };
			}
			content.push({
				type: "tool_use",
				id: tc.id,
				name: tc.function.name,
				input,
			});
		}
	}
	// Legacy function_call
	else if ((choice.message as any).function_call) {
		const fc = (choice.message as any).function_call as {
			name?: string;
			arguments?: string;
		};
		const name = typeof fc?.name === "string" ? fc.name : "unknown";
		const rawArgs = typeof fc?.arguments === "string" ? fc.arguments : "{}";
		let input: unknown = {};
		try {
			input = JSON.parse(rawArgs);
		} catch {
			input = { _raw: rawArgs };
		}
		content.push({
			type: "tool_use",
			id: `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
			name,
			input,
		});
	}

	// 停止原因
	let stopReason: AnthropicResponse["stop_reason"] = "end_turn";
	if (
		choice.finish_reason === "tool_calls" ||
		choice.message.tool_calls?.length
	) {
		stopReason = "tool_use";
	} else if (choice.finish_reason === "length") {
		stopReason = "max_tokens";
	}

	return {
		id: messageId,
		type: "message",
		role: "assistant",
		content,
		model,
		stop_reason: stopReason,
		usage: openaiResp.usage
			? {
				input_tokens: openaiResp.usage.prompt_tokens,
				output_tokens: openaiResp.usage.completion_tokens,
			}
			: { input_tokens: 0, output_tokens: 0 },
	};
}

// (previous fake streaming helper removed; we now stream/translate incrementally)
