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
			// Common Chinese punctuation variants
			.replace(/[？]/g, "_")
			.replace(/[：]/g, ":")
	);
}

function stripWrappingQuotes(raw: string): string {
	const s = String(raw || "").trim();
	if (
		(s.startsWith("\"") && s.endsWith("\"")) ||
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

async function resolveToolFilePath(opts: {
	cwd: string;
	rawPath: string;
}): Promise<string | null> {
	const raw = stripWrappingQuotes(String(opts.rawPath || "").trim());
	if (!raw) return null;

	const cwdResolved = path.resolve(opts.cwd);

	// 【修复】首先检查：如果路径是绝对路径且文件存在，直接返回
	// 这解决了模型提供完整沙盒路径时的问题
	if (path.isAbsolute(raw)) {
		const absoluteExists = await pathExists(raw);
		console.log(`[resolveToolFilePath] Absolute path check: raw='${raw}', exists=${absoluteExists}`);
		if (absoluteExists) {
			return raw;
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
	console.log(`[resolveToolFilePath] Relative check: raw='${raw}', cwd='${cwdResolved}', asAbsolute='${asAbsolute}', exists=${exists}, withinCwd=${withinCwd}`);

	if (exists && withinCwd) return asAbsolute;

	// 模糊匹配：如果用户提供了文件名而非路径
	const found = await findFileByLooseName({ rootDir: opts.cwd, query: raw });
	console.log(`[resolveToolFilePath] Fuzzy search result: '${found}'`);
	if (found && (await pathExists(found))) return found;

	// 【修复】最后尝试：如果解析后的路径存在（即使不在 cwd 内），也允许
	// 这处理 sandboxDir 与 cwd 不匹配的边缘情况
	if (exists) {
		console.log(`[resolveToolFilePath] Fallback: allowing existing path outside cwd: '${asAbsolute}'`);
		return asAbsolute;
	}

	console.log(`[resolveToolFilePath] FAILED: Could not resolve path '${raw}' in cwd='${cwdResolved}'`);
	return null;
}

function tokenizeShellLike(input: string): string[] {
	const s = String(input || "");
	const tokens: string[] = [];
	let buf = "";
	let quote: "'" | "\"" | null = null;
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
		if (ch === "'" || ch === "\"") {
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
	return tokens
		.map((t) => (needsQuoting(t) ? JSON.stringify(t) : t))
		.join(" ");
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

	const resolved = await resolveToolFilePath({ cwd: opts.cwd, rawPath: candidate });
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
				const resolved = await resolveToolFilePath({ cwd: opts.cwd, rawPath: v });
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

function toUIEvents(message: any): any[] {
	const events: any[] = [];
	if (!message || typeof message !== "object") return events;

	// SDK system messages (session init, status, compaction boundary, etc.)
	if (message.type === "system") {
		if (message.subtype === "init" && message.session_id) {
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

	if (message.type === "stream_event") {
		const ev = message.event;
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
				input:
					ev.content_block.input && typeof ev.content_block.input === "object"
						? ev.content_block.input
						: {},
			});
		}
		if (ev?.type === "message_start" && ev?.message?.id) {
			events.push({
				type: "session_init",
				sessionId: String(ev.message.id),
			});
		}
	}

	if (message.type === "result") {
		const isError =
			Boolean((message as any).is_error) || message.subtype !== "success";
		if ((message as any).session_id) {
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
}) {
	const require = createRequire(import.meta.url);
	const logger = options.logger;
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
				const resumeSessionId =
					typeof (input as any).resume_session_id === "string" &&
						(input as any).resume_session_id.trim()
						? (input as any).resume_session_id.trim()
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
				console.log(`[agent_sdk] About to call sdk.query with cwd='${cwd}', hasCanUseTool=true`);

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
							reader: {
								description:
									"Reads provided files and extracts key facts/summaries.",
								prompt:
									"Read only the minimum necessary from the provided working directory files using Read/Glob/Grep. Return a concise bullet summary and any key quotes only if necessary.",
								tools: ["Read", "Glob", "Grep"],
							},
							writer: {
								description:
									"Writes polished content (Xiaohongshu/marketing/copywriting) based on provided facts.",
								prompt:
									"Write in Chinese, follow the user's requested style (e.g., 小红书). Prefer using Skill tool when a matching writing skill is available. Do not paste full source files; use extracted facts only.",
								tools: ["Skill", "Read", "Glob", "Grep"],
								skills: enabledSkills.length > 0 ? enabledSkills : undefined,
							},
						},
						hooks: {
							// PreToolUse 钩子：在工具执行前拦截并修复文件路径
							PreToolUse: [
								{
									hooks: [
										async (hookInput: any, _toolUseID: string | undefined, _opts: any) => {
											if (hookInput.hook_event_name !== "PreToolUse") {
												return { continue: true };
											}
											const toolName = (hookInput as any).tool_name || "";
											const toolInput = (hookInput as any).tool_input || {};

											console.log(`[PreToolUse] Tool='${toolName}', Input=${JSON.stringify(toolInput).slice(0, 200)}`);

											// 处理文件读取工具
											const toolLower = String(toolName).toLowerCase();
											if (["read", "glob", "grep", "write", "edit"].includes(toolLower)) {
												const key = typeof toolInput.file_path === "string" ? "file_path"
													: typeof toolInput.path === "string" ? "path"
														: typeof toolInput.file === "string" ? "file"
															: null;

												if (key) {
													const rawPath = String(toolInput[key] || "").trim();
													if (rawPath) {
														console.log(`[PreToolUse] Resolving path: '${rawPath}' in cwd='${cwd}'`);
														const resolved = await resolveToolFilePath({ cwd, rawPath });
														if (resolved && resolved !== rawPath) {
															console.log(`[PreToolUse] ✓ Rewritten: '${rawPath}' -> '${resolved}'`);
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
															console.log(`[PreToolUse] ✗ Failed to resolve: '${rawPath}'`);
														}
													}
												}
											}

											// 处理 Bash 命令
											if (toolLower === "bash" && typeof toolInput.command === "string") {
												const cmd = String(toolInput.command || "");
												const rewritten = await rewriteBashCommandForMissingFile({ cwd, command: cmd });
												if (rewritten && rewritten !== cmd) {
													console.log(`[PreToolUse] ✓ Bash rewritten: '${cmd}' -> '${rewritten}'`);
													return {
														continue: true,
														hookSpecificOutput: {
															hookEventName: "PreToolUse" as const,
															permissionDecision: "allow" as const,
															updatedInput: { ...toolInput, command: rewritten },
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
													"为减少上下文污染：请用 Task 工具把\"读资料/提炼要点\"委派给 reader 子代理，把\"写作成文\"委派给 writer 子代理，然后你只输出最终结果。",
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
						},
						stderr,
						includePartialMessages: true,
						// Force streaming if supported by the SDK/API (cast to any to avoid TS error)
						stream: true,
						// systemPrompt: 如果用户提供了自定义 prompt,使用 preset + append 模式
						// 这样既保留 Claude Code 默认能力,又能添加自定义指令
						systemPrompt: input.system_prompt
							? {
								type: "preset" as const,
								preset: "claude_code" as const,
								append: input.system_prompt,
							}
							: { type: "preset" as const, preset: "claude_code" as const },
						canUseTool: async (
							toolName: string,
							toolInput: any,
							extra: any,
						) => {
							// 【调试】记录每个工具调用 - 非常醒目的日志
							console.log(`\n★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★`);
							console.log(`★ [canUseTool CALLED] Tool='${toolName}', AgentID='${(extra as any)?.agentID || 'main'}'`);
							console.log(`★ Input: ${JSON.stringify(toolInput || {}).slice(0, 200)}`);
							console.log(`★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★\n`);
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
								if (key) {
									const rawPath = String(inputAny[key] || "").trim();
									if (rawPath) {
										console.log(`[agent_sdk] Tool ${toolName}: attempting to resolve path '${rawPath}' in cwd='${cwd}'`);
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
								const rewritten = await rewritePathsDeep({ cwd, value: toolInput });
								if (rewritten !== toolInput) {
									stderr("[agent_sdk] Auto-rewrote Skill input paths within cwd");
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

				for await (const msg of q) {
					// Debug log for streaming issues
					console.log("[agentSdk] msg:", (msg as any).type, JSON.stringify(msg).slice(0, 100));
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
					}
					if ((msg as any)?.type === "result") {
						emit(options.getMainWindow, { runId, type: "done", result: msg });
					}
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
