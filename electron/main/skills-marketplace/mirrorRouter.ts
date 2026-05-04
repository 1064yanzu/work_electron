/**
 * Mirror Router —— 多镜像并发竞速
 *
 * 思路：
 *   1) 给定一个原始 GitHub Raw / archive URL，按规则派生多个镜像变体
 *   2) 用 Promise.any 同时发起，最先 200 的胜出，其余 abort
 *   3) 完全失败时返回结构化错误，让上层可以展示哪条线挂了
 *
 * 规则模板支持下列占位符：
 *   {owner} {repo} {ref} {path}  —— 用于 GitHub Raw 派生
 *   {url}                        —— 用于把任意 URL 包一层（如 ghproxy）
 */

import { net } from "electron";
import type { MirrorTestResult } from "./types";

export interface MirrorTemplate {
	id: string;
	name: string;
	pattern: string;
	enabled: boolean;
}

export const DEFAULT_MIRROR_TEMPLATES: MirrorTemplate[] = [
	{
		id: "github-raw",
		name: "GitHub Raw（直连）",
		pattern: "https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}",
		enabled: true,
	},
	{
		id: "jsdelivr",
		name: "jsDelivr CDN",
		pattern: "https://cdn.jsdelivr.net/gh/{owner}/{repo}@{ref}/{path}",
		enabled: true,
	},
	{
		id: "ghproxy",
		name: "ghproxy 镜像",
		pattern:
			"https://ghproxy.com/https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}",
		enabled: true,
	},
	{
		id: "fastly-jsdelivr",
		name: "Fastly jsDelivr",
		pattern: "https://fastly.jsdelivr.net/gh/{owner}/{repo}@{ref}/{path}",
		enabled: true,
	},
];

/** 解析 raw.githubusercontent.com 风格 URL，提取 owner/repo/ref/path */
export interface GithubRawCoords {
	owner: string;
	repo: string;
	ref: string;
	path: string;
}

export function parseGithubRawUrl(url: string): GithubRawCoords | null {
	try {
		const u = new URL(url);
		if (u.hostname === "raw.githubusercontent.com") {
			const parts = u.pathname.replace(/^\/+/, "").split("/");
			if (parts.length < 4) return null;
			const [owner, repo, ref, ...rest] = parts;
			return { owner, repo, ref, path: rest.join("/") };
		}
		if (u.hostname === "github.com") {
			// https://github.com/{owner}/{repo}/raw/{ref}/{path}
			// or https://github.com/{owner}/{repo}/blob/{ref}/{path}
			const parts = u.pathname.replace(/^\/+/, "").split("/");
			if (parts.length >= 5 && (parts[2] === "raw" || parts[2] === "blob")) {
				const owner = parts[0];
				const repo = parts[1];
				const ref = parts[3];
				const path = parts.slice(4).join("/");
				return { owner, repo, ref, path };
			}
		}
	} catch {
		return null;
	}
	return null;
}

/** 解析 archive URL，例如 https://github.com/{o}/{r}/archive/refs/heads/{ref}.zip 或 .../{ref}.tar.gz */
export interface GithubArchiveCoords {
	owner: string;
	repo: string;
	ref: string;
	format: "zip" | "tar.gz";
}

export function parseGithubArchiveUrl(url: string): GithubArchiveCoords | null {
	try {
		const u = new URL(url);
		if (u.hostname !== "github.com" && u.hostname !== "codeload.github.com")
			return null;
		const m1 = u.pathname.match(
			/^\/([^/]+)\/([^/]+)\/archive\/(?:refs\/(?:heads|tags)\/)?(.+?)\.(zip|tar\.gz|tgz)$/,
		);
		if (m1) {
			const [, owner, repo, ref, ext] = m1;
			return {
				owner,
				repo,
				ref,
				format: ext === "zip" ? "zip" : "tar.gz",
			};
		}
		// codeload.github.com/{o}/{r}/zip/refs/heads/{ref}
		const m2 = u.pathname.match(
			/^\/([^/]+)\/([^/]+)\/(zip|tar\.gz|tarball)\/(?:refs\/(?:heads|tags)\/)?(.+)$/,
		);
		if (m2) {
			const [, owner, repo, kind, ref] = m2;
			return {
				owner,
				repo,
				ref,
				format: kind === "zip" ? "zip" : "tar.gz",
			};
		}
	} catch {
		return null;
	}
	return null;
}

function applyTemplate(
	pattern: string,
	vars: Record<string, string>,
): string | null {
	let out = pattern;
	for (const [k, v] of Object.entries(vars)) {
		out = out.split(`{${k}}`).join(v);
	}
	if (out.includes("{")) return null;
	return out;
}

