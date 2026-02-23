/**
 * fileResolver.ts
 *
 * File resolution utilities for the Agent SDK.
 * Handles loose filename matching, path rewriting, and Bash command rewriting
 * to help the LLM find files within the agent workspace (cwd).
 */
import fsp from "node:fs/promises";
import path from "node:path";

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

export async function resolveToolFilePath(opts: {
	cwd: string;
	rawPath: string;
}): Promise<string | null> {
	const raw = stripWrappingQuotes(String(opts.rawPath || "").trim());
	if (!raw) return null;

	const cwdResolved = path.resolve(opts.cwd);

	const unescapeCommon = (p: string): string =>
		String(p || "")
			// Convert escaped quotes like \" to "
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

	// 【修复】首先检查：如果路径是绝对路径且文件存在，直接返回
	// 这解决了模型提供完整沙盒路径时的问题
	const rawClean = unescapeCommon(raw);
	if (path.isAbsolute(rawClean)) {
		const absoluteExists = await pathExists(rawClean);
		console.log(
			`[resolveToolFilePath] Absolute path check: raw='${rawClean}', exists=${absoluteExists}`,
		);
		if (absoluteExists) {
			const resolved = path.resolve(rawClean);
			const withinCwd =
				resolved === cwdResolved ||
				resolved.startsWith(`${cwdResolved}${path.sep}`);
			if (withinCwd) return rawClean;

			// If model tries to read from ~/.claude/skills, rewrite to cwd/.claude/skills where we sync skills.
			const mapped = mapHomeSkillsToCwd(rawClean);
			if (mapped && (await pathExists(mapped))) {
				console.log(
					`[resolveToolFilePath] Rewriting home skills path to cwd: '${rawClean}' -> '${mapped}'`,
				);
				return mapped;
			}

			// Disallow paths outside cwd to avoid SDK tool sandbox errors.
			console.log(
				`[resolveToolFilePath] Absolute path exists but outside cwd; rejecting: raw='${rawClean}', cwd='${cwdResolved}'`,
			);
			return null;
		}

		// Absolute path doesn't exist; often the basename is correct but the path/quotes are wrong.
		const base = path.basename(rawClean);
		if (base && base !== rawClean) {
			const foundByBase = await findFileByLooseName({
				rootDir: opts.cwd,
				query: base,
			});
			if (foundByBase && (await pathExists(foundByBase))) {
				console.log(
					`[resolveToolFilePath] Absolute path missing; resolved by basename: raw='${rawClean}' -> '${foundByBase}'`,
				);
				return foundByBase;
			}
		}
	}

	const isWithinCwd = (p: string) => {
		const resolved = path.resolve(p);
		return (
			resolved === cwdResolved ||
			resolved.startsWith(`${cwdResolved}${path.sep}`)
		);
	};

	// 尝试作为相对于 cwd 的路径解析
	const asAbsolute = path.isAbsolute(raw) ? raw : path.resolve(opts.cwd, raw);
	const exists = await pathExists(asAbsolute);
	const withinCwd = isWithinCwd(asAbsolute);
	console.log(
		`[resolveToolFilePath] Relative check: raw='${raw}', cwd='${cwdResolved}', asAbsolute='${asAbsolute}', exists=${exists}, withinCwd=${withinCwd}`,
	);

	if (exists && withinCwd) return asAbsolute;

	// 【修复】对于 Write 工具创建新文件：即使文件不存在，只要路径在 cwd 内且是合法路径，就允许
	// 这样 Write 工具就可以创建新文件了
	if (!exists && withinCwd) {
		// 确保父目录存在或可以创建
		const parentDir = path.dirname(asAbsolute);
		const parentExists = await pathExists(parentDir);
		if (parentExists || parentDir === cwdResolved) {
			console.log(
				`[resolveToolFilePath] New file path (for Write): raw='${raw}' -> '${asAbsolute}'`,
			);
			return asAbsolute;
		}
	}

	// 模糊匹配：如果用户提供了文件名而非路径
	const found = await findFileByLooseName({ rootDir: opts.cwd, query: raw });
	console.log(`[resolveToolFilePath] Fuzzy search result: '${found}'`);
	if (found && (await pathExists(found))) return found;

	// If the model passed an absolute-ish string that doesn't exist, try matching by basename.
	const rawBase = path.basename(raw);
	if (rawBase && rawBase !== raw) {
		const foundByBase = await findFileByLooseName({
			rootDir: opts.cwd,
			query: rawBase,
		});
		if (foundByBase && (await pathExists(foundByBase))) return foundByBase;
	}

	console.log(
		`[resolveToolFilePath] FAILED: Could not resolve path '${raw}' in cwd='${cwdResolved}'`,
	);
	return null;
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
