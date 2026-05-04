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
import type {
	MarketplaceArtifactSource,
	MarketplaceEntry,
	MarketplaceSource,
	SourceTrust,
} from "./types";

const FETCH_TIMEOUT_MS = 15_000;

async function fetchJson<T = unknown>(url: string): Promise<T> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
	try {
		const r = await net.fetch(url, {
			method: "GET",
			headers: { Accept: "application/json" },
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
): Promise<MarketplaceEntry[]> {
	const data = await fetchJson<AnthropicMarketplaceJson>(source.url);
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
	name?: string;
	display_name?: string;
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
}

interface SkillsShResponse {
	results?: SkillsShEntry[];
	items?: SkillsShEntry[];
	data?: SkillsShEntry[];
}

async function fetchSkillsSh(
	source: MarketplaceSource,
	query?: string,
): Promise<MarketplaceEntry[]> {
	const base = source.url.replace(/\/+$/, "");
	const candidates = [
		`${base}/api/search?q=${encodeURIComponent(query || "")}&limit=50`,
		`${base}/api/skills?q=${encodeURIComponent(query || "")}&limit=50`,
		`${base}/api/v1/search?q=${encodeURIComponent(query || "")}&limit=50`,
	];
	let data: SkillsShResponse | null = null;
	let lastErr: unknown;
	for (const url of candidates) {
		try {
			data = await fetchJson<SkillsShResponse>(url);
			if (data) break;
		} catch (e) {
			lastErr = e;
		}
	}
	if (!data) {
		throw lastErr instanceof Error
			? lastErr
			: new Error("skills.sh API 不可达");
	}

	const list = data.results ?? data.items ?? data.data ?? [];
	const trust = trustOf(source);
	const entries: MarketplaceEntry[] = [];
	for (const item of list) {
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
			const data = await fetchJson<unknown>(url);
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
): Promise<MarketplaceEntry[]> {
	if (!source.enabled) return [];
	switch (source.type) {
		case "anthropic_marketplace_json":
			return fetchAnthropicMarketplace(source, query);
		case "custom_json":
			return fetchAnthropicMarketplace(source, query);
		case "skills_sh":
			return fetchSkillsSh(source, query);
		case "tencent_skillhub":
			return fetchTencentSkillHub(source, query);
		default:
			return [];
	}
}

export async function aggregateSearch(
	sources: MarketplaceSource[],
	query?: string,
	onlySourceId?: string,
): Promise<{
	entries: MarketplaceEntry[];
	errors: Array<{ sourceId: string; error: string }>;
}> {
	const filtered = onlySourceId
		? sources.filter((s) => s.id === onlySourceId)
		: sources;
	const tasks = filtered.map(async (s) => {
		try {
			return { sourceId: s.id, entries: await fetchSourceEntries(s, query) };
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
		name: "Anthropic 官方",
		type: "anthropic_marketplace_json",
		url: "https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json",
		enabled: true,
		trust: "official",
	},
	{
		id: "skills-sh",
		name: "skills.sh 社区",
		type: "skills_sh",
		url: "https://skills.sh",
		enabled: true,
		trust: "community",
	},
	{
		id: "tencent-skillhub",
		name: "腾讯 SkillHub（国内镜像）",
		type: "tencent_skillhub",
		url: "https://skillhub.tencent.com",
		enabled: true,
		trust: "community",
	},
];
