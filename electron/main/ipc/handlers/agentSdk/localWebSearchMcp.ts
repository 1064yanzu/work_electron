import { z } from "zod";
import { runBrowserSearch, type BrowserSearchResult } from "../browserSearch";

const LOCAL_WEB_SEARCH_SERVER_NAME = "ipo_browser_search";
const LOCAL_WEB_SEARCH_TOOL_NAME = "web_search";

export const LOCAL_WEB_SEARCH_MCP_TOOL =
	`mcp__${LOCAL_WEB_SEARCH_SERVER_NAME}__${LOCAL_WEB_SEARCH_TOOL_NAME}` as const;

type ClaudeAgentSdkLike = {
	createSdkMcpServer: (options: unknown) => unknown;
	tool: (
		name: string,
		description: string,
		inputSchema: Record<string, unknown>,
		handler: (args: Record<string, unknown>) => Promise<unknown>,
		extras?: Record<string, unknown>,
	) => unknown;
};

function normalizeDomain(value: unknown): string {
	const raw = String(value || "")
		.trim()
		.toLowerCase();
	if (!raw) return "";
	try {
		return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
	} catch {
		return raw.replace(/^www\./, "");
	}
}

function hostnameMatches(hostname: string, domain: string): boolean {
	const host = hostname.toLowerCase().replace(/^www\./, "");
	const target = domain.toLowerCase().replace(/^www\./, "");
	return host === target || host.endsWith(`.${target}`);
}

function filterByDomains(
	results: BrowserSearchResult[],
	allowedDomains: unknown,
	blockedDomains: unknown,
): BrowserSearchResult[] {
	const allowed = Array.isArray(allowedDomains)
		? allowedDomains.map(normalizeDomain).filter(Boolean)
		: [];
	const blocked = Array.isArray(blockedDomains)
		? blockedDomains.map(normalizeDomain).filter(Boolean)
		: [];

	return results.filter((result) => {
		let hostname = "";
		try {
			hostname = new URL(result.url).hostname;
		} catch {
			return false;
		}
		if (blocked.some((domain) => hostnameMatches(hostname, domain))) {
			return false;
		}
		if (allowed.length > 0) {
			return allowed.some((domain) => hostnameMatches(hostname, domain));
		}
		return true;
	});
}

function formatSearchResults(options: {
	query: string;
	engine: string;
	results: BrowserSearchResult[];
}) {
	return JSON.stringify(
		{
			query: options.query,
			provider: "local_browser_search",
			engine: options.engine,
			results: options.results.map((result) => ({
				title: result.title,
				url: result.url,
				snippet: result.snippet,
			})),
			usage:
				"Use these real search result URLs as sources. Do not say web search is unavailable when results are present.",
		},
		null,
		2,
	);
}

export function createLocalWebSearchMcpServer(sdk: ClaudeAgentSdkLike) {
	return sdk.createSdkMcpServer({
		name: LOCAL_WEB_SEARCH_SERVER_NAME,
		version: "1.0.0",
		alwaysLoad: true,
		tools: [
			sdk.tool(
				LOCAL_WEB_SEARCH_TOOL_NAME,
				"Search the live web through IPO Workbench's local browser_search implementation. Returns real result URLs and snippets.",
				{
					query: z.string().min(1).describe("Search query"),
					engine: z
						.enum(["bing", "duckduckgo", "google", "baidu"])
						.optional()
						.describe("Search engine, defaults to bing"),
					limit: z
						.number()
						.int()
						.min(1)
						.max(20)
						.optional()
						.describe("Maximum number of results, defaults to 8"),
					allowed_domains: z
						.array(z.string())
						.optional()
						.describe("Only include results from these domains"),
					blocked_domains: z
						.array(z.string())
						.optional()
						.describe("Exclude results from these domains"),
				},
				async (args) => {
					const query = String(args.query || "").trim();
					const engine = String(args.engine || "bing").trim() || "bing";
					const limit =
						typeof args.limit === "number"
							? Math.min(20, Math.max(1, Math.floor(args.limit)))
							: 8;
					const rawResults = await runBrowserSearch({
						query,
						engine,
						limit: Math.min(50, limit * 3),
						use_playwright: false,
					});
					const results = filterByDomains(
						rawResults,
						args.allowed_domains,
						args.blocked_domains,
					).slice(0, limit);

					return {
						content: [
							{
								type: "text",
								text: formatSearchResults({ query, engine, results }),
							},
						],
					};
				},
				{
					alwaysLoad: true,
					searchHint: "live web search, current information, source URLs",
					annotations: {
						title: "本地联网搜索",
						readOnlyHint: true,
						openWorldHint: true,
					},
				},
			),
		],
	});
}
