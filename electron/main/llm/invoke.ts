/**
 * LLM 调用服务
 * 支持多 Provider、非流式和流式调用
 */
import type { BrowserWindow } from "electron";
import type { DbContext } from "../db/client";
import {
	getOpenAICompatibleAuthHeaders,
	normalizeAnthropicBaseUrl,
	normalizeOpenAICompatibleBaseUrl,
} from "./providerHttp";
import { parseLlmError, formatLlmErrorForStream } from "./llmErrors";

const DEFAULT_MODEL = "gpt-4o";

/** LLM 调用超时（毫秒） */
const LLM_CALL_TIMEOUT_MS = 120_000; // 非流式：2 分钟
const LLM_STREAM_TIMEOUT_MS = 300_000; // 流式：5 分钟

/** 创建带超时的 AbortSignal */
function createTimeoutSignal(timeoutMs: number): AbortSignal {
	return AbortSignal.timeout(timeoutMs);
}

/** Provider 类型 */
type ProviderType =
	| "openai"
	| "anthropic"
	| "deepseek"
	| "ollama"
	| "dify"
	| "custom";

interface Provider {
	id: string;
	name: string;
	provider_type: ProviderType;
	is_enabled: boolean;
	api_key?: string;
	api_base?: string;
	models: string[];
	metadata: Record<string, unknown>;
	template_id?: string;
	created_at: number;
	updated_at: number;
}

interface StreamChunk {
	content: string;
	done: boolean;
	channel?: "text" | "thought";
	thoughtMeta?: {
		title?: string;
		source?: string;
		model?: string;
		phase?: string;
		durationMs?: number;
	};
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
	};
}

interface LlmCallOptions {
	model: string;
	prompt: string;
	context?: string[];
	temperature?: number;
}

interface LlmCallResult {
	content: string;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
	};
}

function sendStreamChunk(mainWindow: BrowserWindow, chunk: StreamChunk): void {
	mainWindow.webContents.send("llm-stream-chunk", chunk);
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

async function readTextStream(
	body: ReadableStream<Uint8Array>,
	onText: (text: string) => void,
): Promise<void> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		// Flush by lines to keep latency low while keeping parsers simple.
		let idx: number;
		while ((idx = buffer.indexOf("\n")) !== -1) {
			const line = buffer.slice(0, idx + 1);
			buffer = buffer.slice(idx + 1);
			onText(line);
		}
	}
	if (buffer) onText(buffer);
}

function createSseParser(
	onEvent: (data: string) => void,
): (text: string) => void {
	let buf = "";
	return (text: string) => {
		buf += text;
		while (true) {
			const sep = buf.indexOf("\n\n");
			if (sep === -1) break;
			const block = buf.slice(0, sep);
			buf = buf.slice(sep + 2);

			const lines = block
				.split("\n")
				.map((l) => l.trimEnd())
				.filter(Boolean);
			for (const line of lines) {
				if (!line.startsWith("data:")) continue;
				const data = line.slice("data:".length).trim();
				if (data) onEvent(data);
			}
		}
	};
}

function tryParseJson(raw: string): any | null {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function extractTextPartsFromContent(content: unknown): string[] {
	if (typeof content === "string") {
		return content.trim() ? [content] : [];
	}
	if (!Array.isArray(content)) return [];

	const result: string[] = [];
	for (const item of content) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const type = typeof record.type === "string" ? record.type : "";
		const text =
			typeof record.text === "string"
				? record.text
				: typeof record.output_text === "string"
					? record.output_text
					: "";
		if (
			text &&
			(type === "text" ||
				type === "output_text" ||
				type === "input_text" ||
				type === "")
		) {
			result.push(text);
		}
	}
	return result;
}

