import type { WebSearchResult } from "../../types";
import { invoke } from "../tauriCompat";
import {
	browserSearch,
	type BrowserSearchRequest,
	type BrowserSearchResult,
} from "./browser";
import { getConfig, setConfig } from "./core";
import { listMcpServers, mcpCallTool, mcpListTools } from "./mcp";

export type SearchStrategy =
	| "local_first"
	| "mcp_first"
	| "local_only"
	| "mcp_only";

const DEFAULT_SEARCH_STRATEGY: SearchStrategy = "local_first";

export type SearchMcpProvider = "auto" | "tavily" | "exa_mcp";
const DEFAULT_SEARCH_MCP_PROVIDER: SearchMcpProvider = "auto";

type SearchHealthEntry = {
	lastSuccessAt?: number;
	lastResultCount?: number;
	lastError?: string;
	successCount: number;
	failCount: number;
};

export type SearchHealth = {
	local: SearchHealthEntry;
	mcp: SearchHealthEntry;
};

let cachedSearchStrategy: SearchStrategy = DEFAULT_SEARCH_STRATEGY;
let cachedSearchStrategyLoaded = false;
let cachedSearchMcpProvider: SearchMcpProvider = DEFAULT_SEARCH_MCP_PROVIDER;
let cachedSearchMcpProviderLoaded = false;
const cachedSearchHealth: SearchHealth = {
	local: { successCount: 0, failCount: 0 },
	mcp: { successCount: 0, failCount: 0 },
};

export async function getSearchStrategy(
	forceRefresh = false,
): Promise<SearchStrategy> {
	if (cachedSearchStrategyLoaded && !forceRefresh) return cachedSearchStrategy;
	try {
		const value = await getConfig("search.strategy");
		if (
			value === "local_first" ||
			value === "mcp_first" ||
			value === "local_only" ||
			value === "mcp_only"
		) {
			cachedSearchStrategy = value;
			cachedSearchStrategyLoaded = true;
			return value;
		}
	} catch {
		// ignore
	}

	// 如果没有配置（默认情况），尝试智能检测
	// 如果有可用的 Tavily MCP，自动升级为 MCP 优先
	if (
		!cachedSearchStrategyLoaded ||
		cachedSearchStrategy === DEFAULT_SEARCH_STRATEGY
	) {
		try {
			const binding = await resolveTavilyBinding();
			if (binding) {
				console.log(
					"[Config] 自动检测到 Tavily MCP，将搜索策略升级为 mcp_first",
				);
				cachedSearchStrategy = "mcp_first";
				cachedSearchStrategyLoaded = true;
				return "mcp_first";
			}
		} catch (e) {
			console.warn("[Config] 检测 Tavily MCP 失败", e);
		}
	}

	cachedSearchStrategyLoaded = true;
	return cachedSearchStrategy;
}

export async function setSearchStrategy(
	strategy: SearchStrategy,
): Promise<void> {
	cachedSearchStrategy = strategy;
	cachedSearchStrategyLoaded = true;
	await setConfig("search.strategy", strategy);
}

export async function getSearchMcpProvider(
	forceRefresh = false,
): Promise<SearchMcpProvider> {
	if (cachedSearchMcpProviderLoaded && !forceRefresh)
		return cachedSearchMcpProvider;
	try {
		const value = await getConfig("search.mcpProvider");
		if (value === "auto" || value === "tavily" || value === "exa_mcp") {
			cachedSearchMcpProvider = value;
			cachedSearchMcpProviderLoaded = true;
			return value;
		}
	} catch {
		// ignore
	}
	cachedSearchMcpProviderLoaded = true;
	return cachedSearchMcpProvider;
}

export async function setSearchMcpProvider(
	provider: SearchMcpProvider,
): Promise<void> {
	cachedSearchMcpProvider = provider;
	cachedSearchMcpProviderLoaded = true;
	await setConfig("search.mcpProvider", provider);
}

export type WebSearchTuning = {
	maxResults: number;
	excludeDomains: string[];
	searchWithTime: boolean;
	perDomainLimit: number;
};

const DEFAULT_WEBSEARCH_TUNING: WebSearchTuning = {
	maxResults: 10,
	excludeDomains: [],
	searchWithTime: false,
	perDomainLimit: 3,
};

