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

import { useCallback, useEffect } from "react";
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

	return {
		status,
		rate,
		scope,
		speak,
		pause: pauseTts,
		resume: resumeTts,
		stop: stopTts,
		setRate,
	};
}
