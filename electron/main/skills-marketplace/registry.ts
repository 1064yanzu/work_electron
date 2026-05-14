/**
 * Registry —— 多源 marketplace 聚合
 *
 * 支持 4 种 source type：
 *   1) anthropic_marketplace_json — 标准 marketplace.json（Anthropic 官方仓库等）
 *   2) skills_sh                  — skills.sh 社区索引（GET /api/search）
 *   3) tencent_skillhub           — 腾讯 SkillHub（第一阶段当镜像基址用，list 走 fallback）
 *   4) custom_json                — 用户自定义的 marketplace.json
 *
 * 所有 adapter 都返回统一的 MarketplaceEntry[]。
 */

import { net } from "electron";
import {
	DEFAULT_MIRROR_TEMPLATES,
	type MirrorTemplate,
	fetchWithMirrors,
	parseGithubRawUrl,
} from "./mirrorRouter";
import type {
	MarketplaceArtifactSource,
	MarketplaceEntry,
	MarketplaceSource,
	SourceTrust,
} from "./types";

const FETCH_TIMEOUT_MS = 15_000;

/**
 * 通用 JSON 拉取：
 *   - GitHub raw / github.com 域名 → 走 mirrorRouter，race jsDelivr/ghproxy/Fastly 等镜像
 *   - 其他域名（skills.sh / 自建 marketplace 站）→ 直连，但显式 redirect:"follow"
 *
 * `mirrors` 来自 handler 层从 DB 读取的用户配置，默认为 DEFAULT_MIRROR_TEMPLATES。
 */
async function fetchJson<T = unknown>(
	url: string,
	mirrors?: MirrorTemplate[],
): Promise<T> {
	const isGithubRaw = parseGithubRawUrl(url) != null;
	const templates =
		mirrors && mirrors.length > 0 ? mirrors : DEFAULT_MIRROR_TEMPLATES;

	if (isGithubRaw) {
		const { response } = await fetchWithMirrors(url, templates, {
			method: "GET",
			headers: { Accept: "application/json" },
			timeoutMs: FETCH_TIMEOUT_MS,
		});
		return (await response.json()) as T;
	}

	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
	try {
		const r = await net.fetch(url, {
			method: "GET",
			headers: { Accept: "application/json" },
			redirect: "follow",
			signal: ctrl.signal,
		});
		if (!r.ok) {
			throw new Error(`HTTP ${r.status} @ ${url}`);
		}
		return (await r.json()) as T;
	} finally {
		clearTimeout(timer);
	}
}

function trustOf(source: MarketplaceSource): SourceTrust {
	if (source.trust) return source.trust;
	if (source.type === "anthropic_marketplace_json") return "official";
	if (source.type === "skills_sh" || source.type === "tencent_skillhub")
		return "community";
	return "custom";
}

function safeStr(v: unknown, fallback = ""): string {
	if (typeof v === "string") return v;
	if (v == null) return fallback;
	return String(v);
}

function parseGithubLikeSource(raw: unknown): MarketplaceArtifactSource | null {
	if (!raw || typeof raw !== "object") return null;
	const obj = raw as Record<string, unknown>;
	const sourceType = safeStr(obj.source ?? obj.type).toLowerCase();

	if (sourceType === "github" || obj.repo || obj.repository) {
		const repoStr = safeStr(obj.repository ?? obj.repo);
		let owner = safeStr(obj.owner);
		let repo = safeStr(obj.name);
		if (repoStr.includes("/")) {
			const [o, r] = repoStr.split("/");
			owner = owner || o;
			repo = repo || r;
		}
		const ref = safeStr(obj.ref ?? obj.branch ?? obj.commit ?? "main", "main");
		const subdir =
			safeStr(obj.path ?? obj.subdir ?? obj.directory) || undefined;
		if (!owner || !repo) return null;
		return { kind: "github", owner, repo, ref, subdir };
	}

	if (sourceType === "url" || obj.url) {
		const url = safeStr(obj.url);
		if (!url) return null;
		return { kind: "url", url };
	}

	return null;
}