function parseOpenAIStyleResult(raw: string): LlmCallResult {
	const json = tryParseJson(raw);
	if (json) {
		const responseUsage = json?.usage;
		if (Array.isArray(json?.output)) {
			const text = json.output
				.flatMap((item: any) => extractTextPartsFromContent(item?.content))
				.join("");
			const usage = responseUsage
				? {
						prompt_tokens: Number(responseUsage.input_tokens ?? 0),
						completion_tokens: Number(responseUsage.output_tokens ?? 0),
						total_tokens: Number(
							responseUsage.total_tokens ??
								Number(responseUsage.input_tokens ?? 0) +
									Number(responseUsage.output_tokens ?? 0),
						),
					}
				: undefined;
			return { content: text, usage };
		}

		if (Array.isArray(json?.choices)) {
			const text = json.choices
				.flatMap((choice: any) => {
					const messageContent = choice?.message?.content;
					if (typeof messageContent === "string") return [messageContent];
					return extractTextPartsFromContent(messageContent);
				})
				.join("");
			const usage = responseUsage
				? {
						prompt_tokens: Number(responseUsage.prompt_tokens ?? 0),
						completion_tokens: Number(responseUsage.completion_tokens ?? 0),
						total_tokens: Number(
							responseUsage.total_tokens ??
								Number(responseUsage.prompt_tokens ?? 0) +
									Number(responseUsage.completion_tokens ?? 0),
						),
					}
				: undefined;
			return { content: text, usage };
		}
	}

	if (!raw.includes("data:")) {
		throw new SyntaxError(`Unsupported LLM response: ${raw.slice(0, 200)}`);
	}

	let content = "";
	let usage: LlmCallResult["usage"];
	const parse = createSseParser((data) => {
		if (data === "[DONE]") return;
		const chunk = tryParseJson(data);
		if (!chunk) return;

		if (chunk?.type === "response.output_text.delta") {
			if (typeof chunk.delta === "string") content += chunk.delta;
		}

		if (chunk?.type === "response.done") {
			const responseUsage = chunk?.response?.usage;
			if (responseUsage && typeof responseUsage === "object") {
				const inputTokens = Number(responseUsage.input_tokens ?? 0);
				const outputTokens = Number(responseUsage.output_tokens ?? 0);
				usage = {
					prompt_tokens: inputTokens,
					completion_tokens: outputTokens,
					total_tokens: Number(responseUsage.total_tokens ?? inputTokens + outputTokens),
				};
			}
		}

		if (Array.isArray(chunk?.choices)) {
			for (const choice of chunk.choices) {
				const deltaContent = choice?.delta?.content;
				if (typeof deltaContent === "string") {
					content += deltaContent;
				}
				const messageContent = choice?.message?.content;
				if (typeof messageContent === "string") {
					content += messageContent;
				} else {
					content += extractTextPartsFromContent(messageContent).join("");
				}
			}
		}

		if (chunk?.usage && typeof chunk.usage === "object") {
			const promptTokens = Number(
				chunk.usage.prompt_tokens ?? chunk.usage.input_tokens ?? 0,
			);
			const completionTokens = Number(
				chunk.usage.completion_tokens ?? chunk.usage.output_tokens ?? 0,
			);
			usage = {
				prompt_tokens: promptTokens,
				completion_tokens: completionTokens,
				total_tokens: Number(
					chunk.usage.total_tokens ?? promptTokens + completionTokens,
				),
			};
		}
	});

	parse(raw.endsWith("\n\n") ? raw : `${raw}\n\n`);
	return { content, usage };
}

function collectThoughtTextFromUnknown(value: unknown): string[] {
	if (!value) return [];
	if (typeof value === "string") return value.trim() ? [value] : [];
	if (Array.isArray(value)) {
		const out: string[] = [];
		for (const item of value) out.push(...collectThoughtTextFromUnknown(item));
		return out;
	}
	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		const out: string[] = [];
		for (const [key, nested] of Object.entries(obj)) {
			if (
				key === "text" ||
				key === "content" ||
				key === "reasoning" ||
				key === "thinking"
			) {
				out.push(...collectThoughtTextFromUnknown(nested));
				continue;
			}
		}
		return out;
	}
	return [];
}

function extractThoughtDeltaFromOpenAIChunk(chunk: any): string {
	const delta = chunk?.choices?.[0]?.delta;
	if (!delta || typeof delta !== "object") return "";

	const candidates: unknown[] = [
		delta.reasoning_content,
		delta.reasoning_text,
		delta.reasoning,
		delta.thinking,
	];
	const parts: string[] = [];
	for (const candidate of candidates) {
		parts.push(...collectThoughtTextFromUnknown(candidate));
	}
	return parts.join("");
}

/**
 * 获取活跃模型
 */
