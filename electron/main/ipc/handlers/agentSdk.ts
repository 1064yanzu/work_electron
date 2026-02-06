import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { app } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import { isRetryableError, DEFAULT_RETRY_CONFIG } from "../../utils/retryUtils";
import { interactionBroker } from "./agentSdk/interactionBroker";
import { createLifecycleHooks } from "./agentSdk/hooksFactory";
import { runRegistry } from "./agentSdk/runRegistry";
import { createSubagentLifecycleHooks } from "./agentSdk/subagentHooks";
import { isSdkSessionId, normalizeSdkSessionId } from "./agentSdk/sessionId";

const execFileAsync = promisify(execFile);
const MAX_RESOLVE_SCAN_ENTRIES = 5000;

async function pathExists(p: string): Promise<boolean> {
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
			// Normalize quote variants ("护岛" vs “护岛”) so basenames can be fuzzy-matched.
			.replace(/[“”„‟＂]/g, "_")
			.replace(/[‘’‚‛]/g, "_")
			// Common Chinese punctuation variants
			.replace(/[？]/g, "_")
			.replace(/[：]/g, ":")
	);
}

function stripWrappingQuotes(raw: string): string {
	const s = String(raw || "").trim();
	if (
		(s.startsWith('"') && s.endsWith('"')) ||
		(s.startsWith("'") && s.endsWith("'"))
	) {
		return s.slice(1, -1).trim();
	}
	return s;
}

