import type { ChatMessageBlock } from "./types";

function normalizeComparableText(text: string): string {
	return String(text || "")
		.replace(/\s+/g, " ")
		.replace(/[>❌⚠️]/g, "")
		.trim()
		.toLowerCase();
}

export function joinTextBlocks(blocks: ChatMessageBlock[]): string {
	return blocks
		.filter(
			(block): block is Extract<ChatMessageBlock, { type: "text" }> =>
				block.type === "text",
		)
		.map((block) => block.text || "")
		.join("");
}

export function isTextCoveredByFinalText(
	existingText: string,
	finalText: string,
): boolean {
	const existing = normalizeComparableText(existingText);
	const final = normalizeComparableText(finalText);
	if (!existing || !final) return false;
	return final === existing || final.includes(existing);
}
