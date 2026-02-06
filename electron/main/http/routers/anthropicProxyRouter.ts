/**
 * Anthropic 代理路由
 * 提供 Anthropic 兼容的 /v1/messages API，支持多 Provider 转发
 */
import type { Request, Response } from "express";
import { Router } from "express";
import type { DbContext } from "../../db/client";
import { resolveProviderApiKey } from "../../llm/invoke";
import type { Logger } from "../../logging/types";
import {
	extractIpoConversationId,
	stripIpoMarkersFromAnthropicRequest,
} from "../anthropicProxy/ipoMarkers";
import { decodeIpoRoutedModel } from "../anthropicProxy/modelRouting";
import {
	callProvider,
	callProviderStream,
} from "../anthropicProxy/providerCalls";
import { resolveSubagentScenarioModel } from "../anthropicProxy/scenarioModelOverride";
import { estimateAnthropicInputTokens } from "../anthropicProxy/tokenEstimation";
import type { AnthropicRequest, ProviderConfig } from "../anthropicProxy/types";

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

function parseJsonArray(value: unknown): string[] {
	try {
		if (typeof value === "string") return JSON.parse(value) as string[];
		if (Array.isArray(value)) return value as string[];
	} catch {
		// ignore
	}
	return [];
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
	try {
		if (typeof value === "string")
			return JSON.parse(value) as Record<string, unknown>;
		if (value && typeof value === "object")
			return value as Record<string, unknown>;
	} catch {
		// ignore
	}
	return null;
}

function buildProviderConfig(row: any): ProviderConfig & { id: string } {
	return {
		id: String(row.id),
		provider_type: String(row.provider_type),
		api_key: row.api_key ? String(row.api_key) : undefined,
		api_base: row.api_base ? String(row.api_base) : undefined,
		template_id: row.template_id ? String(row.template_id) : undefined,
		metadata: parseJsonObject(row.metadata),
	};
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
						const providerModels = parseJsonArray((row as any).models);
						for (const m of providerModels) modelSet.add(String(m));
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
		const anthropicReq = (req.body || {}) as AnthropicRequest;
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
			const incomingModel = anthropicReq.model;

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

			// 1.5 子代理模型策略（推荐）：子代理在 AgentDefinition.model 中编码 providerId+modelId，
			// 代理在这里解码并强制选择对应 Provider+Model。
			const routedModel = decodeIpoRoutedModel(model);
			let forcedProviderId: string | null = routedModel?.providerId || null;
			let subagentKey: string | null = routedModel?.agentKey || null;

			if (routedModel) {
				model = routedModel.modelId;
				res.setHeader("x-ipo-subagent", "1");
				res.setHeader("x-ipo-subagent-key", routedModel.agentKey);
				res.setHeader("x-ipo-model-override", routedModel.modelId);
				res.setHeader("x-ipo-provider-override", routedModel.providerId);
			}

			// 1.6 后备策略：通过子代理场景描述识别并查找用户配置的模型
			// 这是因为 SDK 的 AgentDefinition.model 只接受预定义值(sonnet/opus/haiku/inherit)
			// 我们通过识别 "You are a specialized subagent for:" 来判断这是子代理请求
			// 然后从用户的场景配置中查找对应的 providerId 和 modelId
			if (!routedModel) {
				const scenarioRouting = await resolveSubagentScenarioModel({
					db,
					anthropicReq,
					currentModel: model,
					logger,
					requestId,
				});
				if (scenarioRouting) {
					forcedProviderId = scenarioRouting.providerId;
					model = scenarioRouting.modelId;
					subagentKey = scenarioRouting.subagentKey;
					res.setHeader("x-ipo-subagent", "1");
					// URL 编码中文字符，避免 HTTP 头无效字符错误
					res.setHeader(
						"x-ipo-subagent-key",
						encodeURIComponent(scenarioRouting.subagentKey),
					);
					res.setHeader("x-ipo-model-override", scenarioRouting.modelId);
					res.setHeader("x-ipo-provider-override", scenarioRouting.providerId);
				}
			}

			logger?.info({
				msg: "anthropic proxy request",
				requestId,
				conversationId,
				incomingModel: incomingModel || null,
				effectiveModel: model || null,
				subagentKey,
				overrideModelId: routedModel?.modelId || null,
				overrideProviderId: routedModel?.providerId || forcedProviderId || null,
				modelRouting: Boolean(routedModel || subagentKey),
				stream: anthropicReq.stream === true,
			});

			// 2. 查找 Provider
			const providerRows = await db.client.execute(
				`SELECT * FROM providers WHERE is_enabled = 1`,
			);
			let provider: (ProviderConfig & { id: string }) | null = null;

			if (forcedProviderId) {
				const forced = providerRows.rows.find(
					(r) => String((r as any).id) === forcedProviderId,
				) as any;
				if (forced) {
					provider = buildProviderConfig(forced);
				} else {
					logger?.warn({
						msg: "anthropic proxy: scenario provider override not found/enabled; falling back to model-based resolution",
						requestId,
						overrideProviderId: forcedProviderId,
						model,
					});
				}
			}

			if (!provider) {
				for (const row of providerRows.rows) {
					const models = parseJsonArray((row as any).models);
					if (models.includes(model)) {
						provider = buildProviderConfig(row);
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

			logger?.info({
				msg: "anthropic proxy: provider resolved",
				requestId,
				conversationId,
				model,
				providerId: provider.id,
				providerType: provider.provider_type,
				templateId: provider.template_id || null,
				hasApiBase: Boolean(provider.api_base),
				forcedByScenario: Boolean(forcedProviderId),
			});

			// 3. 构建请求并调用
			const resolvedApiKey = await resolveProviderApiKey(
				db,
				provider.id,
				provider.api_key,
			);
			const providerWithKey: ProviderConfig = {
				...provider,
				api_key: resolvedApiKey,
			};

			if (anthropicReq.stream) {
				// SSE 流式响应（真实流式转发/翻译）
				res.setHeader("Content-Type", "text/event-stream");
				res.setHeader("Cache-Control", "no-cache");
				res.setHeader("Connection", "keep-alive");
				await callProviderStream(
					providerWithKey,
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
				providerWithKey,
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
