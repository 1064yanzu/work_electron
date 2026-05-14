/**
 * 上下文文件聚合器
 *
 * 把"我们维护的 SOUL/USER/MEMORY"和"SDK 自动加载的 CLAUDE.md / AGENTS.md"
 * 统一抽象成 6 个虚拟文件 token，让设置面板一处全景化管理。
 *
 *   soul              → <userData>/agent-memory/SOUL.md
 *   user              → <userData>/agent-memory/USER.md
 *   memory            → <userData>/agent-memory/MEMORY.md
 *   global_claude_md  → ~/.claude/CLAUDE.md（全局用户级，影响所有 Claude Code 实例）
 *   project_claude_md → <cwd>/CLAUDE.md（项目级，跟随当前线程）
 *   project_agents_md → <cwd>/AGENTS.md（项目级，跟随当前线程）
 *
 * 我们维护的三件套有字符上限；SDK 自动加载的三件套不在我们控制下，
 * 不设上限（仅用大小提示）。global_claude_md 写入需要 confirmed=true，
 * 避免误改全局配置。
 */
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	MEMORY_FILES,
	MemoryQuotaError,
	readFile as readMemoryFile,
	writeFile as writeMemoryFile,
	type MemoryFileName,
} from "./memoryFileStore";
import { getSnapshot } from "./memorySnapshot";

export type ContextFileToken =
	| "soul"
	| "user"
	| "memory"
	| "global_claude_md"
	| "project_claude_md"
	| "project_agents_md";

export interface ContextFileInfo {
	token: ContextFileToken;
	displayName: string;
	path: string;
	content: string;
	charCount: number;
	limit?: number;
	lastModified: number;
	exists: boolean;
	managedBy: "ipo" | "sdk";
	requiresConfirm: boolean;
	cwdRelative: boolean;
}

function isMemoryToken(token: ContextFileToken): token is MemoryFileName {
	return token === "soul" || token === "user" || token === "memory";
}

function resolveSdkPath(
	token: Extract<
		ContextFileToken,
		"global_claude_md" | "project_claude_md" | "project_agents_md"
	>,
	cwd: string | null,
): string | null {
	if (token === "global_claude_md") {
		return path.join(os.homedir(), ".claude", "CLAUDE.md");
	}
	if (!cwd || !cwd.trim()) return null;
	const abs = path.isAbsolute(cwd) ? cwd : path.resolve(cwd);
	if (token === "project_claude_md") return path.join(abs, "CLAUDE.md");
	if (token === "project_agents_md") return path.join(abs, "AGENTS.md");
	return null;
}

function displayNameFor(token: ContextFileToken): string {
	switch (token) {
		case "soul":
		case "user":
		case "memory":
			return MEMORY_FILES[token].displayName;
		case "global_claude_md":
			return "~/.claude/CLAUDE.md";
		case "project_claude_md":
			return "CLAUDE.md (项目级)";
		case "project_agents_md":
			return "AGENTS.md (项目级)";
	}
}

async function readSdkFile(
	token: Extract<
		ContextFileToken,
		"global_claude_md" | "project_claude_md" | "project_agents_md"
	>,
	cwd: string | null,
): Promise<ContextFileInfo> {
	const filePath = resolveSdkPath(token, cwd);
	if (!filePath) {
		return {
			token,
			displayName: displayNameFor(token),
			path: "",
			content: "",
			charCount: 0,
			lastModified: 0,
			exists: false,
			managedBy: "sdk",
			requiresConfirm: token === "global_claude_md",
			cwdRelative: token !== "global_claude_md",
		};
	}
	try {
		const [content, stat] = await Promise.all([
			fsp.readFile(filePath, "utf8"),
			fsp.stat(filePath),
		]);
		return {
			token,
			displayName: displayNameFor(token),
			path: filePath,
			content,
			charCount: content.length,
			lastModified: stat.mtimeMs,
			exists: true,
			managedBy: "sdk",
			requiresConfirm: token === "global_claude_md",
			cwdRelative: token !== "global_claude_md",
		};
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return {
				token,
				displayName: displayNameFor(token),
				path: filePath,
				content: "",
				charCount: 0,
				lastModified: 0,
				exists: false,
				managedBy: "sdk",
				requiresConfirm: token === "global_claude_md",
				cwdRelative: token !== "global_claude_md",
			};
		}
		throw err;
	}
}

