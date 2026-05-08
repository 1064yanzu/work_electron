/**
 * 阅读器分段朗读控制器
 *
 * 设计意图：
 *  - 把章节 DOM 切成段（p / h1-h4 / blockquote / li），按"当前可见区域"为起点，
 *    一段一段送给 TTS，避免一次性合成整章带来的首段延迟和配额浪费。
 *  - 利用 ttsStore 新增的 onCompleted 回调，自然衔接下一段；用户 stop / 切换页面
 *    都会通过 onAborted 通知 controller 清理。
 *  - 段落切分粒度：段落本身 ≤ MAX_SEG_CHARS（约 220 字）则整段一次朗读；
 *    否则按句号 / 问号 / 叹号 / 分号 切句，再合并到 ≤ MAX_SEG_CHARS。
 *  - DOM 高亮 + 自动滚动跟随：当前段加 class，超出视口时 scrollIntoView。
 *
 * v2 边播边合成（音频预取）：
 *  - 段 N 开始播放时立刻触发段 N+1、N+2 的 IPC 合成（fire-and-forget）
 *  - 段 N 自然结束时，优先消费缓存的 payload，调 speakPrefetchedTts 直接播
 *  - 缓存 miss / 远端合成失败 / 当前是 system provider → 回落到原 speakTts 路径
 *  - jumpTo / stop / settings 变化（外部调 invalidatePrefetch）→ 清空缓存
 *
 * 不依赖 React，方便被 hook 包装也可以被 store/effect 直接调用。
 */

import {
	resolveSpeakConfig,
	speakPrefetchedTts,
	speakTts,
	stopTts,
	type ResolvedSpeakConfig,
	type TTSSynthesizeRequest,
} from "../tts";
import { createAudioPrefetcher, type AudioPrefetcher } from "./audioPrefetcher";

// 单段最大字符数；超出则按句切分再合并
const MAX_SEG_CHARS = 220;
// 句子切分（中英文标点）
const SENTENCE_SPLIT_RE = /(?<=[。！？!?\n；;])/;

// 预取窗口：当前段后预取 LOOKAHEAD 段；保留过去 BEHIND 段以容忍 jumpTo 回退
const PREFETCH_LOOKAHEAD = 2;
const PREFETCH_BEHIND = 1;

const HIGHLIGHT_CLASS = "reader-tts-active";
const READING_CLASS = "reader-tts-reading";

const PARAGRAPH_SELECTOR = "p, h1, h2, h3, h4, h5, h6, blockquote, li";

export interface ReaderSpeechSegment {
	/** DOM 段落锚点（段落级；句切后多个 segment 可能共享同一 element） */
	element: HTMLElement;
	/** 该段在 element.textContent 中的字符起止；用于精确定位 */
	startOffset: number;
	endOffset: number;
	/** 实际朗读的文本（可能是 element.textContent 的一个子串） */
	text: string;
}

export interface ReaderSpeechProgress {
	/** 当前正在播放的段落，0 表示首段；-1 表示尚未开始或已结束 */
	cursor: number;
	/** 总段数 */
	total: number;
	/** 当前段对应的 DOM element */
	currentElement: HTMLElement | null;
}

export interface ReaderSpeechControllerOptions {
	/** 进度更新回调（高亮 / 进度条用） */
	onProgress?: (progress: ReaderSpeechProgress) => void;
	/** 队列播完时触发（自然走到末尾，不是被中止） */
	onComplete?: () => void;
	/** 被外部中止（用户 stop / 切章 / unmount）时触发 */
	onAbort?: () => void;
	/** 是否在播完一段后自动滚动让下一段进入视口；默认 true */
	autoScroll?: boolean;
}

/**
 * 把 article 容器切成 ReaderSpeechSegment 列表。
 * 顺序：DOM 顺序 = 阅读顺序。
 */
