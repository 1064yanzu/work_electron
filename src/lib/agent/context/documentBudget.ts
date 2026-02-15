export type DocumentContextMode = "inline" | "summary" | "file_ref";

export type DocumentBudgetInput = {
	content: string;
	hasActiveDoc: boolean;
	docPath?: string | null;
	maxInlineChars?: number;
	maxSummaryChars?: number;
};

export type DocumentBudgetResult = {
	mode: DocumentContextMode;
	injectedDocument: string;
	stats: {
		originalChars: number;
		injectedChars: number;
	};
	guidance?: string;
};

function clip(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;
	return `${text.slice(0, maxChars)}\n...(已截断)`;
}

function buildHeadTailSummary(
	text: string,
	headChars: number,
	tailChars: number,
) {
	if (text.length <= headChars + tailChars + 32) return text;
	const head = text.slice(0, headChars);
	const tail = text.slice(-tailChars);
	return `${head}\n\n...(中间内容已省略)...\n\n${tail}`;
}

function extractHeadings(text: string, maxItems = 8): string[] {
	const lines = text.split(/\r?\n/);
	const out: string[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		if (!/^#{1,6}\s+/.test(trimmed)) continue;
		out.push(trimmed.replace(/^#{1,6}\s+/, ""));
		if (out.length >= maxItems) break;
	}
	return out;
}

export function buildDocumentBudget(
	input: DocumentBudgetInput,
): DocumentBudgetResult {
	const maxInlineChars = Math.max(
		500,
		Math.floor(input.maxInlineChars ?? 4000),
	);
	const maxSummaryChars = Math.max(
		maxInlineChars + 1000,
		Math.floor(input.maxSummaryChars ?? 12000),
	);
	const raw = String(input.content || "");
	const originalChars = raw.length;

	if (!input.hasActiveDoc) {
		return {
			mode: "inline",
			injectedDocument: "（空文档）",
			stats: { originalChars: 0, injectedChars: 4 },
		};
	}

	if (!raw.trim()) {
		return {
			mode: "inline",
			injectedDocument: "（空文档）",
			stats: { originalChars, injectedChars: 4 },
		};
	}

	if (originalChars <= maxInlineChars) {
		return {
			mode: "inline",
			injectedDocument: raw,
			stats: { originalChars, injectedChars: originalChars },
		};
	}

	const headings = extractHeadings(raw);
	const headingBlock =
		headings.length > 0 ? `\n## 结构标题\n- ${headings.join("\n- ")}\n` : "";

	if (originalChars <= maxSummaryChars) {
		const summary = buildHeadTailSummary(raw, 1800, 1200);
		const injected = clip(
			`【文档摘要模式】文档较长，以下为头尾片段与结构信息。${headingBlock}\n${summary}`,
			maxSummaryChars,
		);
		return {
			mode: "summary",
			injectedDocument: injected,
			stats: { originalChars, injectedChars: injected.length },
			guidance: "当前文档已按摘要模式注入；若需要细节，请用 Read 精确读取。",
		};
	}

	const pathTip = input.docPath?.trim()
		? `文档路径：${input.docPath}`
		: "文档路径不可用，请通过当前工作目录定位目标文档后 Read。";
	const tinySummary = buildHeadTailSummary(raw, 800, 500);
	const injected = clip(
		`【文档引用模式】文档过大，未全量注入。\n${pathTip}${headingBlock}\n## 文档片段\n${tinySummary}`,
		2400,
	);
	return {
		mode: "file_ref",
		injectedDocument: injected,
		stats: { originalChars, injectedChars: injected.length },
		guidance: "文档已转为 file_ref，先基于路径或标题定位文件，再按需 Read。",
	};
}
