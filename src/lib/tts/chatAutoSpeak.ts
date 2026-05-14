/**
 * 对话自动朗读控制器（单例，跨组件）
 *
 * 解决几个具体问题：
 *  1. 组件重挂载（虚拟化 / contentVisibility）会让同一条消息再念一遍
 *     —— 用 module 级 Set 记住已播过的 messageId
 *  2. 流式结束瞬间 isStreaming 抖动导致重复触发
 *     —— 用 debounce 合并"完成态"到最后一次 content
 *  3. 长回复一次合成太大
 *     —— 用 splitForSpeech 分段，串成队列依次播；用户触发 stopTts 或切会话自动掐断
 *
 * 不维护任何 UI 状态；UI 读 ttsStore 的 status 即可知道当前是否在念。
 */

import { sanitizeForSpeech, splitForSpeech } from "./sanitize";
import { speakTts, stopTts } from "./ttsStore";

/** 已朗读过的 messageId；避免组件重挂载时重复朗读 */
const spokenMessageIds = new Set<string>();

/** 当前正在播报的 messageId（只允许有一条被自动朗读） */
let activeMessageId: string | null = null;

/** debounce: messageId → timer */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** debounce 期内对应消息的最新 content；timer 触发时读它 */
const pendingContents = new Map<string, string>();

/** 每条消息分段播报的队列控制器 */
interface QueueController {
	cancelled: boolean;
}
const activeQueues = new Map<string, QueueController>();

const COMPLETION_DEBOUNCE_MS = 250;
/** 自动播报允许的最大总字符数；超出截断（用户主动点朗读按钮不受此限） */
const AUTO_MAX_CHARS = 2000;
/** 单段最大字符数，交给 splitForSpeech */
const AUTO_SEGMENT_CHARS = 220;
/**
 * 历史消息保护窗口：timestamp 距离 now 超过此值的消息不再自动朗读。
 * 避免切回旧会话 / 首次打开面板时把历史回复全部再念一遍。
 */
const FRESH_WINDOW_MS = 15_000;

interface AutoSpeakInput {
	messageId: string;
	content: string;
	isStreaming: boolean;
	/** 消息 timestamp（ms）；用于历史消息保护 */
	timestamp?: number;
}

/**
 * 渲染层每次收到新内容都调这个。
 * 组件内保留 useEffect([message.id, message.content, isStreaming]) 即可。
 *
 * 内部逻辑：
 *  - 仍在流式 → 直接跳过；等 isStreaming 翻到 false 那一刻再处理
 *  - 流式刚结束 → 立即把 messageId 计入 spokenMessageIds，
 *    防止 StrictMode 双跑 / 父组件 re-render 导致的二次进入；
 *    再用 debounce 等 React 当前批次的所有状态合并完，统一拿到最终 content
 *  - 同一个 messageId 已经播过 → 直接跳过
 */
export function requestAutoSpeak(input: AutoSpeakInput): void {
	const { messageId, content, isStreaming, timestamp } = input;
	if (!messageId) return;
	if (spokenMessageIds.has(messageId)) return;

	// 流式中：等 isStreaming 翻到 false 再处理。占位定时器对实际播放没有作用，
	// 反而会让流式过程频繁触发 clearPending+setTimeout，无意义。
	if (isStreaming) return;

	// 历史消息保护：距离现在超过 FRESH_WINDOW_MS 的消息直接标记已播
	if (
		typeof timestamp === "number" &&
		Number.isFinite(timestamp) &&
		Date.now() - timestamp > FRESH_WINDOW_MS
	) {
		spokenMessageIds.add(messageId);
		return;
	}

	// 关键：同步标记。后续任何重入（StrictMode 双跑、metadata 抖动）都会被
	// `spokenMessageIds.has(messageId)` 直接挡掉，杜绝重复播报。
	spokenMessageIds.add(messageId);

	// 暂存最新 content；如果 250ms 内 content 被再次更新，timer 触发时读最新版本。
	pendingContents.set(messageId, content);

	clearPending(messageId);
	const timer = setTimeout(() => {
		pendingTimers.delete(messageId);
		const latest = pendingContents.get(messageId) ?? content;
		pendingContents.delete(messageId);
		const sanitized = sanitizeForSpeech(latest, {
			maxLength: AUTO_MAX_CHARS,
		});
		if (!sanitized) return;
		void playQueue(messageId, sanitized);
	}, COMPLETION_DEBOUNCE_MS);
	pendingTimers.set(messageId, timer);
}

function clearPending(messageId: string) {
	const t = pendingTimers.get(messageId);
	if (t) {
		clearTimeout(t);
		pendingTimers.delete(messageId);
	}
	pendingContents.delete(messageId);
}

async function playQueue(messageId: string, text: string): Promise<void> {
	// 替换当前队列
	cancelActiveQueue();
	activeMessageId = messageId;
	const controller: QueueController = { cancelled: false };
	activeQueues.set(messageId, controller);

	const segments = splitForSpeech(text, AUTO_SEGMENT_CHARS);
	for (const seg of segments) {
		if (controller.cancelled) return;
		// 用 Promise 包一层 speakTts 的 onCompleted/onAborted，串成队列
		await new Promise<void>((resolve) => {
			void speakTts(seg, {
				scope: "chat",
				onCompleted: () => resolve(),
				onAborted: () => {
					controller.cancelled = true;
					resolve();
				},
			});
		});
	}
	if (activeMessageId === messageId) {
		activeMessageId = null;
	}
	activeQueues.delete(messageId);
}

function cancelActiveQueue(): void {
	// 标记所有队列为 cancelled；speakTts 会触发 onAborted 推进 resolve
	for (const c of activeQueues.values()) {
		c.cancelled = true;
	}
	activeQueues.clear();
	activeMessageId = null;
}

/**
 * 用户主动切会话 / 关闭侧边栏 / 切主题 / 重新生成消息时调用。
 * 停掉当前播放并清掉 pending，但保留 spokenMessageIds（避免回切后又重念一遍）。
 */
export function cancelChatAutoSpeak(): void {
	for (const t of pendingTimers.values()) clearTimeout(t);
	pendingTimers.clear();
	pendingContents.clear();
	cancelActiveQueue();
	stopTts();
}

/**
 * 重新生成某条消息时调用：把这条消息从已播集合中剔除，允许再次朗读。
 */
export function forgetSpokenMessage(messageId: string): void {
	spokenMessageIds.delete(messageId);
	clearPending(messageId);
	const q = activeQueues.get(messageId);
	if (q) q.cancelled = true;
	activeQueues.delete(messageId);
}

/**
 * 切换会话时清空整个已播集合（新会话的消息允许被念）。
 * 保持 pending/active 被清掉。
 */
export function resetChatAutoSpeak(): void {
	spokenMessageIds.clear();
	cancelChatAutoSpeak();
}
