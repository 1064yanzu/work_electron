/**
 * 合并当前已累积文本与新收到的流式片段。
 *
 * 目标：
 * - 正常增量：previous + next
 * - 上游重复发送已有片段：不重复追加
 * - 上游回放带重叠的尾部：只补齐新增部分
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
	if (!previous) {
		return next;
	}
	if (next === previous) {
		return previous;
	}
	if (next.startsWith(previous)) {
		return next;
	}
	if (previous.includes(next)) {
		return previous;
	}
	if (next.includes(previous)) {
		return next;
	}

	const maxOverlap = Math.min(previous.length, next.length);
	for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
		if (previous.slice(-overlap) === next.slice(0, overlap)) {
			return `${previous}${next.slice(overlap)}`;
		}
	}

	return `${previous}${next}`;
}

export function getAppendedStreamingDelta(
	previousText: string | undefined,
	nextChunk: string | undefined,
): { mergedText: string; appendedDelta: string } {
	const previous = typeof previousText === "string" ? previousText : "";
	const mergedText = mergeStreamingText(previous, nextChunk);
	if (mergedText.length <= previous.length) {
		return {
			mergedText,
			appendedDelta: "",
		};
	}
	return {
		mergedText,
		appendedDelta: mergedText.slice(previous.length),
	};
}
