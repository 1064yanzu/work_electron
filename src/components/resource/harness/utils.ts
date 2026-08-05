/**
 * 会话中枢的纯函数工具与常量。
 *
 * 都是无副作用的展示层辅助函数，单独成文件便于复用与阅读。
 */
import type { HandoffProgressPayload } from "./types";

/** 单页最多拉取的会话数（后端上限 500，这里取更克制的值） */
export const LIST_LIMIT = 200;
/** 检索结果上限 */
export const SEARCH_LIMIT = 60;
/** 转录一次最多拉取的消息数 */
export const TRANSCRIPT_LIMIT = 400;
/** 单条消息折叠阈值（字符） */
export const MESSAGE_FOLD_LENGTH = 460;
/** 本应用自身的 harness 标识 */
export const APP_HARNESS = "ipo-sdk";

/** 毫秒时间戳 → 相对时间 */
export function formatRelativeTime(ts: number): string {
	if (!ts) return "";
	const delta = Date.now() - ts;
	if (delta < 0) return "刚刚";
	const min = Math.floor(delta / 60_000);
	if (min < 1) return "刚刚";
	if (min < 60) return `${min} 分钟前`;
	const hour = Math.floor(min / 60);
	if (hour < 24) return `${hour} 小时前`;
	const day = Math.floor(hour / 24);
	if (day < 7) return `${day} 天前`;
	return new Date(ts).toLocaleDateString("zh-CN");
}

/** 取 cwd 的最后两段路径，超出部分用 … 省略 */
export function shortCwd(cwd: string | null): string {
	if (!cwd) return "";
	const segments = cwd.split(/[/\\]/).filter(Boolean);
	if (segments.length === 0) return cwd;
	const tail = segments.slice(-2).join("/");
	return segments.length > 2 ? `…/${tail}` : tail;
}

/** 会话展示标题（后端可能没抓到标题） */
export function sessionTitle(session: {
	title: string | null;
	cwd: string | null;
}): string {
	const title = session.title?.trim();
	if (title) return title;
	const cwd = shortCwd(session.cwd);
	return cwd ? `${cwd} 的会话` : "未命名会话";
}

/** 蒸馏阶段的中文说明 */
export function describeHandoffPhase(
	progress: HandoffProgressPayload | null,
): string {
	if (!progress) return "正在准备…";
	switch (progress.phase) {
		case "loading":
			return "正在读取会话转录…";
		case "mapping":
			return `正在提炼片段 ${progress.current}/${progress.total}`;
		case "reducing":
			return "正在归纳交接要点…";
		case "done":
			return "蒸馏完成";
		default:
			return "正在蒸馏…";
	}
}

/** 错误对象 → 可展示文案 */
export function toMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
