/**
 * fileResolver.ts
 *
 * File resolution utilities for the Agent SDK.
 * Handles loose filename matching, path rewriting, and Bash command rewriting
 * to help the LLM find files within the agent workspace (cwd).
 *
 * Supports global file access: paths outside the sandbox are resolved but
 * flagged via `insideSandbox: false` so the permission layer can gate writes.
 */
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedPath {
	/** Resolved absolute path */
	path: string;
	/** Whether the path is inside the agent sandbox (cwd) */
	insideSandbox: boolean;
}

// ---------------------------------------------------------------------------
// Sensitive path protection
// ---------------------------------------------------------------------------

const HOME = os.homedir();

/** Directories that should NEVER be accessible to the agent, even with user approval */
const SENSITIVE_PATHS = [
	path.join(HOME, ".ssh"),
	path.join(HOME, ".gnupg"),
	path.join(HOME, ".aws", "credentials"),
	path.join(HOME, ".config", "gcloud"),
	"/etc/shadow",
	"/etc/passwd",
	"/etc/sudoers",
];

/** Directory prefixes that are system-critical and should be blocked for writes */
const SYSTEM_WRITE_BLOCKED_PREFIXES = [
	"/System",
	"/usr/bin",
	"/usr/sbin",
	"/sbin",
	"/bin",
	"/private/var/root",
];

export function isSensitivePath(p: string): boolean {
	const resolved = path.resolve(p);
	for (const sensitive of SENSITIVE_PATHS) {
		if (
			resolved === sensitive ||
			resolved.startsWith(`${sensitive}${path.sep}`)
		) {
			return true;
		}
	}
	return false;
}

export function isSystemWriteBlocked(p: string): boolean {
	const resolved = path.resolve(p);
	for (const prefix of SYSTEM_WRITE_BLOCKED_PREFIXES) {
		if (
			resolved === prefix ||
			resolved.startsWith(`${prefix}${path.sep}`)
		) {
			return true;
		}
	}
	return false;
}

export function isPathInsideCwd(filePath: string, cwd: string): boolean {
	const resolved = path.resolve(filePath);
	const cwdResolved = path.resolve(cwd);
	return (
		resolved === cwdResolved ||
		resolved.startsWith(`${cwdResolved}${path.sep}`)
	);
}

export const MAX_RESOLVE_SCAN_ENTRIES = 5000;

/**
 * Default timeout (ms) for findFileByLooseName to avoid indefinite scanning.
 */
const FILE_RESOLVE_TIMEOUT_MS = 10_000;

export async function pathExists(p: string): Promise<boolean> {
	try {
		await fsp.access(p);
		return true;
	} catch {
		return false;
	}
}

function normalizeForLooseMatch(input: string): string {
	return (
		String(input || "")
			.normalize("NFC")
			.trim()
			.toLowerCase()
			// Strip common ellipsis / truncation markers that sometimes appear in tool inputs.
			.replace(/[.…]+$/g, "")
			.replace(/[.…]/g, "")
			.replace(/\s+/g, " ")
			// Make punctuation/illegal filename chars comparable to our sandbox filename strategy.
			.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
			// Normalize quote variants ("护岛" vs "护岛") so basenames can be fuzzy-matched.
			.replace(/[""„‟＂]/g, "_")
			.replace(/[''‚‛]/g, "_")
			// Common Chinese punctuation variants
			.replace(/[？]/g, "_")
			.replace(/[：]/g, ":")
	);
}

export function stripWrappingQuotes(raw: string): string {
	const s = String(raw || "").trim();
	if (
		(s.startsWith('"') && s.endsWith('"')) ||
		(s.startsWith("'") && s.endsWith("'"))
	) {
		return s.slice(1, -1).trim();
	}
	return s;
}

