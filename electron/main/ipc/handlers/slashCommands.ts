/**
 * Claude Code 风格斜杠命令 —— 主进程 IPC handlers（Task 6.0.b）。
 *
 * 包含三条 handler：
 * 1. `slash_commands_scan` — 扫描 `.claude/commands/` 下 Markdown 自定义命令；
 * 2. `slash_commands_git_diff` — 执行 `git diff` 并按 `max_bytes` 截断；
 * 3. `slash_commands_write_init` — 写入 `CLAUDE.md` 模板，带覆盖确认。
 *
 * 安全与约束：
 * - 路径白名单：仅允许 `${workspace_dir}/.claude/commands/`
 *   与（开关 `include_user_home=true` 时）`${os.homedir()}/.claude/commands/`；
 * - 单文件 ≤ 64 KB，单次扫描上限 `max_files`（默认 500），总耗时 ≤ 3 s；
 * - `git diff` 子进程超时 10 s，`maxBuffer` 10 MB；
 * - 异常不吞：抛出 `Error`，由 `register.ts` 的 `IpcHandler` 统一转受控错误字符串。
 */

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app, dialog, type IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 64 * 1024; // 单文件最大 64 KB
const DEFAULT_MAX_FILES = 500;
const SCAN_TIMEOUT_MS = 3_000;
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 10 * 1024 * 1024; // 10 MB
const DIFF_DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

// ---------------------------------------------------------------------------
// 内置 CLAUDE.md 模板（中文）
// ---------------------------------------------------------------------------

const CLAUDE_MD_TEMPLATE = `# 项目指引 — Claude Code

> 本文件由 Claude Code 斜杠命令 \`/init\` 生成，用于为 Claude Agent 提供项目级上下文。
> 请按需补充与调整。

## 1. 项目概览

- 项目简介：
- 主要技术栈：
- 运行 / 构建命令：

## 2. 工作约定

- 代码风格与 Lint 要求：
- 测试运行方式：
- 提交信息规范：

## 3. Claude Code 行为提示

- 默认使用中文输出分析与回复；
- 修改代码前请先阅读相关模块，不要凭空假设；
- 涉及外部 API、数据库 schema、配置文件等跨模块改动，提交前在此简要记录影响范围。

## 4. 自定义斜杠命令

- 可在 \`.claude/commands/\` 下放置 Markdown 文件，作为项目级自定义命令。
- 文件名会被规范化为 id（小写、连字符）。
- frontmatter 中 \`name\` / \`description\` 会在菜单里展示。
`;

// ---------------------------------------------------------------------------
// 工具：frontmatter 解析
// ---------------------------------------------------------------------------

interface ParsedMd {
	name?: string;
	description?: string;
	prompt: string;
}

function parseFrontmatter(raw: string): ParsedMd {
	// 只接受形如 "---\n<YAML-ish key: value 行>\n---\n..." 的简单前言
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) {
		return { prompt: raw };
	}
	const front = match[1] ?? "";
	const body = match[2] ?? "";
	const meta: Record<string, string> = {};
	for (const line of front.split(/\r?\n/)) {
		const kv = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/);
		if (!kv) continue;
		const key = kv[1]?.toLowerCase();
		let value = kv[2] ?? "";
		if (!key || !value) continue;
		// 去掉包围引号
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		meta[key] = value;
	}
	return {
		name: typeof meta.name === "string" ? meta.name : undefined,
		description:
			typeof meta.description === "string" ? meta.description : undefined,
		prompt: body,
	};
}

