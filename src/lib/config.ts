import type { WebSearchResult } from "../types";
import type {
	RemoteChannelStatus,
	RemoteControlConfig,
	RemotePairingRecord,
	RemotePairingRequest,
	RemoteRuntimeStatus,
	RemoteSessionInfo,
} from "./api";
import {
	MOTION_PREFERENCE_CONFIG_KEY,
	MOTION_PREFERENCE_EVENT,
	normalizeMotionPreference,
	type MotionPreference,
} from "./interaction/motionPreference";
import { invoke } from "./tauriCompat";

export interface AppConfig {
	key: string;
	value: any;
}

export type CenterDefaultView = "graph" | "preview" | "code";
export type CenterArtifactClickBehavior = "select_only" | "open_preview";
export type CenterInfoDensity = "comfortable" | "compact";

export interface CenterUxPrefs {
	defaultView: CenterDefaultView;
	graphFollow: boolean;
	artifactClickBehavior: CenterArtifactClickBehavior;
	infoDensity: CenterInfoDensity;
}

export interface MCPServer {
	id: string;
	name: string;
	command: string;
	args: string[];
	env?: Record<string, string>;
	enabled: boolean;
}

export interface McpTestResult {
	tool_count: number;
	tool_names: string[];
}

export interface MCPTool {
	name: string;
	description?: string | null;
	inputSchema?: any;
}

export interface MCPToolResultContent {
	type: string;
	text?: string | null;
	data?: string | null;
	mimeType?: string | null;
}

export interface MCPToolResult {
	content: MCPToolResultContent[];
	isError?: boolean | null;
}

// 搜索策略
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

export interface EnvCheckResult {
	node_version: string | null;
	npx_version: string | null;
	path: string;
	shell: string | null;
	valid: boolean;
}

// 配置管理
export async function getConfig(key: string): Promise<any | null> {
	return invoke("get_config", { key });
}

export async function setConfig(key: string, value: any): Promise<void> {
	return invoke("set_config", { key, value });
}

let cachedMotionPreference: MotionPreference = "system";
let cachedMotionPreferenceLoaded = false;
const DEFAULT_CENTER_UX_PREFS: CenterUxPrefs = {
	defaultView: "graph",
	graphFollow: true,
	artifactClickBehavior: "select_only",
	infoDensity: "comfortable",
};
const CENTER_UX_CONFIG_KEYS = {
	defaultView: "center.ux.defaultView",
	graphFollow: "center.ux.graphFollow",
	artifactClickBehavior: "center.ux.artifactClickBehavior",
	infoDensity: "center.ux.infoDensity",
} as const;
let cachedCenterUxPrefs: CenterUxPrefs = { ...DEFAULT_CENTER_UX_PREFS };
let cachedCenterUxPrefsLoaded = false;

export async function getMotionPreference(
	forceRefresh = false,
): Promise<MotionPreference> {
	if (cachedMotionPreferenceLoaded && !forceRefresh) {
		return cachedMotionPreference;
	}

	try {
		const value = await getConfig(MOTION_PREFERENCE_CONFIG_KEY);
		cachedMotionPreference = normalizeMotionPreference(value);
	} catch {
		cachedMotionPreference = "system";
	}

	cachedMotionPreferenceLoaded = true;
	return cachedMotionPreference;
}

export async function setMotionPreference(
	preference: MotionPreference,
): Promise<void> {
	const normalized = normalizeMotionPreference(preference);
	cachedMotionPreference = normalized;
	cachedMotionPreferenceLoaded = true;
	await setConfig(MOTION_PREFERENCE_CONFIG_KEY, normalized);
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent(MOTION_PREFERENCE_EVENT, { detail: normalized }),
		);
	}
}

function normalizeCenterDefaultView(value: unknown): CenterDefaultView {
	if (value === "graph" || value === "preview" || value === "code")
		return value;
	// 向后兼容历史配置：旧版本 docs 视图并入 preview
	if (value === "docs") return "preview";
	return DEFAULT_CENTER_UX_PREFS.defaultView;
}