export async function findFileByLooseName(opts: {
	rootDir: string;
	query: string;
	timeoutMs?: number;
}): Promise<string | null> {
	const q = normalizeForLooseMatch(stripWrappingQuotes(opts.query));
	if (!q) return null;

	const deadline = Date.now() + (opts.timeoutMs ?? FILE_RESOLVE_TIMEOUT_MS);

	let visited = 0;
	const queue: string[] = [opts.rootDir];

	const candidates: Array<{ score: number; path: string }> = [];

	while (queue.length > 0 && visited < MAX_RESOLVE_SCAN_ENTRIES) {
		// Timeout protection: bail out if we've exceeded the deadline.
		if (Date.now() > deadline) break;

		const dir = queue.shift() as string;
		let entries: Array<import("node:fs").Dirent> = [];
		try {
			entries = await fsp.readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const ent of entries) {
			if (visited++ >= MAX_RESOLVE_SCAN_ENTRIES) break;
			// Periodic deadline check inside inner loop
			if (visited % 500 === 0 && Date.now() > deadline) break;

			const name = ent.name;
			// Avoid massive dirs if user points cwd wrong.
			if (ent.isDirectory()) {
				if (name === "node_modules" || name === ".git") continue;
				if (name.startsWith(".")) continue;
				queue.push(path.join(dir, name));
				continue;
			}
			if (!ent.isFile()) continue;

			const fullPath = path.join(dir, name);
			const base = normalizeForLooseMatch(name);

			let score = -1;
			if (base === q) score = 100;
			else if (base.startsWith(q)) score = 80;
			else if (base.includes(q)) score = 60;
			// When the LLM passes an ultra-long title, our sandbox filename may be truncated.
			// In that case, query often contains the basename as a substring.
			else if (q.startsWith(base)) score = 75;
			else if (q.includes(base)) score = 65;
			else {
				const stem = base.replace(/\.[a-z0-9]+$/i, "");
				if (stem === q) score = 70;
				else if (stem.startsWith(q)) score = 55;
				else if (stem.includes(q)) score = 40;
				else if (q.startsWith(stem)) score = 52;
				else if (q.includes(stem)) score = 45;
			}

			if (score >= 0) {
				// Prefer shallower paths for ambiguity.
				const depth = fullPath
					.slice(opts.rootDir.length)
					.split(path.sep)
					.filter(Boolean).length;
				candidates.push({ score: score - depth, path: fullPath });
			}
		}
	}

	if (candidates.length === 0) return null;
	candidates.sort((a, b) => b.score - a.score);
	return candidates[0]?.path ?? null;
}

export async function guessDefaultReadableFilePath(
	cwd: string,
): Promise<string | null> {
	let entries: Array<import("node:fs").Dirent> = [];
	try {
		entries = await fsp.readdir(cwd, { withFileTypes: true });
	} catch {
		return null;
	}

	const files = entries
		.filter((e) => e.isFile() && !e.name.startsWith("."))
		.slice(0, 500)
		.map((e) => path.join(cwd, e.name));

	if (files.length === 0) return null;
	if (files.length === 1) return files[0];

	const preferredExt = new Set([
		"md",
		"markdown",
		"txt",
		"json",
		"csv",
		"html",
		"htm",
	]);

	const scored: Array<{ score: number; mtimeMs: number; p: string }> = [];
	for (const p of files) {
		let st: import("node:fs").Stats | null = null;
		try {
			st = await fsp.stat(p);
		} catch {
			continue;
		}
		const ext = path.extname(p).replace(/^\./, "").toLowerCase();
		const score = preferredExt.has(ext) ? 10 : 0;
		scored.push({ score, mtimeMs: st.mtimeMs, p });
	}

	scored.sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs);
	return scored[0]?.p || null;
}