async function getActiveModel(db: DbContext): Promise<string> {
	const rows = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = 'active_model'`,
		args: [],
	});
	if (rows.rows.length === 0) return DEFAULT_MODEL;
	return (rows.rows[0].value as string) || DEFAULT_MODEL;
}

/**
 * Provider 缓存 - 避免每次 LLM 调用都重新查询数据库
 */
const PROVIDER_CACHE_TTL_MS = 30_000;
let providerCacheTimestamp = 0;
let providerCacheData: Provider[] = [];

async function getEnabledProviders(db: DbContext): Promise<Provider[]> {
	const now = Date.now();
	if (
		now - providerCacheTimestamp < PROVIDER_CACHE_TTL_MS &&
		providerCacheData.length > 0
	) {
		return providerCacheData;
	}

	const rows = await db.client.execute(
		`SELECT * FROM providers WHERE is_enabled = 1`,
	);

	const providers: Provider[] = [];
	for (const row of rows.rows) {
		let models: string[] = [];
		try {
			models = JSON.parse((row.models as string) || "[]");
		} catch {
			continue;
		}
		let metadata: Record<string, unknown> = {};
		try {
			metadata = JSON.parse((row.metadata as string) || "{}");
		} catch {
			metadata = {};
		}
		providers.push({
			id: row.id as string,
			name: row.name as string,
			provider_type: row.provider_type as ProviderType,
			is_enabled: true,
			api_key: row.api_key as string | undefined,
			api_base: row.api_base as string | undefined,
			models,
			metadata,
			template_id: row.template_id as string | undefined,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		});
	}

	providerCacheData = providers;
	providerCacheTimestamp = now;
	return providers;
}

/** 主动失效 provider 缓存（在 provider 变更时调用） */
export function invalidateProviderCache() {
	providerCacheTimestamp = 0;
	providerCacheData = [];
}

/**
 * 根据模型查找 Provider
 */
async function findProviderForModel(
	db: DbContext,
	model: string,
): Promise<Provider | null> {
	const providers = await getEnabledProviders(db);
	return providers.find((p) => p.models.includes(model)) ?? null;
}

/**
 * 构建系统上下文消息
 */
function buildContextMessage(context?: string[]): string | null {
	if (!context || context.length === 0) return null;
	return `以下是相关上下文信息：\n\n${context.join("\n\n---\n\n")}`;
}

function normalizeApiKeys(raw?: string): string[] {
	if (!raw) return [];
	return raw
		.split(/[\n,，]/g)
		.map((key) => key.trim())
		.filter(Boolean);
}

export async function resolveProviderApiKey(
	db: DbContext,
	providerId: string,
	raw?: string,
): Promise<string | undefined> {
	const keys = normalizeApiKeys(raw);
	if (keys.length === 0) return undefined;
	if (keys.length === 1) return keys[0];

	const key = `provider.api_key_index.${providerId}`;
	const rows = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ?`,
		args: [key],
	});
	const lastIndexRaw = rows.rows[0]?.value;
	const lastIndex = Number.isFinite(Number(lastIndexRaw))
		? Number(lastIndexRaw)
		: -1;
	const nextIndex = (lastIndex + 1) % keys.length;
	const timestamp = Date.now();
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [key, String(nextIndex), timestamp],
	});
	return keys[nextIndex];
}

/** 判断 provider 是否配置了 OpenAI Responses API 端点 */
function isResponsesEndpoint(provider: Provider): boolean {
	return provider.metadata?.openai_endpoint_type === "responses";
}

/**
 * 调用 OpenAI Responses API（非流式）
 * 端点: POST /v1/responses
 * 文档: https://platform.openai.com/docs/api-reference/responses
 */
async function callOpenAIResponses(
	provider: Provider,
	model: string,
	prompt: string,
	apiKey: string | undefined,
	context?: string[],
	temperature?: number,
): Promise<LlmCallResult> {
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		provider,
		"https://api.openai.com",
	);
	const url = `${baseUrl}/responses`;

	const contextMsg = buildContextMessage(context);
	const transientStatus = new Set([429, 500, 502, 503, 504, 524]);
	let response: Response | null = null;
	let lastErrorText = "";

	const body: Record<string, unknown> = {
		model,
		input: prompt,
		temperature: temperature ?? 0.7,
	};
	if (contextMsg) {
		body.instructions = contextMsg;
	}

	const MAX_RETRIES = 4;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getOpenAICompatibleAuthHeaders(provider, apiKey),
			},
			body: JSON.stringify(body),
			signal: createTimeoutSignal(LLM_CALL_TIMEOUT_MS),
		});

		if (response.ok) break;
		lastErrorText = await response.text();
		if (transientStatus.has(response.status) && attempt < MAX_RETRIES - 1) {
			// 指数退避：1s, 3s, 8s, 20s
			const baseDelay = 1000;
			const delay = Math.min(baseDelay * 2.5 ** attempt, 30_000);
			await sleep(delay);
			continue;
		}
		throw new Error(`LLM call failed: ${response.status} - ${lastErrorText}`);
	}

	if (!response || !response.ok) {
		throw new Error(`LLM call failed: unknown - ${lastErrorText || "no response"}`);
	}

	return parseOpenAIStyleResult(await response.text());
}

/**
 * 调用 OpenAI Responses API（流式）
 * SSE 事件: response.output_text.delta / response.done
 */