interface AnthropicMarketplacePlugin {
	name?: string;
	displayName?: string;
	description?: string;
	version?: string;
	author?: string | { name?: string };
	homepage?: string;
	tags?: string[];
	icon?: string;
	license?: string;
	sha256?: string;
	source?: unknown;
}

interface AnthropicMarketplaceJson {
	plugins?: AnthropicMarketplacePlugin[];
	skills?: AnthropicMarketplacePlugin[];
	items?: AnthropicMarketplacePlugin[];
	version?: number;
	owner?: { name?: string; url?: string };
}

async function fetchAnthropicMarketplace(
	source: MarketplaceSource,
	query?: string,
	mirrors?: MirrorTemplate[],
): Promise<MarketplaceEntry[]> {
	const data = await fetchJson<AnthropicMarketplaceJson>(source.url, mirrors);
	const list = data.plugins ?? data.skills ?? data.items ?? [];
	const trust = trustOf(source);

	const entries: MarketplaceEntry[] = [];
	for (const item of list) {
		const name = safeStr(item.name);
		if (!name) continue;
		const artifact = parseGithubLikeSource(item.source);
		if (!artifact) continue;
		entries.push({
			id: `${source.id}/${name}`,
			sourceId: source.id,
			trust,
			name,
			displayName: safeStr(item.displayName) || name,
			description: safeStr(item.description),
			version: safeStr(item.version) || undefined,
			author:
				typeof item.author === "string"
					? item.author
					: safeStr(item.author?.name) || undefined,
			homepage: safeStr(item.homepage) || undefined,
			tags: Array.isArray(item.tags)
				? item.tags.map((t) => safeStr(t))
				: undefined,
			icon: safeStr(item.icon) || undefined,
			license: safeStr(item.license) || undefined,
			sha256: safeStr(item.sha256) || undefined,
			artifact,
			rawSourceUrl: source.url,
		});
	}

	if (query) {
		const q = query.toLowerCase();
		return entries.filter(
			(e) =>
				e.name.toLowerCase().includes(q) ||
				e.description.toLowerCase().includes(q) ||
				(e.tags?.some((t) => t.toLowerCase().includes(q)) ?? false),
		);
	}
	return entries;
}

interface SkillsShEntry {
	id?: string;
	skillId?: string;
	name?: string;
	display_name?: string;
	displayName?: string;
	description?: string;
	version?: string;
	author?: string;
	repo?: string;
	repository?: string;
	url?: string;
	ref?: string;
	branch?: string;
	subdir?: string;
	path?: string;
	tags?: string[];
	icon?: string;
	source?: string;
	installs?: number;
}

interface SkillsShResponse {
	results?: SkillsShEntry[];
	items?: SkillsShEntry[];
	data?: SkillsShEntry[];
	skills?: SkillsShEntry[];
}

/** 把 skills.sh 返回的 source 字段 (如 "github/awesome-copilot") 解成 GitHub 三元组 */
function parseSkillsShSource(
	src: string | undefined,
): MarketplaceArtifactSource | null {
	if (!src) return null;
	const m = src.match(/^github\/([^/]+)\/?(.*)$/);
	if (!m) return null;
	const owner = m[1];
	const rest = m[2] ?? "";
	if (!owner) return null;
	if (!rest) {
		return { kind: "github", owner, repo: owner, ref: "main" };
	}
	const [repo, ...subdirParts] = rest.split("/");
	return {
		kind: "github",
		owner,
		repo,
		ref: "main",
		subdir: subdirParts.length ? subdirParts.join("/") : undefined,
	};
}

