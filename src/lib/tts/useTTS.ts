/**
 * useTTS — 渲染端统一朗读 hook
 *
 * 用法：
 *   const tts = useTTS({ scope: "reader" });
 *   tts.speak(text);
 *   tts.pause(); tts.resume(); tts.stop();
 *
 * 全局只有一个朗读队列：切换 scope 自动 stop 之前的。
 */

import { useCallback, useEffect, useMemo } from "react";
import {
	loadTtsSettings,
	pauseTts,
	resumeTts,
	setTtsRate,
	speakTts,
	stopTts,
	useTtsStoreSelector,
	type SpeakOptions,
} from "./ttsStore";
import type { TTSScope, TTSStatus } from "./types";

export interface UseTTSResult {
	status: TTSStatus;
	rate: number;
	scope: TTSScope | null;
	speak: (text: string, options?: Partial<SpeakOptions>) => Promise<void>;
	pause: () => void;
	resume: () => void;
	stop: () => void;
	setRate: (rate: number) => void;
}

export function useTTS(opts: { scope: TTSScope }): UseTTSResult {
	const status = useTtsStoreSelector((s) => s.status);
	const scope = useTtsStoreSelector((s) => s.scope);
	const rate = useTtsStoreSelector((s) => s.settings?.rate ?? 1);

	useEffect(() => {
		void loadTtsSettings();
	}, []);

	const speak = useCallback(
		async (text: string, override: Partial<SpeakOptions> = {}) => {
			await speakTts(text, { scope: opts.scope, ...override });
		},
		[opts.scope],
	);

	const setRate = useCallback((next: number) => {
		setTtsRate(next);
	}, []);

	// 把返回对象用 useMemo 缓存，避免每次渲染都新建对象引用。
	// 调用方把 tts 整体作为 useMemo 依赖时也能正确命中缓存。
	return useMemo<UseTTSResult>(
		() => ({
			status,
			rate,
			scope,
			speak,
			pause: pauseTts,
			resume: resumeTts,
			stop: stopTts,
			setRate,
		}),
		[status, rate, scope, speak, setRate],
	);
}