async function callOpenAIResponsesStream(opts: {
	provider: Provider;
	model: string;
	prompt: string;
	apiKey: string | undefined;
	context?: string[];
	temperature?: number;
	onChunk: (
		text: string,
		channel?: "text" | "thought",
		thoughtMeta?: StreamChunk["thoughtMeta"],
	) => void;
}): Promise<{ usage?: StreamChunk["usage"] }> {
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		opts.provider,
		"https://api.openai.com",
	);
	const url = `${baseUrl}/responses`;

	const contextMsg = buildContextMessage(opts.context);
	const transientStatus = new Set([429, 500, 502, 503, 504, 524]);
	let lastErrorText = "";

	const body: Record<string, unknown> = {
		model: opts.model,
		input: opts.prompt,
		temperature: opts.temperature ?? 0.7,
		stream: true,
	};
	if (contextMsg) {
		body.instructions = contextMsg;
	}

	for (let attempt = 0; attempt < 3; attempt++) {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getOpenAICompatibleAuthHeaders(opts.provider, opts.apiKey),
			},
			body: JSON.stringify(body),
			signal: createTimeoutSignal(LLM_STREAM_TIMEOUT_MS),
		});

		if (!response.ok) {
			lastErrorText = await response.text();
			if (transientStatus.has(response.status) && attempt < 2) {
				await sleep(500 * (attempt + 1) * (attempt + 1));
				continue;
			}
			throw new Error(
				`LLM call failed (stream): ${response.status} - ${lastErrorText}`,
			);
		}

		if (!response.body) throw new Error("No response body for streaming");

		let usage: StreamChunk["usage"] | undefined;

		const parse = createSseParser((data) => {
			if (data === "[DONE]") return;
			try {
				const json = JSON.parse(data) as any;
				const eventType = json?.type as string | undefined;

				if (eventType === "response.output_text.delta") {
					// delta 字段即文本片段
					const delta = typeof json.delta === "string" ? json.delta : "";
					if (delta) opts.onChunk(delta, "text");
				} else if (eventType === "response.done") {
					// 从 response.done 事件提取 usage
					const u = json?.response?.usage;
					if (u && typeof u === "object") {
						const inputT = Number(u.input_tokens ?? 0);
						const outputT = Number(u.output_tokens ?? 0);
						usage = {
							prompt_tokens: inputT,
							completion_tokens: outputT,
							total_tokens: u.total_tokens ? Number(u.total_tokens) : inputT + outputT,
						};
					}
				}
			} catch {
				// ignore malformed lines
			}
		});

		await readTextStream(response.body, parse);
		return { usage };
	}

	throw new Error(`LLM call failed (stream): unknown - ${lastErrorText}`);
}

/**
 * 调用 OpenAI 兼容 API（chat/completions）
 */
async function callOpenAICompatible(
	provider: Provider,
	model: string,
	prompt: string,
	apiKey: string | undefined,
	context?: string[],
	temperature?: number,
): Promise<LlmCallResult> {
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		provider,
		"https://api.openai.com",
	);
	const url = `${baseUrl}/chat/completions`;

	const messages: Array<{ role: string; content: string }> = [];

	// 添加上下文作为 system 消息
	const contextMsg = buildContextMessage(context);
	if (contextMsg) {
		messages.push({ role: "system", content: contextMsg });
	}

	// 添加用户消息
	messages.push({ role: "user", content: prompt });

	const transientStatus = new Set([429, 500, 502, 503, 504, 524]);

	let response: Response | null = null;
	let lastErrorText = "";
	const MAX_RETRIES = 4;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getOpenAICompatibleAuthHeaders(provider, apiKey),
			},
			body: JSON.stringify({
				model,
				messages,
				temperature: temperature ?? 0.7,
			}),
			signal: createTimeoutSignal(LLM_CALL_TIMEOUT_MS),
		});

		if (response.ok) break;
		lastErrorText = await response.text();
		if (transientStatus.has(response.status) && attempt < MAX_RETRIES - 1) {
			// 指数退避：1s, 3s, 8s, 20s
			const baseDelay = 1000;
			const delay = Math.min(baseDelay * 2.5 ** attempt, 30_000);
			await sleep(delay);
			continue;
		}
		throw new Error(`LLM call failed: ${response.status} - ${lastErrorText}`);
	}

	if (!response || !response.ok) {
		throw new Error(
			`LLM call failed: unknown - ${lastErrorText || "no response"}`,
		);
	}

	return parseOpenAIStyleResult(await response.text());
}