export function collectReaderSegments(
	article: HTMLElement,
): ReaderSpeechSegment[] {
	const segments: ReaderSpeechSegment[] = [];
	const blocks = Array.from(
		article.querySelectorAll<HTMLElement>(PARAGRAPH_SELECTOR),
	);
	for (const block of blocks) {
		const text = (block.textContent || "").trim();
		if (!text) continue;
		// 段落较短：整段一次朗读
		if (text.length <= MAX_SEG_CHARS) {
			segments.push({
				element: block,
				startOffset: 0,
				endOffset: text.length,
				text,
			});
			continue;
		}
		// 段落较长：按句号分，逐句合并到 ≤ MAX_SEG_CHARS
		const sentences = text
			.split(SENTENCE_SPLIT_RE)
			.map((s) => s.trim())
			.filter(Boolean);
		let buffer = "";
		let bufferStart = 0;
		let cursor = 0; // 在原始 text 内的累计字符位置
		for (const sentence of sentences) {
			// 找到 sentence 在原始 text 中的位置（从 cursor 开始向后搜索）
			const found = text.indexOf(sentence, cursor);
			const sentenceStart = found >= 0 ? found : cursor;
			const sentenceEnd = sentenceStart + sentence.length;
			cursor = sentenceEnd;

			if (!buffer) {
				buffer = sentence;
				bufferStart = sentenceStart;
				continue;
			}
			if (buffer.length + sentence.length + 1 <= MAX_SEG_CHARS) {
				buffer = `${buffer}${sentence.startsWith("，") ? "" : ""}${sentence}`;
				continue;
			}
			segments.push({
				element: block,
				startOffset: bufferStart,
				endOffset: bufferStart + buffer.length,
				text: buffer,
			});
			buffer = sentence;
			bufferStart = sentenceStart;
		}
		if (buffer) {
			segments.push({
				element: block,
				startOffset: bufferStart,
				endOffset: bufferStart + buffer.length,
				text: buffer,
			});
		}
	}
	return segments;
}

/**
 * 找到"当前可见区域"对应的起点段落 index。
 *
 * 滚动模式（垂直滚动）：第一个 bottom > scrollContainer.top - 8 的段落
 * paged 模式（横向分栏）：第一个 left + width > scrollContainer.left 的段落（即跨过页起点的段落）
 */
export function findStartSegmentIndex(
	segments: ReaderSpeechSegment[],
	scrollContainer: HTMLElement,
	mode: "scroll" | "paged",
): number {
	if (segments.length === 0) return -1;
	const containerRect = scrollContainer.getBoundingClientRect();

	if (mode === "scroll") {
		// 视口顶部上方一点点（- 8px）就接受，避免用户刚滚过半段的体感丢失
		const top = containerRect.top - 8;
		for (let i = 0; i < segments.length; i++) {
			const rect = segments[i].element.getBoundingClientRect();
			// 段落底部还在视口里（或下方）→ 这是可见的第一段
			if (rect.bottom > top) return i;
		}
		// 全部都在视口上方了（极端情况） → 兜底回最后一段
		return segments.length - 1;
	}

	// paged：横向分栏，每页宽度 = container.clientWidth
	// 页起点是 scrollLeft；段落 element 的 offsetLeft 距 article（columns 容器）原点的距离
	const left = containerRect.left - 8;
	for (let i = 0; i < segments.length; i++) {
		const rect = segments[i].element.getBoundingClientRect();
		// 段落右边界仍在视口起点右侧 → 当前页可见
		if (rect.right > left) return i;
	}
	return segments.length - 1;
}

export interface ReaderSpeechController {
	/** 已经准备好的段落数量 */
	readonly segmentCount: number;
	/** 当前 cursor */
	readonly cursor: number;
	/** 是否正在运行（已启动但未完成且未中止） */
	readonly isRunning: boolean;
	/** 启动队列：从 startIndex 开始播 */
	start(startIndex?: number): void;
	/** 跳到指定段落（停掉当前段，继续从该段开始） */
	jumpTo(index: number): void;
	/** 完全终止队列 */
	stop(): void;
	/** 清理 DOM 高亮（不调 stopTts） */
	clearDomMarks(): void;
	/** 清空预取缓存（settings 中 voice/provider 变化时由上层调用） */
	invalidatePrefetch(): void;
	/**
	 * 在 article 上挂"点击段落 → 跳读"监听，并加 .reader-article--tts-running class。
	 * 返回解绑函数，上层在 stop / 切章 / unmount 时务必调用。
	 */
	bindArticleInteraction(article: HTMLElement): () => void;
}