function normalizeCenterArtifactClickBehavior(
	value: unknown,
): CenterArtifactClickBehavior {
	if (value === "open_preview" || value === "select_only") return value;
	return DEFAULT_CENTER_UX_PREFS.artifactClickBehavior;
}

function normalizeCenterInfoDensity(value: unknown): CenterInfoDensity {
	if (value === "compact" || value === "comfortable") return value;
	return DEFAULT_CENTER_UX_PREFS.infoDensity;
}

export async function getCenterUxPrefs(
	forceRefresh = false,
): Promise<CenterUxPrefs> {
	if (cachedCenterUxPrefsLoaded && !forceRefresh) return cachedCenterUxPrefs;
	try {
		const [defaultViewRaw, graphFollowRaw, clickRaw, densityRaw] =
			await Promise.all([
				getConfig(CENTER_UX_CONFIG_KEYS.defaultView),
				getConfig(CENTER_UX_CONFIG_KEYS.graphFollow),
				getConfig(CENTER_UX_CONFIG_KEYS.artifactClickBehavior),
				getConfig(CENTER_UX_CONFIG_KEYS.infoDensity),
			]);
		cachedCenterUxPrefs = {
			defaultView: normalizeCenterDefaultView(defaultViewRaw),
			graphFollow:
				typeof graphFollowRaw === "boolean"
					? graphFollowRaw
					: DEFAULT_CENTER_UX_PREFS.graphFollow,
			artifactClickBehavior: normalizeCenterArtifactClickBehavior(clickRaw),
			infoDensity: normalizeCenterInfoDensity(densityRaw),
		};
	} catch {
		cachedCenterUxPrefs = { ...DEFAULT_CENTER_UX_PREFS };
	}
	cachedCenterUxPrefsLoaded = true;
	return cachedCenterUxPrefs;
}

export async function setCenterUxPrefs(
	updates: Partial<CenterUxPrefs>,
): Promise<CenterUxPrefs> {
	const merged: CenterUxPrefs = {
		defaultView: normalizeCenterDefaultView(
			updates.defaultView ?? cachedCenterUxPrefs.defaultView,
		),
		graphFollow:
			typeof updates.graphFollow === "boolean"
				? updates.graphFollow
				: cachedCenterUxPrefs.graphFollow,
		artifactClickBehavior: normalizeCenterArtifactClickBehavior(
			updates.artifactClickBehavior ??
				cachedCenterUxPrefs.artifactClickBehavior,
		),
		infoDensity: normalizeCenterInfoDensity(
			updates.infoDensity ?? cachedCenterUxPrefs.infoDensity,
		),
	};
	cachedCenterUxPrefs = merged;
	cachedCenterUxPrefsLoaded = true;
	await Promise.all([
		setConfig(CENTER_UX_CONFIG_KEYS.defaultView, merged.defaultView),
		setConfig(CENTER_UX_CONFIG_KEYS.graphFollow, merged.graphFollow),
		setConfig(
			CENTER_UX_CONFIG_KEYS.artifactClickBehavior,
			merged.artifactClickBehavior,
		),
		setConfig(CENTER_UX_CONFIG_KEYS.infoDensity, merged.infoDensity),
	]);
	return merged;
}

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

export type PerformanceTuning = {
	sourceAutoRefreshMs: number;
	remoteSyncIntervalMs: number;
	enableUiDebugLogs: boolean;
};

const DEFAULT_PERFORMANCE_TUNING: PerformanceTuning = {
	sourceAutoRefreshMs: 10000,
	remoteSyncIntervalMs: 20000,
	enableUiDebugLogs: false,
};

const PERFORMANCE_CONFIG_KEYS = {
	sourceAutoRefreshMs: "performance.sourceAutoRefreshMs",
	remoteSyncIntervalMs: "performance.remoteSyncIntervalMs",
	enableUiDebugLogs: "performance.enableUiDebugLogs",
} as const;

let cachedPerformanceTuning: PerformanceTuning = {
	...DEFAULT_PERFORMANCE_TUNING,
};
let cachedPerformanceTuningLoaded = false;

export function getCachedPerformanceTuning(): PerformanceTuning {
	return cachedPerformanceTuning;
}