export async function resolveToolFilePathEx(opts: {
	cwd: string;
	rawPath: string;
	/** When true, allows paths outside cwd (returns insideSandbox=false) */
	allowGlobal?: boolean;
}): Promise<ResolvedPath | null> {
	const raw = stripWrappingQuotes(String(opts.rawPath || "").trim());
	if (!raw) return null;

	const cwdResolved = path.resolve(opts.cwd);
	const allowGlobal = opts.allowGlobal !== false; // default true

	const unescapeCommon = (p: string): string =>
		String(p || "")
			.replace(/\\(["'])/g, "$1")
			.trim();

	const mapHomeSkillsToCwd = (p: string): string | null => {
		const norm = String(p || "");
		const marker = `${path.sep}.claude${path.sep}skills${path.sep}`;
		const idx = norm.indexOf(marker);
		if (idx < 0) return null;
		const tail = norm.slice(idx + marker.length);
		if (!tail) return null;
		return path.join(opts.cwd, ".claude", "skills", tail);
	};

	const checkInsideCwd = (p: string): boolean => {
		const resolved = path.resolve(p);
		return (
			resolved === cwdResolved ||
			resolved.startsWith(`${cwdResolved}${path.sep}`)
		);
	};

	// 首先检查：如果路径是绝对路径且文件存在
	const rawClean = unescapeCommon(raw);
	if (path.isAbsolute(rawClean)) {
		const absoluteExists = await pathExists(rawClean);
		console.log(
			`[resolveToolFilePathEx] Absolute path check: raw='${rawClean}', exists=${absoluteExists}`,
		);
		if (absoluteExists) {
			const resolved = path.resolve(rawClean);
			const withinCwd = checkInsideCwd(resolved);
			if (withinCwd) return { path: rawClean, insideSandbox: true };

			// Rewrite ~/.claude/skills to cwd/.claude/skills
			const mapped = mapHomeSkillsToCwd(rawClean);
			if (mapped && (await pathExists(mapped))) {
				console.log(
					`[resolveToolFilePathEx] Rewriting home skills path to cwd: '${rawClean}' -> '${mapped}'`,
				);
				return { path: mapped, insideSandbox: true };
			}

			// 全局访问：路径在沙盒外，但文件存在
			if (allowGlobal) {
				console.log(
					`[resolveToolFilePathEx] Global access: path='${rawClean}', insideSandbox=false`,
				);
				return { path: rawClean, insideSandbox: false };
			}

			console.log(
				`[resolveToolFilePathEx] Absolute path exists but outside cwd and global disabled; rejecting`,
			);
			return null;
		}

		// Absolute path doesn't exist; try basename matching within cwd
		const base = path.basename(rawClean);
		if (base && base !== rawClean) {
			const foundByBase = await findFileByLooseName({
				rootDir: opts.cwd,
				query: base,
			});
			if (foundByBase && (await pathExists(foundByBase))) {
				console.log(
					`[resolveToolFilePathEx] Absolute path missing; resolved by basename: raw='${rawClean}' -> '${foundByBase}'`,
				);
				return { path: foundByBase, insideSandbox: true };
			}
		}

		// 绝对路径不存在但可能是新文件 — 检查父目录是否存在
		const parentDir = path.dirname(rawClean);
		const parentExists = await pathExists(parentDir);
		if (parentExists) {
			const insideCwd = checkInsideCwd(rawClean);
			if (insideCwd) {
				return { path: rawClean, insideSandbox: true };
			}
			if (allowGlobal) {
				console.log(
					`[resolveToolFilePathEx] New file (global): path='${rawClean}', insideSandbox=false`,
				);
				return { path: rawClean, insideSandbox: false };
			}
		}
	}

	// 尝试作为相对于 cwd 的路径解析
	const asAbsolute = path.isAbsolute(raw) ? raw : path.resolve(opts.cwd, raw);
	const exists = await pathExists(asAbsolute);
	const withinCwd = checkInsideCwd(asAbsolute);
	console.log(
		`[resolveToolFilePathEx] Relative check: raw='${raw}', asAbsolute='${asAbsolute}', exists=${exists}, withinCwd=${withinCwd}`,
	);

	if (exists && withinCwd) return { path: asAbsolute, insideSandbox: true };
	if (exists && !withinCwd && allowGlobal) {
		return { path: asAbsolute, insideSandbox: false };
	}

	// 文件不存在但路径在 cwd 内 — 允许新文件创建
	if (!exists && withinCwd) {
		const parentDir = path.dirname(asAbsolute);
		const parentExists = await pathExists(parentDir);
		if (parentExists || parentDir === cwdResolved) {
			console.log(
				`[resolveToolFilePathEx] New file path (cwd): raw='${raw}' -> '${asAbsolute}'`,
			);
			return { path: asAbsolute, insideSandbox: true };
		}
	}

	// 文件不存在但路径在 cwd 外 — 允许新文件创建（全局模式）
	if (!exists && !withinCwd && allowGlobal) {
		const parentDir = path.dirname(asAbsolute);
		const parentExists = await pathExists(parentDir);
		if (parentExists) {
			return { path: asAbsolute, insideSandbox: false };
		}
	}

	// 模糊匹配：如果用户提供了文件名而非路径（仅在 cwd 内搜索）
	const found = await findFileByLooseName({ rootDir: opts.cwd, query: raw });
	console.log(`[resolveToolFilePathEx] Fuzzy search result: '${found}'`);
	if (found && (await pathExists(found))) {
		return { path: found, insideSandbox: true };
	}

	// Basename fallback
	const rawBase = path.basename(raw);
	if (rawBase && rawBase !== raw) {
		const foundByBase = await findFileByLooseName({
			rootDir: opts.cwd,
			query: rawBase,
		});
		if (foundByBase && (await pathExists(foundByBase))) {
			return { path: foundByBase, insideSandbox: true };
		}
	}

	console.log(
		`[resolveToolFilePathEx] FAILED: Could not resolve path '${raw}' in cwd='${cwdResolved}'`,
	);
	return null;
}

/**
 * Legacy wrapper — returns just the path string (null if not found).
 * Used by code paths that don't need sandbox scope info.
 */
export async function resolveToolFilePath(opts: {
	cwd: string;
	rawPath: string;
}): Promise<string | null> {
	const result = await resolveToolFilePathEx({
		cwd: opts.cwd,
		rawPath: opts.rawPath,
		allowGlobal: true,
	});
	return result?.path ?? null;
}

// ---------------------------------------------------------------------------
// Shell tokenization & Bash command rewriting
// ---------------------------------------------------------------------------

function tokenizeShellLike(input: string): string[] {
	const s = String(input || "");
	const tokens: string[] = [];
	let buf = "";
	let quote: "'" | '"' | null = null;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i] as string;
		if (quote) {
			if (ch === quote) {
				quote = null;
			} else {
				buf += ch;
			}
			continue;
		}
		if (ch === "'" || ch === '"') {
			quote = ch;
			continue;
		}
		if (/\s/.test(ch)) {
			if (buf) {
				tokens.push(buf);
				buf = "";
			}
			continue;
		}
		buf += ch;
	}
	if (buf) tokens.push(buf);
	return tokens;
}

function needsQuoting(token: string): boolean {
	return /[\s"'\\]/.test(token);
}

function joinShellTokens(tokens: string[]): string {
	return tokens.map((t) => (needsQuoting(t) ? JSON.stringify(t) : t)).join(" ");
}

function looksLikeGlob(p: string): boolean {
	return /[*?\[\]{}]/.test(p);
}

export async function rewriteBashCommandForMissingFile(opts: {
	cwd: string;
	command: string;
}): Promise<string | null> {
	const tokens = tokenizeShellLike(opts.command);
	if (tokens.length < 2) return null;

	const cmd = tokens[0]?.toLowerCase();
	if (!cmd) return null;

	// Only handle simple single-command reads to reduce risk.
	const supported = new Set(["cat", "head", "tail", "ls", "stat"]);
	if (!supported.has(cmd)) return null;

	// Pick last token as candidate file path (works for `cat file`, `head -n 20 file`, `ls -la file`).
	const candidateRaw = tokens[tokens.length - 1] as string;
	if (!candidateRaw) return null;
	if (candidateRaw === "-" || candidateRaw.startsWith("-")) return null;
	if (looksLikeGlob(candidateRaw)) return null;

	const candidate = stripWrappingQuotes(candidateRaw);
	if (!candidate) return null;

	const resolved = await resolveToolFilePath({
		cwd: opts.cwd,
		rawPath: candidate,
	});
	if (!resolved || resolved === candidate) return null;

	const updated = [...tokens];
	updated[updated.length - 1] = resolved;
	return joinShellTokens(updated);
}

// ---------------------------------------------------------------------------
// Deep path rewriting for complex tool inputs (e.g. Skill)
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shouldTreatAsPathKey(key: string): boolean {
	const k = key.toLowerCase();
	return (
		k === "path" ||
		k === "file" ||
		k === "file_path" ||
		k === "filePath".toLowerCase() ||
		k.includes("file") ||
		k.includes("path") ||
		k.includes("source")
	);
}

export async function rewritePathsDeep(opts: {
	cwd: string;
	value: unknown;
	depth?: number;
}): Promise<unknown> {
	const depth = opts.depth ?? 0;
	if (depth > 6) return opts.value;

	if (typeof opts.value === "string") {
		const s = stripWrappingQuotes(opts.value);
		// Avoid rewriting obviously-not-path huge strings.
		if (s.length > 260) return opts.value;
		const resolved = await resolveToolFilePath({ cwd: opts.cwd, rawPath: s });
		return resolved ?? opts.value;
	}

	if (Array.isArray(opts.value)) {
		const out: unknown[] = [];
		let changed = false;
		for (const item of opts.value) {
			const next = await rewritePathsDeep({
				cwd: opts.cwd,
				value: item,
				depth: depth + 1,
			});
			out.push(next);
			if (next !== item) changed = true;
		}
		return changed ? out : opts.value;
	}

	if (isObject(opts.value)) {
		const obj = opts.value;
		const out: Record<string, unknown> = {};
		let changed = false;
		for (const [k, v] of Object.entries(obj)) {
			if (typeof v === "string" && shouldTreatAsPathKey(k)) {
				const resolved = await resolveToolFilePath({
					cwd: opts.cwd,
					rawPath: v,
				});
				if (resolved && resolved !== v) {
					out[k] = resolved;
					changed = true;
					continue;
				}
			}

			const next = await rewritePathsDeep({
				cwd: opts.cwd,
				value: v,
				depth: depth + 1,
			});
			out[k] = next;
			if (next !== v) changed = true;
		}
		return changed ? out : opts.value;
	}

	return opts.value;
}
