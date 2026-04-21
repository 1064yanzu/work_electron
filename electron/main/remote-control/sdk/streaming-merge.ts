/**
 * Streaming 文本合并算法 —— 整段移植自 openclaw
 * source: openclaw-main/extensions/feishu/src/streaming-card.ts:115-149
 *
 * 用途：处理 streaming 过程中收到的文本片段，把它们合并成完整文本。
 * 场景：
 * - 增量 text_delta 相加（最常见）
 * - 流中断重发，出现部分重叠
 * - 上游发来的已经是累计文本（next.startsWith(previous)）
 */

/**
 * 合并 previous 和 next 两段文本。
 * 返回语义上正确的完整文本。
 */
export function mergeStreamingText(
	previousText: string | undefined,
	nextText: string | undefined,
): string {
	const previous = typeof previousText === "string" ? previousText : "";
	const next = typeof nextText === "string" ? nextText : "";
	if (!next) {
		return previous;
	}
	if (!previous || next === previous) {
		return next;
	}
	if (next.startsWith(previous)) {
		return next;
	}
	if (previous.startsWith(next)) {
		return previous;
	}
	if (next.includes(previous)) {
		return next;
	}
	if (previous.includes(next)) {
		return previous;
	}

	// Merge partial overlaps, e.g. "这" + "这是" => "这是".
	const maxOverlap = Math.min(previous.length, next.length);
	for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
		if (previous.slice(-overlap) === next.slice(0, overlap)) {
			return `${previous}${next.slice(overlap)}`;
		}
	}
	// Fallback for fragmented partial chunks: append as-is to avoid losing tokens.
	return `${previous}${next}`;
}

/**
 * 截断长文本给 summary 用。
 * source: openclaw-main/extensions/feishu/src/streaming-card.ts:107-113
 */
export function truncateSummary(text: string, max = 50): string {
	if (!text) {
		return "";
	}
	const clean = text.replace(/\n/g, " ").trim();
	return clean.length <= max ? clean : `${clean.slice(0, max - 3)}...`;
}
