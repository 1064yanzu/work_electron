/**
 * TTS 音色管理 — listVoices 缓存（5 分钟 TTL） + cloneVoice / deleteVoice 调度
 *
 * 缓存目的：voice 列表是 UI 渲染的高频依赖，每次切下拉都打远程 API 太重。
 */
import type {
	TTSAdapterContext,
	TTSCloneRequest,
	TTSProviderConfig,
	TTSVoice,
} from "./types";
import { getProviderAdapter } from "./invoke";

const VOICE_CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
	voices: TTSVoice[];
	timestamp: number;
}

const voiceCache = new Map<string, CacheEntry>();

export function invalidateVoiceCache(providerId?: string): void {
	if (!providerId) {
		voiceCache.clear();
		return;
	}
	voiceCache.delete(providerId);
}

export async function listVoicesCached(
	provider: TTSProviderConfig,
	options?: { forceRefresh?: boolean; signal?: AbortSignal },
): Promise<TTSVoice[]> {
	const now = Date.now();
	if (!options?.forceRefresh) {
		const cached = voiceCache.get(provider.id);
		if (cached && now - cached.timestamp < VOICE_CACHE_TTL_MS) {
			return cached.voices;
		}
	}
	const adapter = getProviderAdapter(provider.type);
	if (!adapter?.listVoices) {
		return [];
	}
	const ctx: TTSAdapterContext = {
		provider,
		signal: options?.signal ?? new AbortController().signal,
	};
	const voices = await adapter.listVoices(ctx);
	voiceCache.set(provider.id, { voices, timestamp: Date.now() });
	return voices;
}

export async function cloneVoiceForProvider(
	provider: TTSProviderConfig,
	req: TTSCloneRequest,
	options?: {
		signal?: AbortSignal;
		sendCloneProgress?: TTSAdapterContext["sendCloneProgress"];
		updateProviderMetadata?: TTSAdapterContext["updateProviderMetadata"];
	},
): Promise<TTSVoice> {
	const adapter = getProviderAdapter(provider.type);
	if (!adapter?.cloneVoice) {
		throw new Error(`Provider 类型 ${provider.type} 不支持音色克隆`);
	}
	const ctx: TTSAdapterContext = {
		provider,
		signal: options?.signal ?? new AbortController().signal,
		sendCloneProgress: options?.sendCloneProgress,
		updateProviderMetadata: options?.updateProviderMetadata,
	};
	const voice = await adapter.cloneVoice(req, ctx);
	invalidateVoiceCache(provider.id);
	return voice;
}

export async function deleteVoiceForProvider(
	provider: TTSProviderConfig,
	voiceId: string,
	options?: {
		signal?: AbortSignal;
		updateProviderMetadata?: TTSAdapterContext["updateProviderMetadata"];
	},
): Promise<void> {
	const adapter = getProviderAdapter(provider.type);
	if (!adapter?.deleteVoice) {
		throw new Error(`Provider 类型 ${provider.type} 不支持删除音色`);
	}
	const ctx: TTSAdapterContext = {
		provider,
		signal: options?.signal ?? new AbortController().signal,
		updateProviderMetadata: options?.updateProviderMetadata,
	};
	await adapter.deleteVoice(voiceId, ctx);
	invalidateVoiceCache(provider.id);
}
