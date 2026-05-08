/**
 * useTTSVoices — 给定 providerId，加载 voice 列表 + capabilities
 *
 * 内部：
 *  - System provider 走 systemProvider.listSystemVoices（不调 IPC）
 *  - 远程 provider 走 ttsListVoices（5 分钟缓存）
 *  - 监听 voiceschanged（仅 system）
 */

import { useEffect, useState } from "react";
import { ttsCapabilities, ttsListVoices } from "../api/tts";
import {
	listSystemVoices,
	subscribeSystemVoices,
} from "./providers/systemProvider";
import { useTtsStoreSelector } from "./ttsStore";
import type { TTSCapabilities, TTSProviderConfig, TTSVoice } from "./types";

interface UseTTSVoicesResult {
	voices: TTSVoice[];
	capabilities: TTSCapabilities | null;
	loading: boolean;
	error: string | null;
	refresh: () => Promise<void>;
}

export function useTTSVoices(
	providerId: string | null | undefined,
): UseTTSVoicesResult {
	const provider = useTtsStoreSelector((s) =>
		providerId ? s.settings?.providers.find((p) => p.id === providerId) : null,
	);
	const [voices, setVoices] = useState<TTSVoice[]>([]);
	const [capabilities, setCapabilities] = useState<TTSCapabilities | null>(
		null,
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const load = async (force = false) => {
		if (!providerId || !provider) {
			setVoices([]);
			setCapabilities(null);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			if (provider.type === "system") {
				setVoices(listSystemVoices(provider.id));
				setCapabilities({
					listVoices: true,
					cloneVoice: false,
					deleteVoice: false,
					voiceLabels: false,
					streamSynthesis: false,
				});
			} else {
				const [list, caps] = await Promise.all([
					ttsListVoices(providerId, force),
					ttsCapabilities(providerId),
				]);
				setVoices(list);
				setCapabilities(caps);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void load(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [providerId, provider?.type, provider?.api_key, provider?.api_base]);

	useEffect(() => {
		if (!provider || provider.type !== "system") return;
		const unsubscribe = subscribeSystemVoices(() => {
			setVoices(listSystemVoices(provider.id));
		});
		return unsubscribe;
	}, [provider]);

	return {
		voices,
		capabilities,
		loading,
		error,
		refresh: () => load(true),
	};
}

export function inferDefaultProvider(
	providers: TTSProviderConfig[] | undefined,
): TTSProviderConfig | null {
	if (!providers || providers.length === 0) return null;
	const enabled = providers.filter((p) => p.is_enabled);
	if (enabled.length === 0) return providers[0];
	return enabled[0];
}