function normalizeCommandId(filename: string): string {
	const stem = filename.replace(/\.md$/i, "");
	return stem
		.toLowerCase()
		.replace(/[^a-z0-9\-_]/g, "-")
		.replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// 工具：路径白名单校验
// ---------------------------------------------------------------------------

function ensureAbsolute(p: string): string {
	const raw = String(p ?? "").trim();
	if (!raw) throw new Error("路径不能为空");
	if (raw.includes("\0")) throw new Error("路径非法");
	if (!path.isAbsolute(raw)) throw new Error("必须使用绝对路径");
	return path.resolve(raw);
}

function resolveScanRoots(
	workspaceDir: string,
	includeUserHome: boolean,
): Array<{ absPath: string; source: "project" | "user" }> {
	const out: Array<{ absPath: string; source: "project" | "user" }> = [];
	const projectPath = path.join(
		ensureAbsolute(workspaceDir),
		".claude",
		"commands",
	);
	out.push({ absPath: projectPath, source: "project" });
	if (includeUserHome) {
		const home = app.getPath("home") || os.homedir();
		if (home) {
			out.push({
				absPath: path.join(home, ".claude", "commands"),
				source: "user",
			});
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// 扫描 —— 带总超时
// ---------------------------------------------------------------------------

type ScanOutput = IPCSchema["slash_commands_scan"]["output"];

async function scanOneRoot(
	root: { absPath: string; source: "project" | "user" },
	remainingBudget: number,
): Promise<ScanOutput> {
	const entries: ScanOutput = [];
	let stat;
	try {
		stat = await fs.stat(root.absPath);
	} catch {
		return entries; // 目录不存在：返回空
	}
	if (!stat.isDirectory()) return entries;

	const files = await fs.readdir(root.absPath, { withFileTypes: true });
	for (const f of files) {
		if (remainingBudget <= 0) break;
		if (!f.isFile()) continue;
		if (!f.name.toLowerCase().endsWith(".md")) continue;
		const filePath = path.join(root.absPath, f.name);
		let fileStat;
		try {
			fileStat = await fs.stat(filePath);
		} catch {
			continue;
		}
		if (fileStat.size > MAX_FILE_BYTES) continue;
		let content: string;
		try {
			content = await fs.readFile(filePath, "utf-8");
		} catch {
			continue;
		}
		const parsed = parseFrontmatter(content);
		const id = normalizeCommandId(f.name);
		if (!id) continue;
		entries.push({
			id,
			name: parsed.name,
			description: parsed.description,
			prompt: parsed.prompt,
			source: root.source,
			sourcePath: filePath,
		});
		remainingBudget -= 1;
	}
	return entries;
}

// ---------------------------------------------------------------------------
// execFile Promise 化
// ---------------------------------------------------------------------------

function execGit(
	args: string[],
	cwd: string,
	options: { timeout?: number; maxBuffer?: number },
): Promise<{ stdout: string; stderr: string; code: number }> {
	return new Promise((resolve) => {
		execFile(
			"git",
			args,
			{
				cwd,
				timeout: options.timeout ?? GIT_TIMEOUT_MS,
				maxBuffer: options.maxBuffer ?? GIT_MAX_BUFFER,
				windowsHide: true,
			},
			(err, stdout, stderr) => {
				const code =
					err && typeof (err as { code?: number }).code === "number"
						? Number((err as { code?: number }).code)
						: err
							? 1
							: 0;
				resolve({
					stdout: String(stdout ?? ""),
					stderr: String(stderr ?? ""),
					code,
				});
			},
		);
	});
}

// ---------------------------------------------------------------------------
// Handlers 工厂
// ---------------------------------------------------------------------------

type HandlerInput<K extends keyof IPCSchema> = IPCSchema[K]["input"];
type HandlerOutput<K extends keyof IPCSchema> = IPCSchema[K]["output"];

export function createSlashCommandsHandlers() {
	const slash_commands_scan = async (
		_event: IpcMainInvokeEvent,
		input: HandlerInput<"slash_commands_scan">,
	): Promise<HandlerOutput<"slash_commands_scan">> => {
		const roots = resolveScanRoots(
			input.workspace_dir,
			input.include_user_home,
		);
		const maxFiles = Math.max(
			1,
			Math.min(5000, input.max_files ?? DEFAULT_MAX_FILES),
		);

		const scanPromise = (async () => {
			let budget = maxFiles;
			const all: ScanOutput = [];
			for (const root of roots) {
				const entries = await scanOneRoot(root, budget);
				for (const e of entries) all.push(e);
				budget -= entries.length;
				if (budget <= 0) break;
			}
			return all;
		})();

		const timeoutPromise = new Promise<ScanOutput>((resolve) => {
			setTimeout(() => resolve([]), SCAN_TIMEOUT_MS);
		});
		return Promise.race([scanPromise, timeoutPromise]);
	};

	const slash_commands_git_diff = async (
		_event: IpcMainInvokeEvent,
		input: HandlerInput<"slash_commands_git_diff">,
	): Promise<HandlerOutput<"slash_commands_git_diff">> => {
		const cwd = ensureAbsolute(input.workspace_dir);
		const maxBytes = Math.max(
			1024,
			Math.min(50 * 1024 * 1024, input.max_bytes ?? DIFF_DEFAULT_MAX_BYTES),
		);

		const statRes = await execGit(["diff", "--stat"], cwd, {});
		if (statRes.code !== 0 && statRes.stderr) {
			throw new Error(`git diff --stat 失败：${statRes.stderr.slice(0, 500)}`);
		}

		const diffRes = await execGit(["diff", "--no-color"], cwd, {});
		if (diffRes.code !== 0 && diffRes.stderr) {
			throw new Error(`git diff 失败：${diffRes.stderr.slice(0, 500)}`);
		}

		let diff = diffRes.stdout;
		if (diff.length > maxBytes) {
			diff = `${diff.slice(0, maxBytes)}\n...(diff 已按 ${maxBytes} 字节截断)`;
		}
		const stat = statRes.stdout;
		const hasChanges = stat.trim().length > 0 || diff.trim().length > 0;
		return { has_changes: hasChanges, diff, stat };
	};

	const slash_commands_write_init = async (
		_event: IpcMainInvokeEvent,
		input: HandlerInput<"slash_commands_write_init">,
	): Promise<HandlerOutput<"slash_commands_write_init">> => {
		const cwd = ensureAbsolute(input.workspace_dir);
		const target = path.join(cwd, "CLAUDE.md");
		let existed = false;
		try {
			await fs.access(target);
			existed = true;
		} catch {
			existed = false;
		}

		if (existed && !input.overwrite) {
			return {
				path: target,
				created: false,
				overwritten: false,
				error: "exists",
			};
		}

		await fs.writeFile(target, CLAUDE_MD_TEMPLATE, "utf-8");
		return {
			path: target,
			created: !existed,
			overwritten: existed,
		};
	};

	const slash_commands_pick_directory = async (
		_event: IpcMainInvokeEvent,
		input: HandlerInput<"slash_commands_pick_directory">,
	): Promise<HandlerOutput<"slash_commands_pick_directory">> => {
		const result = await dialog.showOpenDialog({
			title: input.title || "选择目录",
			defaultPath:
				input.default_path && input.default_path.trim()
					? input.default_path
					: undefined,
			properties: ["openDirectory", "createDirectory"],
		});
		if (result.canceled || result.filePaths.length === 0) {
			return { canceled: true, path: "" };
		}
		return { canceled: false, path: result.filePaths[0] ?? "" };
	};

	const slash_commands_save_dialog = async (
		_event: IpcMainInvokeEvent,
		input: HandlerInput<"slash_commands_save_dialog">,
	): Promise<HandlerOutput<"slash_commands_save_dialog">> => {
		const filters =
			Array.isArray(input.filters) && input.filters.length > 0
				? input.filters
				: [
						{ name: "Markdown", extensions: ["md"] },
						{ name: "All Files", extensions: ["*"] },
					];
		const result = await dialog.showSaveDialog({
			title: input.title || "保存到…",
			defaultPath:
				input.default_path && input.default_path.trim()
					? input.default_path
					: undefined,
			filters,
		});
		if (result.canceled || !result.filePath) {
			return { canceled: true, path: "" };
		}
		return { canceled: false, path: result.filePath };
	};

	const slash_commands_export_session_md = async (
		_event: IpcMainInvokeEvent,
		input: HandlerInput<"slash_commands_export_session_md">,
	): Promise<HandlerOutput<"slash_commands_export_session_md">> => {
		const target = ensureAbsolute(input.path);
		const dir = path.dirname(target);
		await fs.mkdir(dir, { recursive: true });
		const content = String(input.content ?? "");
		await fs.writeFile(target, content, "utf-8");
		return { path: target, bytes: Buffer.byteLength(content, "utf-8") };
	};

	return {
		slash_commands_scan,
		slash_commands_git_diff,
		slash_commands_write_init,
		slash_commands_pick_directory,
		slash_commands_save_dialog,
		slash_commands_export_session_md,
	};
}
