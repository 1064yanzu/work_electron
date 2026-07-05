/**
 * TTS 统一调用入口（参照 electron/main/llm/invoke.ts 的多 provider 抽象）
 *
 * 职责：
 *  - 维护 provider type → adapter 映射（不可变注册表）
 *  - 提供 synthesize / synthesizeStream 的统一调度
 *  - 统一超时与取消（与 ttsStreamRegistry 联动）
 *
 * 注意：
 *  - 这里不直接读数据库；provider 配置由调用方（ttsService / handler）从 tts_settings 取出后传入
 *  - 渲染端 system provider（WebSpeech）由前端 systemProvider 实现，主进程不参与
 */
import type { BrowserWindow } from "electron";
import { BatchedSender } from "../utils/batchedSender";
import { ttsStreamRegistry } from "./streamRegistry";
import { elevenLabsProvider } from "./providers/elevenLabs";
import { mimoProvider } from "./providers/mimo";
import { openaiCompatibleProvider } from "./providers/openaiCompatible";
import { volcanoProvider } from "./providers/volcano";
import type {
	TTSAdapterContext,
	TTSCloneProgressEvent,
	TTSProviderAdapter,
	TTSProviderConfig,
	TTSProviderType,
	TTSStreamChunkEvent,
	TTSSynthesizeRequest,
} from "./types";

const TTS_CALL_TIMEOUT_MS = 60_000;
const TTS_STREAM_TIMEOUT_MS = 5 * 60 * 1000;

const ADAPTERS: Partial<Record<TTSProviderType, TTSProviderAdapter>> = {
	openai_compatible: openaiCompatibleProvider,
	elevenlabs: elevenLabsProvider,
	volcano: volcanoProvider,
	mimo: mimoProvider,
	// system 由前端实现，主进程不暴露
};

export function getProviderAdapter(
	type: TTSProviderType,
): TTSProviderAdapter | null {
	return ADAPTERS[type] ?? null;
}

function combine(signals: (AbortSignal | undefined)[]): AbortSignal {
	const controller = new AbortController();
	for (const signal of signals) {
		if (!signal) continue;
		if (signal.aborted) {
			controller.abort(signal.reason);
			return controller.signal;
		}
		signal.addEventListener(
			"abort",
			() => {
				controller.abort(signal.reason);
			},
			{ once: true },
		);
	}
	return controller.signal;
}

function timeoutSignal(ms: number): AbortSignal {
	return AbortSignal.timeout(ms);
}

/** 一次性合成 */
export async function synthesize(
	provider: TTSProviderConfig,
	req: TTSSynthesizeRequest,
): Promise<{ audioBase64: string; format: string }> {
	const adapter = getProviderAdapter(provider.type);
	if (!adapter) {
		throw new Error(`不支持的 TTS provider 类型：${provider.type}`);
	}
	const ctx: TTSAdapterContext = {
		provider,
		signal: timeoutSignal(TTS_CALL_TIMEOUT_MS),
	};
	const result = await adapter.synthesize(req, ctx);
	return { audioBase64: bufferToBase64(result.audio), format: result.format };
}

/** 试听某音色（adapter 没实现 previewVoice 时回退到 synthesize 一段问候） */
export async function previewVoice(
	provider: TTSProviderConfig,
	voiceId: string,
	text?: string,
): Promise<{ audioBase64: string; format: string }> {
	const adapter = getProviderAdapter(provider.type);
	if (!adapter) {
		throw new Error(`不支持的 TTS provider 类型：${provider.type}`);
	}
	const ctx: TTSAdapterContext = {
		provider,
		signal: timeoutSignal(TTS_CALL_TIMEOUT_MS),
	};
	if (adapter.previewVoice) {
		const result = await adapter.previewVoice(voiceId, ctx);
		return {
			audioBase64: bufferToBase64(result.audio),
			format: result.format,
		};
	}
	const result = await adapter.synthesize(
		{
			providerId: provider.id,
			voice: voiceId,
			text: text || "你好，这是当前音色的试听。",
		},
		ctx,
	);
	return { audioBase64: bufferToBase64(result.audio), format: result.format };
}

/** 流式合成 — 通过 BatchedSender 把 chunk 推到 tts-stream-chunk 通道 */
export async function synthesizeStream(
	provider: TTSProviderConfig,
	req: TTSSynthesizeRequest & { streamId: string },
	mainWindow: BrowserWindow | null,
): Promise<{ ok: boolean }> {
	const adapter = getProviderAdapter(provider.type);
	if (!adapter) {
		throw new Error(`不支持的 TTS provider 类型：${provider.type}`);
	}

	const controller = ttsStreamRegistry.register(req.streamId);
	const signal = combine([
		controller.signal,
		timeoutSignal(TTS_STREAM_TIMEOUT_MS),
	]);
	const sender = getStreamSender(mainWindow);

	const ctx: TTSAdapterContext = {
		provider,
		signal,
		sendChunk: (chunk) => {
			if (!sender) return;
			sender.send(chunk);
			if (chunk.done) sender.flush();
		},
	};

	try {
		if (adapter.synthesizeStream) {
			await adapter.synthesizeStream(req, ctx);
		} else {
			const result = await adapter.synthesize(req, ctx);
			if (sender) {
				sender.send({
					streamId: req.streamId,
					audioBase64: bufferToBase64(result.audio),
					format: result.format,
					done: false,
				});
				sender.send({ streamId: req.streamId, done: true });
				sender.flush();
			}
		}
		return { ok: true };
	} catch (e) {
		if (sender) {
			sender.send({
				streamId: req.streamId,
				done: true,
				error: e instanceof Error ? e.message : String(e),
			});
			sender.flush();
		}
		return { ok: false };
	} finally {
		ttsStreamRegistry.unregister(req.streamId);
	}
}

let cachedSender: BatchedSender<TTSStreamChunkEvent> | null = null;
let cachedSenderWindow: BrowserWindow | null = null;

function getStreamSender(
	mainWindow: BrowserWindow | null,
): BatchedSender<TTSStreamChunkEvent> | null {
	if (!mainWindow) return null;
	if (cachedSender && cachedSenderWindow === mainWindow) return cachedSender;
	cachedSenderWindow = mainWindow;
	cachedSender = new BatchedSender<TTSStreamChunkEvent>(
		"tts-stream-chunk",
		() =>
			cachedSenderWindow && !cachedSenderWindow.isDestroyed()
				? cachedSenderWindow
				: null,
	);
	return cachedSender;
}

let cloneSender: BatchedSender<TTSCloneProgressEvent> | null = null;
let cloneSenderWindow: BrowserWindow | null = null;

export function getCloneProgressSender(
	mainWindow: BrowserWindow | null,
): BatchedSender<TTSCloneProgressEvent> | null {
	if (!mainWindow) return null;
	if (cloneSender && cloneSenderWindow === mainWindow) return cloneSender;
	cloneSenderWindow = mainWindow;
	cloneSender = new BatchedSender<TTSCloneProgressEvent>(
		"tts-clone-progress",
		() =>
			cloneSenderWindow && !cloneSenderWindow.isDestroyed()
				? cloneSenderWindow
				: null,
	);
	return cloneSender;
}

function bufferToBase64(buffer: ArrayBuffer): string {
	return Buffer.from(buffer).toString("base64");
}