export function isUiDebugLogsEnabled(): boolean {
	return cachedPerformanceTuning.enableUiDebugLogs;
}

function normalizeInterval(
	value: unknown,
	defaultValue: number,
	min: number,
	max: number,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) return defaultValue;
	return Math.max(min, Math.min(max, Math.floor(value)));
}

export async function getPerformanceTuning(
	forceRefresh = false,
): Promise<PerformanceTuning> {
	if (cachedPerformanceTuningLoaded && !forceRefresh) {
		return cachedPerformanceTuning;
	}
	try {
		const [
			sourceAutoRefreshMsRaw,
			remoteSyncIntervalMsRaw,
			enableUiDebugLogsRaw,
		] = await Promise.all([
			getConfig(PERFORMANCE_CONFIG_KEYS.sourceAutoRefreshMs),
			getConfig(PERFORMANCE_CONFIG_KEYS.remoteSyncIntervalMs),
			getConfig(PERFORMANCE_CONFIG_KEYS.enableUiDebugLogs),
		]);
		cachedPerformanceTuning = {
			sourceAutoRefreshMs: normalizeInterval(
				sourceAutoRefreshMsRaw,
				DEFAULT_PERFORMANCE_TUNING.sourceAutoRefreshMs,
				2000,
				60_000,
			),
			remoteSyncIntervalMs: normalizeInterval(
				remoteSyncIntervalMsRaw,
				DEFAULT_PERFORMANCE_TUNING.remoteSyncIntervalMs,
				5000,
				120_000,
			),
			enableUiDebugLogs: Boolean(enableUiDebugLogsRaw),
		};
	} catch {
		cachedPerformanceTuning = { ...DEFAULT_PERFORMANCE_TUNING };
	}
	cachedPerformanceTuningLoaded = true;
	return cachedPerformanceTuning;
}

export async function setPerformanceTuning(
	patch: Partial<PerformanceTuning>,
): Promise<PerformanceTuning> {
	const current = await getPerformanceTuning();
	const next: PerformanceTuning = {
		sourceAutoRefreshMs: normalizeInterval(
			patch.sourceAutoRefreshMs ?? current.sourceAutoRefreshMs,
			DEFAULT_PERFORMANCE_TUNING.sourceAutoRefreshMs,
			2000,
			60_000,
		),
		remoteSyncIntervalMs: normalizeInterval(
			patch.remoteSyncIntervalMs ?? current.remoteSyncIntervalMs,
			DEFAULT_PERFORMANCE_TUNING.remoteSyncIntervalMs,
			5000,
			120_000,
		),
		enableUiDebugLogs:
			typeof patch.enableUiDebugLogs === "boolean"
				? patch.enableUiDebugLogs
				: current.enableUiDebugLogs,
	};
	cachedPerformanceTuning = next;
	cachedPerformanceTuningLoaded = true;
	await Promise.all([
		setConfig(
			PERFORMANCE_CONFIG_KEYS.sourceAutoRefreshMs,
			next.sourceAutoRefreshMs,
		),
		setConfig(
			PERFORMANCE_CONFIG_KEYS.remoteSyncIntervalMs,
			next.remoteSyncIntervalMs,
		),
		setConfig(
			PERFORMANCE_CONFIG_KEYS.enableUiDebugLogs,
			next.enableUiDebugLogs,
		),
	]);
	return next;
}

export async function getAllConfigs(): Promise<AppConfig[]> {
	return invoke("get_all_configs");
}

// MCP 服务器管理
export async function listMcpServers(): Promise<MCPServer[]> {
	return invoke("list_mcp_servers");
}

export async function addMcpServer(server: MCPServer): Promise<void> {
	await invoke("create_mcp_server", {
		name: server.name,
		command: server.command,
		args: server.args,
		env: server.env ?? {},
		enabled: server.enabled,
	});
}

export async function updateMcpServer(server: MCPServer): Promise<void> {
	await invoke("update_mcp_server", {
		id: server.id,
		name: server.name,
		command: server.command,
		args: server.args,
		env: server.env ?? {},
		enabled: server.enabled,
	});
}

