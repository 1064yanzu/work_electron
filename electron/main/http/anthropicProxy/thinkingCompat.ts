export type ThoughtSource = "thinking" | "reasoning";

export type ThoughtFragment = {
	source: ThoughtSource;
	text: string;
};

const THOUGHT_MAX_CHARS = 64 * 1024;

const FIELD_TO_SOURCE: Record<string, ThoughtSource> = {
	thinking: "thinking",
	thought: "thinking",
	reasoning: "reasoning",
	reasoning_content: "reasoning",
	reasoning_text: "reasoning",
};

function normalizeText(input: unknown): string {
	if (typeof input !== "string") return "";
	const text = input.trim();
	if (!text) return "";
	return text.length > THOUGHT_MAX_CHARS
		? `${text.slice(0, THOUGHT_MAX_CHARS)}\n\n[Thought truncated]`
		: text;
}

function tryParseThoughtJsonString(input: string): unknown | null {
	const text = input.trim();
	if (!text) return null;
	if (!/^(?:\{|\[)/.test(text)) return null;
	if (!/"(?:thinking|reasoning|reasoning_content|reasoning_text|thought|text|content)"/i.test(text)) {
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function collectTextsFromThoughtValue(value: unknown, depth = 0): string[] {
	if (value == null || depth > 10) return [];

	if (typeof value === "string") {
		const parsed = tryParseThoughtJsonString(value);
		if (parsed != null) return collectTextsFromThoughtValue(parsed, depth + 1);
		const normalized = normalizeText(value);
		return normalized ? [normalized] : [];
	}

	if (Array.isArray(value)) {
		const out: string[] = [];
		for (const item of value) {
			out.push(...collectTextsFromThoughtValue(item, depth + 1));
		}
		return out;
	}

	if (typeof value !== "object") return [];

	const out: string[] = [];
	for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
		const normalizedKey = key.toLowerCase().trim();
		if (
			normalizedKey === "text" ||
			normalizedKey === "content" ||
			normalizedKey in FIELD_TO_SOURCE
		) {
			out.push(...collectTextsFromThoughtValue(nested, depth + 1));
			continue;
		}
		if (Array.isArray(nested) || (nested && typeof nested === "object")) {
			out.push(...collectTextsFromThoughtValue(nested, depth + 1));
		}
	}
	return out;
}

function extractThoughtFragmentsFromCarrier(carrier: unknown): ThoughtFragment[] {
	if (!carrier || typeof carrier !== "object") return [];
	const record = carrier as Record<string, unknown>;
	const out: ThoughtFragment[] = [];

	for (const [field, source] of Object.entries(FIELD_TO_SOURCE)) {
		if (!(field in record)) continue;
		const texts = collectTextsFromThoughtValue(record[field]);
		for (const text of texts) {
			if (!text) continue;
			out.push({ source, text });
		}
	}

	return out;
}

function dedupeThoughtFragments(fragments: ThoughtFragment[]): ThoughtFragment[] {
	const seen = new Set<string>();
	const out: ThoughtFragment[] = [];
	for (const fragment of fragments) {
		if (!fragment.text) continue;
		const key = `${fragment.source}\n${fragment.text}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(fragment);
	}
	return out;
}

/**
 * 提取 OpenAI 兼容 chunk 中的思维字段（thinking/reasoning）。
 */
export function extractThoughtFragmentsFromOpenAIChunk(
	chunk: unknown,
): ThoughtFragment[] {
	const carriers = [
		(chunk as any)?.choices?.[0]?.delta,
		(chunk as any)?.choices?.[0]?.message,
		(chunk as any)?.choices?.[0],
		chunk,
	];
	const fragments: ThoughtFragment[] = [];
	for (const carrier of carriers) {
		fragments.push(...extractThoughtFragmentsFromCarrier(carrier));
	}
	return dedupeThoughtFragments(fragments);
}

export function mergeThoughtFragmentsBySource(
	fragments: ThoughtFragment[],
): Partial<Record<ThoughtSource, string>> {
	const merged: Partial<Record<ThoughtSource, string>> = {};
	for (const fragment of fragments) {
		if (!fragment.text) continue;
		const prev = merged[fragment.source] || "";
		if (!prev) {
			merged[fragment.source] = fragment.text;
			continue;
		}
		if (prev === fragment.text) continue;
		if (fragment.text.startsWith(prev)) {
			merged[fragment.source] = fragment.text;
			continue;
		}
		if (prev.startsWith(fragment.text)) continue;
		merged[fragment.source] = `${prev}${fragment.text}`;
	}
	return merged;
}

function computeSuffixPrefixOverlap(prev: string, next: string): number {
	const max = Math.min(prev.length, next.length);
	for (let k = max; k > 0; k--) {
		if (prev.slice(-k) === next.slice(0, k)) return k;
	}
	return 0;
}

function diffThoughtChunk(
	prev: string,
	incoming: string,
): { next: string; delta: string } {
	if (!incoming) return { next: prev, delta: "" };
	if (!prev) return { next: incoming, delta: incoming };

	if (incoming.startsWith(prev)) {
		return { next: incoming, delta: incoming.slice(prev.length) };
	}
	if (prev.endsWith(incoming)) {
		return { next: prev, delta: "" };
	}

	const overlap = computeSuffixPrefixOverlap(prev, incoming);
	if (overlap > 0) {
		const delta = incoming.slice(overlap);
		return { next: prev + delta, delta };
	}

	// 无法判定累计模式时，按增量拼接，避免漏掉新内容。
	return { next: prev + incoming, delta: incoming };
}

/**
 * 对思维流做“累计/增量”归一化，输出只应新增展示的增量片段。
 */
export class ThoughtDeltaNormalizer {
	private readonly stateBySource = new Map<ThoughtSource, string>();

	consume(rawFragments: ThoughtFragment[]): ThoughtFragment[] {
		const grouped = mergeThoughtFragmentsBySource(rawFragments);
		const out: ThoughtFragment[] = [];

		for (const source of ["thinking", "reasoning"] as const) {
			const incoming = normalizeText(grouped[source] || "");
			if (!incoming) continue;
			const prev = this.stateBySource.get(source) || "";
			const { next, delta } = diffThoughtChunk(prev, incoming);
			this.stateBySource.set(source, next);
			if (!delta) continue;
			const normalizedDelta = normalizeText(delta);
			if (!normalizedDelta) continue;
			out.push({ source, text: normalizedDelta });
		}

		return out;
	}
}