let cachedWebSearchTuning: WebSearchTuning = DEFAULT_WEBSEARCH_TUNING;
let cachedWebSearchTuningLoaded = false;

function normalizeDomainInput(value: unknown): string[] {
	const raw: string[] = Array.isArray(value)
		? value.map((x) => String(x))
		: typeof value === "string"
			? value.split(/[\n,，]/g)
			: [];

	return raw
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean)
		.map((s) => s.replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))
		.map((s) => s.replace(/^\.+/, ""))
		.filter(Boolean);
}

export async function getWebSearchTuning(
	forceRefresh = false,
): Promise<WebSearchTuning> {
	if (cachedWebSearchTuningLoaded && !forceRefresh)
		return cachedWebSearchTuning;

	try {
		const [maxResultsRaw, excludeRaw, withTimeRaw, perDomainRaw] =
			await Promise.all([
				getConfig("search.maxResults"),
				getConfig("search.excludeDomains"),
				getConfig("search.searchWithTime"),
				getConfig("search.perDomainLimit"),
			]);

		const maxResults =
			typeof maxResultsRaw === "number" && Number.isFinite(maxResultsRaw)
				? Math.max(1, Math.min(50, Math.floor(maxResultsRaw)))
				: DEFAULT_WEBSEARCH_TUNING.maxResults;
		const excludeDomains = normalizeDomainInput(excludeRaw);
		const searchWithTime = Boolean(withTimeRaw);
		const perDomainLimit =
			typeof perDomainRaw === "number" && Number.isFinite(perDomainRaw)
				? Math.max(1, Math.min(10, Math.floor(perDomainRaw)))
				: DEFAULT_WEBSEARCH_TUNING.perDomainLimit;

		cachedWebSearchTuning = {
			maxResults,
			excludeDomains,
			searchWithTime,
			perDomainLimit,
		};
		cachedWebSearchTuningLoaded = true;
		return cachedWebSearchTuning;
	} catch {
		cachedWebSearchTuningLoaded = true;
		return cachedWebSearchTuning;
	}
}

export async function setWebSearchTuning(
	patch: Partial<WebSearchTuning>,
): Promise<void> {
	const next: WebSearchTuning = {
		...(await getWebSearchTuning()),
		...patch,
	};

	cachedWebSearchTuning = {
		maxResults: Math.max(1, Math.min(50, Math.floor(next.maxResults))),
		excludeDomains: normalizeDomainInput(next.excludeDomains),
		searchWithTime: Boolean(next.searchWithTime),
		perDomainLimit: Math.max(1, Math.min(10, Math.floor(next.perDomainLimit))),
	};
	cachedWebSearchTuningLoaded = true;

	await Promise.all([
		setConfig("search.maxResults", cachedWebSearchTuning.maxResults),
		setConfig("search.excludeDomains", cachedWebSearchTuning.excludeDomains),
		setConfig("search.searchWithTime", cachedWebSearchTuning.searchWithTime),
		setConfig("search.perDomainLimit", cachedWebSearchTuning.perDomainLimit),
	]);
}

function recordSearchHealth(
	kind: "local" | "mcp",
	ok: boolean,
	resultCount?: number,
	error?: string,
) {
	const entry = cachedSearchHealth[kind];
	if (ok) {
		entry.successCount += 1;
		entry.lastSuccessAt = Date.now();
		entry.lastResultCount = resultCount;
		entry.lastError = undefined;
	} else {
		entry.failCount += 1;
		entry.lastError = error || "unknown";
	}
}

export function getSearchHealth(): SearchHealth {
	return JSON.parse(JSON.stringify(cachedSearchHealth)) as SearchHealth;
}

export function describeSearchHealth(): string {
	const h = cachedSearchHealth;
	const fmt = (e: SearchHealthEntry) =>
		`成功${e.successCount}次/失败${e.failCount}次，最近结果 ${e.lastResultCount ?? "-"}，最后错误 ${e.lastError ?? "无"}`;
	return `本地: ${fmt(h.local)} | MCP: ${fmt(h.mcp)}`;
}

// ───────── Tavily / Exa MCP 搜索桥接 ─────────

type McpToolBinding = {
	serverId: string;
	toolName: string;
	inputSchema?: any;
	discoveredAt: number;
};
let cachedTavilyBinding: McpToolBinding | null = null;

