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
	return path.join(home, ".claude", "skills");
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
		return;
	}

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

type AgentSdkStartInput = IPCSchema["agent_sdk_start"]["input"];
type AgentSdkStartOutput = IPCSchema["agent_sdk_start"]["output"];
type AgentSdkAbortInput = IPCSchema["agent_sdk_abort"]["input"];
type AgentSdkAbortOutput = IPCSchema["agent_sdk_abort"]["output"];

type AgentSdkEventPayload = {
	runId: string;
	type: string;
	message?: unknown;
	result?: unknown;
	error?: string;
	events?: unknown;
};

type GetMainWindow = () => BrowserWindow | null;

const running = new Map<
	string,
	{
		abortController: AbortController;
	}
>();

function emit(getMainWindow: GetMainWindow, payload: AgentSdkEventPayload) {
	const win = getMainWindow();
	if (!win) return;
	win.webContents.send("agent-sdk-event", payload);
}

function isUuidString(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const v = value.trim();
	if (!v) return false;
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		v,
	);
}

function toUIEvents(message: any): any[] {
	const events: any[] = [];
	if (!message || typeof message !== "object") return events;

	// SDK system messages (session init, status, compaction boundary, etc.)
	if (message.type === "system") {
		if (
			message.subtype === "init" &&
			message.session_id &&
			isUuidString(String(message.session_id))
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

	if (message.type === "assistant" || message.type === "user") {
		const beta = message.message;
		const blocks = Array.isArray(beta?.content) ? beta.content : [];
		for (const b of blocks) {
			if (b?.type === "tool_result" && b?.tool_use_id) {
				events.push({
					type: "tool_call_end",
					id: String(b.tool_use_id),
					output: b.content,
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
			isUuidString((message as any).session_id)
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

	function toolsForScenario(
		scenario: string,
		opts?: { includeSkills?: boolean },
	): string[] {
		const includeSkills = opts?.includeSkills === true;
		switch (scenario) {
			case "fast_search":
				return ["Read", "Glob", "Grep"];
			case "code_review":
				return ["Read", "Grep", "Glob", "Bash"];
			case "deep_analysis":
				return ["Read", "Edit", "Write", "Bash", "Grep", "Glob"];
			case "debugging":
				return ["Read", "Edit", "Bash", "Grep", "Glob"];
			case "writing":
				return includeSkills
					? ["Skill", "Read", "Glob", "Grep", "Write"]
					: ["Read", "Write"];
			case "translation":
				return ["Read", "Write"];
			case "data_processing":
				return ["Read", "Write", "Bash"];
			default:
				// Custom / unknown: allow common tools; include Skill to unlock special capabilities.
				return includeSkills
					? ["Skill", "Read", "Write", "Edit", "Bash", "Grep", "Glob"]
					: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"];
		}
	}

	function promptForScenarioAgent(opts: {
		agentKey: string;
		scenario: string;
		customName?: string | null;
		includeSkills: boolean;
	}): string {
		const label = scenarioLabel(opts.scenario, opts.customName);
		const scenarioMarker =
			opts.scenario === "custom" && opts.customName
				? opts.customName
				: opts.scenario;
		const skillHint = opts.includeSkills
			? "You may use Skill tool when helpful.\n"
			: "";

		return [
			`You are a specialized subagent for: ${label}.`,
			"Return only the final useful output. Be concise; do not include chain-of-thought.",
			"Do NOT copy the full conversation history. Use only the context provided in the Task prompt.",
			"This output will be injected back into the main conversation; keep it short and avoid irrelevant details.",
			skillHint.trimEnd(),
			"",
			`<ipo-subagent name="${opts.agentKey}" scenario="${scenarioMarker}" />`,
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

		for (const c of configs) {
			if (!c || typeof c !== "object") continue;
			if ((c as any).enabled === false) continue;

			const scenario = coerceString((c as any).scenario) || "";
			if (!scenario) continue;
			const customName = coerceString((c as any).customName);

			const agentKey =
				scenario === "custom"
					? normalizeAgentKey(customName || "custom")
					: normalizeAgentKey(scenario);
			if (!agentKey) continue;

			const includeSkills = scenario === "writing" || scenario === "custom";

			agents[agentKey] = {
				description: scenarioLabel(scenario, customName),
				prompt: promptForScenarioAgent({
					agentKey,
					scenario,
					customName,
					includeSkills,
				}),
				tools: toolsForScenario(scenario, { includeSkills }),
				disallowedTools: ["Task"],
				skills:
					includeSkills && opts.enabledSkills.length > 0
						? opts.enabledSkills
						: undefined,
			};
		}

		return agents;
	}

	function buildSubagentPolicyAppend(opts: {
		settings: AgentModelSettingsLike | null;
		enabledSkills: string[];
	}): string {
		const configs = Array.isArray(opts.settings?.scenarioConfigs)
			? (opts.settings?.scenarioConfigs as ScenarioModelConfigLike[])
			: [];
		const enabled = configs.filter(
			(c) => c && typeof c === "object" && (c as any).enabled !== false,
		);

		if (enabled.length === 0) return "";

		const lines: string[] = [];
		lines.push("## 子代理(通过 Task 工具调用)");
		lines.push(
			"当你需要某个专门能力/场景时，用 Task 工具把任务委派给对应子代理（subagent_type）。",
		);
		lines.push(
			"重要：如果当前模型自己就能完成（例如具备画图能力），直接完成；如果不具备（例如只能输出纯文本但用户要求生成图片），再委派给合适的子代理。",
		);
		lines.push(
			"为避免上下文污染：调用子代理时只传递最少必要信息，不要粘贴整段对话历史。",
		);
		lines.push("可用子代理：");

		for (const c of enabled.slice(0, 30)) {
			const scenario = coerceString((c as any).scenario) || "";
			const customName = coerceString((c as any).customName);
			const agentKey =
				scenario === "custom"
					? normalizeAgentKey(customName || "custom")
					: normalizeAgentKey(scenario);
			const label = scenarioLabel(scenario, customName);
			if (!agentKey) continue;
			lines.push(`- ${agentKey}: ${label}`);
		}

		if (enabled.length > 30) {
			lines.push(`- ...(还有 ${enabled.length - 30} 个已省略)`);
		}

		return lines.join("\n");
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
		running.set(runId, { abortController });

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
				const toolNameById = new Map<string, string>();
				const toolUseIdByIndex = new Map<number, string>();
				const toolInputJsonById = new Map<string, string>();
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
					} catch { }
				};

				let pathToClaudeCodeExecutable: string | undefined;
				try {
					const p = require.resolve("@anthropic-ai/claude-agent-sdk/cli.js");
					if (fs.existsSync(p)) pathToClaudeCodeExecutable = p;
				} catch { }

				const cwd =
					input.cwd && input.cwd.trim() ? input.cwd.trim() : process.cwd();
				const userShell =
					typeof process.env.SHELL === "string" ? process.env.SHELL : null;
				const userPath = await resolveUserPathFromShell(userShell);
				const resolvedPath = userPath || process.env.PATH;

				logger.info({
					msg: "agent_sdk start",
					scope: "agent",
					runId,
					cwd,
					model: input.model,
					pathToClaudeCodeExecutable,
					allowed_tools: input.allowed_tools,
					has_system_prompt: !!input.system_prompt,
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

				const allowed = Array.isArray(input.allowed_tools)
					? input.allowed_tools
					: [];
				const enabledSkills = normalizeStringArray((input as any).skills);
				const preferredWritingSkill = pickWritingSkill(enabledSkills);
				const agentModelSettings =
					(await loadAgentModelSettingsFromDb()) as AgentModelSettingsLike | null;
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
				const resumeSessionId = isUuidString(resumeSessionIdRaw)
					? resumeSessionIdRaw
					: undefined;
				const persistSession =
					typeof (input as any).persist_session === "boolean"
						? (input as any).persist_session
						: undefined;
				const mcpServers =
					(input as any).mcp_servers &&
						typeof (input as any).mcp_servers === "object"
						? ((input as any).mcp_servers as any)
						: undefined;
				const permissionMode =
					typeof input.permission_mode === "string" &&
						input.permission_mode.trim()
						? input.permission_mode.trim()
						: "acceptEdits";

				// 注意: SDK Options 不直接支持 skills 参数
				// Skills 通过 system prompt 和 syncSkillsToCwd 来处理

				// 【调试】确认 canUseTool 被传入 options
				console.log(
					`[agent_sdk] About to call sdk.query with cwd='${cwd}', hasCanUseTool=true`,
				);

				const q = sdk.query({
					prompt: String(input.prompt ?? ""),
					options: {
						abortController,
						cwd,
						model: String(input.model ?? ""),
						resume: resumeSessionId,
						persistSession,
						mcpServers,
						agents: {
							...scenarioAgents,
							reader: {
								description:
									"Reads provided files and extracts key facts/summaries.",
								prompt: `Read only the minimum necessary from the provided working directory files using Read/Glob/Grep. Return a concise bullet summary and any key quotes only if necessary.\n\n<ipo-subagent name="reader" scenario="fast_search" />`,
								tools: ["Read", "Glob", "Grep"],
								disallowedTools: ["Task"],
							},
							writer: {
								description:
									"Writes polished content (Xiaohongshu/marketing/copywriting) based on provided facts.",
								prompt: `Write in Chinese, follow the user's requested style (e.g., 小红书). Prefer using Skill tool when a matching writing skill is available. Do not paste full source files; use extracted facts only.\n\n<ipo-subagent name="writer" scenario="writing" />`,
								tools: ["Skill", "Read", "Glob", "Grep"],
								disallowedTools: ["Task"],
								skills: enabledSkills.length > 0 ? enabledSkills : undefined,
							},
						},
						hooks: {
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

											// 处理文件读取工具
											const toolLower = String(toolName).toLowerCase();
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
						pathToClaudeCodeExecutable,
						// CRITICAL: settingSources 告诉 SDK 从文件系统加载 skills
						// 必须包含 "user" 和 "project" 才能加载 ~/.claude/skills 和 .claude/skills
						settingSources: ["user", "project"] as any,
						tools:
							allowed.length > 0
								? allowed
								: { type: "preset", preset: "claude_code" },
						env: {
							...process.env,
							...(resolvedPath ? { PATH: resolvedPath } : null),
							ANTHROPIC_BASE_URL: options.anthropicBaseUrl,
							ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "sk-noop",
							// 禁用遥测数据上报，避免"1P event logging failed"错误
							ANTHROPIC_DISABLE_TELEMETRY: "1",
						},
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
								const inputAny = toolInput as any;
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
										return {
											behavior: "allow",
											updatedInput: { ...inputAny, file_path: guessed },
										};
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
											const updatedInput = {
												...inputAny,
												[key]: resolved,
												file_path: resolved,
											};
											return { behavior: "allow", updatedInput };
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
								typeof (toolInput as any).command === "string"
							) {
								const cmd = String((toolInput as any).command || "");
								const rewritten = await rewriteBashCommandForMissingFile({
									cwd,
									command: cmd,
								});
								if (rewritten && rewritten !== cmd) {
									stderr(
										`[agent_sdk] Auto-rewrote Bash command for missing file: '${cmd}' -> '${rewritten}'`,
									);
									return {
										behavior: "allow",
										updatedInput: { ...(toolInput as any), command: rewritten },
									};
								}
							}

							// Skills often take file paths as arguments and validate them internally.
							// When the model passes a title instead of a real path, Skill can fail with
							// "<tool_use_error>File does not exist.</tool_use_error>" and get stuck retrying.
							if (
								toolLower === "skill" &&
								toolInput &&
								typeof toolInput === "object"
							) {
								const rewritten = await rewritePathsDeep({
									cwd,
									value: toolInput,
								});
								if (rewritten !== toolInput) {
									stderr(
										"[agent_sdk] Auto-rewrote Skill input paths within cwd",
									);
									return {
										behavior: "allow",
										updatedInput: rewritten as any,
									};
								}
							}

							// 按照官方文档格式,返回 allow 时需要传递 updatedInput
							return { behavior: "allow", updatedInput: toolInput };
						},
					} as any, // Cast to any to allow stream property
				});

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
							} catch { }
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
								} catch { }
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
					const uiEvents = toUIEvents(msg as any);
					if (uiEvents.length > 0) {
						emit(options.getMainWindow, {
							runId,
							type: "transformed",
							events: uiEvents,
						});
						// 检查是否有 tool_block_stop 事件，如果有则发送完整的工具输入
						for (const ev of uiEvents) {
							if (ev.type === "tool_block_stop" && typeof ev.index === "number") {
								const toolId = toolUseIdByIndex.get(ev.index);
								if (toolId) {
									const inputJsonStr = toolInputJsonById.get(toolId);
									if (inputJsonStr) {
										let parsedInput: Record<string, unknown> = {};
										try {
											parsedInput = JSON.parse(inputJsonStr);
										} catch { }
										// 发送 tool_input_complete 事件
										emit(options.getMainWindow, {
											runId,
											type: "transformed",
											events: [{
												type: "tool_input_complete",
												id: toolId,
												input: parsedInput,
											}],
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
						emit(options.getMainWindow, { runId, type: "done", result: resultWithUsage });
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
				logger.error({
					msg: "agent_sdk runner error",
					scope: "agent",
					runId,
					error,
				});
				emit(options.getMainWindow, { runId, type: "error", error });
			} finally {
				running.delete(runId);
			}
		})();

		return runId;
	};

	const agent_sdk_abort = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkAbortInput,
	): Promise<AgentSdkAbortOutput> => {
		const run = running.get(input.runId);
		if (run) {
			run.abortController.abort();
			running.delete(input.runId);
		}
		return { success: true };
	};

	return { agent_sdk_start, agent_sdk_abort };
}
