import { runBrowserSearch, type BrowserSearchResult } from "../browserSearch";

type WebSearchFallbackDecision =
	| {
			kind: "skip";
			reason: string;
	  }
	| {
			kind: "fallback";
			query: string;
			updatedToolOutput: {
				query: string;
				results: Array<{
					tool_use_id: string;
					content: Array<{ title: string; url: string }>;
				}>;
				durationSeconds: number;
				fallback: {
					provider: "browser_search";
					engine: string;
					reason: string;
				};
			};
			additionalContext: string;
			results: BrowserSearchResult[];
	  };

const WEB_SEARCH_UNAVAILABLE_PATTERNS = [
	/\bI don't (?:currently |actually )?have (?:access to )?a web search tool\b/i,
	/\bI do not (?:currently |actually )?have (?:access to )?a web search tool\b/i,
	/\bno web search tool (?:available|enabled)\b/i,
	/\bwithout the ability to browse the internet\b/i,
	/\bcan't perform live web searches\b/i,
	/\bcannot perform live web searches\b/i,
	/\bunable to perform live web searches\b/i,
	/\bI'm a text-based AI assistant\b/i,
	/没有(?:可用的)?(?:网络|网页)?搜索工具/,
	/无法(?:进行|执行).*实时.*搜索/,
];

function extractQuery(toolInput: unknown, toolResponse: unknown): string {
	const fromInput =
		toolInput &&
		typeof toolInput === "object" &&
		"query" in toolInput &&
		typeof (toolInput as { query?: unknown }).query === "string"
			? (toolInput as { query: string }).query
			: "";
	if (fromInput.trim()) return fromInput.trim();

	const fromResponse =
		toolResponse &&
		typeof toolResponse === "object" &&
		"query" in toolResponse &&
		typeof (toolResponse as { query?: unknown }).query === "string"
			? (toolResponse as { query: string }).query
			: "";
	return fromResponse.trim();
}

function collectText(value: unknown, out: string[] = [], depth = 0): string[] {
	if (depth > 8 || value == null) return out;
	if (typeof value === "string") {
		out.push(value);
		return out;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectText(item, out, depth + 1);
		return out;
	}
	if (typeof value !== "object") return out;
	for (const nested of Object.values(value as Record<string, unknown>)) {
		collectText(nested, out, depth + 1);
	}
	return out;
}

function hasStructuredSearchHit(value: unknown, depth = 0): boolean {
	if (depth > 8 || value == null) return false;
	if (Array.isArray(value)) {
		return value.some((item) => hasStructuredSearchHit(item, depth + 1));
	}
	if (typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	if (typeof record.title === "string" && typeof record.url === "string") {
		return record.title.trim().length > 0 && record.url.trim().length > 0;
	}
	if (
		record.type === "web_search_result" &&
		typeof record.url === "string" &&
		record.url.trim()
	) {
		return true;
	}
	return Object.values(record).some((nested) =>
		hasStructuredSearchHit(nested, depth + 1),
	);
}

function isUnavailableSearchResponse(toolResponse: unknown): boolean {
	if (hasStructuredSearchHit(toolResponse)) return false;
	const text = collectText(toolResponse).join("\n").slice(0, 12000);
	if (!text.trim()) return false;
	return WEB_SEARCH_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(text));
}

function formatFallbackContext(options: {
	query: string;
	engine: string;
	results: BrowserSearchResult[];
}) {
	const lines = options.results.map((result, index) => {
		const snippet = result.snippet?.trim()
			? `\n   摘要：${result.snippet.trim()}`
			: "";
		return `${index + 1}. ${result.title}\n   URL：${result.url}${snippet}`;
	});

	return [
		`内置 WebSearch 的原生结果无效：模型供应商返回了“没有 web search tool / 无法实时搜索”的文本，并未给出真实搜索链接。`,
		`已使用本地 browser_search 兜底执行真实搜索。query=${JSON.stringify(options.query)}, engine=${options.engine}`,
		`请忽略上一条 WebSearch 结果中声称无法搜索的文本，改用下面的真实搜索结果继续任务，并在最终回复里引用这些 URL：`,
		...lines,
	].join("\n");
}

export async function resolveWebSearchFallback(options: {
	toolName: string;
	toolInput: unknown;
	toolResponse: unknown;
	toolUseId?: string;
	engine?: string;
	limit?: number;
}): Promise<WebSearchFallbackDecision> {
	if (options.toolName.toLowerCase() !== "websearch") {
		return { kind: "skip", reason: "not_websearch" };
	}
	if (!isUnavailableSearchResponse(options.toolResponse)) {
		return { kind: "skip", reason: "native_result_usable" };
	}

	const query = extractQuery(options.toolInput, options.toolResponse);
	if (!query) return { kind: "skip", reason: "missing_query" };

	const startedAt = Date.now();
	const engine = options.engine || "bing";
	const results = await runBrowserSearch({
		query,
		engine,
		use_playwright: false,
		limit: options.limit ?? 8,
	});
	const durationSeconds = (Date.now() - startedAt) / 1000;
	if (results.length === 0) {
		return { kind: "skip", reason: "local_search_empty" };
	}

	const updatedToolOutput = {
		query,
		results: [
			{
				tool_use_id: options.toolUseId || "local_browser_search_fallback",
				content: results.map((result) => ({
					title: result.title,
					url: result.url,
				})),
			},
		],
		durationSeconds,
		fallback: {
			provider: "browser_search" as const,
			engine,
			reason: "native_websearch_unavailable_text",
		},
	};

	return {
		kind: "fallback",
		query,
		updatedToolOutput,
		additionalContext: formatFallbackContext({ query, engine, results }),
		results,
	};
}