async function callOpenAICompatibleStream(opts: {
	provider: Provider;
	model: string;
	prompt: string;
	apiKey: string | undefined;
	context?: string[];
	temperature?: number;
	onChunk: (
		text: string,
		channel?: "text" | "thought",
		thoughtMeta?: StreamChunk["thoughtMeta"],
	) => void;
}): Promise<{ usage?: StreamChunk["usage"] }> {
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		opts.provider,
		"https://api.openai.com",
	);
	const url = `${baseUrl}/chat/completions`;

	const messages: Array<{ role: string; content: string }> = [];
	const contextMsg = buildContextMessage(opts.context);
	if (contextMsg) messages.push({ role: "system", content: contextMsg });
	messages.push({ role: "user", content: opts.prompt });

	const transientStatus = new Set([429, 500, 502, 503, 504, 524]);
	let lastErrorText = "";

	for (let attempt = 0; attempt < 3; attempt++) {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getOpenAICompatibleAuthHeaders(opts.provider, opts.apiKey),
			},
			body: JSON.stringify({
				model: opts.model,
				messages,
				stream: true,
				// Some OpenAI-compatible providers support this and will include usage in the final event.
				stream_options: { include_usage: true },
				temperature: opts.temperature ?? 0.7,
			}),
			signal: createTimeoutSignal(LLM_STREAM_TIMEOUT_MS),
		});

		if (!response.ok) {
			lastErrorText = await response.text();
			if (transientStatus.has(response.status) && attempt < 2) {
				await sleep(500 * (attempt + 1) * (attempt + 1));
				continue;
			}
			throw new Error(
				`LLM call failed (stream): ${response.status} - ${lastErrorText}`,
			);
		}

		if (!response.body) throw new Error("No response body for streaming");

		let usage: StreamChunk["usage"] | undefined;
		const parse = createSseParser((data) => {
			if (data === "[DONE]") return;
			try {
				const json = JSON.parse(data) as any;
				const delta = json?.choices?.[0]?.delta;
				const text = typeof delta?.content === "string" ? delta.content : "";
				if (text) opts.onChunk(text, "text");
				const thought = extractThoughtDeltaFromOpenAIChunk(json);
				if (thought) {
					opts.onChunk(thought, "thought", {
						title: "Reasoning",
						source: "reasoning_content",
						model: opts.model,
					});
				}
				if (json?.usage && typeof json.usage === "object") {
					usage = json.usage as any;
				}
			} catch {
				// ignore malformed lines
			}
		});

		await readTextStream(response.body, parse);
		return { usage };
	}

	throw new Error(`LLM call failed (stream): unknown - ${lastErrorText}`);
}

/**
 * 调用 Anthropic API
 */
async function callAnthropic(
	provider: Provider,
	model: string,
	prompt: string,
	apiKey: string | undefined,
	context?: string[],
	temperature?: number,
): Promise<LlmCallResult> {
	const baseUrl = normalizeAnthropicBaseUrl(
		provider.api_base,
		"https://api.anthropic.com",
	);
	const url = `${baseUrl}/v1/messages`;

	// 构建用户消息（包含上下文）
	let userContent = prompt;
	const contextMsg = buildContextMessage(context);
	if (contextMsg) {
		userContent = `${contextMsg}\n\n---\n\n${prompt}`;
	}

	const transientStatus = new Set([429, 500, 502, 503, 504, 524, 529]);
	let response: Response | null = null;
	let lastErrorText = "";

	const MAX_RETRIES = 4;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey || "",
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: userContent }],
				max_tokens: 4096,
				temperature: temperature ?? 0.7,
			}),
			signal: createTimeoutSignal(LLM_CALL_TIMEOUT_MS),
		});

		if (response.ok) break;
		lastErrorText = await response.text();
		if (transientStatus.has(response.status) && attempt < MAX_RETRIES - 1) {
			const baseDelay = 1000;
			const delay = Math.min(baseDelay * 2.5 ** attempt, 30_000);
			await sleep(delay);
			continue;
		}
		throw new Error(`Anthropic call failed: ${response.status} - ${lastErrorText}`);
	}

	if (!response || !response.ok) {
		throw new Error(`Anthropic call failed: unknown - ${lastErrorText || "no response"}`);
	}

	const data = (await response.json()) as {
		content: Array<{ type: string; text?: string }>;
		usage?: {
			input_tokens: number;
			output_tokens: number;
			cache_read_input_tokens?: number;
			cache_creation_input_tokens?: number;
		};
	};

	const textContent = data.content
		.filter((c) => c.type === "text")
		.map((c) => c.text || "")
		.join("");

	return {
		content: textContent,
		usage: data.usage
			? {
					prompt_tokens: data.usage.input_tokens,
					completion_tokens: data.usage.output_tokens,
					total_tokens: data.usage.input_tokens + data.usage.output_tokens,
					cache_read_input_tokens: data.usage.cache_read_input_tokens || undefined,
					cache_creation_input_tokens: data.usage.cache_creation_input_tokens || undefined,
				}
			: undefined,
	};
}