function extractTextBlocks(result: any): string[] {
	const content = Array.isArray(result?.content) ? result.content : [];
	return content
		.filter((c: any) => c && c.type === "text" && typeof c.text === "string")
		.map((c: any) => c.text as string);
}

function tryParseJsonFromText(text: string): any | null {
	const trimmed = text.trim();
	if (!trimmed) return null;
	try {
		return JSON.parse(trimmed);
	} catch {
		const match = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
		if (match) {
			try {
				return JSON.parse(match[1]);
			} catch {
				return null;
			}
		}
		return null;
	}
}

function normalizeWebResults(payload: any): BrowserSearchResult[] {
	const results: any[] =
		(payload && Array.isArray(payload.results) && payload.results) ||
		(payload &&
			payload.data &&
			Array.isArray(payload.data.results) &&
			payload.data.results) ||
		(Array.isArray(payload) ? payload : []);

	return results
		.map((r: any) => ({
			title: String(r?.title || r?.name || r?.heading || "").trim(),
			url: String(r?.url || r?.link || "").trim(),
			snippet: String(r?.snippet || r?.content || r?.description || "").trim(),
			screenshot: undefined,
		}))
		.filter((r) => r.title && r.url.startsWith("http"));
}

function extractUrlishResults(
	text: string,
	limit: number,
): BrowserSearchResult[] {
	const lines = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	const urlRegex = /(https?:\/\/[^\s)]+)\b/g;
	const out: BrowserSearchResult[] = [];
	const seen = new Set<string>();

	for (const line of lines) {
		const matches = line.match(urlRegex);
		if (!matches) continue;
		for (const url of matches) {
			if (seen.has(url)) continue;
			seen.add(url);
			out.push({
				title: url,
				url,
				snippet: line.slice(0, 200),
				screenshot: undefined,
			});
			if (out.length >= limit) return out;
		}
	}
	return out;
}

async function resolveTavilyBinding(): Promise<McpToolBinding | null> {
	const now = Date.now();
	if (
		cachedTavilyBinding &&
		now - cachedTavilyBinding.discoveredAt < 5 * 60_000
	)
		return cachedTavilyBinding;

	const servers = await listMcpServers().catch(() => []);
	const enabled = Array.isArray(servers)
		? servers.filter((s) => s.enabled)
		: [];
	for (const server of enabled) {
		const tools = await mcpListTools(server.id).catch(() => []);
		if (!Array.isArray(tools) || tools.length === 0) continue;
		const exact = tools.find((t) => t?.name === "tavily_search");
		const fuzzy =
			exact ||
			tools.find(
				(t) =>
					typeof t?.name === "string" &&
					/tavily/i.test(t.name) &&
					/search/i.test(t.name),
			);
		if (fuzzy && typeof fuzzy.name === "string") {
			cachedTavilyBinding = {
				serverId: server.id,
				toolName: fuzzy.name,
				inputSchema: (fuzzy as any).inputSchema,
				discoveredAt: now,
			};
			return cachedTavilyBinding;
		}
	}
	return null;
}

function buildTavilyArgs(
	binding: McpToolBinding,
	query: string,
	limit: number,
): Record<string, any> {
	const schema = binding.inputSchema;
	const props =
		schema && typeof schema === "object"
			? (schema.properties as any)
			: undefined;
	const out: Record<string, any> = { query };
	if (!props || typeof props !== "object") {
		out.max_results = limit;
		return out;
	}
	const has = (k: string) => Object.hasOwn(props, k);
	if (has("max_results")) out.max_results = limit;
	else if (has("maxResults")) out.maxResults = limit;
	else if (has("limit")) out.limit = limit;
	else if (has("k")) out.k = limit;
	else out.max_results = limit;
	return out;
}

async function tryLocalSearch(request: BrowserSearchRequest, limit: number) {
	try {
		const res = await browserSearch(request);
		const success = Array.isArray(res) && res.length > 0;
		recordSearchHealth(
			"local",
			success,
			res?.length ?? 0,
			success ? undefined : "0 results",
		);
		if (success) return res.slice(0, limit);
		throw new Error("本地搜索无结果");
	} catch (e) {
		recordSearchHealth(
			"local",
			false,
			undefined,
			e instanceof Error ? e.message : String(e),
		);
		throw e;
	}
}

