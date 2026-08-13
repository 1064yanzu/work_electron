/**
 * LLM 调用服务
 * 支持多 Provider、非流式和流式调用
 *
 * 具体 Provider 调用逻辑在 adapters/ 下（每个 Provider 一个适配器文件，
 * 由 adapters/registry.ts 统一解析），本文件只保留缓存与重试编排。
 */
import type { BrowserWindow } from "electron";
import type { DbContext } from "../db/client";
import { decryptSecret } from "../storage/secretVault";
import { callOpenAIImageGeneration } from "./adapters/imageGeneration";
import { resolveLlmAdapter } from "./adapters/registry";
import { formatLlmErrorForStream, parseLlmError } from "./llmErrors";
import { sendStreamChunk, sleep } from "./shared";
import { llmStreamRegistry } from "./streamRegistry";
import type {
	ImageGenerationOptions,
	ImageGenerationResult,
	LlmCallOptions,
	LlmCallResult,
	Provider,
	ProviderType,
	StreamChunk,
} from "./types";

export type { ImageGenerationOptions, ImageGenerationResult } from "./types";

const DEFAULT_MODEL = "gpt-4o";

/**
 * 获取活跃模型
 *
 * 30s TTL 缓存：active_model 在 set_active_model handler 处显式 invalidate，
 * 同时复用 provider 缓存的失效路径（invalidateProviderCache 一并清掉）。
 */
const ACTIVE_MODEL_CACHE_TTL_MS = 30_000;
let activeModelCacheValue: string | null = null;
let activeModelCacheTimestamp = 0;