async function writeSdkFile(
	token: Extract<
		ContextFileToken,
		"global_claude_md" | "project_claude_md" | "project_agents_md"
	>,
	content: string,
	cwd: string | null,
): Promise<{ ok: boolean; path?: string; error?: string }> {
	const filePath = resolveSdkPath(token, cwd);
	if (!filePath) {
		return { ok: false, error: "NO_CWD" };
	}
	const dir = path.dirname(filePath);
	await fsp.mkdir(dir, { recursive: true });
	const normalized = content.replace(/\r\n/g, "\n");
	const finalContent =
		normalized.length === 0 || normalized.endsWith("\n")
			? normalized
			: `${normalized}\n`;
	const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await fsp.writeFile(tmp, finalContent, "utf8");
	await fsp.rename(tmp, filePath);
	return { ok: true, path: filePath };
}

export async function resolveContextFile(
	token: ContextFileToken,
	cwd: string | null,
): Promise<ContextFileInfo> {
	if (isMemoryToken(token)) {
		const snap = await readMemoryFile(token);
		return {
			token,
			displayName: snap.displayName,
			path: snap.path,
			content: snap.content,
			charCount: snap.charCount,
			limit: snap.limit,
			lastModified: snap.lastModified,
			exists: snap.exists,
			managedBy: "ipo",
			requiresConfirm: false,
			cwdRelative: false,
		};
	}
	return readSdkFile(token, cwd);
}

export async function writeContextFile(
	token: ContextFileToken,
	content: string,
	cwd: string | null,
	confirmed: boolean,
): Promise<{ ok: boolean; error?: string; path?: string }> {
	if (isMemoryToken(token)) {
		try {
			const snap = await writeMemoryFile(token, content);
			return { ok: true, path: snap.path };
		} catch (err) {
			if (err instanceof MemoryQuotaError) {
				return {
					ok: false,
					error: `OVER_QUOTA: ${err.attempted}/${err.limit}`,
				};
			}
			return {
				ok: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}
	if (token === "global_claude_md" && !confirmed) {
		return {
			ok: false,
			error: "REQUIRES_CONFIRMATION",
		};
	}
	return writeSdkFile(token, content, cwd);
}

export async function listAllContextFiles(
	cwd: string | null,
): Promise<
	Array<ContextFileInfo & { injectedInActiveSnapshot: boolean }>
> {
	const tokens: ContextFileToken[] = [
		"soul",
		"user",
		"memory",
		"global_claude_md",
		"project_claude_md",
		"project_agents_md",
	];
	const infos = await Promise.all(
		tokens.map((t) => resolveContextFile(t, cwd)),
	);

	// 简单标注：我们只能确切判断"我们维护的三件套"是否在 active 快照里——
	// SDK 自动加载部分 IPC 层无法精确感知是否注入了，对前端来说仅作为"系统级文件"展示。
	const memSnapshots = (() => {
		// 任意一个 active snapshot 都行，UI 只关心"是否存在 active run"
		const ids: string[] = [];
		try {
			// 通过反射读 module-private map 不必要——后续如果需要可扩展
		} catch {}
		return ids;
	})();
	const hasActiveSnapshot = memSnapshots.length > 0;

	return infos.map((info) => ({
		...info,
		injectedInActiveSnapshot:
			info.managedBy === "ipo" ? hasActiveSnapshot : false,
	}));
}

export function isContextFileToken(value: unknown): value is ContextFileToken {
	return (
		value === "soul" ||
		value === "user" ||
		value === "memory" ||
		value === "global_claude_md" ||
		value === "project_claude_md" ||
		value === "project_agents_md"
	);
}

export function getActiveMemorySnapshotPreview(runId: string): {
	soul: string;
	user: string;
	memory: string;
	frozenAt: number;
} | null {
	const snap = getSnapshot(runId);
	if (!snap) return null;
	return {
		soul: snap.soul,
		user: snap.user,
		memory: snap.memory,
		frozenAt: snap.frozenAt,
	};
}