export async function deleteMcpServer(id: string): Promise<void> {
	await invoke("delete_mcp_server", { id });
}

export async function testMcpServer(
	_server: MCPServer,
): Promise<McpTestResult> {
	throw new Error(
		"当前版本暂不支持在设置页直接测试 MCP（请在 Agent 对话中实际调用工具验证）。",
	);
}

export async function mcpCheckEnv(): Promise<EnvCheckResult> {
	return invoke("mcp_check_env");
}

export async function mcpListTools(
	serverId: string,
	forceRefresh = false,
): Promise<MCPTool[]> {
	return invoke("mcp_list_tools", {
		server_id: serverId,
		force_refresh: forceRefresh,
	});
}

export async function mcpCallTool(
	serverId: string,
	toolName: string,
	argumentsJson: Record<string, any> = {},
): Promise<MCPToolResult> {
	return invoke("mcp_call_tool", {
		server_id: serverId,
		tool_name: toolName,
		arguments: argumentsJson,
	});
}

export async function mcpStopServer(serverId: string): Promise<void> {
	return invoke("mcp_stop_server", { server_id: serverId });
}

// 浏览器搜索
export interface BrowserSearchRequest {
	query: string;
	engine: string;
	use_playwright: boolean;
	limit?: number;
}

export interface BrowserSearchResult {
	title: string;
	snippet: string;
	url: string;
	screenshot?: string;
}

export async function browserSearch(
	request: BrowserSearchRequest,
): Promise<BrowserSearchResult[]> {
	return invoke("browser_search", { request });
}

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

// 页面内容
export interface PageContent {
	url: string;
	title: string;
	content: string;
	description?: string;
	favicon?: string;
	html?: string;
}

// 获取页面内容（阅读模式）
export async function fetchPageContent(url: string): Promise<PageContent> {
	return invoke("fetch_page_content", { url });
}

// 打开内置浏览器窗口
export async function openBrowserWindow(url: string): Promise<void> {
	return invoke("open_browser_window", { url });
}

// ==================== Agent Skills API ====================

export interface SkillMetadata {
	name: string;
	description: string;
	location: string;
	enabled: boolean;
}

/** 列出所有已安装的技能 */
export async function listSkills(): Promise<SkillMetadata[]> {
	return invoke("list_skills");
}

/** 导入技能文件夹 */
export async function importSkill(sourcePath: string): Promise<SkillMetadata> {
	return invoke("import_skill", { sourcePath });
}

/** 删除技能 */
export async function deleteSkill(skillName: string): Promise<void> {
	return invoke("delete_skill", { skillName });
}

/** 设置技能启用状态 */
export async function setSkillEnabled(
	skillName: string,
	enabled: boolean,
): Promise<void> {
	return invoke("set_skill_enabled", { skillName, enabled });
}

// ==================== Skills Marketplace API ====================

export type MarketplaceSourceType =
	| "anthropic_marketplace_json"
	| "skills_sh"
	| "tencent_skillhub"
	| "custom_json";

export type MarketplaceSourceTrust = "official" | "community" | "custom";

export interface MarketplaceSourceConfig {
	id: string;
	name: string;
	type: MarketplaceSourceType;
	url: string;
	enabled: boolean;
	trust?: MarketplaceSourceTrust;
}

export interface MarketplaceMirror {
	id: string;
	name: string;
	pattern: string;
	enabled: boolean;
}

export interface MarketplaceListSourcesResult {
	sources: MarketplaceSourceConfig[];
	mirrors: MarketplaceMirror[];
	autoCheck: boolean;
}

export interface MarketplaceEntry {
	id: string;
	sourceId: string;
	trust: MarketplaceSourceTrust;
	name: string;
	displayName?: string;
	description: string;
	version?: string;
	author?: string;
	homepage?: string;
	tags?: string[];
	icon?: string;
	license?: string;
	sha256?: string;
	artifact: unknown;
	rawSourceUrl?: string;
	installed?: boolean;
	installedVersion?: string;
}

export interface MarketplaceSearchResult {
	entries: MarketplaceEntry[];
	errors: Array<{ sourceId: string; error: string }>;
}