async function tryMcpTavily(query: string, limit: number) {
	try {
		const binding = await resolveTavilyBinding();
		if (!binding) {
			throw new Error("未配置可用的 MCP Tavily 搜索工具");
		}
		const res = await mcpCallTool(
			binding.serverId,
			binding.toolName,
			buildTavilyArgs(binding, query, limit),
		);
		const text = extractTextBlocks(res).join("\n");
		const parsed = tryParseJsonFromText(text);
		const normalized = normalizeWebResults(parsed);
		const finalResults =
			normalized.length > 0 ? normalized : extractUrlishResults(text, limit);
		const success = finalResults.length > 0;
		recordSearchHealth(
			"mcp",
			success,
			finalResults.length,
			success ? undefined : "0 results",
		);
		if (!success) throw new Error("MCP Tavily 无结果");
		return finalResults.slice(0, limit);
	} catch (e) {
		recordSearchHealth(
			"mcp",
			false,
			undefined,
			e instanceof Error ? e.message : String(e),
		);
		throw e;
	}
}

type ExaMcpResult = {
	title?: string;
	url?: string;
	text?: string;
	publishedDate?: string;
};

const EXA_MCP_API_HOST = "https://mcp.exa.ai/mcp";

function parseExaMcpText(raw: string): ExaMcpResult[] {
	const items: ExaMcpResult[] = [];
	for (const chunk of raw.split("\n\n")) {
		const lines = chunk.split("\n");
		let title = "";
		let url = "";
		let text = "";
		let textStartIndex = -1;
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i];
			if (line.startsWith("Title:")) {
				title = line.replace(/^Title:\s*/, "");
				continue;
			}
			if (line.startsWith("URL:")) {
				url = line.replace(/^URL:\s*/, "");
				continue;
			}
			if (line.startsWith("Text:") && textStartIndex === -1) {
				textStartIndex = i;
				text = line.replace(/^Text:\s*/, "");
			}
		}
		if (textStartIndex !== -1) {
			const rest = lines.slice(textStartIndex + 1).join("\n");
			if (rest.trim().length > 0) {
				text = text ? `${text}\n${rest}` : rest;
			}
		}
		if (title || url || text) {
			items.push({ title, url, text });
		}
	}
	return items;
}

function parseExaMcpResponse(text: string): BrowserSearchResult[] {
	const lines = text.split("\n");
	for (const line of lines) {
		if (!line.startsWith("data: ")) continue;
		try {
			const data = JSON.parse(line.slice(6)) as {
				result?: { content?: Array<{ type: string; text?: string }> };
			};
			const contentText = data.result?.content?.[0]?.text;
			if (contentText) {
				return parseExaMcpText(contentText).map((item) => ({
					title: item.title?.trim() || item.url?.trim() || "Untitled",
					url: item.url?.trim() || "",
					snippet: item.text?.trim() || "",
					screenshot: undefined,
				}));
			}
		} catch {
			continue;
		}
	}
	try {
		const data = JSON.parse(text) as {
			result?: { content?: Array<{ type: string; text?: string }> };
		};
		const contentText = data.result?.content?.[0]?.text;
		if (contentText) {
			return parseExaMcpText(contentText).map((item) => ({
				title: item.title?.trim() || item.url?.trim() || "Untitled",
				url: item.url?.trim() || "",
				snippet: item.text?.trim() || "",
				screenshot: undefined,
			}));
		}
	} catch {
		return [];
	}
	return [];
}