async function fetchSkillsSh(
	source: MarketplaceSource,
	query?: string,
	_mirrors?: MirrorTemplate[],
): Promise<MarketplaceEntry[]> {
	// skills.sh 的 /api/search 要求 query >= 2 字符；浏览态（query 为空）直接跳过该源
	const q = (query ?? "").trim();
	if (q.length < 2) return [];

	const base = source.url.replace(/\/+$/, "");
	// 仅尝试一个真实可用端点；返回非 OK 则抛错，让调用方汇总到 errors 里
	const url = `${base}/api/search?q=${encodeURIComponent(q)}&limit=50`;
	// 非 GitHub 域名，fetchJson 会自动走直连 + redirect:"follow"
	const data = await fetchJson<SkillsShResponse>(url);

	const list = data.skills ?? data.results ?? data.items ?? data.data ?? [];
	const trust = trustOf(source);
	const entries: MarketplaceEntry[] = [];
	for (const item of list) {
		const name = safeStr(item.name ?? item.skillId ?? item.id);
		if (!name) continue;
		// 优先用 source 字段（"github/owner/repo"）解析 artifact
		const artifact =
			parseSkillsShSource(item.source) ?? parseGithubLikeSource(item);
		if (!artifact) continue;
		entries.push({
			id: `${source.id}/${name}`,
			sourceId: source.id,
			trust,
			name,
			displayName: safeStr(item.displayName ?? item.display_name) || name,
			description: safeStr(item.description),
			version: safeStr(item.version) || undefined,
			author: safeStr(item.author) || undefined,
			tags: Array.isArray(item.tags)
				? item.tags.map((t) => safeStr(t))
				: undefined,
			icon: safeStr(item.icon) || undefined,
			artifact,
			rawSourceUrl: source.url,
		});
	}
	return entries;
}

async function fetchTencentSkillHub(
	source: MarketplaceSource,
	query?: string,
	mirrors?: MirrorTemplate[],
): Promise<MarketplaceEntry[]> {
	// 第一阶段：腾讯 SkillHub REST API 未公开，list 阶段先尝试常见路径，失败时返回空
	// 主要价值是作为 mirrorRouter 里的镜像基址
	const base = source.url.replace(/\/+$/, "");
	const candidates = [
		`${base}/api/skills?q=${encodeURIComponent(query || "")}&limit=50`,
		`${base}/api/v1/skills?q=${encodeURIComponent(query || "")}`,
		`${base}/marketplace.json`,
	];
	for (const url of candidates) {
		try {
			const data = await fetchJson<unknown>(url, mirrors);
			// 如果是 marketplace.json 格式
			const asMarketplace = data as AnthropicMarketplaceJson;
			if (
				asMarketplace.plugins ||
				asMarketplace.skills ||
				asMarketplace.items
			) {
				const fakeSource: MarketplaceSource = { ...source, url };
				return fetchAnthropicMarketplaceFromData(
					fakeSource,
					asMarketplace,
					query,
				);
			}
			// 如果是 skills.sh 风格
			const asResponse = data as SkillsShResponse;
			const list = asResponse.results ?? asResponse.items ?? asResponse.data;
			if (Array.isArray(list)) {
				const trust = trustOf(source);
				const entries: MarketplaceEntry[] = [];
				for (const item of list as SkillsShEntry[]) {
					const name = safeStr(item.name ?? item.id);
					if (!name) continue;
					const artifact = parseGithubLikeSource(item);
					if (!artifact) continue;
					entries.push({
						id: `${source.id}/${name}`,
						sourceId: source.id,
						trust,
						name,
						displayName: safeStr(item.display_name) || name,
						description: safeStr(item.description),
						version: safeStr(item.version) || undefined,
						artifact,
						rawSourceUrl: url,
					});
				}
				return entries;
			}
		} catch {
			// 试下一个
		}
	}
	return [];
}

function fetchAnthropicMarketplaceFromData(
	source: MarketplaceSource,
	data: AnthropicMarketplaceJson,
	query?: string,
): MarketplaceEntry[] {
	const list = data.plugins ?? data.skills ?? data.items ?? [];
	const trust = trustOf(source);
	const entries: MarketplaceEntry[] = [];
	for (const item of list) {
		const name = safeStr(item.name);
		if (!name) continue;
		const artifact = parseGithubLikeSource(item.source);
		if (!artifact) continue;
		entries.push({
			id: `${source.id}/${name}`,
			sourceId: source.id,
			trust,
			name,
			displayName: safeStr(item.displayName) || name,
			description: safeStr(item.description),
			version: safeStr(item.version) || undefined,
			artifact,
			rawSourceUrl: source.url,
		});
	}
	if (query) {
		const q = query.toLowerCase();
		return entries.filter(
			(e) =>
				e.name.toLowerCase().includes(q) ||
				e.description.toLowerCase().includes(q),
		);
	}
	return entries;
}

