/**
 * useReaderSpeech — 阅读器分段朗读 hook
 *
 * 职责：
 *  - 拉起 ReaderSpeechController：从用户当前可见段落开始播
 *  - 衔接 ttsStore：用 status 派生 hook 状态，pause/resume/setRate 直接透传
 *  - 切章 / unmount 自动 stop，避免新章节继续读旧章节
 *
 * 使用约定：
 *  - DOM 必须存在 `.reader-article` 容器（由 TextEngine 渲染）
 *  - 单栏模式滚动容器：`.reader-main`（外层 main）
 *  - 双栏 paged 模式滚动容器：`.reader-engine--paged`（内层引擎）
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
	collectReaderSegments,
	createReaderSpeechController,
	findStartSegmentIndex,
	type ReaderSpeechController,
	type ReaderSpeechProgress,
} from "../../../lib/reader/speech";
import {
	pauseTts,
	resumeTts,
	setTtsRate,
	stopTts,
	useTtsStoreSelector,
} from "../../../lib/tts";

export interface ReaderSpeechHandle {
	/** 当前 TTS 状态（来自 ttsStore） */
	status: "idle" | "loading" | "playing" | "paused";
	/** 全局 rate；用于 UI slider */
	rate: number;
	/** scope；用于 TTSPlaybackBar 判断要不要显示 */
	scope: "reader" | "chat" | "pet" | "global" | null;
	/** 当前段在队列中的 cursor，未启动为 -1 */
	cursor: number;
	/** 段落总数 */
	total: number;
	/** 启动 / 暂停 / 继续 / 停止 / 切下一段 / 切上一段 */
	start: () => void;
	pause: () => void;
	resume: () => void;
	stop: () => void;
	next: () => void;
	prev: () => void;
	setRate: (rate: number) => void;
}

interface UseReaderSpeechOptions {
	/** 当前章节 id；切章时 controller 会自动重置 */
	chapterKey: string | number | null;
	/** 双栏分页模式 */
	isPaged: boolean;
	/** 章节是否就绪（有 text/html） */
	hasContent: boolean;
}

export function useReaderSpeech(
	opts: UseReaderSpeechOptions,
): ReaderSpeechHandle {
	const status = useTtsStoreSelector((s) => s.status);
	const scope = useTtsStoreSelector((s) => s.scope);
	const rate = useTtsStoreSelector((s) => s.settings?.rate ?? 1);
	// 音色/Provider 变化时让 controller 清空音频预取缓存（base64 是按旧音色合成的）
	const providerId = useTtsStoreSelector(
		(s) => s.settings?.default_provider_id ?? null,
	);
	const readerVoiceId = useTtsStoreSelector(
		(s) => s.settings?.scene_reader_voice_id ?? null,
	);
	const defaultVoiceId = useTtsStoreSelector(
		(s) => s.settings?.default_voice_id ?? null,
	);

	const controllerRef = useRef<ReaderSpeechController | null>(null);
	const unbindInteractionRef = useRef<(() => void) | null>(null);
	const progressRef = useRef<ReaderSpeechProgress>({
		cursor: -1,
		total: 0,
		currentElement: null,
	});

	const teardown = useCallback(() => {
		// 先解绑 click 监听并移除 article class，避免残留
		unbindInteractionRef.current?.();
		unbindInteractionRef.current = null;
		controllerRef.current?.stop();
		controllerRef.current?.clearDomMarks();
		controllerRef.current = null;
		progressRef.current = { cursor: -1, total: 0, currentElement: null };
	}, []);

	// 切章 / 卸载 / chapterKey 变化 → 清理旧 controller
	useEffect(() => {
		return () => {
			teardown();
		};
	}, [teardown]);
	useEffect(() => {
		teardown();
		// chapterKey 变化时停止旧朗读，但不强制启动新章节
	}, [opts.chapterKey, teardown]);
	// 用户在朗读中切换音色/Provider/语速 → 让 controller 把缓存里旧参数合成的 base64 全部丢弃，
	// 下一段会按新 settings 重新 prefetch。当前正在播的那一段：
	//  - 远程 TTS 通过 audio.playbackRate 已经实时变速（setTtsRate 内部已处理）
	//  - 系统 TTS 当前段无法实时变速（Web Speech API 限制），下一段会用新 rate
	// rate 高频变化（拖动滑块）→ debounce 250ms，避免疯狂 invalidate
	useEffect(() => {
		const handle = setTimeout(() => {
			controllerRef.current?.invalidatePrefetch();
		}, 250);
		return () => clearTimeout(handle);
	}, [providerId, readerVoiceId, defaultVoiceId, rate]);

	const queryDom = useCallback(() => {
		const article = document.querySelector(
			".reader-article",
		) as HTMLElement | null;
		const scrollContainer = opts.isPaged
			? (document.querySelector(".reader-engine--paged") as HTMLElement | null)
			: (document.querySelector(".reader-main") as HTMLElement | null);
		return { article, scrollContainer };
	}, [opts.isPaged]);

	const start = useCallback(() => {
		if (!opts.hasContent) return;
		const { article, scrollContainer } = queryDom();
		if (!article || !scrollContainer) return;
		const segments = collectReaderSegments(article);
		if (segments.length === 0) return;
		const startIndex = findStartSegmentIndex(
			segments,
			scrollContainer,
			opts.isPaged ? "paged" : "scroll",
		);
		// 旧 controller 先彻底关掉
		teardown();
		const controller = createReaderSpeechController(
			segments,
			scrollContainer,
			opts.isPaged ? "paged" : "scroll",
			{
				onProgress: (p) => {
					progressRef.current = p;
				},
				onComplete: () => {
					controllerRef.current = null;
				},
				onAbort: () => {
					// stop() 会触发；不在这里清 controllerRef，stop() 已经管了
				},
				autoScroll: true,
			},
		);
		controllerRef.current = controller;
		// 朗读期间允许用户点击其他段直接跳读
		unbindInteractionRef.current = controller.bindArticleInteraction(article);
		controller.start(Math.max(0, startIndex));
	}, [opts.hasContent, opts.isPaged, queryDom, teardown]);

	const stop = useCallback(() => {
		unbindInteractionRef.current?.();
		unbindInteractionRef.current = null;
		controllerRef.current?.stop();
		controllerRef.current = null;
		// 双保险：即使 controller 已 null 也清掉全局 TTS
		stopTts();
	}, []);

	const next = useCallback(() => {
		const c = controllerRef.current;
		if (!c) return;
		const target = progressRef.current.cursor + 1;
		if (target >= c.segmentCount) {
			stop();
			return;
		}
		c.jumpTo(target);
	}, [stop]);

	const prev = useCallback(() => {
		const c = controllerRef.current;
		if (!c) return;
		const target = Math.max(0, progressRef.current.cursor - 1);
		c.jumpTo(target);
	}, []);

	return useMemo<ReaderSpeechHandle>(
		() => ({
			status,
			rate,
			scope,
			cursor: progressRef.current.cursor,
			total: progressRef.current.total,
			start,
			pause: pauseTts,
			resume: resumeTts,
			stop,
			next,
			prev,
			setRate: setTtsRate,
		}),
		[status, rate, scope, start, stop, next, prev],
	);
}