async function getActiveModel(db: DbContext): Promise<string> {
	const now = Date.now();
	if (
		activeModelCacheValue &&
		now - activeModelCacheTimestamp < ACTIVE_MODEL_CACHE_TTL_MS
	) {
		return activeModelCacheValue;
	}
	const rows = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = 'active_model'`,
		args: [],
	});
	const value =
		rows.rows.length === 0
			? DEFAULT_MODEL
			: (rows.rows[0].value as string) || DEFAULT_MODEL;
	activeModelCacheValue = value;
	activeModelCacheTimestamp = now;
	return value;
}

/**
 * Provider 缓存 - 避免每次 LLM 调用都重新查询数据库
 *
 * 缓存过期瞬间多个并发调用容易重复跑 SQL + JSON.parse，
 * 用 inFlight promise 去重，让同时间窗口内的并发请求共享一次查询。
 */
const PROVIDER_CACHE_TTL_MS = 30_000;
let providerCacheTimestamp = 0;
let providerCacheData: Provider[] = [];
let providerCacheInFlight: Promise<Provider[]> | null = null;

async function getEnabledProviders(db: DbContext): Promise<Provider[]> {
	const now = Date.now();
	if (
		now - providerCacheTimestamp < PROVIDER_CACHE_TTL_MS &&
		providerCacheData.length > 0
	) {
		return providerCacheData;
	}

	if (providerCacheInFlight) return providerCacheInFlight;

	providerCacheInFlight = (async () => {
		try {
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
					api_key: decryptSecret(row.api_key as string | undefined),
					api_base: row.api_base as string | undefined,
					models,
					metadata,
					template_id: row.template_id as string | undefined,
					created_at: row.created_at as number,
					updated_at: row.updated_at as number,
				});
			}

			providerCacheData = providers;
			providerCacheTimestamp = Date.now();
			return providers;
		} finally {
			providerCacheInFlight = null;
		}
	})();

	return providerCacheInFlight;
}

/** 主动失效 provider 与 active_model 缓存（在 provider/active_model 变更时调用） */
export function invalidateProviderCache() {
	providerCacheTimestamp = 0;
	providerCacheData = [];
	providerCacheInFlight = null;
	activeModelCacheValue = null;
	activeModelCacheTimestamp = 0;
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

function normalizeApiKeys(raw?: string): string[] {
	if (!raw) return [];
	return raw
		.split(/[\n,，]/g)
		.map((key) => key.trim())
		.filter(Boolean);
}

/**
 * 解析 provider 实际要用的 API key —— 全应用的**统一解密出口**。
 *
 * 落库的 `api_key` 是 safeStorage 密文（见 `storage/secretVault.ts`），也可能是
 * 加密迁移之前留下的明文；`decryptSecret` 对两者都幂等。多 key 轮询（用换行/逗号
 * 分隔）在解密之后再拆分。
 */
export async function resolveProviderApiKey(
	db: DbContext,
	providerId: string,
	raw?: string,
): Promise<string | undefined> {
	const keys = normalizeApiKeys(decryptSecret(raw) || undefined);
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
 * 通过指定 Provider 调用 LLM（经注册表解析适配器）
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

	const adapter = resolveLlmAdapter(provider, model);
	return adapter.call({
		provider,
		model,
		prompt,
		apiKey: resolvedApiKey,
		context,
		temperature,
	});
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
 *
 * 若 options.streamId 提供，则注册到 llmStreamRegistry，
 * 渲染端可通过 IPC `invoke_llm_stream_cancel` 主动 abort 整个上游 SSE。
 */
export async function invokeLlmStream(
	db: DbContext,
	mainWindow: BrowserWindow | null,
	options: LlmCallOptions,
): Promise<{ started: boolean }> {
	if (!mainWindow) {
		throw new Error("No main window available for streaming");
	}

	const streamId = options.streamId;
	const controller = streamId ? llmStreamRegistry.register(streamId) : null;
	const userSignal = controller?.signal;

	const isAbortedError = (err: unknown): boolean => {
		if (!err) return false;
		if (
			typeof err === "object" &&
			err !== null &&
			"name" in err &&
			(err as { name?: string }).name === "AbortError"
		) {
			return true;
		}
		return Boolean(userSignal?.aborted);
	};

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
				if (userSignal?.aborted) return;
				sendStreamChunk(mainWindow, {
					content: text,
					done: false,
					channel,
					thoughtMeta,
					streamId,
				});
			};

			try {
				const adapter = resolveLlmAdapter(provider, model);
				const res = await adapter.callStream({
					provider,
					model,
					prompt: options.prompt,
					apiKey: resolvedApiKey,
					context: options.context,
					temperature: options.temperature,
					signal: userSignal,
					onChunk,
				});
				usage = res.usage;
			} catch (e) {
				// 用户取消 → 静默结束，不再补偿落 chunk
				if (isAbortedError(e)) {
					sendStreamChunk(mainWindow, {
						content: "",
						done: true,
						usage,
						streamId,
					});
					return;
				}
				// Fallback: provider might not support streaming; use non-stream and emit in chunks.
				const result = await invokeLlm(db, options);
				const content = result.content;
				const chunkSize = 40;
				for (let i = 0; i < content.length; i += chunkSize) {
					if (userSignal?.aborted) break;
					sendStreamChunk(mainWindow, {
						content: content.slice(i, i + chunkSize),
						done: false,
						streamId,
					});
					await sleep(10);
				}
				usage = result.usage;
			}

			sendStreamChunk(mainWindow, {
				content: "",
				done: true,
				usage,
				streamId,
			});
		} catch (error) {
			// 用户取消不算错误
			if (isAbortedError(error)) {
				sendStreamChunk(mainWindow, { content: "", done: true, streamId });
				return;
			}
			// 解析错误并发送结构化错误信息
			const errorInfo = parseLlmError(
				error instanceof Error ? error : String(error),
			);
			console.error(
				`[invokeLlmStream] ${errorInfo.title}: ${errorInfo.rawError}`,
			);
			const errorChunk: StreamChunk = {
				content: formatLlmErrorForStream(errorInfo),
				done: true,
				streamId,
			};
			sendStreamChunk(mainWindow, errorChunk);
		} finally {
			if (streamId) llmStreamRegistry.unregister(streamId);
		}
	})();

	return { started: true };
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