async function callAnthropicStream(opts: {
	provider: Provider;
	model: string;
	prompt: string;
	apiKey: string | undefined;
	context?: string[];
	temperature?: number;
	onChunk: (
		text: string,
		channel?: "text" | "thought",
		thoughtMeta?: StreamChunk["thoughtMeta"],
	) => void;
}): Promise<{ usage?: StreamChunk["usage"] }> {
	const baseUrl = normalizeAnthropicBaseUrl(
		opts.provider.api_base,
		"https://api.anthropic.com",
	);
	const url = `${baseUrl}/v1/messages`;

	let userContent = opts.prompt;
	const contextMsg = buildContextMessage(opts.context);
	if (contextMsg) userContent = `${contextMsg}\n\n---\n\n${opts.prompt}`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": opts.apiKey || "",
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: opts.model,
			messages: [{ role: "user", content: userContent }],
			max_tokens: 4096,
			temperature: opts.temperature ?? 0.7,
			stream: true,
		}),
		signal: createTimeoutSignal(LLM_STREAM_TIMEOUT_MS),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(
			`Anthropic call failed (stream): ${response.status} - ${error}`,
		);
	}
	if (!response.body) throw new Error("No response body for streaming");

	let usage: StreamChunk["usage"] | undefined;
	// 分别跟踪 message_start 和 message_delta 中的 token 数据
	let startInputTokens = 0;
	let startCacheReadTokens = 0;
	let startCacheCreationTokens = 0;
	const blockKindByIndex = new Map<number, string>();
	const parse = createSseParser((data) => {
		try {
			const json = JSON.parse(data) as any;
			// message_start 包含 input_tokens 和 cache 相关 token
			if (json?.type === "message_start" && json?.message?.usage) {
				const u = json.message.usage;
				startInputTokens = Number(u.input_tokens ?? 0);
				startCacheReadTokens = Number(u.cache_read_input_tokens ?? 0);
				startCacheCreationTokens = Number(u.cache_creation_input_tokens ?? 0);
			}
			if (json?.type === "content_block_start") {
				const idx = typeof json?.index === "number" ? json.index : -1;
				if (idx >= 0) {
					const blockType =
						typeof json?.content_block?.type === "string"
							? json.content_block.type
							: "";
					blockKindByIndex.set(idx, blockType);
				}
			}
			if (json?.type === "content_block_delta") {
				const delta = json?.delta;
				const idx = typeof json?.index === "number" ? json.index : -1;
				const blockKind = idx >= 0 ? blockKindByIndex.get(idx) : "";
				if (
					delta?.type === "thinking_delta" &&
					typeof delta?.thinking === "string"
				) {
					opts.onChunk(delta.thinking, "thought", {
						title: "Thinking",
						source: "thinking",
						model: opts.model,
					});
				}
				if (delta?.type === "text_delta" && typeof delta?.text === "string") {
					if (blockKind === "thinking" || blockKind === "reasoning") {
						opts.onChunk(delta.text, "thought", {
							title: blockKind === "reasoning" ? "Reasoning" : "Thinking",
							source: blockKind,
							model: opts.model,
						});
					} else {
						opts.onChunk(delta.text, "text");
					}
				}
			}
			if (
				json?.type === "content_block_stop" &&
				typeof json?.index === "number"
			) {
				blockKindByIndex.delete(json.index);
			}
			// message_delta 只包含 output_tokens，需要合并 message_start 的 input_tokens
			if (json?.type === "message_delta" && json?.usage) {
				const outputTokens = Number(json.usage.output_tokens ?? 0);
				usage = {
					prompt_tokens: startInputTokens,
					completion_tokens: outputTokens,
					total_tokens: startInputTokens + outputTokens,
					cache_read_input_tokens: startCacheReadTokens || undefined,
					cache_creation_input_tokens: startCacheCreationTokens || undefined,
				};
			}
		} catch {
			// ignore
		}
	});

	await readTextStream(response.body, parse);
	return { usage };
}

/**
 * 调用 Ollama API（内部使用流式并聚合结果）
 */
async function callOllama(
	provider: Provider,
	model: string,
	prompt: string,
	_context?: string[],
	_temperature?: number,
): Promise<LlmCallResult> {
	// 使用流式调用内部实现，确保一致性
	let content = "";
	await callOllamaStream({
		provider,
		model,
		prompt,
		onChunk: (text) => {
			content += text;
		},
	});
	return { content };
}

async function callOllamaStream(opts: {
	provider: Provider;
	model: string;
	prompt: string;
	onChunk: (text: string) => void;
}): Promise<void> {
	const baseUrl = opts.provider.api_base || "http://localhost:11434";
	const url = `${baseUrl}/api/chat`;

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: opts.model,
			messages: [{ role: "user", content: opts.prompt }],
			stream: true,
		}),
		signal: createTimeoutSignal(LLM_STREAM_TIMEOUT_MS),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(
			`Ollama call failed (stream): ${response.status} - ${error}`,
		);
	}
	if (!response.body) throw new Error("No response body for streaming");

	let buf = "";
	await readTextStream(response.body, (text) => {
		buf += text;
		let idx: number;
		while ((idx = buf.indexOf("\n")) !== -1) {
			const line = buf.slice(0, idx).trim();
			buf = buf.slice(idx + 1);
			if (!line) continue;
			try {
				const json = JSON.parse(line) as any;
				const part =
					typeof json?.message?.content === "string"
						? json.message.content
						: "";
				if (part) opts.onChunk(part);
			} catch {
				// ignore
			}
		}
	});
}

