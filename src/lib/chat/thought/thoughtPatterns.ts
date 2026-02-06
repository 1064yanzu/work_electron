export interface ThoughtMeta {
	title?: string;
	source?: string;
	model?: string;
	phase?: string;
	durationMs?: number;
	tag?: string;
	truncated?: boolean;
}

export interface ThoughtTagPattern {
	name: string;
	openTag: string;
	closeTag: string;
	title: string;
}

export const THOUGHT_TAG_PATTERNS: ThoughtTagPattern[] = [
	{ name: "think", openTag: "<think>", closeTag: "</think>", title: "Thought" },
	{
		name: "thought",
		openTag: "<thought>",
		closeTag: "</thought>",
		title: "Thought",
	},
	{
		name: "thinking",
		openTag: "<thinking>",
		closeTag: "</thinking>",
		title: "Thinking",
	},
	{
		name: "reasoning",
		openTag: "<reasoning>",
		closeTag: "</reasoning>",
		title: "Reasoning",
	},
];

const THOUGHT_SOURCE_TITLE_MAP: Record<string, string> = {
	reasoning: "Reasoning",
	reasoning_content: "Reasoning",
	reasoning_text: "Reasoning",
	thinking: "Thinking",
	thought: "Thought",
};

export function getThoughtPatternByName(
	name?: string,
): ThoughtTagPattern | null {
	if (!name) return null;
	const target = String(name).trim().toLowerCase();
	if (!target) return null;
	return (
		THOUGHT_TAG_PATTERNS.find((pattern) => pattern.name === target) || null
	);
}

export function deriveThoughtTitle(meta?: ThoughtMeta): string {
	if (meta?.title && meta.title.trim()) return meta.title.trim();
	if (meta?.tag) {
		const pattern = getThoughtPatternByName(meta.tag);
		if (pattern) return pattern.title;
	}
	if (meta?.source) {
		const key = String(meta.source).trim().toLowerCase();
		if (THOUGHT_SOURCE_TITLE_MAP[key]) return THOUGHT_SOURCE_TITLE_MAP[key];
	}
	return "Thought";
}

export function normalizeThoughtContent(
	content: string,
	maxChars: number,
): { content: string; truncated: boolean } {
	const safeMax = Math.max(512, Math.floor(maxChars));
	const text = String(content || "");
	if (text.length <= safeMax) return { content: text, truncated: false };
	const suffix = "\n\n[Thought truncated due to length limit]";
	const keep = Math.max(0, safeMax - suffix.length);
	return {
		content: `${text.slice(0, keep)}${suffix}`,
		truncated: true,
	};
}

export function getMaxThoughtTagTokenLength(): number {
	let max = 0;
	for (const pattern of THOUGHT_TAG_PATTERNS) {
		max = Math.max(max, pattern.openTag.length, pattern.closeTag.length);
	}
	return max;
}