/**
 * 给定原始 URL，派生所有镜像变体。
 * 包含原始 URL 本身（除非用户禁用了 github-raw）。
 */
export function deriveMirrorUrls(
	originalUrl: string,
	templates: MirrorTemplate[],
): string[] {
	const enabled = templates.filter((t) => t.enabled);
	const seen = new Set<string>();
	const out: string[] = [];

	const tryAdd = (url: string | null) => {
		if (!url) return;
		if (seen.has(url)) return;
		seen.add(url);
		out.push(url);
	};

	const rawCoords = parseGithubRawUrl(originalUrl);
	if (rawCoords) {
		for (const t of enabled) {
			tryAdd(applyTemplate(t.pattern, { ...rawCoords }));
		}
	} else {
		// 非 GitHub raw URL：原 URL 优先，把支持 {url} 的镜像包一层
		tryAdd(originalUrl);
		for (const t of enabled) {
			if (t.pattern.includes("{url}")) {
				tryAdd(t.pattern.split("{url}").join(originalUrl));
			}
		}
	}

	if (out.length === 0) tryAdd(originalUrl);
	return out;
}

/** Race 多个 fetch，最先成功的胜出，其余 abort */
export async function fetchWithMirrors(
	originalUrl: string,
	templates: MirrorTemplate[],
	init?: {
		method?: string;
		headers?: Record<string, string>;
		timeoutMs?: number;
	},
): Promise<{ response: Response; usedUrl: string }> {
	const urls = deriveMirrorUrls(originalUrl, templates);
	const timeoutMs = init?.timeoutMs ?? 20_000;

	if (urls.length === 1) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await net.fetch(urls[0], {
				method: init?.method ?? "GET",
				headers: init?.headers,
				signal: controller.signal,
			});
			if (!response.ok) throw new Error(`HTTP ${response.status} @ ${urls[0]}`);
			return { response, usedUrl: urls[0] };
		} finally {
			clearTimeout(timer);
		}
	}

	const controllers = urls.map(() => new AbortController());
	const timers: NodeJS.Timeout[] = [];

	const tasks = urls.map(async (url, i) => {
		const ctrl = controllers[i];
		const timer = setTimeout(() => ctrl.abort(), timeoutMs);
		timers.push(timer);
		const response = await net.fetch(url, {
			method: init?.method ?? "GET",
			headers: init?.headers,
			signal: ctrl.signal,
		});
		if (!response.ok) {
			throw new Error(`HTTP ${response.status} @ ${url}`);
		}
		return { response, usedUrl: url, idx: i };
	});

	try {
		const winner = await Promise.any(tasks);
		// 中止其它仍在飞行的请求
		for (let i = 0; i < controllers.length; i++) {
			if (i !== winner.idx) {
				try {
					controllers[i].abort();
				} catch {
					// noop
				}
			}
		}
		return { response: winner.response, usedUrl: winner.usedUrl };
	} catch (e) {
		const aggregate = e as AggregateError;
		const messages = aggregate?.errors?.map((err) =>
			err instanceof Error ? err.message : String(err),
		);
		throw new Error(
			`所有镜像均失败：${messages?.join(" | ") || (e as Error).message}`,
		);
	} finally {
		for (const t of timers) clearTimeout(t);
	}
}

/** 测速：对每个模板用 HEAD 探测一个轻量 URL，返回 latency。 */
export async function testMirrors(
	templates: MirrorTemplate[],
): Promise<MirrorTestResult[]> {
	// 用一个稳定存在的小文件做探测：anthropics/claude-plugins-official 的 README
	const probeCoords: GithubRawCoords = {
		owner: "anthropics",
		repo: "claude-plugins-official",
		ref: "main",
		path: "README.md",
	};

	const probeRawUrl =
		"https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/README.md";

	const tasks = templates.map<Promise<MirrorTestResult>>(async (t) => {
		const url = t.pattern.includes("{owner}")
			? applyTemplate(t.pattern, { ...probeCoords })
			: t.pattern.includes("{url}")
				? t.pattern.split("{url}").join(probeRawUrl)
				: probeRawUrl;
		if (!url) return { url: t.pattern, ok: false, error: "BAD_TEMPLATE" };

		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), 8_000);
		const start = Date.now();
		try {
			const r = await net.fetch(url, {
				method: "GET",
				headers: { Range: "bytes=0-127" },
				signal: ctrl.signal,
			});
			const ok = r.ok || r.status === 206;
			return {
				url,
				ok,
				latencyMs: Date.now() - start,
				error: ok ? undefined : `HTTP ${r.status}`,
			};
		} catch (e) {
			return {
				url,
				ok: false,
				error: e instanceof Error ? e.message : String(e),
			};
		} finally {
			clearTimeout(timer);
		}
	});

	return Promise.all(tasks);
}