/**
 * 通过指定 Provider 调用 LLM（内部分流）
 */
async function callProviderLlm(
	db: DbContext,
	provider: Provider,
	model: string,
	prompt: string,
	context?: string[],
	temperature?: number,
): Promise<LlmCallResult> {
	const resolvedApiKey = await resolveProviderApiKey(
		db,
		provider.id,
		provider.api_key,
	);

	switch (provider.provider_type) {
		case "anthropic":
			return callAnthropic(
				provider,
				model,
				prompt,
				resolvedApiKey,
				context,
				temperature,
			);
		case "ollama":
			return callOllama(provider, model, prompt, context, temperature);
		default:
			if (isResponsesEndpoint(provider)) {
				return callOpenAIResponses(
					provider,
					model,
					prompt,
					resolvedApiKey,
					context,
					temperature,
				);
			}
			return callOpenAICompatible(
				provider,
				model,
				prompt,
				resolvedApiKey,
				context,
				temperature,
			);
	}
}

export async function invokeLlm(
	db: DbContext,
	options: LlmCallOptions,
): Promise<LlmCallResult> {
	// 确定实际使用的模型
	let model = options.model;
	if (!model) {
		model = await getActiveModel(db);
	}

	// 查找所有能用这个模型的 Provider（用于 fallback）
	const allProviders = await getEnabledProviders(db);
	const matchingProviders = allProviders.filter((p) =>
		p.models.includes(model),
	);

	if (matchingProviders.length === 0) {
		// 回退到活跃模型
		const activeModel = await getActiveModel(db);
		const activeProviders = allProviders.filter((p) =>
			p.models.includes(activeModel),
		);
		if (activeProviders.length > 0) {
			model = activeModel;
			matchingProviders.push(...activeProviders);
		}
	}

	if (matchingProviders.length === 0) {
		throw new Error(
			`No enabled provider found for model: requested=${options.model} effective=${model}`,
		);
	}

	// 尝试主 Provider，失败后 fallback 到其他 Provider
	let lastError: Error | null = null;
	for (const provider of matchingProviders) {
		try {
			return await callProviderLlm(
				db,
				provider,
				model,
				options.prompt,
				options.context,
				options.temperature,
			);
		} catch (err) {
			lastError = err instanceof Error ? err : new Error(String(err));
			// 如果还有其他 Provider 可用，继续尝试
			if (matchingProviders.indexOf(provider) < matchingProviders.length - 1) {
				console.warn(
					`[invokeLlm] Provider ${provider.name} (${provider.id}) failed for model ${model}, trying next provider. Error: ${lastError.message}`,
				);
				continue;
			}
		}
	}

	throw lastError || new Error(`LLM call failed for model: ${model}`);
}

/**
 * 流式 LLM 调用
 * 通过事件发送到渲染进程
 */
export async function invokeLlmStream(
	db: DbContext,
	mainWindow: BrowserWindow | null,
	options: LlmCallOptions,
): Promise<{ started: boolean }> {
	if (!mainWindow) {
		throw new Error("No main window available for streaming");
	}

	// 异步执行流式调用
	(async () => {
		try {
			let model = options.model;
			if (!model) model = await getActiveModel(db);

			let provider = await findProviderForModel(db, model);
			if (!provider) {
				const activeModel = await getActiveModel(db);
				provider = await findProviderForModel(db, activeModel);
				if (provider) model = activeModel;
			}

			if (!provider) {
				throw new Error(
					`No enabled provider found for model: requested=${options.model} effective=${model}`,
				);
			}

			const resolvedApiKey = await resolveProviderApiKey(
				db,
				provider.id,
				provider.api_key,
			);

			let usage: StreamChunk["usage"] | undefined;
			const onChunk = (
				text: string,
				channel: "text" | "thought" = "text",
				thoughtMeta?: StreamChunk["thoughtMeta"],
			) => {
				sendStreamChunk(mainWindow, {
					content: text,
					done: false,
					channel,
					thoughtMeta,
				});
			};

			try {
				switch (provider.provider_type) {
					case "anthropic": {
						const res = await callAnthropicStream({
							provider,
							model,
							prompt: options.prompt,
							apiKey: resolvedApiKey,
							context: options.context,
							temperature: options.temperature,
							onChunk,
						});
						usage = res.usage;
						break;
					}
					case "ollama":
						await callOllamaStream({
							provider,
							model,
							prompt: options.prompt,
							onChunk,
						});
						break;
					default: {
						if (isResponsesEndpoint(provider)) {
							const res = await callOpenAIResponsesStream({
								provider,
								model,
								prompt: options.prompt,
								apiKey: resolvedApiKey,
								context: options.context,
								temperature: options.temperature,
								onChunk,
							});
							usage = res.usage;
						} else {
							const res = await callOpenAICompatibleStream({
								provider,
								model,
								prompt: options.prompt,
								apiKey: resolvedApiKey,
								context: options.context,
								temperature: options.temperature,
								onChunk,
							});
							usage = res.usage;
						}
						break;
					}
				}
			} catch (e) {
				// Fallback: provider might not support streaming; use non-stream and emit in chunks.
				const result = await invokeLlm(db, options);
				const content = result.content;
				const chunkSize = 40;
				for (let i = 0; i < content.length; i += chunkSize) {
					sendStreamChunk(mainWindow, {
						content: content.slice(i, i + chunkSize),
						done: false,
					});
					await sleep(10);
				}
				usage = result.usage;
			}

			sendStreamChunk(mainWindow, {
				content: "",
				done: true,
				usage,
			});
		} catch (error) {
			// 解析错误并发送结构化错误信息
			const errorInfo = parseLlmError(error instanceof Error ? error : String(error));
			console.error(`[invokeLlmStream] ${errorInfo.title}: ${errorInfo.rawError}`);
			const errorChunk: StreamChunk = {
				content: formatLlmErrorForStream(errorInfo),
				done: true,
			};
			sendStreamChunk(mainWindow, errorChunk);
		}
	})();

	return { started: true };
}