export interface MarketplaceInstallResult {
	success: boolean;
	name?: string;
	location?: string;
	error?: string;
}

export interface MarketplaceUpdateItem {
	name: string;
	currentVersion?: string;
	latestVersion?: string;
	entryId: string;
	sourceId: string;
}

export interface MarketplaceMirrorTestResult {
	url: string;
	ok: boolean;
	latencyMs?: number;
	error?: string;
}

export async function marketplaceListSources(): Promise<MarketplaceListSourcesResult> {
	return invoke("skills_marketplace_list_sources");
}

export async function marketplaceSetSources(payload: {
	sources?: MarketplaceSourceConfig[];
	mirrors?: MarketplaceMirror[];
	autoCheck?: boolean;
}): Promise<{ success: boolean }> {
	return invoke("skills_marketplace_set_sources", payload);
}

export async function marketplaceSearch(
	query?: string,
	sourceId?: string,
): Promise<MarketplaceSearchResult> {
	return invoke("skills_marketplace_search", { query, sourceId });
}

export async function marketplaceInstall(
	entryId: string,
): Promise<MarketplaceInstallResult> {
	return invoke("skills_marketplace_install", { entryId });
}

export async function marketplaceUninstall(
	skillName: string,
): Promise<{ success: boolean }> {
	return invoke("skills_marketplace_uninstall", { skillName });
}

export async function marketplaceCheckUpdates(): Promise<{
	updates: MarketplaceUpdateItem[];
}> {
	return invoke("skills_marketplace_check_updates");
}

export async function marketplaceTestMirror(): Promise<{
	results: MarketplaceMirrorTestResult[];
}> {
	return invoke("skills_marketplace_test_mirror");
}

export async function marketplacePreview(entryId: string): Promise<{
	skillMd?: string;
	usedUrl?: string;
	error?: string;
}> {
	return invoke("skills_marketplace_preview", { entryId });
}

// ==================== 远程控制配置 ====================

let cachedRemoteControlConfig: RemoteControlConfig | null = null;

export async function getRemoteControlConfig(
	forceRefresh = false,
): Promise<RemoteControlConfig> {
	if (cachedRemoteControlConfig && !forceRefresh) {
		return cachedRemoteControlConfig;
	}
	const config = await invoke<RemoteControlConfig>(
		"get_remote_control_config",
		{},
	);
	cachedRemoteControlConfig = config;
	return config;
}

export async function setRemoteControlConfig(
	config: RemoteControlConfig,
): Promise<void> {
	await invoke("set_remote_control_config", { config });
	cachedRemoteControlConfig = config;
}

export async function getRemoteControlRuntimeStatus(): Promise<RemoteRuntimeStatus> {
	return invoke("get_remote_control_runtime_status", {});
}

export async function listRemoteChannels(): Promise<RemoteChannelStatus[]> {
	return invoke("list_remote_channels", {});
}

export async function listRemotePairings(): Promise<{
	pending_requests: RemotePairingRequest[];
	records: RemotePairingRecord[];
}> {
	return invoke("list_remote_pairings", {});
}

export async function approveRemotePairing(
	requestId: string,
	approvedBy = "settings",
): Promise<void> {
	await invoke("approve_remote_pairing", {
		request_id: requestId,
		approved_by: approvedBy,
	});
}

export async function rejectRemotePairing(
	requestId: string,
	reason?: string,
): Promise<void> {
	await invoke("reject_remote_pairing", {
		request_id: requestId,
		reason,
	});
}

export async function revokeRemotePairing(input: {
	channel_id: string;
	peer_id: string;
	reason?: string;
}): Promise<void> {
	await invoke("revoke_remote_pairing", input);
}

export async function listRemoteSessions(
	limit = 50,
): Promise<RemoteSessionInfo[]> {
	return invoke("list_remote_sessions", { limit });
}

export async function terminateRemoteSession(runId: string): Promise<void> {
	await invoke("terminate_remote_session", { run_id: runId });
}

export async function testRemoteChannel(channelId: string): Promise<{
	ok: boolean;
	message: string;
}> {
	return invoke("test_remote_channel", { channel_id: channelId });
}