export async function fetchSourceEntries(
	source: MarketplaceSource,
	query?: string,
	mirrors?: MirrorTemplate[],
): Promise<MarketplaceEntry[]> {
	if (!source.enabled) return [];
	switch (source.type) {
		case "anthropic_marketplace_json":
			return fetchAnthropicMarketplace(source, query, mirrors);
		case "custom_json":
			return fetchAnthropicMarketplace(source, query, mirrors);
		case "skills_sh":
			return fetchSkillsSh(source, query, mirrors);
		case "tencent_skillhub":
			return fetchTencentSkillHub(source, query, mirrors);
		default:
			return [];
	}
}

export async function aggregateSearch(
	sources: MarketplaceSource[],
	query?: string,
	onlySourceId?: string,
	mirrors?: MirrorTemplate[],
): Promise<{
	entries: MarketplaceEntry[];
	errors: Array<{ sourceId: string; error: string }>;
}> {
	const filtered = onlySourceId
		? sources.filter((s) => s.id === onlySourceId)
		: sources;
	const tasks = filtered.map(async (s) => {
		try {
			return {
				sourceId: s.id,
				entries: await fetchSourceEntries(s, query, mirrors),
			};
		} catch (e) {
			return {
				sourceId: s.id,
				entries: [] as MarketplaceEntry[],
				error: e instanceof Error ? e.message : String(e),
			};
		}
	});
	const results = await Promise.all(tasks);
	const entries: MarketplaceEntry[] = [];
	const errors: Array<{ sourceId: string; error: string }> = [];
	for (const r of results) {
		entries.push(...r.entries);
		if (r.error) errors.push({ sourceId: r.sourceId, error: r.error });
	}
	// 同名跨源去重：保留 trust 优先级最高的
	const trustRank: Record<SourceTrust, number> = {
		official: 3,
		community: 2,
		custom: 1,
	};
	const dedup = new Map<string, MarketplaceEntry>();
	for (const e of entries) {
		const prev = dedup.get(e.name);
		if (!prev || trustRank[e.trust] > trustRank[prev.trust]) {
			dedup.set(e.name, e);
		}
	}
	return { entries: Array.from(dedup.values()), errors };
}

export const DEFAULT_SOURCES: MarketplaceSource[] = [
	{
		id: "anthropic-official",
		name: "Anthropic 官方 Plugins",
		type: "anthropic_marketplace_json",
		url: "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json",
		enabled: true,
		trust: "official",
	},
	{
		id: "anthropic-community",
		name: "Anthropic 社区 Plugins（量大）",
		type: "anthropic_marketplace_json",
		url: "https://raw.githubusercontent.com/anthropics/claude-plugins-community/main/.claude-plugin/marketplace.json",
		enabled: true,
		trust: "official",
	},
	{
		id: "anthropic-skills",
		name: "Anthropic Skills",
		type: "anthropic_marketplace_json",
		url: "https://raw.githubusercontent.com/anthropics/skills/main/.claude-plugin/marketplace.json",
		enabled: true,
		trust: "official",
	},
	{
		id: "anthropic-claude-code",
		name: "Anthropic Claude Code",
		type: "anthropic_marketplace_json",
		url: "https://raw.githubusercontent.com/anthropics/claude-code/main/.claude-plugin/marketplace.json",
		enabled: true,
		trust: "official",
	},
	{
		id: "wshobson-agents",
		name: "wshobson/agents",
		type: "anthropic_marketplace_json",
		url: "https://raw.githubusercontent.com/wshobson/agents/main/.claude-plugin/marketplace.json",
		enabled: true,
		trust: "community",
	},
	{
		id: "xiaolai-marketplace",
		name: "xiaolai 中文圈 Marketplace",
		type: "anthropic_marketplace_json",
		url: "https://raw.githubusercontent.com/xiaolai/claude-plugin-marketplace/main/.claude-plugin/marketplace.json",
		enabled: false,
		trust: "community",
	},
];