async function findFileByLooseName(opts: {
	rootDir: string;
	query: string;
}): Promise<string | null> {
	const q = normalizeForLooseMatch(stripWrappingQuotes(opts.query));
	if (!q) return null;

	let visited = 0;
	const queue: string[] = [opts.rootDir];

	const candidates: Array<{ score: number; path: string }> = [];

	while (queue.length > 0 && visited < MAX_RESOLVE_SCAN_ENTRIES) {
		const dir = queue.shift() as string;
		let entries: Array<import("node:fs").Dirent> = [];
		try {
			entries = await fsp.readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}

		for (const ent of entries) {
			if (visited++ >= MAX_RESOLVE_SCAN_ENTRIES) break;
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

async function guessDefaultReadableFilePath(
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

async function resolveToolFilePath(opts: {
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

async function rewriteBashCommandForMissingFile(opts: {
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

async function rewritePathsDeep(opts: {
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

async function resolveUserPathFromShell(
	shell: string | null,
): Promise<string | null> {
	const s = (shell || "").trim();
	if (!s) return null;

	for (const args of [
		["-ilc", "echo -n $PATH"],
		["-lc", "echo -n $PATH"],
		["-c", "echo -n $PATH"],
	]) {
		try {
			const { stdout } = await execFileAsync(s, args, {
				env: process.env,
				timeout: 2000,
				maxBuffer: 1024 * 1024,
			});
			const out = String(stdout || "").trim();
			if (out && out.includes(":")) return out;
		} catch (e: unknown) {
			const err = e as { code?: string };
			// Ignore common errors
			if (err.code !== "ENOENT") {
				// console.debug('Shell resolution error:', e);
			}
		}
	}
	return null;
}

function normalizeStringArray(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

function isLikelyWritingTask(prompt: string): boolean {
	const p = prompt.toLowerCase();
	return (
		p.includes("小红书") ||
		p.includes("推文") ||
		p.includes("文案") ||
		p.includes("写一篇") ||
		p.includes("写篇") ||
		p.includes("撰写") ||
		p.includes("润色") ||
		p.includes("改写") ||
		p.includes("公众号") ||
		p.includes("营销") ||
		p.includes("笔记")
	);
}

function pickWritingSkill(skills: string[]): string | null {
	const lowered = skills.map((s) => ({ raw: s, low: s.toLowerCase() }));
	const exact = lowered.find((s) => s.low === "writing-assistant");
	if (exact) return exact.raw;
	const byKeyword = lowered.find(
		(s) => s.low.includes("writing") || s.raw.includes("写作"),
	);
	return byKeyword?.raw ?? null;
}

function getHomeSkillsRootDir() {
	const home = app.getPath("home");
	// Codex desktop stores skills under ~/.codex/skills.
	// Claude Code stores skills under ~/.claude/skills.
	// Prefer Codex skills if present.
	const codexSkills = path.join(home, ".codex", "skills");
	const claudeSkills = path.join(home, ".claude", "skills");
	if (fs.existsSync(codexSkills)) return codexSkills;
	if (fs.existsSync(claudeSkills)) return claudeSkills;
	// Default to Codex location to make intent obvious.
	return codexSkills;
}

async function ensureDir(dir: string) {
	await fsp.mkdir(dir, { recursive: true });
}

/**
 * Claude Agent SDK 的 Skill tool 会扫描 cwd/.claude/skills（project settings）等目录。
 * 我们当前的技能库在 ~/.claude/skills（home）。为避免 SDK 执行 Skill 时提示“不可用”，
 * 在每次启动 agent 前，把 home skills 增量同步到 cwd/.claude/skills。
 */
async function syncSkillsToCwd(cwd: string, stderr: (msg: string) => void) {
	const srcRoot = getHomeSkillsRootDir();
	const destRoot = path.join(cwd, ".claude", "skills");

	try {
		await ensureDir(destRoot);
	} catch (e) {
		stderr(
			`[agent_sdk_start] Failed to ensure project skills dir: ${destRoot}. ${e instanceof Error ? e.message : String(e)}`,
		);
		return;
	}

	let entries: Array<import("node:fs").Dirent> = [];
	try {
		entries = await fsp.readdir(srcRoot, { withFileTypes: true });
	} catch {
		// 没有 home skills 目录就不做同步
		stderr(`[agent_sdk_start] Home skills dir not found: ${srcRoot}`);
		return;
	}

	stderr(
		`[agent_sdk_start] Syncing skills: src=${srcRoot} -> dest=${destRoot} (dirs=${entries.filter((e) => e.isDirectory()).length})`,
	);

	for (const ent of entries) {
		if (!ent.isDirectory()) continue;
		const srcDir = path.join(srcRoot, ent.name);
		const destDir = path.join(destRoot, ent.name);
		try {
			await fsp.access(destDir);
			// 已存在则不覆盖，避免破坏 project 侧自定义
			continue;
		} catch {
			// dest 不存在 -> copy
		}

		try {
			await fsp.cp(srcDir, destDir, {
				recursive: true,
				dereference: true,
				errorOnExist: false,
			});
		} catch (e) {
			stderr(
				`[agent_sdk_start] Failed to sync skill '${ent.name}' to project skills dir. ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}
}

function uniqStrings(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const v of values) {
		const s = String(v || "").trim();
		if (!s) continue;
		if (seen.has(s)) continue;
		seen.add(s);
		out.push(s);
	}
	return out;
}

async function listProjectSkills(cwd: string): Promise<string[]> {
	const dir = path.join(cwd, ".claude", "skills");
	try {
		const entries = await fsp.readdir(dir, { withFileTypes: true });
		return entries
			.filter((e) => e.isDirectory() && !e.name.startsWith("."))
			.map((e) => e.name);
	} catch {
		return [];
	}
}

function expandHomePath(rawPath: string): string {
	const v = String(rawPath || "").trim();
	if (!v) return "";
	if (v === "~") return app.getPath("home");
	if (v.startsWith("~/")) return path.join(app.getPath("home"), v.slice(2));
	return v;
}

async function resolveExistingDirectory(
	rawPath: string,
	cwd: string,
): Promise<string | null> {
	const expanded = expandHomePath(rawPath);
	if (!expanded) return null;
	const abs = path.isAbsolute(expanded)
		? path.resolve(expanded)
		: path.resolve(cwd, expanded);
	try {
		const stat = await fsp.stat(abs);
		if (!stat.isDirectory()) return null;
		return abs;
	} catch {
		return null;
	}
}

async function normalizeAdditionalDirectories(
	cwd: string,
	input: unknown,
): Promise<string[]> {
	if (!Array.isArray(input)) return [];
	const resolved = await Promise.all(
		input.map((item) => resolveExistingDirectory(String(item || ""), cwd)),
	);
	return uniqStrings(resolved.filter((item): item is string => Boolean(item)));
}

async function collectProjectPluginPaths(cwd: string): Promise<string[]> {
	const pluginRoot = path.join(cwd, ".claude", "plugins");
	try {
		const stat = await fsp.stat(pluginRoot);
		if (!stat.isDirectory()) return [];
	} catch {
		return [];
	}

	try {
		const entries = await fsp.readdir(pluginRoot, { withFileTypes: true });
		const subdirs = entries
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
			.map((entry) => path.join(pluginRoot, entry.name));
		if (subdirs.length > 0) return subdirs;
		return [pluginRoot];
	} catch {
		return [pluginRoot];
	}
}

async function normalizePlugins(
	cwd: string,
	input: unknown,
): Promise<Array<{ type: "local"; path: string }>> {
	const configured = Array.isArray(input) ? input : [];
	const configuredPaths: string[] = [];
	for (const item of configured) {
		if (!item || typeof item !== "object") continue;
		const typed = item as { type?: unknown; path?: unknown };
		if (typed.type !== "local" || typeof typed.path !== "string") continue;
		configuredPaths.push(typed.path);
	}

	const projectPaths = await collectProjectPluginPaths(cwd);
	const merged = uniqStrings([...projectPaths, ...configuredPaths]);
	const resolved = await Promise.all(
		merged.map((p) => resolveExistingDirectory(p, cwd)),
	);

	return resolved
		.filter((p): p is string => Boolean(p))
		.map((p) => ({ type: "local" as const, path: p }));
}

type AgentSdkStartInput = IPCSchema["agent_sdk_start"]["input"];
type AgentSdkStartOutput = IPCSchema["agent_sdk_start"]["output"];
type AgentSdkAbortInput = IPCSchema["agent_sdk_abort"]["input"];
type AgentSdkAbortOutput = IPCSchema["agent_sdk_abort"]["output"];
type AgentSdkResolveInteractionInput =
	IPCSchema["agent_sdk_resolve_interaction"]["input"];
type AgentSdkResolveInteractionOutput =
	IPCSchema["agent_sdk_resolve_interaction"]["output"];
type AgentSdkControlInput = IPCSchema["agent_sdk_control"]["input"];
type AgentSdkControlOutput = IPCSchema["agent_sdk_control"]["output"];

type AgentSdkInteractionRequestPayload = {
	requestId: string;
	toolName: string;
	toolInput: Record<string, unknown>;
	toolUseId: string;
	agentId?: string;
	description?: string;
	decisionReason?: string;
	blockedPath?: string;
	suggestions?: unknown[];
	expiresAt: number;
};

type AgentSdkEventPayload = {
	runId: string;
	type: string;
	message?: unknown;
	result?: unknown;
	error?: string;
	events?: unknown;
	request?: AgentSdkInteractionRequestPayload;
};

type GetMainWindow = () => BrowserWindow | null;

function emit(getMainWindow: GetMainWindow, payload: AgentSdkEventPayload) {
	const win = getMainWindow();
	if (!win) return;
	win.webContents.send("agent-sdk-event", payload);
}

const DATA_IMAGE_URL_RE =
	/data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi;
const DATA_IMAGE_URL_LIMIT = 1;
const DATA_IMAGE_URL_MAX_CHARS = 8_000_000;

function extensionFromDataImageMime(raw: string): string {
	const mime = String(raw || "")
		.toLowerCase()
		.trim();
	if (!mime) return "png";
	if (mime === "jpeg") return "jpg";
	if (mime === "svg+xml") return "svg";
	if (mime === "x-icon") return "ico";
	return mime.replace(/[^a-z0-9]+/g, "") || "png";
}

function collectDataImageUrlsFromString(
	input: string,
	limit = DATA_IMAGE_URL_LIMIT,
): string[] {
	const text = String(input || "");
	if (!text || text.length > DATA_IMAGE_URL_MAX_CHARS) return [];
	const found: string[] = [];
	let match: RegExpExecArray | null = null;
	DATA_IMAGE_URL_RE.lastIndex = 0;
	while ((match = DATA_IMAGE_URL_RE.exec(text)) !== null) {
		const whole = match[0];
		if (!whole) continue;
		found.push(whole);
		if (found.length >= limit) break;
	}
	return found;
}

function collectDataImageUrlsFromUnknown(
	value: unknown,
	limit = DATA_IMAGE_URL_LIMIT,
): string[] {
	const found = new Set<string>();
	const seen = new Set<unknown>();

	const visit = (v: unknown, depth: number) => {
		if (v === null || v === undefined) return;
		if (depth > 8 || found.size >= limit) return;

		if (typeof v === "string") {
			const items = collectDataImageUrlsFromString(v, limit - found.size);
			for (const item of items) {
				found.add(item);
				if (found.size >= limit) break;
			}
			return;
		}
		if (Array.isArray(v)) {
			for (const item of v) {
				visit(item, depth + 1);
				if (found.size >= limit) break;
			}
			return;
		}
		if (typeof v !== "object") return;
		if (seen.has(v)) return;
		seen.add(v);
		for (const item of Object.values(v as Record<string, unknown>)) {
			visit(item, depth + 1);
			if (found.size >= limit) break;
		}
	};

	visit(value, 0);
	return [...found];
}

async function persistDataImageUrlToCwd(input: {
	dataUrl: string;
	cwd: string;
	prefix?: string;
}): Promise<string | null> {
	const match = String(input.dataUrl || "").match(
		/^data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i,
	);
	if (!match) return null;
	const ext = extensionFromDataImageMime(match[1] || "png");
	const rawBase64 = match[2] || "";
	if (!rawBase64) return null;
	let bytes: Buffer;
	try {
		bytes = Buffer.from(rawBase64, "base64");
	} catch {
		return null;
	}
	if (!bytes || bytes.length === 0) return null;

	const outDir = path.join(input.cwd, "images");
	await fsp.mkdir(outDir, { recursive: true });
	const fileName = `${input.prefix || "generated-image"}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
	const outPath = path.join(outDir, fileName);
	await fsp.writeFile(outPath, bytes);
	return outPath;
}

function buildUiToolResultOutput(
	original: unknown,
	persistedPaths: string[],
): unknown {
	const imagePaths = uniqStrings(persistedPaths);
	if (imagePaths.length === 0) return original;

	if (original && typeof original === "object" && !Array.isArray(original)) {
		const record = original as Record<string, unknown>;
		const existing = Array.isArray(record.image_paths)
			? record.image_paths.filter((v): v is string => typeof v === "string")
			: [];
		return {
			...record,
			image_paths: uniqStrings([...existing, ...imagePaths]),
		};
	}

	return {
		image_paths: imagePaths,
	};
}

function toUIEvents(
	message: any,
	options?: {
		rewriteToolResultOutput?: (toolUseId: string, output: unknown) => unknown;
	},
): any[] {
	const events: any[] = [];
	if (!message || typeof message !== "object") return events;

	// SDK system messages (session init, status, compaction boundary, etc.)
	if (message.type === "system") {
		if (message.subtype === "task_notification") {
			events.push({
				type: "task_notification",
				taskId:
					typeof message.task_id === "string" ? message.task_id : undefined,
				status: typeof message.status === "string" ? message.status : undefined,
				outputFile:
					typeof message.output_file === "string"
						? message.output_file
						: undefined,
				summary:
					typeof message.summary === "string" ? message.summary : undefined,
			});
		}

		if (message.subtype === "files_persisted") {
			events.push({
				type: "files_persisted",
				files: Array.isArray(message.files) ? message.files : [],
				failed: Array.isArray(message.failed) ? message.failed : [],
				processedAt:
					typeof message.processed_at === "string"
						? message.processed_at
						: undefined,
			});
		}

		if (
			message.subtype === "init" &&
			message.session_id &&
			isSdkSessionId(String(message.session_id))
		) {
			events.push({
				type: "session_init",
				sessionId: String(message.session_id),
				cwd: typeof message.cwd === "string" ? message.cwd : undefined,
			});
		}

		if (message.subtype === "status") {
			if (message.status === "compacting") {
				events.push({
					type: "system_notice",
					level: "info",
					content: "Claude Agent SDK 正在压缩上下文（compacting）…",
				});
			} else if (message.status === null) {
				events.push({
					type: "system_notice",
					level: "info",
					content: "Claude Agent SDK 上下文压缩完成。",
				});
			}
		}

		if (message.subtype === "compact_boundary") {
			const trigger = message.compact_metadata?.trigger;
			const preTokens = message.compact_metadata?.pre_tokens;
			events.push({
				type: "system_notice",
				level: "info",
				content: `Claude Agent SDK 已压缩上下文（trigger=${String(trigger ?? "unknown")}, pre_tokens=${String(preTokens ?? "unknown")}）`,
			});
		}
	}

	if (message.type === "auth_status") {
		events.push({
			type: "auth_status",
			isAuthenticating: Boolean(message.isAuthenticating),
			output: Array.isArray(message.output)
				? message.output.filter(
						(v: unknown): v is string => typeof v === "string",
					)
				: [],
			error: typeof message.error === "string" ? message.error : undefined,
		});
	}

	if (message.type === "tool_use_summary") {
		events.push({
			type: "tool_use_summary",
			summary: typeof message.summary === "string" ? message.summary : "",
			precedingToolUseIds: Array.isArray(message.preceding_tool_use_ids)
				? message.preceding_tool_use_ids
				: [],
		});
	}

	if (message.type === "assistant" || message.type === "user") {
		const beta = message.message;
		const blocks = Array.isArray(beta?.content) ? beta.content : [];
		for (const b of blocks) {
			if (b?.type === "tool_result" && b?.tool_use_id) {
				const toolUseId = String(b.tool_use_id);
				const output = options?.rewriteToolResultOutput
					? options.rewriteToolResultOutput(toolUseId, b.content)
					: b.content;
				events.push({
					type: "tool_call_end",
					id: toolUseId,
					output,
					isError:
						Boolean(b.is_error) ||
						String(b.content ?? "").includes("<tool_use_error>"),
				});
			}
		}
	}

	// Handle stream events (either wrapped in 'stream_event' or raw)
	let ev = message;
	if (message.type === "stream_event") {
		ev = message.event;
	}

	if (
		ev?.type === "content_block_delta" &&
		ev?.delta?.type === "text_delta" &&
		typeof ev.delta.text === "string"
	) {
		events.push({ type: "text_delta", content: ev.delta.text });
	}
	if (
		ev?.type === "content_block_start" &&
		ev?.content_block?.type === "tool_use"
	) {
		events.push({
			type: "tool_call_start",
			id: String(ev.content_block.id),
			name: String(ev.content_block.name),
			index: typeof ev.index === "number" ? ev.index : undefined,
			input:
				ev.content_block.input && typeof ev.content_block.input === "object"
					? ev.content_block.input
					: {},
		});
	}
	// 当 content_block_stop 事件触发时，工具输入流式传输已完成
	if (ev?.type === "content_block_stop" && typeof ev?.index === "number") {
		events.push({
			type: "tool_block_stop",
			index: ev.index,
		});
	}

	if (message.type === "result") {
		const isError =
			Boolean((message as any).is_error) || message.subtype !== "success";
		if (
			typeof (message as any).session_id === "string" &&
			isSdkSessionId((message as any).session_id)
		) {
			events.push({
				type: "session_init",
				sessionId: String((message as any).session_id),
			});
		}
		events.push({
			type: "result",
			subtype: message.subtype,
			isError,
			result:
				typeof (message as any).result === "string"
					? (message as any).result
					: "",
		});
	}
	return events;
}

export function createAgentSdkHandlers(options: {
	getMainWindow: GetMainWindow;
	anthropicBaseUrl: string;
	logger: Logger;
	db: DbContext;
}) {
	const require = createRequire(import.meta.url);
	const logger = options.logger;

	type AgentModelSettingsLike = {
		scenarioConfigs?: unknown;
	};
	type ScenarioModelConfigLike = {
		scenario?: unknown;
		customName?: unknown;
		enabled?: unknown;
		modelId?: unknown;
		providerId?: unknown;
		description?: unknown;
	};

	let cachedAgentModelSettings: { loadedAt: number; settings: any } | null =
		null;
	const AGENT_MODEL_SETTINGS_CACHE_TTL_MS = 5_000;

	async function loadAgentModelSettingsFromDb(): Promise<any | null> {
		const now = Date.now();
		if (
			cachedAgentModelSettings &&
			now - cachedAgentModelSettings.loadedAt <
				AGENT_MODEL_SETTINGS_CACHE_TTL_MS
		) {
			return cachedAgentModelSettings.settings;
		}

		try {
			const rows = await options.db.client.execute({
				sql: `SELECT value FROM app_config WHERE key = ?`,
				args: ["agent.model_settings"],
			});
			const raw = rows.rows.length > 0 ? (rows.rows[0].value as unknown) : null;

			let parsed: any = null;
			try {
				if (typeof raw === "string") parsed = JSON.parse(raw);
				else if (raw && typeof raw === "object") parsed = raw;
			} catch {
				parsed = null;
			}

			cachedAgentModelSettings = { loadedAt: now, settings: parsed };
			// 【调试】记录加载的配置
			logger.info({
				msg: "agent_sdk loadAgentModelSettingsFromDb result",
				scope: "agent",
				hasSettings: !!parsed,
				scenarioConfigsCount: Array.isArray(parsed?.scenarioConfigs)
					? parsed.scenarioConfigs.length
					: 0,
				scenarioConfigsPreview: Array.isArray(parsed?.scenarioConfigs)
					? parsed.scenarioConfigs.slice(0, 3).map((c: any) => ({
							scenario: c?.scenario,
							customName: c?.customName,
							enabled: c?.enabled,
							modelId: c?.modelId,
							providerId: c?.providerId,
						}))
					: [],
			});
			return parsed;
		} catch {
			cachedAgentModelSettings = { loadedAt: now, settings: null };
			return null;
		}
	}

	function coerceString(value: unknown): string | null {
		if (typeof value !== "string") return null;
		const s = value.trim();
		return s ? s : null;
	}

	function normalizeAgentKey(key: string): string {
		// Keep names stable and readable; avoid newlines/tabs.
		return String(key || "")
			.normalize("NFC")
			.trim()
			.replace(/\s+/g, " ");
	}

	function buildSubagentAliasMap(
		agents: Record<string, { description?: unknown }>,
	): Map<string, string> {
		const map = new Map<string, string>();
		const add = (alias: unknown, agentKey: string) => {
			if (typeof alias !== "string") return;
			const n = normalizeAgentKey(alias);
			if (!n) return;
			if (!map.has(n)) map.set(n, agentKey);
		};

		for (const [agentKey, def] of Object.entries(agents)) {
			add(agentKey, agentKey);
			add((def as any)?.description, agentKey);

			// Common user/model inputs we want to tolerate.
			const desc =
				typeof (def as any)?.description === "string"
					? (def as any).description
					: "";
			if (desc.startsWith("自定义："))
				add(desc.slice("自定义：".length), agentKey);
			add(`custom:${desc}`, agentKey);
		}
		return map;
	}

	function resolveSubagentType(
		rawSubagentType: string,
		agents: Record<string, unknown>,
		aliasMap: Map<string, string>,
	): string | null {
		const raw = String(rawSubagentType || "");
		const trimmed = raw.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
		const norm = normalizeAgentKey(trimmed);
		if (!norm) return null;

		// Exact key match (after normalization).
		if (Object.prototype.hasOwnProperty.call(agents, norm)) return norm;
		const dashToUnderscore = norm.replace(/-/g, "_");
		if (
			dashToUnderscore !== norm &&
			Object.prototype.hasOwnProperty.call(agents, dashToUnderscore)
		) {
			return dashToUnderscore;
		}
		const underscoreToDash = norm.replace(/_/g, "-");
		if (
			underscoreToDash !== norm &&
			Object.prototype.hasOwnProperty.call(agents, underscoreToDash)
		) {
			return underscoreToDash;
		}
		const lower = /^[\x00-\x7F]+$/.test(norm) ? norm.toLowerCase() : null;
		if (lower && Object.prototype.hasOwnProperty.call(agents, lower))
			return lower;

		// Alias match (e.g. Chinese description / customName).
		const direct = aliasMap.get(norm);
		if (direct && Object.prototype.hasOwnProperty.call(agents, direct))
			return direct;

		// Prefix tolerance.
		if (norm.startsWith("custom:")) {
			const n2 = normalizeAgentKey(norm.slice("custom:".length));
			const v2 = aliasMap.get(n2);
			if (v2 && Object.prototype.hasOwnProperty.call(agents, v2)) return v2;
		}
		if (norm.startsWith("自定义：")) {
			const n2 = normalizeAgentKey(norm.slice("自定义：".length));
			const v2 = aliasMap.get(n2);
			if (v2 && Object.prototype.hasOwnProperty.call(agents, v2)) return v2;
		}

		// Last-resort: if it doesn't look like a valid agent key, fall back to a built-in.
		// This avoids hard failures like: Agent type 'xxx' not found.
		const looksLikeKey = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(norm);
		if (!looksLikeKey) return "general-purpose";

		return null;
	}

	/**
	 * 为自定义场景生成 SDK 兼容的英文 agent key
	 * SDK 不接受中文作为 agent key，需要生成英文标识符
	 * @param scenario - 场景类型，如 "custom", "fast_search" 等
	 * @param _customName - 自定义场景的中文名称（当前未使用，保留供将来扩展）
	 * @param index - 自定义场景的索引，用于生成唯一 key
	 */
	function generateAgentKey(
		scenario: string,
		_customName: string | null,
		index: number,
	): string {
		if (scenario === "custom") {
			// 为自定义场景生成 "custom-1", "custom-2" 格式的英文 key
			return `custom-${index + 1}`;
		}
		// 非自定义场景使用场景名（已经是英文）
		return normalizeAgentKey(scenario);
	}

	function scenarioLabel(scenario: string, customName?: string | null): string {
		if (scenario === "fast_search") return "快速搜索";
		if (scenario === "code_review") return "代码审查";
		if (scenario === "deep_analysis") return "深度分析";
		if (scenario === "writing") return "写作润色";
		if (scenario === "translation") return "翻译";
		if (scenario === "data_processing") return "数据处理";
		if (scenario === "debugging") return "调试排错";
		if (scenario === "custom")
			return customName ? `自定义：${customName}` : "自定义";
		return scenario || "unknown";
	}

	/**
	 * 从子代理描述中自动提取触发关键词
	 * 用于用户没有配置 triggerKeywords 时的备用匹配
	 */
	function extractTriggerKeywordsFromDescription(
		description: string,
	): string[] {
		const keywords: string[] = [];
		const desc = description.toLowerCase();

		// 画图/图像相关
		const imagePatterns = [
			"画图",
			"绘图",
			"绘制",
			"作图",
			"生成图",
			"创建图",
			"制作图",
			"图片",
			"图像",
			"图画",
			"插图",
			"插画",
			"海报",
			"画面",
			"generate image",
			"create image",
			"draw",
		];
		for (const p of imagePatterns) {
			if (desc.includes(p.toLowerCase())) {
				keywords.push(p);
			}
		}

		// 视频相关
		const videoPatterns = ["视频", "动画", "video", "animation"];
		for (const p of videoPatterns) {
			if (desc.includes(p.toLowerCase())) {
				keywords.push(p);
			}
		}

		// 搜索相关
		const searchPatterns = ["搜索", "查找", "检索", "search", "find"];
		for (const p of searchPatterns) {
			if (desc.includes(p.toLowerCase())) {
				keywords.push(p);
			}
		}

		// 代码相关
		const codePatterns = ["代码", "编程", "开发", "coding", "programming"];
		for (const p of codePatterns) {
			if (desc.includes(p.toLowerCase())) {
				keywords.push(p);
			}
		}

		// 翻译相关
		const translatePatterns = ["翻译", "translate", "translation"];
		for (const p of translatePatterns) {
			if (desc.includes(p.toLowerCase())) {
				keywords.push(p);
			}
		}

		return keywords;
	}

	function matchScenarioAgentForPrompt(opts: {
		settings: AgentModelSettingsLike | null;
		promptText: string;
	}): { agentKey: string; description: string; matchedKeyword: string } | null {
		const promptText = String(opts.promptText || "");
		const lower = promptText.toLowerCase();
		const configs = Array.isArray(opts.settings?.scenarioConfigs)
			? (opts.settings?.scenarioConfigs as ScenarioModelConfigLike[])
			: [];

		// Keep custom-N stable by config order (UI order), regardless of enabled/disabled state.
		let customIndex = 0;
		for (const c of configs) {
			if (!c || typeof c !== "object") continue;
			const scenario = coerceString((c as any).scenario) || "";
			if (!scenario) continue;
			const customName = coerceString((c as any).customName);

			const indexForKey = customIndex;
			if (scenario === "custom") customIndex++;

			// Disabled configs should not be auto-matched.
			if ((c as any).enabled === false) continue;

			const agentKey = generateAgentKey(scenario, customName, indexForKey);
			if (!agentKey) continue;

			// 获取用户配置的触发关键词
			let triggerKeywords = Array.isArray((c as any).triggerKeywords)
				? (c as any).triggerKeywords
				: [];

			// 如果用户没有配置关键词，从描述中自动提取
			if (triggerKeywords.length === 0 && customName) {
				const autoKeywords = extractTriggerKeywordsFromDescription(customName);
				triggerKeywords = autoKeywords;
			}

			for (const kw of triggerKeywords) {
				const k = String(kw || "").trim();
				if (!k) continue;
				const kl = k.toLowerCase();
				const hit = lower.includes(kl) || promptText.includes(k);
				if (!hit) continue;

				const description =
					scenario === "custom" && customName
						? customName
						: scenarioLabel(scenario, customName);
				return { agentKey, description, matchedKeyword: k };
			}
		}
		return null;
	}

	function toolsForScenario(
		scenario: string,
		opts?: { includeSkills?: boolean },
	): string[] {
		const includeSkills = opts?.includeSkills === true;
		switch (scenario) {
			case "fast_search":
				return ["Read", "Glob", "Grep", "WebSearch", "WebFetch"];
			case "code_review":
				return ["Read", "Grep", "Glob", "Bash", "WebSearch", "WebFetch"];
			case "deep_analysis":
				return [
					"Read",
					"Edit",
					"Write",
					"Bash",
					"Grep",
					"Glob",
					"WebSearch",
					"WebFetch",
				];
			case "debugging":
				return [
					"Read",
					"Edit",
					"Bash",
					"Grep",
					"Glob",
					"WebSearch",
					"WebFetch",
				];
			case "writing":
				return includeSkills
					? ["Skill", "Read", "Glob", "Grep", "Write", "WebSearch", "WebFetch"]
					: ["Read", "Write", "WebSearch", "WebFetch"];
			case "translation":
				return ["Read", "Write", "WebFetch"];
			case "data_processing":
				return ["Read", "Write", "Bash", "WebSearch", "WebFetch"];
			default:
				// Custom / unknown: allow common tools; include Skill to unlock special capabilities.
				return includeSkills
					? [
							"Skill",
							"Read",
							"Write",
							"Edit",
							"Bash",
							"Grep",
							"Glob",
							"WebSearch",
							"WebFetch",
						]
					: [
							"Read",
							"Write",
							"Edit",
							"Bash",
							"Grep",
							"Glob",
							"WebSearch",
							"WebFetch",
						];
		}
	}

	function promptForScenarioAgent(opts: {
		agentKey: string;
		scenario: string;
		customName?: string | null;
		includeSkills: boolean;
		// 模型路由信息（嵌入到 prompt 中，由 proxy 解析）
		providerId?: string | null;
		modelId?: string | null;
	}): string {
		const label = scenarioLabel(opts.scenario, opts.customName);
		const skillHint = opts.includeSkills
			? "You may use Skill tool when helpful.\n"
			: "";

		// 构建路由标记（隐藏在 XML 注释中，proxy 会解析）
		const routingMarker =
			opts.providerId && opts.modelId
				? `<!-- ipo-route:${opts.providerId}:${opts.modelId} -->\n`
				: "";

		return [
			routingMarker,
			`You are a specialized subagent for: ${label}.`,
			"Return only the final useful output. Be concise; do not include chain-of-thought.",
			"Do NOT copy the full conversation history. Use only the context provided in the Task prompt.",
			"This output will be injected back into the main conversation; keep it short and avoid irrelevant details.",
			skillHint.trimEnd(),
			"",
		]
			.filter(Boolean)
			.join("\n");
	}

	function buildDynamicScenarioAgents(opts: {
		settings: AgentModelSettingsLike | null;
		enabledSkills: string[];
	}): Record<string, any> {
		const agents: Record<string, any> = {};
		const configs = Array.isArray(opts.settings?.scenarioConfigs)
			? (opts.settings?.scenarioConfigs as ScenarioModelConfigLike[])
			: [];

		// Keep custom-N stable by config order (UI order), regardless of enabled/disabled state.
		let customIndex = 0;

		for (const c of configs) {
			if (!c || typeof c !== "object") continue;
			const scenario = coerceString((c as any).scenario) || "";
			if (!scenario) continue;
			const customName = coerceString((c as any).customName);

			const indexForKey = customIndex;
			if (scenario === "custom") customIndex++;

			// Only enabled configs become runnable subagents.
			if ((c as any).enabled === false) continue;

			// 为自定义场景生成英文 key（SDK 不接受中文）
			const agentKey = generateAgentKey(scenario, customName, indexForKey);
			if (!agentKey) continue;

			const includeSkills = scenario === "writing" || scenario === "custom";
			const isCustom = scenario === "custom";

			// 描述使用中文名称供主模型理解
			const description =
				scenario === "custom" && customName
					? customName
					: scenarioLabel(scenario, customName);

			const modelId = coerceString((c as any).modelId);
			const providerId = coerceString((c as any).providerId);

			// 【调试】检查路由参数
			logger.info({
				msg: "agent_sdk buildDynamicScenarioAgents routing params",
				scope: "agent",
				agentKey,
				modelId: modelId || null,
				providerId: providerId || null,
				hasRouting: !!(providerId && modelId),
			});

			agents[agentKey] = {
				description,
				prompt: promptForScenarioAgent({
					agentKey,
					scenario,
					customName,
					includeSkills,
					providerId,
					modelId,
				}),
				// SDK 只接受 model: 'sonnet' | 'opus' | 'haiku' | 'inherit' (文档第7167行)
				// 自定义模型路由将在 anthropic proxy 层通过 agentKey (如 custom-1) 来识别和处理
				// 这里使用 undefined 让 agent 继承主模型，proxy 会根据 subagentKey 路由到正确的 provider+model
				model: undefined,
				// 自定义场景子代理：保持足够自由（继承主线程工具，允许 Task 嵌套）
				...(isCustom
					? {}
					: {
							tools: toolsForScenario(scenario, { includeSkills }),
							disallowedTools: ["Task"],
						}),
				skills:
					includeSkills && opts.enabledSkills.length > 0
						? opts.enabledSkills
						: undefined,
				maxTurns: isCustom ? 30 : 20,
			};
		}

		// 【调试】记录生成的子代理
		logger.info({
			msg: "agent_sdk buildDynamicScenarioAgents result",
			scope: "agent",
			agentKeysGenerated: Object.keys(agents),
			agentsCount: Object.keys(agents).length,
			agentsPreview: Object.entries(agents)
				.slice(0, 5)
				.map(([k, v]) => ({
					agentKey: k,
					description: (v as any)?.description,
					modelEncoded: !!(v as any)?.model,
				})),
		});

		return agents;
	}

	function buildSubagentPolicyAppend(opts: {
		settings: AgentModelSettingsLike | null;
		enabledSkills: string[];
	}): string {
		const configs = Array.isArray(opts.settings?.scenarioConfigs)
			? (opts.settings?.scenarioConfigs as ScenarioModelConfigLike[])
			: [];

		const lines: string[] = [];

		if (opts.enabledSkills.length > 0) {
			lines.push("## Skills（可通过 Skill 工具调用）");
			lines.push(
				`已安装技能（skill 参数可用值）：${opts.enabledSkills.slice(0, 50).join(", ")}`,
			);
			if (opts.enabledSkills.length > 50) {
				lines.push(`（还有 ${opts.enabledSkills.length - 50} 个已省略）`);
			}
		}

		if (configs.length === 0) return lines.join("\n");

		type ScenarioItem = {
			agentKey: string;
			description: string;
			enabled: boolean;
		};

		// Keep custom-N stable by config order (UI order), regardless of enabled/disabled state.
		let customIndex = 0;
		const items: ScenarioItem[] = [];
		for (const c of configs) {
			if (!c || typeof c !== "object") continue;
			const scenario = coerceString((c as any).scenario) || "";
			if (!scenario) continue;
			const customName = coerceString((c as any).customName);

			const indexForKey = customIndex;
			if (scenario === "custom") customIndex++;

			const agentKey = generateAgentKey(scenario, customName, indexForKey);
			if (!agentKey) continue;

			const description =
				scenario === "custom" && customName
					? customName
					: scenarioLabel(scenario, customName);

			items.push({
				agentKey,
				description,
				enabled: (c as any).enabled !== false,
			});
		}

		lines.push("## 子代理(通过 Task 工具调用)");
		lines.push("");
		lines.push(
			"**委派规则**：用户已配置以下子代理，当用户请求的意图与子代理的功能描述**语义相关**时，请**优先**调用 Task 工具委派；如需补充最小必要上下文，可先进行少量 Read/Glob/Grep。",
		);
		lines.push("");
		lines.push(
			'调用方式：Task({ subagent_type: "<英文标识符>", description: "简述任务", prompt: "完整任务描述+所需上下文" })',
		);
		lines.push("");

		const enabled = items.filter((x) => x.enabled);
		const disabled = items.filter((x) => !x.enabled);

		if (enabled.length === 0) {
			lines.push(
				"当前：你已配置子代理场景，但都处于【禁用】状态。请到设置中启用后再使用。",
			);
		} else {
			lines.push("已启用的子代理：");
			for (const x of enabled.slice(0, 30)) {
				lines.push(
					`- 功能：**${x.description}** → 调用 Task({ subagent_type: "${x.agentKey}", ... })`,
				);
			}
			if (enabled.length > 30) {
				lines.push(`- ...(还有 ${enabled.length - 30} 个已省略)`);
			}
			lines.push("");
			lines.push(
				'**语义匹配示例**：如果子代理描述是"画图"，那么用户说"绘制图像""生成图片""作图"都应该匹配。',
			);
			lines.push(
				"**执行顺序**：在需要调用子代理的任务中，默认优先调用 Task；若确有必要，可先做最小化的信息读取或定位，再发起 Task。",
			);
			lines.push(
				"**避免重复**：同一需求在拿到子代理结果前，不要重复调用同一个 Task；若子代理已返回 image_paths，请直接基于该结果结束回答。",
			);
			lines.push("");
			lines.push(
				"（内置子代理：general-purpose / Explore / Plan / Bash 可直接使用）",
			);
		}

		if (disabled.length > 0) {
			lines.push("");
			lines.push("已配置但禁用（不会生成子代理，请先在设置中启用）：");
			for (const x of disabled.slice(0, 30)) {
				lines.push(`- ${x.agentKey}（禁用）→ ${x.description}`);
			}
			if (disabled.length > 30) {
				lines.push(`- ...(还有 ${disabled.length - 30} 个已省略)`);
			}
		}

		// 【调试】记录生成的子代理提示词
		const result = lines.join("\n");
		logger.info({
			msg: "agent_sdk buildSubagentPolicyAppend result",
			scope: "agent",
			enabledSubagentsCount: enabled.length,
			disabledSubagentsCount: disabled.length,
			subagentItems: items.map((x) => ({
				agentKey: x.agentKey,
				description: x.description.slice(0, 50),
				enabled: x.enabled,
			})),
			promptPreview: result.slice(0, 500),
		});

		return result;
	}

	/**
	 * 构建精简版系统提示词
	 * 极致压缩：只保留最核心的规则和工具名称
	 */
	function buildCustomSystemPrompt(opts: {
		cwd: string;
		model: string;
		appendContent: string;
	}): string {
		const today = new Date().toISOString().slice(0, 10);

		return `You are Claude, an AI assistant. Always respond in Chinese.

## Tools
Read, Write, Edit, Glob, Grep, Bash, Task, Skill, WebFetch, WebSearch

## Rules
- Use Read before Edit; use Read/Glob/Grep instead of Bash cat/find/grep
- Parallel tool calls when independent; use absolute paths
- Task: delegate to subagent_type; pass minimal context
- <system-reminder> tags in messages contain system-injected info

## Environment
cwd: ${opts.cwd} | date: ${today} | model: ${opts.model}

${opts.appendContent}`.trim();
	}

	const agent_sdk_start = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkStartInput,
	): Promise<AgentSdkStartOutput> => {
		const runId = randomUUID();
		const abortController = new AbortController();
		runRegistry.set(runId, { abortController });

		(async () => {
			try {
				const sdk = await import("@anthropic-ai/claude-agent-sdk");
				const stderr = (data: string) => {
					logger.info({
						msg: "agent_sdk stderr",
						scope: "agent",
						runId,
						data:
							typeof data === "string" ? data.slice(0, 20000) : String(data),
					});
					emit(options.getMainWindow, { runId, type: "stderr", error: data });
				};
				const emitLifecycleEvent = (event: Record<string, unknown>) => {
					emit(options.getMainWindow, {
						runId,
						type: "transformed",
						events: [event],
					});
				};
				const toolNameById = new Map<string, string>();
				const toolUseIdByIndex = new Map<number, string>();
				const toolInputJsonById = new Map<string, string>();
				const taskCallSignatureByToolUseId = new Map<string, string>();
				const taskCallStateBySignature = new Map<
					string,
					"running" | "completed"
				>();
				const taskImagePathsByToolUseId = new Map<string, string[]>();
				const normalizeTaskSignaturePart = (v: unknown) =>
					String(v || "")
						.normalize("NFC")
						.trim()
						.toLowerCase()
						.replace(/\s+/g, " ")
						.slice(0, 1200);
				const buildTaskCallSignature = (
					toolInput: Record<string, unknown>,
				): string => {
					const subagent =
						typeof toolInput.subagent_type === "string"
							? toolInput.subagent_type
							: typeof toolInput.subagentType === "string"
								? toolInput.subagentType
								: "";
					const description =
						typeof toolInput.description === "string"
							? toolInput.description
							: "";
					const prompt =
						typeof toolInput.prompt === "string" ? toolInput.prompt : "";
					return [
						normalizeTaskSignaturePart(subagent),
						normalizeTaskSignaturePart(description),
						normalizeTaskSignaturePart(prompt),
					].join("||");
				};
				const logToolUseError = (payload: any) => {
					try {
						const blocks = Array.isArray(payload?.message?.content)
							? payload.message.content
							: [];
						for (const b of blocks) {
							if (b?.type !== "tool_result") continue;
							const toolUseId = String(b?.tool_use_id || "");
							const content = typeof b?.content === "string" ? b.content : "";
							if (!content.includes("<tool_use_error>")) continue;
							const toolName = toolUseId
								? toolNameById.get(toolUseId)
								: undefined;
							const inputJson = toolUseId
								? toolInputJsonById.get(toolUseId)
								: undefined;
							const inputPreview = inputJson
								? inputJson.length > 800
									? `${inputJson.slice(0, 800)}…`
									: inputJson
								: "";
							stderr(
								`[agent_sdk] <tool_use_error> tool_use_id=${toolUseId || "unknown"} tool=${toolName || "unknown"}\n` +
									(inputPreview ? `input=${inputPreview}\n` : "") +
									content.slice(0, 2000),
							);
						}
					} catch {}
				};

				let pathToClaudeCodeExecutable: string | undefined;
				try {
					const p = require.resolve("@anthropic-ai/claude-agent-sdk/cli.js");
					if (fs.existsSync(p)) pathToClaudeCodeExecutable = p;
				} catch {}

				const cwd =
					input.cwd && input.cwd.trim() ? input.cwd.trim() : process.cwd();
				const userShell =
					typeof process.env.SHELL === "string" ? process.env.SHELL : null;
				const userPath = await resolveUserPathFromShell(userShell);
				const resolvedPath = userPath || process.env.PATH;

				// Force Claude Code to ignore the user's global Claude config (which may enable OAuth/first-party
				// routing that bypasses ANTHROPIC_BASE_URL). Point config dir at the per-run sandbox so the CLI
				// follows env-based Anthropic API settings deterministically.
				const claudeConfigDir = cwd;

				// IMPORTANT: pass base URL without "/v1". The Claude Code CLI appends "/v1" itself for
				// Anthropic Messages endpoints, and telemetry uses `${ANTHROPIC_BASE_URL}/api/event_logging/batch`.
				// If we append "/v1" here, telemetry becomes "/v1/api/event_logging/batch" (noisy) and may trigger
				// fallback behavior.
				const anthropicBaseUrl =
					typeof options.anthropicBaseUrl === "string"
						? options.anthropicBaseUrl.replace(/\/v1\/?$/i, "")
						: "http://127.0.0.1:8765";

				// The CLI requires an Anthropic-looking API key to follow the normal Anthropic client path.
				// This key is only used against our local proxy; it is never forwarded upstream as a real secret.
				const anthropicApiKeyRaw =
					typeof process.env.ANTHROPIC_API_KEY === "string"
						? process.env.ANTHROPIC_API_KEY.trim()
						: "";
				const anthropicApiKey =
					anthropicApiKeyRaw ||
					"sk-ant-api03-dummy000000000000000000000000000000000000";

				// Claude Code 对 ANTHROPIC_API_KEY 有“显式批准”机制：在非交互模式下，如果 key 未被批准，
				// CLI 可能会继续走 firstParty 路径，从而绕过 ANTHROPIC_BASE_URL。
				// 我们将 per-run sandbox 作为 CLAUDE_CONFIG_DIR，并在其中写入 settings.json 自动批准该 key，
				// 以确保推理流量可稳定经过本地 Anthropic Proxy（从而触发子代理场景→模型替换逻辑）。
				try {
					const settingsPath = path.join(claudeConfigDir, "settings.json");
					const approvedKey = anthropicApiKey.slice(-20);

					let settingsObj: any = {};
					if (fs.existsSync(settingsPath)) {
						try {
							const raw = fs.readFileSync(settingsPath, "utf8");
							const parsed = JSON.parse(raw);
							if (parsed && typeof parsed === "object") settingsObj = parsed;
						} catch {}
					}

					if (!settingsObj.customApiKeyResponses)
						settingsObj.customApiKeyResponses = {};
					if (!Array.isArray(settingsObj.customApiKeyResponses.approved))
						settingsObj.customApiKeyResponses.approved = [];
					if (!Array.isArray(settingsObj.customApiKeyResponses.rejected))
						settingsObj.customApiKeyResponses.rejected = [];

					if (
						!settingsObj.customApiKeyResponses.approved.includes(approvedKey)
					) {
						settingsObj.customApiKeyResponses.approved.push(approvedKey);
					}

					fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
					fs.writeFileSync(
						settingsPath,
						JSON.stringify(settingsObj, null, 2),
						"utf8",
					);
				} catch {}

				logger.info({
					msg: "agent_sdk start",
					scope: "agent",
					runId,
					cwd,
					model: input.model,
					anthropicBaseUrl,
					anthropicApiKeyPresent: Boolean(anthropicApiKeyRaw),
					claudeConfigDir,
					pathToClaudeCodeExecutable,
					allowed_tools: input.allowed_tools,
					has_system_prompt: !!input.system_prompt,
					interactive_approval:
						typeof input.interactive_approval === "boolean"
							? input.interactive_approval
							: true,
					permission_mode: input.permission_mode,
					additionalDirectoriesCount: Array.isArray(
						(input as any).additional_directories,
					)
						? (input as any).additional_directories.length
						: 0,
					pluginsCount: Array.isArray((input as any).plugins)
						? (input as any).plugins.length
						: 0,
				});

				// 【调试】打印 cwd 到控制台
				console.log(`[agent_sdk] Starting with cwd='${cwd}'`);

				// 检查 skills 目录
				const skillsDir = path.join(cwd, ".claude", "skills");
				try {
					const skillEntries = await fsp.readdir(skillsDir, {
						withFileTypes: true,
					});
					const skillNames = skillEntries
						.filter((e) => e.isDirectory() && !e.name.startsWith("."))
						.map((e) => e.name);
					logger.info({
						msg: "agent_sdk skills directory",
						scope: "agent",
						runId,
						skillsDir,
						skillNames,
					});
				} catch (e) {
					logger.info({
						msg: "agent_sdk skills directory not accessible",
						scope: "agent",
						runId,
						skillsDir,
						error: e instanceof Error ? e.message : String(e),
					});
				}

				// 让 SDK 的 Skill tool 能在 project settings（cwd/.claude/skills）里发现 skills
				await syncSkillsToCwd(cwd, stderr);

				const interactiveApproval =
					typeof input.interactive_approval === "boolean"
						? input.interactive_approval
						: true;
				const allowedRaw = Array.isArray(input.allowed_tools)
					? input.allowed_tools
					: [];
				const allowed = uniqStrings(
					interactiveApproval
						? [...allowedRaw, "AskUserQuestion"]
						: [...allowedRaw],
				);
				const skillsFromInput = normalizeStringArray((input as any).skills);
				const skillsFromProject = await listProjectSkills(cwd);
				const enabledSkills = uniqStrings([
					...skillsFromInput,
					...skillsFromProject,
				]);
				const preferredWritingSkill = pickWritingSkill(enabledSkills);
				const agentModelSettings =
					(await loadAgentModelSettingsFromDb()) as AgentModelSettingsLike | null;
				try {
					const configs = Array.isArray(
						(agentModelSettings as any)?.scenarioConfigs,
					)
						? ((agentModelSettings as any).scenarioConfigs as any[])
						: [];
					const enabledCount = configs.filter(
						(c) => c && c.enabled !== false,
					).length;
					logger.info({
						msg: "agent_sdk scenario+skills loaded",
						scope: "agent",
						runId,
						scenarioConfigsTotal: configs.length,
						scenarioConfigsEnabled: enabledCount,
						projectSkillsCount: skillsFromProject.length,
						inputSkillsCount: skillsFromInput.length,
						enabledSkillsCount: enabledSkills.length,
						enabledSkillsPreview: enabledSkills.slice(0, 20),
					});
				} catch {}
				const scenarioAgents = buildDynamicScenarioAgents({
					settings: agentModelSettings,
					enabledSkills,
				});
				const subagentPolicyAppend = buildSubagentPolicyAppend({
					settings: agentModelSettings,
					enabledSkills,
				});
				const resumeSessionIdRaw =
					typeof (input as any).resume_session_id === "string"
						? (input as any).resume_session_id.trim()
						: "";
				const resumeSessionId = normalizeSdkSessionId(resumeSessionIdRaw);
				if (resumeSessionIdRaw && !resumeSessionId) {
					logger.warn({
						msg: "agent_sdk invalid resume_session_id dropped",
						scope: "agent",
						runId,
						resumeSessionIdRaw,
					});
				}
				const persistSession =
					typeof (input as any).persist_session === "boolean"
						? (input as any).persist_session
						: undefined;
				const mcpServers =
					(input as any).mcp_servers &&
					typeof (input as any).mcp_servers === "object"
						? ((input as any).mcp_servers as any)
						: undefined;
				const additionalDirectories = await normalizeAdditionalDirectories(
					cwd,
					(input as any).additional_directories,
				);
				const plugins = await normalizePlugins(cwd, (input as any).plugins);
				const permissionMode =
					typeof input.permission_mode === "string" &&
					input.permission_mode.trim()
						? input.permission_mode.trim()
						: "default";
				const sandboxSettings =
					(input as any).sandbox && typeof (input as any).sandbox === "object"
						? ((input as any).sandbox as Record<string, unknown>)
						: undefined;
				const subagentLifecycleHooks = createSubagentLifecycleHooks({
					logger,
					runId,
					stderr,
					emitLifecycleEvent,
				});
				const lifecycleHooks = createLifecycleHooks({
					logger,
					runId,
					stderr,
					emitLifecycleEvent,
				});

				// 注意: SDK Options 不直接支持 skills 参数
				// Skills 通过 system prompt 和 syncSkillsToCwd 来处理

				// 【调试】确认 canUseTool 被传入 options
				console.log(
					`[agent_sdk] About to call sdk.query with cwd='${cwd}', hasCanUseTool=true`,
				);

				const agentsConfig = {
					...scenarioAgents,
					reader: {
						description:
							"Reads provided files and extracts key facts/summaries.",
						prompt:
							"Read only the minimum necessary from the provided working directory files using Read/Glob/Grep. Return a concise bullet summary and any key quotes only if necessary.",
						model:
							typeof (scenarioAgents as any)?.fast_search?.model === "string"
								? String((scenarioAgents as any).fast_search.model)
								: undefined,
						tools: ["Read", "Glob", "Grep"],
						disallowedTools: ["Task"],
					},
					writer: {
						description:
							"Writes polished content (Xiaohongshu/marketing/copywriting) based on provided facts.",
						prompt:
							"Write in Chinese, follow the user's requested style (e.g., 小红书). Prefer using Skill tool when a matching writing skill is available. Do not paste full source files; use extracted facts only.",
						model:
							typeof (scenarioAgents as any)?.writing?.model === "string"
								? String((scenarioAgents as any).writing.model)
								: undefined,
						tools: ["Skill", "Read", "Glob", "Grep"],
						disallowedTools: ["Task"],
						skills: enabledSkills.length > 0 ? enabledSkills : undefined,
					},
				};
				const subagentAliasToKey = buildSubagentAliasMap(agentsConfig as any);

				// 【调试】记录传递给 SDK 的 agents 配置
				logger.info({
					msg: "agent_sdk agentsConfig before sdk.query",
					scope: "agent",
					runId,
					allowedToolsCount: allowed.length,
					allowedToolsHasTask: allowed.includes("Task"),
					agentKeys: Object.keys(agentsConfig),
					agentsPreview: Object.entries(agentsConfig).map(([k, v]) => ({
						key: k,
						hasDescription: !!(v as any)?.description,
						hasPrompt: !!(v as any)?.prompt,
						model: (v as any)?.model?.slice?.(0, 50) ?? (v as any)?.model,
					})),
				});

				const q = sdk.query({
					prompt: String(input.prompt ?? ""),
					options: {
						abortController,
						cwd,
						model: String(input.model ?? ""),
						resume: resumeSessionId,
						persistSession,
						mcpServers,
						// 必须传入 allowedTools 并包含 Task，否则自定义 agents 无法被调用
						// 参考文档: "The Task tool must be included in allowedTools since Claude invokes subagents through the Task tool."
						allowedTools: allowed.length > 0 ? allowed : undefined,
						agents: agentsConfig as any,
						hooks: {
							...lifecycleHooks,
							...subagentLifecycleHooks,
							// PreToolUse 钩子：在工具执行前拦截并修复文件路径
							PreToolUse: [
								{
									hooks: [
										async (
											hookInput: any,
											_toolUseID: string | undefined,
											_opts: any,
										) => {
											if (hookInput.hook_event_name !== "PreToolUse") {
												return { continue: true };
											}
											const toolName = (hookInput as any).tool_name || "";
											const toolInput = (hookInput as any).tool_input || {};

											console.log(
												`[PreToolUse] Tool='${toolName}', Input=${JSON.stringify(toolInput).slice(0, 200)}`,
											);

											const toolLower = String(toolName).toLowerCase();

											// 处理 Task(subagent) 调用：兼容用户/模型用中文描述填写 subagent_type
											if (
												toolLower === "task" &&
												toolInput &&
												typeof toolInput === "object"
											) {
												const toolUseId = String(
													(hookInput as any).tool_use_id || "",
												).trim();
												const inputAny = toolInput as Record<string, unknown>;
												let normalizedInput: Record<string, unknown> = {
													...inputAny,
												};
												let normalizedChanged = false;
												const rawSubType =
													typeof inputAny.subagent_type === "string"
														? inputAny.subagent_type
														: typeof inputAny.subagentType === "string"
															? inputAny.subagentType
															: null;
												if (rawSubType) {
													const resolved = resolveSubagentType(
														rawSubType,
														agentsConfig,
														subagentAliasToKey,
													);
													if (resolved && resolved !== rawSubType) {
														console.log(
															`[PreToolUse] ✓ subagent_type rewritten: '${rawSubType}' -> '${resolved}'`,
														);
														normalizedInput = {
															...normalizedInput,
															subagent_type: resolved,
															subagentType: resolved,
														};
														normalizedChanged = true;
													}
												}

												// 若 Task prompt 中携带了明确文件路径，强制补充“先 Read 文件再作图/写作”的执行约束
												const taskPrompt =
													typeof normalizedInput.prompt === "string"
														? normalizedInput.prompt
														: "";
												if (taskPrompt) {
													const pathMatches =
														taskPrompt.match(
															/(?:\/Users\/[^\n"'`]+?\.[A-Za-z0-9]{1,8}|\/[^\n"'`]+?\.[A-Za-z0-9]{1,8})/g,
														) || [];
													const existingPaths: string[] = [];
													for (const raw of pathMatches.slice(0, 8)) {
														const candidate = String(raw || "")
															.trim()
															.replace(/[),，。；;:]+$/g, "");
														if (!candidate || existingPaths.includes(candidate))
															continue;
														try {
															if (fs.existsSync(candidate)) {
																existingPaths.push(candidate);
															}
														} catch {}
													}
													const hasReadConstraint =
														/先读取|先用Read|使用 Read|Read 工具|先用 read|read 工具/i.test(
															taskPrompt,
														);
													if (existingPaths.length > 0 && !hasReadConstraint) {
														const readHint =
															`\n\n执行要求：你必须先使用 Read 工具读取以下文件后再继续，不得只根据标题猜测内容：\n` +
															existingPaths.map((p) => `- ${p}`).join("\n");
														normalizedInput = {
															...normalizedInput,
															prompt: `${taskPrompt}${readHint}`,
														};
														normalizedChanged = true;
													}
												}

												const signature =
													buildTaskCallSignature(normalizedInput);
												const state = signature
													? taskCallStateBySignature.get(signature)
													: undefined;
												if (signature && state) {
													return {
														continue: true,
														hookSpecificOutput: {
															hookEventName: "PreToolUse" as const,
															permissionDecision: "deny" as const,
															permissionDecisionReason:
																"检测到重复的 Task 调用（同一子代理 + 同一任务描述），请直接基于已有结果继续回答。",
														},
													};
												}

												if (signature) {
													taskCallStateBySignature.set(signature, "running");
													if (toolUseId) {
														taskCallSignatureByToolUseId.set(
															toolUseId,
															signature,
														);
													}
												}

												// 如有输入规范化（subagent_type / prompt），回写 updatedInput
												if (normalizedChanged) {
													return {
														continue: true,
														hookSpecificOutput: {
															hookEventName: "PreToolUse" as const,
															permissionDecision: "allow" as const,
															updatedInput: normalizedInput,
														},
													};
												}
											}

											// 处理文件读取工具
											if (
												["read", "glob", "grep", "write", "edit"].includes(
													toolLower,
												)
											) {
												const key =
													typeof toolInput.file_path === "string"
														? "file_path"
														: typeof toolInput.path === "string"
															? "path"
															: typeof toolInput.file === "string"
																? "file"
																: null;

												if (key) {
													const rawPath = String(toolInput[key] || "").trim();
													if (rawPath) {
														console.log(
															`[PreToolUse] Resolving path: '${rawPath}' in cwd='${cwd}'`,
														);
														const resolved = await resolveToolFilePath({
															cwd,
															rawPath,
														});
														if (resolved && resolved !== rawPath) {
															console.log(
																`[PreToolUse] ✓ Rewritten: '${rawPath}' -> '${resolved}'`,
															);
															return {
																continue: true,
																hookSpecificOutput: {
																	hookEventName: "PreToolUse" as const,
																	permissionDecision: "allow" as const,
																	updatedInput: {
																		...toolInput,
																		[key]: resolved,
																		file_path: resolved,
																	},
																},
															};
														}
														if (!resolved) {
															console.log(
																`[PreToolUse] ✗ Failed to resolve: '${rawPath}'`,
															);
														}
													}
												}
											}

											// 处理 Bash 命令
											if (
												toolLower === "bash" &&
												typeof toolInput.command === "string"
											) {
												const cmd = String(toolInput.command || "");
												const rewritten =
													await rewriteBashCommandForMissingFile({
														cwd,
														command: cmd,
													});
												if (rewritten && rewritten !== cmd) {
													console.log(
														`[PreToolUse] ✓ Bash rewritten: '${cmd}' -> '${rewritten}'`,
													);
													return {
														continue: true,
														hookSpecificOutput: {
															hookEventName: "PreToolUse" as const,
															permissionDecision: "allow" as const,
															updatedInput: {
																...toolInput,
																command: rewritten,
															},
														},
													};
												}
											}

											return { continue: true };
										},
									],
								},
							],
							PostToolUse: [
								{
									hooks: [
										async (hookInput: any) => {
											if (hookInput.hook_event_name !== "PostToolUse") {
												return { continue: true };
											}
											const toolName = String(
												(hookInput as any).tool_name || "",
											);
											const toolLower = toolName.toLowerCase();
											if (toolLower !== "task") return { continue: true };

											const toolUseId = String(
												(hookInput as any).tool_use_id || "",
											).trim();
											const signature = toolUseId
												? taskCallSignatureByToolUseId.get(toolUseId)
												: undefined;
											if (signature)
												taskCallStateBySignature.set(signature, "completed");

											const response = (hookInput as any).tool_response;
											const dataUrls = collectDataImageUrlsFromUnknown(
												response,
												DATA_IMAGE_URL_LIMIT,
											);
											if (dataUrls.length === 0) return { continue: true };

											const persistedPaths: string[] = [];
											for (const dataUrl of dataUrls) {
												try {
													const saved = await persistDataImageUrlToCwd({
														dataUrl,
														cwd,
														prefix: "subagent-image",
													});
													if (saved) persistedPaths.push(saved);
												} catch (e) {
													stderr(
														`[PostToolUse] persist image failed: ${e instanceof Error ? e.message : String(e)}`,
													);
												}
											}

											const uniqPaths = uniqStrings(persistedPaths);
											if (toolUseId && uniqPaths.length > 0) {
												taskImagePathsByToolUseId.set(toolUseId, uniqPaths);
											}
											if (uniqPaths.length === 0) return { continue: true };

											return {
												continue: true,
												hookSpecificOutput: {
													hookEventName: "PostToolUse" as const,
													additionalContext: `子代理图片已保存到本地路径，请优先使用这些路径并结束回答（不要再次调用画图子代理）：image_paths=${JSON.stringify(uniqPaths)}`,
												},
											};
										},
									],
								},
							],
							PostToolUseFailure: [
								{
									hooks: [
										async (hookInput: any) => {
											if (hookInput.hook_event_name !== "PostToolUseFailure") {
												return { continue: true };
											}
											const toolName = String(
												(hookInput as any).tool_name || "",
											);
											if (toolName.toLowerCase() !== "task") {
												return { continue: true };
											}
											const toolUseId = String(
												(hookInput as any).tool_use_id || "",
											).trim();
											if (!toolUseId) return { continue: true };
											const signature =
												taskCallSignatureByToolUseId.get(toolUseId);
											if (signature) {
												taskCallStateBySignature.delete(signature);
												taskCallSignatureByToolUseId.delete(toolUseId);
											}
											taskImagePathsByToolUseId.delete(toolUseId);
											return { continue: true };
										},
									],
								},
							],
							UserPromptSubmit: [
								{
									hooks: [
										async (hookInput: any) => {
											const promptText =
												hookInput.hook_event_name === "UserPromptSubmit"
													? String((hookInput as any).prompt ?? "")
													: "";
											const additions: string[] = [];
											additions.push(
												"读取文件请优先使用 Read/Glob/Grep 等内置工具（不要依赖通配符 Bash）。",
											);

											const matchedScenarioAgent = matchScenarioAgentForPrompt({
												settings: agentModelSettings,
												promptText,
											});
											if (matchedScenarioAgent) {
												additions.push(
													`⚠️ 你的请求可能与子代理「${matchedScenarioAgent.description}」语义相关。请优先调用 Task({ subagent_type: "${matchedScenarioAgent.agentKey}", ... })；如需补充上下文，可先做最小必要的 Read/Glob/Grep。`,
												);
											}

											if (isLikelyWritingTask(promptText)) {
												if (preferredWritingSkill) {
													additions.push(
														`这是写作任务：请先调用 Skill 工具（skill=\"${preferredWritingSkill}\"）生成初稿/框架，再根据需要整理为最终输出。`,
													);
												} else if (enabledSkills.length > 0) {
													additions.push(
														`这是写作任务：如果有合适技能，请先调用 Skill 工具（可用技能：${enabledSkills.join(", ")}）。`,
													);
												}

												additions.push(
													'为减少上下文污染：请用 Task 工具把"读资料/提炼要点"委派给 reader 子代理，把"写作成文"委派给 writer 子代理，然后你只输出最终结果。',
												);
											}

											return {
												continue: true,
												hookSpecificOutput: {
													hookEventName: "UserPromptSubmit",
													additionalContext: additions.join("\n"),
												},
											};
										},
									],
								},
							],
						},
						permissionMode: permissionMode as any,
						additionalDirectories:
							additionalDirectories.length > 0
								? additionalDirectories
								: undefined,
						plugins: plugins.length > 0 ? plugins : undefined,
						sandbox: sandboxSettings as any,
						pathToClaudeCodeExecutable,
						// CRITICAL: settingSources 告诉 SDK 从文件系统加载 skills
						// 必须包含 "user" 和 "project" 才能加载 ~/.claude/skills 和 .claude/skills
						settingSources: ["user", "project"] as any,
						tools:
							allowed.length > 0
								? allowed
								: { type: "preset", preset: "claude_code" },
						env: (() => {
							const env: Record<string, string> = {};
							for (const [k, v] of Object.entries(process.env)) {
								if (typeof v === "string") env[k] = v;
							}

							// Avoid inheriting user account/session routing that could bypass our proxy.
							delete env.ANTHROPIC_AUTH_TOKEN;
							delete env.CLAUDE_CODE_OAUTH_TOKEN;
							delete env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR;
							delete env.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
							delete env.CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR;
							delete env.CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR;

							if (resolvedPath) env.PATH = resolvedPath;

							env.CLAUDE_CONFIG_DIR = claudeConfigDir;
							// CRITICAL: do NOT append "/v1" here. The CLI constructs "/v1/messages" internally.
							env.ANTHROPIC_BASE_URL = anthropicBaseUrl;
							env.ANTHROPIC_API_KEY = anthropicApiKey;
							// Some CLI code paths look at this name instead.
							env.CLAUDE_CODE_API_BASE_URL = anthropicBaseUrl;

							// Reduce background noise during debugging.
							env.DISABLE_TELEMETRY = "1";
							env.DISABLE_ERROR_REPORTING = "1";
							env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";

							return env;
						})(),
						stderr,
						includePartialMessages: true,
						// Force streaming if supported by the SDK/API (cast to any to avoid TS error)
						stream: true,
						// 使用精简版系统提示词，移除 Claude Code preset 中不需要的内容
						// 保留工具使用说明、Skill 调用、子代理配置等核心功能
						systemPrompt: buildCustomSystemPrompt({
							cwd,
							model: String(input.model ?? ""),
							appendContent: [input.system_prompt, subagentPolicyAppend]
								.filter((s) => typeof s === "string" && s.trim())
								.join("\n\n"),
						}),
						canUseTool: async (
							toolName: string,
							toolInput: any,
							extra: any,
						) => {
							// 【调试】记录每个工具调用 - 非常醒目的日志
							console.log(
								`\n★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★`,
							);
							console.log(
								`★ [canUseTool CALLED] Tool='${toolName}', AgentID='${(extra as any)?.agentID || "main"}'`,
							);
							console.log(
								`★ Input: ${JSON.stringify(toolInput || {}).slice(0, 200)}`,
							);
							console.log(
								`★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★\n`,
							);
							if (abortController.signal.aborted || extra?.signal?.aborted) {
								return {
									behavior: "deny",
									message: "aborted",
								};
							}
							if (allowed.length > 0 && !allowed.includes(toolName)) {
								return {
									behavior: "deny",
									message: `Tool disabled: ${toolName}`,
								};
							}

							let rewrittenInput: Record<string, unknown> =
								toolInput && typeof toolInput === "object"
									? { ...(toolInput as Record<string, unknown>) }
									: {};

							// Repair common file-path mistakes for file tools (especially Read).
							// The SDK tools expect a real file path, but the LLM sometimes passes a title.
							// We try to resolve it within the task cwd to avoid repeated <tool_use_error>.
							const toolLower = String(toolName || "").toLowerCase();
							if (
								(toolLower === "read" ||
									toolLower === "glob" ||
									toolLower === "grep" ||
									toolLower === "write" ||
									toolLower === "edit") &&
								toolInput &&
								typeof toolInput === "object"
							) {
								const inputAny = rewrittenInput as Record<string, unknown>;
								const key =
									typeof inputAny.file_path === "string"
										? "file_path"
										: typeof inputAny.path === "string"
											? "path"
											: typeof inputAny.file === "string"
												? "file"
												: null;
								if (!key && toolLower === "read") {
									const guessed = await guessDefaultReadableFilePath(cwd);
									if (guessed) {
										stderr(
											`[agent_sdk] Auto-filled Read file_path='${guessed}' (missing in tool input)`,
										);
										rewrittenInput = { ...inputAny, file_path: guessed };
									}
								}
								if (key) {
									const rawPath = String(inputAny[key] || "").trim();
									if (rawPath) {
										console.log(
											`[agent_sdk] Tool ${toolName}: attempting to resolve path '${rawPath}' in cwd='${cwd}'`,
										);
										const resolved = await resolveToolFilePath({
											cwd,
											rawPath,
										});
										if (resolved && resolved !== rawPath) {
											stderr(
												`[agent_sdk] Auto-resolved ${toolName} input '${rawPath}' -> '${resolved}'`,
											);
											// Keep existing key shape, but also provide file_path for robustness.
											rewrittenInput = {
												...inputAny,
												[key]: resolved,
												file_path: resolved,
											};
										}
										if (!resolved) {
											stderr(
												`[agent_sdk] Failed to resolve ${toolName} path '${rawPath}' within cwd='${cwd}'`,
											);
											return {
												behavior: "deny",
												message:
													`Path not found in agent workspace. Only use files under cwd=${cwd}. ` +
													`Try Glob to list files, then Read using that path.`,
											};
										}
									}
								}
							}

							// Repair common Bash reads like: cat "title..."
							if (
								toolLower === "bash" &&
								toolInput &&
								typeof toolInput === "object" &&
								typeof (rewrittenInput as any).command === "string"
							) {
								const cmd = String((rewrittenInput as any).command || "");
								const rewritten = await rewriteBashCommandForMissingFile({
									cwd,
									command: cmd,
								});
								if (rewritten && rewritten !== cmd) {
									stderr(
										`[agent_sdk] Auto-rewrote Bash command for missing file: '${cmd}' -> '${rewritten}'`,
									);
									rewrittenInput = {
										...(rewrittenInput as any),
										command: rewritten,
									};
								}
							}

							// Skills often take file paths as arguments and validate them internally.
							// When the model passes a title instead of a real path, Skill can fail with
							// "<tool_use_error>File does not exist.</tool_use_error>" and get stuck retrying.
							if (
								toolLower === "skill" &&
								rewrittenInput &&
								typeof rewrittenInput === "object"
							) {
								const rewritten = await rewritePathsDeep({
									cwd,
									value: rewrittenInput,
								});
								if (rewritten !== rewrittenInput) {
									stderr(
										"[agent_sdk] Auto-rewrote Skill input paths within cwd",
									);
									rewrittenInput = rewritten as Record<string, unknown>;
								}
							}

							// AskUserQuestion 不支持在 subagent 内触发，直接拒绝并让主代理继续。
							if (
								toolName === "AskUserQuestion" &&
								typeof extra?.agentID === "string" &&
								extra.agentID.trim()
							) {
								return {
									behavior: "deny",
									message:
										"AskUserQuestion is not supported inside subagents. Continue from the main agent.",
								};
							}

							if (!interactiveApproval) {
								if (toolName === "AskUserQuestion") {
									return {
										behavior: "deny",
										message: "Interactive approval is disabled",
									};
								}
								return { behavior: "allow", updatedInput: rewrittenInput };
							}

							const requestId = randomUUID();
							const timeoutMs = 55_000;
							const toolUseId =
								typeof extra?.toolUseID === "string" ? extra.toolUseID : "";
							const request: AgentSdkInteractionRequestPayload = {
								requestId,
								toolName,
								toolInput: rewrittenInput,
								toolUseId,
								agentId:
									typeof extra?.agentID === "string"
										? extra.agentID
										: undefined,
								description:
									typeof extra?.description === "string"
										? extra.description
										: undefined,
								decisionReason:
									typeof extra?.decisionReason === "string"
										? extra.decisionReason
										: undefined,
								blockedPath:
									typeof extra?.blockedPath === "string"
										? extra.blockedPath
										: undefined,
								suggestions: Array.isArray(extra?.suggestions)
									? extra.suggestions
									: undefined,
								expiresAt: Date.now() + timeoutMs,
							};
							emit(options.getMainWindow, {
								runId,
								type: "interaction_request",
								request,
							});

							const decision = await interactionBroker.createRequest(
								runId,
								requestId,
								timeoutMs,
							);
							if (decision.behavior === "allow") {
								return {
									behavior: "allow",
									updatedInput: decision.updatedInput ?? rewrittenInput,
									updatedPermissions: Array.isArray(decision.updatedPermissions)
										? (decision.updatedPermissions as any)
										: undefined,
								};
							}
							return {
								behavior: "deny",
								message: decision.message || "User denied",
								interrupt: decision.interrupt,
							};
						},
					} as any, // Cast to any to allow stream property
				});
				runRegistry.updateQuery(runId, q as any);

				let sawResult = false;
				// Accumulate token usage from SDK stream events
				let accumulatedInputTokens = 0;
				let accumulatedOutputTokens = 0;
				for await (const msg of q) {
					// Avoid logging every stream delta; it can freeze the app.
					const msgAny = msg as any;
					const debug = process.env.AGENT_SDK_DEBUG === "1";
					if (debug) {
						const t = String(msgAny?.type || "");
						const isTextDelta =
							t === "stream_event" &&
							msgAny?.event?.type === "content_block_delta" &&
							msgAny?.event?.delta?.type === "text_delta";
						if (!isTextDelta) {
							const subtype =
								t === "stream_event"
									? String(msgAny?.event?.type || "")
									: String(msgAny?.subtype || "");
							console.log("[agentSdk] msg:", t, subtype);
						}
					}
					if (
						msgAny?.type === "stream_event" &&
						msgAny?.event?.type === "content_block_start" &&
						msgAny?.event?.content_block?.type === "tool_use"
					) {
						const id = String(msgAny.event.content_block.id || "");
						const name = String(msgAny.event.content_block.name || "");
						if (id) toolNameById.set(id, name);
						const idx = Number(msgAny.event.index);
						if (id && Number.isFinite(idx)) toolUseIdByIndex.set(idx, id);
						// Some upstreams may include input inline; capture if present.
						if (id && msgAny.event.content_block.input) {
							try {
								toolInputJsonById.set(
									id,
									JSON.stringify(msgAny.event.content_block.input ?? {}),
								);
							} catch {}
						}
					}
					if (
						msgAny?.type === "stream_event" &&
						msgAny?.event?.type === "content_block_delta" &&
						msgAny?.event?.delta?.type === "input_json_delta" &&
						typeof msgAny.event.delta.partial_json === "string"
					) {
						const idx = Number(msgAny.event.index);
						const id = Number.isFinite(idx)
							? toolUseIdByIndex.get(idx)
							: undefined;
						if (id) {
							const prev = toolInputJsonById.get(id) || "";
							toolInputJsonById.set(id, prev + msgAny.event.delta.partial_json);
						}
					}
					// Extract token usage from stream events (message_start contains input_tokens, message_delta contains output_tokens)
					if (
						msgAny?.type === "stream_event" &&
						msgAny?.event?.type === "message_start" &&
						msgAny?.event?.message?.usage
					) {
						const usage = msgAny.event.message.usage;
						if (typeof usage.input_tokens === "number") {
							accumulatedInputTokens += usage.input_tokens;
						}
					}
					if (
						msgAny?.type === "stream_event" &&
						msgAny?.event?.type === "message_delta" &&
						msgAny?.event?.usage
					) {
						const usage = msgAny.event.usage;
						if (typeof usage.output_tokens === "number") {
							accumulatedOutputTokens += usage.output_tokens;
						}
					}
					if (msgAny?.type === "assistant" && msgAny?.message) {
						const blocks = Array.isArray(msgAny.message.content)
							? msgAny.message.content
							: [];
						for (const b of blocks) {
							if (b?.type !== "tool_use") continue;
							const id = String(b?.id || "");
							const name = String(b?.name || "");
							if (id && name) toolNameById.set(id, name);
							if (id && b?.input) {
								try {
									toolInputJsonById.set(id, JSON.stringify(b.input ?? {}));
								} catch {}
							}
						}
					}
					if (msgAny?.type === "user" && msgAny?.message) {
						logToolUseError(msgAny);
					}
					emit(options.getMainWindow, {
						runId,
						type: "sdk_message",
						message: msg,
					});
					const uiEvents = toUIEvents(msg as any, {
						rewriteToolResultOutput: (toolUseId, output) => {
							const persistedPaths = taskImagePathsByToolUseId.get(toolUseId);
							if (!persistedPaths || persistedPaths.length === 0) return output;
							return buildUiToolResultOutput(output, persistedPaths);
						},
					});
					if (uiEvents.length > 0) {
						emit(options.getMainWindow, {
							runId,
							type: "transformed",
							events: uiEvents,
						});
						// 检查是否有 tool_block_stop 事件，如果有则发送完整的工具输入
						for (const ev of uiEvents) {
							if (
								ev.type === "tool_block_stop" &&
								typeof ev.index === "number"
							) {
								const toolId = toolUseIdByIndex.get(ev.index);
								if (toolId) {
									const inputJsonStr = toolInputJsonById.get(toolId);
									if (inputJsonStr) {
										let parsedInput: Record<string, unknown> = {};
										try {
											parsedInput = JSON.parse(inputJsonStr);
										} catch {}
										// 发送 tool_input_complete 事件
										emit(options.getMainWindow, {
											runId,
											type: "transformed",
											events: [
												{
													type: "tool_input_complete",
													id: toolId,
													input: parsedInput,
												},
											],
										});
									}
								}
							}
						}
					}
					if ((msg as any)?.type === "result") {
						sawResult = true;
						// Attach accumulated usage to the result
						const resultWithUsage = {
							...(msg as any),
							usage:
								accumulatedInputTokens > 0 || accumulatedOutputTokens > 0
									? {
											input_tokens: accumulatedInputTokens,
											output_tokens: accumulatedOutputTokens,
										}
									: (msg as any)?.usage,
						};
						emit(options.getMainWindow, {
							runId,
							type: "done",
							result: resultWithUsage,
						});
					}
				}
				if (!sawResult) {
					emit(options.getMainWindow, {
						runId,
						type: "done",
						result: {
							type: "result",
							subtype: "success",
							is_error: false,
							result: "",
							usage:
								accumulatedInputTokens > 0 || accumulatedOutputTokens > 0
									? {
											input_tokens: accumulatedInputTokens,
											output_tokens: accumulatedOutputTokens,
										}
									: undefined,
						},
					});
				}
			} catch (e) {
				const error = e instanceof Error ? e.message : String(e);
				const retryable = isRetryableError(error);
				logger.error({
					msg: "agent_sdk runner error",
					scope: "agent",
					runId,
					error,
					retryable,
				});
				// 发送错误事件，包含是否可重试的信息
				emit(options.getMainWindow, {
					runId,
					type: "error",
					error,
					retryable,
					retryConfig: retryable
						? {
								maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
								baseDelayMs: DEFAULT_RETRY_CONFIG.baseDelayMs,
							}
						: undefined,
				} as any);
			} finally {
				interactionBroker.clearRun(runId);
				runRegistry.delete(runId);
			}
		})();

		return runId;
	};

	const agent_sdk_abort = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkAbortInput,
	): Promise<AgentSdkAbortOutput> => {
		const run = runRegistry.get(input.runId);
		if (run) {
			run.abortController.abort();
			interactionBroker.clearRun(input.runId);
			runRegistry.delete(input.runId);
		}
		return { success: true };
	};

	const agent_sdk_resolve_interaction = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkResolveInteractionInput,
	): Promise<AgentSdkResolveInteractionOutput> => {
		const resolved = interactionBroker.resolve(
			input.runId,
			input.requestId,
			input.decision,
		);
		return { success: resolved };
	};

	const agent_sdk_control = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkControlInput,
	): Promise<AgentSdkControlOutput> => {
		const run = runRegistry.get(input.runId);
		if (!run?.query) {
			return {
				success: false,
				error: `Run not found: ${input.runId}`,
			};
		}

		try {
			switch (input.action) {
				case "set_permission_mode":
					if (
						typeof input.mode !== "string" ||
						!input.mode.trim() ||
						typeof run.query.setPermissionMode !== "function"
					) {
						return { success: false, error: "Invalid mode" };
					}
					await run.query.setPermissionMode(input.mode.trim());
					return { success: true };
				case "set_model":
					if (typeof run.query.setModel !== "function") {
						return { success: false, error: "setModel not supported" };
					}
					await run.query.setModel(
						typeof input.model === "string" ? input.model : undefined,
					);
					return { success: true };
				case "interrupt":
					if (typeof run.query.interrupt === "function") {
						await run.query.interrupt();
					} else {
						run.abortController.abort();
					}
					return { success: true };
				case "mcp_status":
					if (typeof run.query.mcpServerStatus !== "function") {
						return { success: false, error: "mcpServerStatus not supported" };
					}
					return {
						success: true,
						data: await run.query.mcpServerStatus(),
					};
				case "mcp_reconnect":
					if (
						typeof run.query.reconnectMcpServer !== "function" ||
						typeof input.serverName !== "string" ||
						!input.serverName.trim()
					) {
						return { success: false, error: "Invalid serverName" };
					}
					await run.query.reconnectMcpServer(input.serverName.trim());
					return { success: true };
				case "mcp_toggle":
					if (
						typeof run.query.toggleMcpServer !== "function" ||
						typeof input.serverName !== "string" ||
						!input.serverName.trim() ||
						typeof input.enabled !== "boolean"
					) {
						return { success: false, error: "Invalid mcp_toggle input" };
					}
					await run.query.toggleMcpServer(
						input.serverName.trim(),
						input.enabled,
					);
					return { success: true };
				case "mcp_set_servers":
					if (
						typeof run.query.setMcpServers !== "function" ||
						!input.servers ||
						typeof input.servers !== "object"
					) {
						return { success: false, error: "Invalid servers" };
					}
					return {
						success: true,
						data: await run.query.setMcpServers(
							input.servers as Record<string, unknown>,
						),
					};
				default:
					return {
						success: false,
						error: `Unsupported action: ${String((input as any).action || "")}`,
					};
			}
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	};

	return {
		agent_sdk_start,
		agent_sdk_abort,
		agent_sdk_resolve_interaction,
		agent_sdk_control,
	};
}