async function tryExaMcpSearch(query: string, limit: number) {
	try {
		// 优先交给后端执行请求与解析（避免渲染进程 CORS/性能问题）
		let normalized: BrowserSearchResult[] = [];
		try {
			normalized = await invoke("exa_mcp_search", { query, limit });
		} catch {
			// 回退：仍然在渲染进程请求（兼容未注册 handler / 非桌面环境）
			const response = await fetch(EXA_MCP_API_HOST, {
				method: "POST",
				headers: {
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: {
						name: "web_search_exa",
						arguments: {
							query,
							type: "auto",
							numResults: limit,
							livecrawl: "fallback",
						},
					},
				}),
			});
			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Exa MCP ${response.status}: ${errorText}`);
			}
			const text = await response.text();
			normalized = parseExaMcpResponse(text);
		}
		const finalResults = normalized.filter(
			(r) => r.url && r.url.startsWith("http"),
		);
		const success = finalResults.length > 0;
		recordSearchHealth(
			"mcp",
			success,
			finalResults.length,
			success ? undefined : "0 results",
		);
		if (!success) throw new Error("Exa MCP 无结果");
		return finalResults.slice(0, limit);
	} catch (e) {
		recordSearchHealth(
			"mcp",
			false,
			undefined,
			e instanceof Error ? e.message : String(e),
		);
		throw e;
	}
}

export async function smartBrowserSearch(
	request: BrowserSearchRequest & { limit?: number; strategy?: SearchStrategy },
): Promise<BrowserSearchResult[]> {
	const tuning = await getWebSearchTuning();
	const limit =
		typeof request.limit === "number" && request.limit > 0
			? request.limit
			: tuning.maxResults;
	const strategy = request.strategy || (await getSearchStrategy());
	const mcpProvider = await getSearchMcpProvider();

	const query = tuning.searchWithTime
		? `${new Date().toLocaleDateString("zh-CN")} ${request.query}`
		: request.query;
	const requestWithTuning: BrowserSearchRequest = {
		...request,
		query,
		limit: limit * 3,
	};

	const applyPolicies = (results: BrowserSearchResult[]) => {
		const out: BrowserSearchResult[] = [];
		const perDomain = new Map<string, number>();
		const seen = new Set<string>();
		for (const r of results) {
			const url = String(r?.url || "").trim();
			if (!url.startsWith("http")) continue;
			if (seen.has(url)) continue;

			let hostname = "";
			try {
				hostname = new URL(url).hostname.toLowerCase();
			} catch {
				continue;
			}

			if (
				tuning.excludeDomains.some(
					(d) => hostname === d || hostname.endsWith(`.${d}`),
				)
			) {
				continue;
			}
			const count = perDomain.get(hostname) ?? 0;
			if (count >= tuning.perDomainLimit) continue;
			perDomain.set(hostname, count + 1);
			seen.add(url);
			out.push({ ...r, url });
			if (out.length >= limit) break;
		}
		return out;
	};

	const runLocal = async () =>
		applyPolicies(await tryLocalSearch(requestWithTuning, limit * 3));
	const runMcp = async () => {
		if (mcpProvider === "exa_mcp") {
			return applyPolicies(await tryExaMcpSearch(query, limit * 3));
		}
		if (mcpProvider === "tavily") {
			return applyPolicies(await tryMcpTavily(query, limit * 3));
		}
		try {
			return applyPolicies(await tryMcpTavily(query, limit * 3));
		} catch {
			return applyPolicies(await tryExaMcpSearch(query, limit * 3));
		}
	};

	const wrapError = (primary: unknown, secondary?: unknown) => {
		const p = primary instanceof Error ? primary.message : String(primary);
		const s = secondary
			? secondary instanceof Error
				? secondary.message
				: String(secondary)
			: "";
		return s ? `${p}; fallback 也失败: ${s}` : p;
	};

	if (strategy === "mcp_only") {
		try {
			return await runMcp();
		} catch (e) {
			throw new Error(wrapError(e));
		}
	}

	if (strategy === "local_only") {
		try {
			return await runLocal();
		} catch (e) {
			throw new Error(wrapError(e));
		}
	}

	if (strategy === "local_first") {
		try {
			return await runLocal();
		} catch (localErr) {
			try {
				return await runMcp();
			} catch (mcpErr) {
				throw new Error(wrapError(localErr, mcpErr));
			}
		}
	}

	// mcp_first
	try {
		return await runMcp();
	} catch (mcpErr) {
		try {
			return await runLocal();
		} catch (localErr) {
			throw new Error(wrapError(mcpErr, localErr));
		}
	}
}

export async function smartWebSearch(payload: {
	query: string;
	engine?: string;
	limit?: number;
	strategy?: SearchStrategy;
}): Promise<WebSearchResult[]> {
	const results = await smartBrowserSearch({
		query: payload.query,
		engine: (payload.engine as any) || "duckduckgo",
		use_playwright: false,
		limit: payload.limit,
		strategy: payload.strategy,
	});
	return results.map((r) => ({
		title: r.title,
		url: r.url,
		snippet: r.snippet,
	}));
}