// ==================== 图像生成 API ====================

export interface ImageGenerationOptions {
	model: string;
	prompt: string;
	n?: number; // 生成数量，默认 1
	size?: string; // 尺寸，如 "1024x1024"
	quality?: string; // "standard" | "hd"
	style?: string; // "vivid" | "natural"
	// 高级参数（参考 Cherry Studio）
	negativePrompt?: string; // 负向提示词
	seed?: number; // 随机种子
	numInferenceSteps?: number; // 推理步数
	guidanceScale?: number; // 引导比例 (CFG Scale)
	promptEnhancement?: boolean; // 提示词增强
}

export interface ImageGenerationResult {
	images: Array<{
		url?: string;
		base64?: string;
		revised_prompt?: string;
	}>;
	model: string;
}

/**
 * 调用 OpenAI 兼容的图像生成 API
 */
async function callOpenAIImageGeneration(
	provider: Provider,
	options: ImageGenerationOptions,
	apiKey: string | undefined,
): Promise<ImageGenerationResult> {
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		provider,
		"https://api.openai.com",
	);
	const url = `${baseUrl}/images/generations`;

	const transientStatus = new Set([429, 500, 502, 503, 504, 524]);
	let response: Response | null = null;
	let lastErrorText = "";

	for (let attempt = 0; attempt < 3; attempt++) {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getOpenAICompatibleAuthHeaders(provider, apiKey),
			},
			body: JSON.stringify({
				model: options.model,
				prompt: options.prompt,
				n: options.n ?? 1,
				size: options.size ?? "1024x1024",
				quality: options.quality,
				style: options.style,
				response_format: "url",
				// 高级参数（供应商支持情况各异）
				negative_prompt: options.negativePrompt,
				seed: options.seed,
				num_inference_steps: options.numInferenceSteps,
				guidance_scale: options.guidanceScale,
				prompt_enhancement: options.promptEnhancement,
			}),
		});

		if (response.ok) break;
		lastErrorText = await response.text();
		if (transientStatus.has(response.status) && attempt < 2) {
			await sleep(500 * (attempt + 1) * (attempt + 1));
			continue;
		}
		throw new Error(
			`Image generation failed: ${response.status} - ${lastErrorText}`,
		);
	}

	if (!response || !response.ok) {
		throw new Error(
			`Image generation failed: unknown - ${lastErrorText || "no response"}`,
		);
	}

	const data = (await response.json()) as {
		data: Array<{
			url?: string;
			b64_json?: string;
			revised_prompt?: string;
		}>;
	};

	return {
		images: data.data.map((item) => ({
			url: item.url,
			base64: item.b64_json,
			revised_prompt: item.revised_prompt,
		})),
		model: options.model,
	};
}

/**
 * 图像生成调用入口
 */
export async function invokeImageGeneration(
	db: DbContext,
	options: ImageGenerationOptions,
): Promise<ImageGenerationResult> {
	const provider = await findProviderForModel(db, options.model);
	if (!provider) {
		throw new Error(
			`No enabled provider found for image generation model: ${options.model}`,
		);
	}

	const resolvedApiKey = await resolveProviderApiKey(
		db,
		provider.id,
		provider.api_key,
	);

	// 目前仅支持 OpenAI 兼容的图像生成 API
	return callOpenAIImageGeneration(provider, options, resolvedApiKey);
}
