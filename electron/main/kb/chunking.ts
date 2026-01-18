export type TextChunk = {
	index: number;
	content: string;
};

export function chunkTextByLength(input: string, maxLen = 800): TextChunk[] {
	const text = input.trim();
	if (!text) return [];

	const paragraphs = text
		.split(/\n{2,}/)
		.map((p) => p.trim())
		.filter(Boolean);
	const chunks: TextChunk[] = [];

	let buffer = "";
	let index = 0;

	const flush = () => {
		const c = buffer.trim();
		if (c.length > 0) {
			chunks.push({ index, content: c });
			index += 1;
		}
		buffer = "";
	};

	for (const p of paragraphs) {
		if (p.length > maxLen) {
			flush();
			for (let i = 0; i < p.length; i += maxLen) {
				const slice = p.slice(i, i + maxLen).trim();
				if (slice.length > 0) {
					chunks.push({ index, content: slice });
					index += 1;
				}
			}
			continue;
		}

		if (buffer.length === 0) {
			buffer = p;
			continue;
		}

		if (buffer.length + 2 + p.length <= maxLen) {
			buffer = `${buffer}\n\n${p}`;
		} else {
			flush();
			buffer = p;
		}
	}

	flush();
	return chunks;
}

/**
 * 将文本切分为字符串数组
 */
export function buildChunks(text: string, maxLen = 800): string[] {
	return chunkTextByLength(text, maxLen).map((c) => c.content);
}
