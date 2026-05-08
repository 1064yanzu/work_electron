/**
 * TTS IPC Handlers — 11 个命令的入口
 *
 * 参照 createReaderHandlers 的工厂模式：
 *  - 入口：createTtsHandlers({ db, getMainWindow })
 *  - 类型：Handler<K> 对齐 IPCSchema
 */
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";

import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import {
	getCloneProgressSender,
	previewVoice,
	synthesize,
	synthesizeStream,
} from "../../tts/invoke";
import { ttsStreamRegistry } from "../../tts/streamRegistry";
import {
	cloneVoiceForProvider,
	deleteVoiceForProvider,
	listVoicesCached,
} from "../../tts/voiceManager";
import {
	getProviderById,
	getTtsSettings,
	resolveCapabilities,
	updateTtsSettings,
} from "../../services/ttsService";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export interface TtsHandlerDeps {
	db: DbContext;
	getMainWindow: () => BrowserWindow | null;
}

/**
 * 给 adapter 提供的"持久化 provider metadata"回调工厂。
 *
 * 闭包持有 db / providerId —— 调用时读最新 settings → 把 patch 浅合并进对应
 * provider 的 metadata → updateTtsSettings 写库 → 返回更新后的 provider。
 *
 * 用途：MiMo 的"克隆音色"实际上是把样本 base64 存进 metadata.cloned_voices；
 * adapter.cloneVoice 通过这个回调持久化，而不需要 handler 层去懂业务细节。
 */
function createMetadataUpdater(db: DbContext, providerId: string) {
	return async (patch: Record<string, unknown>) => {
		const settings = await getTtsSettings(db);
		const idx = settings.providers.findIndex((p) => p.id === providerId);
		if (idx < 0) {
			throw new Error(`updateProviderMetadata: 未找到 provider ${providerId}`);
		}
		const before = settings.providers[idx];
		const nextProvider = {
			...before,
			metadata: { ...(before.metadata || {}), ...patch },
		};
		const nextProviders = settings.providers.slice();
		nextProviders[idx] = nextProvider;
		await updateTtsSettings(db, { providers: nextProviders });
		return nextProvider;
	};
}

export function createTtsHandlers({ db, getMainWindow }: TtsHandlerDeps) {
	return {
		tts_settings_get: (async () => {
			return getTtsSettings(db);
		}) satisfies Handler<"tts_settings_get">,

		tts_settings_update: (async (_event, patch) => {
			return updateTtsSettings(db, patch);
		}) satisfies Handler<"tts_settings_update">,

		tts_list_voices: (async (_event, input) => {
			const provider = await getProviderById(db, input.providerId);
			if (!provider) {
				throw new Error(`未找到 provider：${input.providerId}`);
			}
			return listVoicesCached(provider, {
				forceRefresh: input.forceRefresh,
			});
		}) satisfies Handler<"tts_list_voices">,

		tts_voice_preview: (async (_event, input) => {
			const provider = await getProviderById(db, input.providerId);
			if (!provider) {
				throw new Error(`未找到 provider：${input.providerId}`);
			}
			return previewVoice(provider, input.voiceId, input.text);
		}) satisfies Handler<"tts_voice_preview">,

		tts_clone_voice: (async (_event, input) => {
			const provider = await getProviderById(db, input.providerId);
			if (!provider) {
				return { ok: false, error: `未找到 provider：${input.providerId}` };
			}
			try {
				const sender = getCloneProgressSender(getMainWindow());
				const voice = await cloneVoiceForProvider(provider, input, {
					sendCloneProgress: (stage, progress, message) => {
						sender?.send({
							providerId: provider.id,
							stage,
							progress,
							message,
						});
						if (stage === "ready" || stage === "error") sender?.flush();
					},
					updateProviderMetadata: createMetadataUpdater(db, provider.id),
				});
				return { ok: true, voice };
			} catch (e) {
				return {
					ok: false,
					error: e instanceof Error ? e.message : String(e),
				};
			}
		}) satisfies Handler<"tts_clone_voice">,

		tts_delete_voice: (async (_event, input) => {
			const provider = await getProviderById(db, input.providerId);
			if (!provider) {
				return { ok: false, error: `未找到 provider：${input.providerId}` };
			}
			try {
				await deleteVoiceForProvider(provider, input.voiceId, {
					updateProviderMetadata: createMetadataUpdater(db, provider.id),
				});
				return { ok: true };
			} catch (e) {
				return {
					ok: false,
					error: e instanceof Error ? e.message : String(e),
				};
			}
		}) satisfies Handler<"tts_delete_voice">,

		tts_capabilities: (async (_event, input) => {
			const provider = await getProviderById(db, input.providerId);
			if (!provider) {
				return {
					listVoices: false,
					cloneVoice: false,
					deleteVoice: false,
					voiceLabels: false,
					streamSynthesis: false,
				};
			}
			return resolveCapabilities(provider);
		}) satisfies Handler<"tts_capabilities">,

		tts_synthesize: (async (_event, input) => {
			const provider = await getProviderById(db, input.providerId);
			if (!provider) {
				throw new Error(`未找到 provider：${input.providerId}`);
			}
			return synthesize(provider, input);
		}) satisfies Handler<"tts_synthesize">,

		tts_synthesize_stream: (async (_event, input) => {
			const provider = await getProviderById(db, input.providerId);
			if (!provider) {
				return { ok: false };
			}
			return synthesizeStream(provider, input, getMainWindow());
		}) satisfies Handler<"tts_synthesize_stream">,

		tts_cancel: (async (_event, input) => {
			const ok = ttsStreamRegistry.cancel(input.streamId, "user-cancelled");
			return { ok };
		}) satisfies Handler<"tts_cancel">,

		tts_test: (async (_event, input) => {
			const provider = await getProviderById(db, input.providerId);
			if (!provider) {
				return { ok: false, error: `未找到 provider：${input.providerId}` };
			}
			try {
				const result = await synthesize(provider, {
					providerId: provider.id,
					text: input.text || "测试合成：你好世界。",
					voice: provider.voice,
				});
				return {
					ok: true,
					audioBase64: result.audioBase64,
					format: result.format,
				};
			} catch (e) {
				return {
					ok: false,
					error: e instanceof Error ? e.message : String(e),
				};
			}
		}) satisfies Handler<"tts_test">,
	};
}