interface InternalState {
	segments: ReaderSpeechSegment[];
	cursor: number;
	running: boolean;
	options: ReaderSpeechControllerOptions;
	scrollContainer: HTMLElement | null;
	mode: "scroll" | "paged";
	prefetcher: AudioPrefetcher;
	/** 预取使用的 voice/provider 锁定快照；避免合成期内 settings 变化导致音色错位 */
	prefetchSignature: string | null;
}

export function createReaderSpeechController(
	segments: ReaderSpeechSegment[],
	scrollContainer: HTMLElement | null,
	mode: "scroll" | "paged",
	options: ReaderSpeechControllerOptions = {},
): ReaderSpeechController {
	const state: InternalState = {
		segments,
		cursor: -1,
		running: false,
		options,
		scrollContainer,
		mode,
		prefetcher: createAudioPrefetcher(),
		prefetchSignature: null,
	};

	function clearAllMarks() {
		for (const seg of state.segments) {
			seg.element.classList.remove(HIGHLIGHT_CLASS, READING_CLASS);
		}
	}

	function highlight(index: number) {
		const seg = state.segments[index];
		if (!seg) return;
		clearAllMarks();
		seg.element.classList.add(HIGHLIGHT_CLASS, READING_CLASS);
		if (state.options.autoScroll !== false && state.scrollContainer) {
			scrollSegmentIntoView(state.scrollContainer, seg.element, state.mode);
		}
	}

	function emitProgress() {
		state.options.onProgress?.({
			cursor: state.cursor,
			total: state.segments.length,
			currentElement: state.segments[state.cursor]?.element ?? null,
		});
	}

	/**
	 * 给定段索引，按当前 settings 解析出预取请求；返回 null 表示本段不应预取
	 * （system provider 路径、settings 未就绪、scope 被禁用）。
	 *
	 * 同时把 voice/provider 拼成 signature 写回 state，用于"settings 变化检测"——
	 * 若已存的 signature 与本次不同，说明 settings 切了音色/Provider，需先清空旧缓存。
	 */
	async function buildPrefetchRequest(
		index: number,
	): Promise<TTSSynthesizeRequest | null> {
		const seg = state.segments[index];
		if (!seg) return null;
		let resolved: ResolvedSpeakConfig | null = null;
		try {
			resolved = await resolveSpeakConfig(seg.text, {
				scope: "reader",
				force: true,
			});
		} catch {
			return null;
		}
		if (!resolved || resolved.kind !== "remote") return null;
		// signature 含 providerId / voice / rate —— 任一变化都让旧缓存作废
		// （TTSSynthesizeRequest.rate 是合成期参数，部分 provider 会把语速烤进音频里）
		const sig = `${resolved.request.providerId}:${resolved.request.voice ?? ""}:${resolved.request.rate ?? 1}`;
		if (state.prefetchSignature && state.prefetchSignature !== sig) {
			// settings 中的音色/Provider 变了 —— 旧缓存全部作废
			state.prefetcher.clear();
		}
		state.prefetchSignature = sig;
		return resolved.request;
	}

	/** 触发指定段的预合成（若条件不满足会安静地不做事） */
	function schedulePrefetch(index: number): void {
		if (index < 0 || index >= state.segments.length) return;
		void buildPrefetchRequest(index).then((req) => {
			if (!req) return;
			if (!state.running) return;
			// 窗口外不再触发（防止 jumpTo 或 stop 后的迟到回调污染缓存）
			if (
				index < state.cursor - PREFETCH_BEHIND ||
				index > state.cursor + PREFETCH_LOOKAHEAD
			) {
				return;
			}
			state.prefetcher.prefetch(index, req);
		});
	}

	/** 走预取路径播某段；预取 miss / 失败时返回 false，由调用方 fallback */
	function tryPlayFromPrefetch(index: number): boolean {
		const pending = state.prefetcher.take(index);
		if (!pending) return false;
		// 已经接管：就算稍后 take 解析为 null（合成失败），也已经走了 fallback 回调
		void pending.then((payload) => {
			if (!state.running) return;
			if (state.cursor !== index) return; // 已被 jumpTo / stop
			if (!payload) {
				// 预取失败 → 退回原路径
				playWithLiveSynthesize(index);
				return;
			}
			speakPrefetchedTts(payload, {
				scope: "reader",
				force: true,
				onCompleted: () => {
					if (!state.running) return;
					if (state.cursor !== index) return;
					playAt(index + 1);
				},
				onAborted: () => {},
			});
		});
		return true;
	}

	/** 老路径：实时合成 + 播放（system provider / 预取 miss / 预取失败 都走这） */
	function playWithLiveSynthesize(index: number): void {
		const seg = state.segments[index];
		if (!seg) {
			finish("complete");
			return;
		}
		void speakTts(seg.text, {
			scope: "reader",
			force: true,
			onCompleted: () => {
				if (!state.running) return;
				if (state.cursor !== index) return;
				playAt(index + 1);
			},
			onAborted: () => {},
		});
	}

	function playAt(index: number) {
		state.cursor = index;
		const seg = state.segments[index];
		if (!seg) {
			finish("complete");
			return;
		}
		highlight(index);
		emitProgress();

		// 滑动窗口：把过远的缓存丢掉，再补齐前方
		state.prefetcher.pruneOutsideWindow(
			index,
			PREFETCH_BEHIND,
			PREFETCH_LOOKAHEAD,
		);
		// 先尝试从缓存播
		const consumed = tryPlayFromPrefetch(index);
		if (!consumed) {
			playWithLiveSynthesize(index);
		}
		// 边播边合成下两段
		for (let i = 1; i <= PREFETCH_LOOKAHEAD; i++) {
			schedulePrefetch(index + i);
		}
	}

	function finish(reason: "complete" | "abort") {
		state.running = false;
		state.cursor = -1;
		clearAllMarks();
		emitProgress();
		if (reason === "complete") state.options.onComplete?.();
		else state.options.onAbort?.();
	}

	/** 跳转到指定段（被 controller.jumpTo 和点击监听共用） */
	function jumpToInternal(index: number): void {
		if (!state.running) return;
		const safe = Math.max(0, Math.min(index, state.segments.length - 1));
		state.cursor = safe;
		state.prefetcher.pruneOutsideWindow(
			safe,
			PREFETCH_BEHIND,
			PREFETCH_LOOKAHEAD,
		);
		playAt(safe);
	}

	/**
	 * 给 article 容器挂 click 监听：朗读中点击任意段落 → 跳到该段继续读。
	 *
	 * 设计要点：
	 *  - 仅在 controller running 时生效（未启动 / stop 后不响应）
	 *  - 用户在划选文字（selection 非 collapsed）→ 不触发，保留正常选择行为
	 *  - 点中链接 / 按钮 / 输入控件 → 不触发，让原生交互优先
	 *  - 长段落被句切成多个 segment 时 → 跳到该 element 的第一个 segment（段头）
	 *  - 同时给 article 加 .reader-article--tts-running class 让 CSS 给出 hover 提示
	 *
	 * 返回解绑函数；上层在 stop / 切章 / unmount 时务必调用，避免事件泄漏。
	 */
	function bindArticleInteraction(article: HTMLElement): () => void {
		article.classList.add("reader-article--tts-running");

		const handler = (ev: MouseEvent) => {
			if (!state.running) return;
			// 用户正在划选 → 让选区行为优先
			const sel = typeof window !== "undefined" ? window.getSelection() : null;
			if (sel && !sel.isCollapsed) return;
			const target = ev.target as HTMLElement | null;
			if (!target) return;
			// 链接 / 按钮 / 输入框 / 可编辑区域 → 让原生交互优先
			if (target.closest("a, button, input, textarea, [contenteditable]")) {
				return;
			}
			// 找到第一个包含 target 的 segment
			let hitIdx = -1;
			for (let i = 0; i < state.segments.length; i++) {
				const el = state.segments[i].element;
				if (el === target || el.contains(target)) {
					hitIdx = i;
					break;
				}
			}
			if (hitIdx < 0) return;
			// 同一 element 可能有多个 segment（长段落句切）→ 回退到该 element 的首段
			const elem = state.segments[hitIdx].element;
			let firstIdx = hitIdx;
			while (firstIdx > 0 && state.segments[firstIdx - 1].element === elem) {
				firstIdx--;
			}
			// 已经在播这一段（或它的子段）→ 静默忽略，避免重复跳同段重新合成
			if (firstIdx === state.cursor) return;
			jumpToInternal(firstIdx);
		};

		article.addEventListener("click", handler);
		return () => {
			article.classList.remove("reader-article--tts-running");
			article.removeEventListener("click", handler);
		};
	}

	return {
		get segmentCount() {
			return state.segments.length;
		},
		get cursor() {
			return state.cursor;
		},
		get isRunning() {
			return state.running;
		},
		start(startIndex = 0) {
			if (state.running) return;
			state.running = true;
			const safeIndex = Math.max(
				0,
				Math.min(startIndex, state.segments.length - 1),
			);
			// 启动时预取首段 + 后续 LOOKAHEAD 段；首段命中预取就能显著缩短首字延迟
			for (let i = 0; i <= PREFETCH_LOOKAHEAD; i++) {
				schedulePrefetch(safeIndex + i);
			}
			playAt(safeIndex);
		},
		jumpTo(index: number) {
			jumpToInternal(index);
		},
		stop() {
			if (!state.running) return;
			state.running = false;
			state.prefetcher.clear();
			state.prefetchSignature = null;
			stopTts();
			finish("abort");
		},
		clearDomMarks() {
			clearAllMarks();
		},
		invalidatePrefetch() {
			state.prefetcher.clear();
			state.prefetchSignature = null;
		},
		bindArticleInteraction,
	};
}

