export function isContextTooLongError(text: string): boolean {
	const t = String(text || "").toLowerCase();
	return (
		t.includes("context_length_exceeded") ||
		t.includes("context too long") ||
		t.includes("max tokens") ||
		t.includes("token limit")
	);
}

export function trimConversationContextLines(
	lines: string[],
	maxLines: number,
	maxCharsPerLine: number,
): string[] {
	const trimmed = lines
		.map((line) => String(line || "").trim())
		.filter(Boolean)
		.map((line) =>
			line.length > maxCharsPerLine
				? `${line.slice(0, maxCharsPerLine)}...`
				: line,
		);
	if (trimmed.length <= maxLines) return trimmed;
	return trimmed.slice(-maxLines);
}
