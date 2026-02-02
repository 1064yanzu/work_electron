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

const DEFAULT_MODEL = "gpt-4o";

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
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
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
 * 根据模型查找 Provider
 */
async function findProviderForModel(
	db: DbContext,
	model: string,
): Promise<Provider | null> {
	const rows = await db.client.execute(
		`SELECT * FROM providers WHERE is_enabled = 1`,
	);

	for (const row of rows.rows) {
		let models: string[] = [];
		try {
			models = JSON.parse((row.models as string) || "[]");
		} catch {
			continue;
		}
		if (models.includes(model)) {
			let metadata: Record<string, unknown> = {};
			try {
				metadata = JSON.parse((row.metadata as string) || "{}");
			} catch {
				metadata = {};
			}
			return {
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
			};
		}
	}
	return null;
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

/**
 * 调用 OpenAI 兼容 API
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
	for (let attempt = 0; attempt < 3; attempt++) {
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
		});

		if (response.ok) break;
		lastErrorText = await response.text();
		if (transientStatus.has(response.status) && attempt < 2) {
			// Exponential-ish backoff for Cloudflare 524 / rate-limit / gateway errors
			await sleep(500 * (attempt + 1) * (attempt + 1));
			continue;
		}
		throw new Error(`LLM call failed: ${response.status} - ${lastErrorText}`);
	}

	if (!response || !response.ok) {
		throw new Error(
			`LLM call failed: unknown - ${lastErrorText || "no response"}`,
		);
	}

	const data = (await response.json()) as {
		choices: Array<{ message: { content: string } }>;
		usage?: {
			prompt_tokens: number;
			completion_tokens: number;
			total_tokens: number;
		};
	};

	return {
		content: data.choices[0]?.message?.content || "",
		usage: data.usage,
	};
}

async function callOpenAICompatibleStream(opts: {
	provider: Provider;
	model: string;
	prompt: string;
	apiKey: string | undefined;
	context?: string[];
	temperature?: number;
	onChunk: (text: string) => void;
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
				if (text) opts.onChunk(text);
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

	const response = await fetch(url, {
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
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Anthropic call failed: ${response.status} - ${error}`);
	}

	const data = (await response.json()) as {
		content: Array<{ type: string; text?: string }>;
		usage?: {
			input_tokens: number;
			output_tokens: number;
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
	onChunk: (text: string) => void;
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
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(
			`Anthropic call failed (stream): ${response.status} - ${error}`,
		);
	}
	if (!response.body) throw new Error("No response body for streaming");

	let usage: StreamChunk["usage"] | undefined;
	const parse = createSseParser((data) => {
		try {
			const json = JSON.parse(data) as any;
			if (json?.type === "content_block_delta") {
				const delta = json?.delta;
				if (delta?.type === "text_delta" && typeof delta?.text === "string") {
					opts.onChunk(delta.text);
				}
			}
			if (json?.type === "message_delta" && json?.usage) {
				usage = {
					prompt_tokens: Number(json.usage.input_tokens ?? 0),
					completion_tokens: Number(json.usage.output_tokens ?? 0),
					total_tokens:
						Number(json.usage.input_tokens ?? 0) +
						Number(json.usage.output_tokens ?? 0),
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
 * 非流式 LLM 调用
 */
export async function invokeLlm(
	db: DbContext,
	options: LlmCallOptions,
): Promise<LlmCallResult> {
	// 确定实际使用的模型
	let model = options.model;
	if (!model) {
		model = await getActiveModel(db);
	}

	// 查找 Provider
	let provider = await findProviderForModel(db, model);
	if (!provider) {
		// 回退到活跃模型
		const activeModel = await getActiveModel(db);
		provider = await findProviderForModel(db, activeModel);
		if (provider) {
			model = activeModel;
		}
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

	// 根据 provider_type 分流
	switch (provider.provider_type) {
		case "anthropic":
			return callAnthropic(
				provider,
				model,
				options.prompt,
				resolvedApiKey,
				options.context,
				options.temperature,
			);
		case "ollama":
			return callOllama(
				provider,
				model,
				options.prompt,
				options.context,
				options.temperature,
			);
		default:
			return callOpenAICompatible(
				provider,
				model,
				options.prompt,
				resolvedApiKey,
				options.context,
				options.temperature,
			);
	}
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
			const onChunk = (text: string) => {
				sendStreamChunk(mainWindow, { content: text, done: false });
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
			// 发送错误作为文本
			const errorChunk: StreamChunk = {
				content: `Error: ${error instanceof Error ? error.message : String(error)}`,
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