/**
 * 把指定段落滚动到视口里的合适位置。
 * 滚动模式：让段落顶部出现在容器顶部 + 一点 padding 的位置
 * paged 模式：让段落所在的列起点对齐容器左边
 */
function scrollSegmentIntoView(
	scrollContainer: HTMLElement,
	element: HTMLElement,
	mode: "scroll" | "paged",
) {
	const containerRect = scrollContainer.getBoundingClientRect();
	const elementRect = element.getBoundingClientRect();

	if (mode === "scroll") {
		const padding = 80;
		// 段落已经完全在视口（且不贴边） → 不动
		if (
			elementRect.top >= containerRect.top + padding &&
			elementRect.bottom <= containerRect.bottom - 40
		) {
			return;
		}
		const offsetWithin = elementRect.top - containerRect.top;
		const target = scrollContainer.scrollTop + offsetWithin - padding;
		scrollContainer.scrollTo({
			top: Math.max(0, target),
			behavior: "smooth",
		});
		return;
	}

	// paged：找到段落属于第几"页"，跳到该页的起点
	const pageWidth = scrollContainer.clientWidth;
	if (pageWidth <= 0) return;
	const offsetLeft = elementRect.left - containerRect.left;
	const currentLeft = scrollContainer.scrollLeft;
	// 段落在视口左侧 → 上一页；右侧 → 下一页
	if (
		elementRect.right < containerRect.left + 8 ||
		elementRect.left > containerRect.right - 8
	) {
		const targetLeft =
			currentLeft + Math.floor(offsetLeft / pageWidth) * pageWidth;
		const maxLeft = Math.max(
			0,
			scrollContainer.scrollWidth - scrollContainer.clientWidth,
		);
		scrollContainer.scrollTo({
			left: Math.max(0, Math.min(targetLeft, maxLeft)),
			top: 0,
			behavior: "smooth",
		});
	}
}
