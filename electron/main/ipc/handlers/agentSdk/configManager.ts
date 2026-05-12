/**
 * configManager.ts
 *
 * Configuration, normalization, and skill/directory helpers for the Agent SDK.
 * Includes shell PATH resolution, settings normalizers, skill syncing,
 * directory resolution, and plugin normalization.
 */
import { execFile } from "node:child_process";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import {
	getManagedSkillsRootDir,
	getProjectSkillsRootDir,
} from "../skillRoots";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Shell / PATH resolution
// ---------------------------------------------------------------------------

export async function resolveUserPathFromShell(
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

// ---------------------------------------------------------------------------
// Value normalizers
// ---------------------------------------------------------------------------

export function normalizeStringArray(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
}

export function normalizeNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

export function normalizeSettingSources(
	value: unknown,
): Array<"user" | "project" | "local"> {
	const arr = Array.isArray(value)
		? value
		: typeof value === "string"
			? value.split(/[,\s]+/g)
			: [];
	const allowed = new Set(["user", "project", "local"]);
	const out: Array<"user" | "project" | "local"> = [];
	for (const item of arr) {
		const s = String(item || "").trim() as "user" | "project" | "local";
		if (!allowed.has(s)) continue;
		if (!out.includes(s)) out.push(s);
	}
	return out.length > 0 ? out : ["user", "project"];
}

export function normalizeToolSearchMode(
	value: unknown,
): "auto" | "auto:5" | "true" | "false" {
	const normalized = String(value || "")
		.trim()
		.toLowerCase();
	if (
		normalized === "auto" ||
		normalized === "auto:5" ||
		normalized === "true" ||
		normalized === "false"
	) {
		return normalized;
	}
	// 默认关：与 Claude Code CLI 默认行为对齐。
	// 开了之后 SDK 会注入 ToolSearch 章节，稀释主指令权重，且增加一次工具发现的延迟。
	return "false";
}

/**
 * 思考档位（直接透传 SDK 的 effort / thinking 字段）。
 * - "off" → thinking: { type: "disabled" }
 * - "low" / "medium" / "high" / "xhigh" → effort
 * - undefined → 不传任何 thinking 相关字段，SDK 自决（Opus 4.6+ 默认 adaptive + high）
 */
export type ThinkingLevel = "off" | "low" | "medium" | "high" | "xhigh";

export function normalizeThinkingLevel(
	value: unknown,
): ThinkingLevel | undefined {
	if (value === undefined || value === null) return undefined;
	const normalized = String(value).trim().toLowerCase();
	if (
		normalized === "off" ||
		normalized === "low" ||
		normalized === "medium" ||
		normalized === "high" ||
		normalized === "xhigh"
	) {
		return normalized;
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Writing task detection
// ---------------------------------------------------------------------------

export function isLikelyWritingTask(prompt: string): boolean {
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

export function pickWritingSkill(skills: string[]): string | null {
	const lowered = skills.map((s) => ({ raw: s, low: s.toLowerCase() }));
	const exact = lowered.find((s) => s.low === "writing-assistant");
	if (exact) return exact.raw;
	const byKeyword = lowered.find(
		(s) => s.low.includes("writing") || s.raw.includes("写作"),
	);
	return byKeyword?.raw ?? null;
}

// ---------------------------------------------------------------------------
// Skills directory & sync
// ---------------------------------------------------------------------------

async function ensureDir(dir: string) {
	await fsp.mkdir(dir, { recursive: true });
}

/**
 * Compare SKILL.md modification times between source and destination.
 * Returns true if source is newer than dest (or dest doesn't exist).
 */
async function isSkillNewer(srcDir: string, destDir: string): Promise<boolean> {
	const srcSkillMd = path.join(srcDir, "SKILL.md");
	const destSkillMd = path.join(destDir, "SKILL.md");
	try {
		const [srcStat, destStat] = await Promise.all([
			fsp.stat(srcSkillMd).catch(() => null),
			fsp.stat(destSkillMd).catch(() => null),
		]);
		if (!srcStat) return false; // source has no SKILL.md — skip
		if (!destStat) return true; // dest doesn't exist — needs sync
		return srcStat.mtimeMs > destStat.mtimeMs;
	} catch {
		return false;
	}
}

/**
 * Claude Agent SDK 的 Skill tool 会扫描 cwd/.claude/skills（project settings）等目录。
 * 我们当前的技能库在 ~/.claude/skills（home）。为避免 SDK 执行 Skill 时提示"不可用"，
 * 在每次启动 agent 前，把 home skills 增量同步到 cwd/.claude/skills。
 *
 * 改进：对已存在的 skill，比较 SKILL.md 的修改时间，源更新时重新同步。
 */
export async function syncSkillsToCwd(
	cwd: string,
	stderr: (msg: string) => void,
	enabledSkillNames?: string[],
) {
	const srcRoot = getManagedSkillsRootDir();
	const destRoot = getProjectSkillsRootDir(cwd);
	const enabledSkillSet = new Set(
		(enabledSkillNames ?? []).map((name) => String(name || "").trim()),
	);
	const hasExplicitEnabledSkills = Array.isArray(enabledSkillNames);

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
		stderr(`[agent_sdk_start] Home skills dir not found: ${srcRoot}`);
		return;
	}

	const dirEntries = entries.filter((e) => e.isDirectory());
	stderr(
		`[agent_sdk_start] Syncing enabled skills: src=${srcRoot} -> dest=${destRoot} (enabled=${hasExplicitEnabledSkills ? enabledSkillSet.size : dirEntries.length}, available=${dirEntries.length})`,
	);

	let newCount = 0;
	let updatedCount = 0;
	let removedCount = 0;
	const homeSkillNames = new Set(dirEntries.map((ent) => ent.name));

	for (const ent of dirEntries) {
		if (hasExplicitEnabledSkills && !enabledSkillSet.has(ent.name)) continue;

		const srcDir = path.join(srcRoot, ent.name);
		const destDir = path.join(destRoot, ent.name);

		let destExists = false;
		try {
			await fsp.access(destDir);
			destExists = true;
		} catch {
			// dest 不存在
		}

		if (destExists) {
			// 检查是否有更新：比较 SKILL.md 的 mtime
			const newer = await isSkillNewer(srcDir, destDir);
			if (!newer) continue;

			// 源更新 — 重新同步（删除旧的，复制新的）
			try {
				await fsp.rm(destDir, { recursive: true, force: true });
			} catch {
				// 删除失败就跳过
				continue;
			}
			updatedCount++;
		} else {
			newCount++;
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

	if (hasExplicitEnabledSkills) {
		try {
			const destEntries = await fsp.readdir(destRoot, { withFileTypes: true });
			for (const ent of destEntries) {
				if (!ent.isDirectory()) continue;
				if (!homeSkillNames.has(ent.name)) continue;
				if (enabledSkillSet.has(ent.name)) continue;
				await fsp.rm(path.join(destRoot, ent.name), {
					recursive: true,
					force: true,
				});
				removedCount++;
			}
		} catch (e) {
			stderr(
				`[agent_sdk_start] Failed to prune disabled project skills. ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}

	if (newCount > 0 || updatedCount > 0 || removedCount > 0) {
		stderr(
			`[agent_sdk_start] Skills sync complete: ${newCount} new, ${updatedCount} updated, ${removedCount} removed`,
		);
	}
}

// ---------------------------------------------------------------------------
// String / array helpers
// ---------------------------------------------------------------------------

export function uniqStrings(values: string[]): string[] {
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

export async function listProjectSkills(cwd: string): Promise<string[]> {
	const dir = getProjectSkillsRootDir(cwd);
	try {
		const entries = await fsp.readdir(dir, { withFileTypes: true });
		return entries
			.filter((e) => e.isDirectory() && !e.name.startsWith("."))
			.map((e) => e.name);
	} catch {
		return [];
	}
}

/**
 * Skills 隔离策略：
 *
 * 旧实现：当应用侧传入 skills 数组时，把 settingSources 砍成 ["project"]，
 * 试图阻止用户级技能漂移。问题是 SDK 在 settingSources 不含 "user" 时，
 * 同时会忽略 ~/.claude/CLAUDE.md、~/.claude/agents、~/.claude/commands、
 * 用户级 hooks 等所有 user-scope 配置 —— 这正是 Claude Code CLI 默认会读到的、
 * "活人感"赖以存在的内容。
 *
 * 新策略：始终保留 settingSources（默认含 user + project）。skills 隔离靠
 * `syncSkillsToCwd` + project skills 目录过滤实现，不再用 settingSources 当大锤。
 *
 * 兼容：参数 `skillsFromInput` 保留以避免调用方爆炸，但不再影响返回值。
 */
export function resolveSkillSettingSources(
	settingSources: Array<"user" | "project" | "local">,
	_skillsFromInput: string[] | undefined,
): Array<"user" | "project" | "local"> {
	return settingSources;
}

// ---------------------------------------------------------------------------
// CLAUDE.md chain loader
// ---------------------------------------------------------------------------

const CLAUDE_MD_CANDIDATES = [
	"CLAUDE.md",
	"CLAUDE.local.md",
	".claude/CLAUDE.md",
];
const CLAUDE_MD_MAX_BYTES = 64 * 1024;

async function readClaudeMdAt(absDir: string): Promise<string[]> {
	const out: string[] = [];
	for (const rel of CLAUDE_MD_CANDIDATES) {
		const full = path.join(absDir, rel);
		try {
			const stat = await fsp.stat(full);
			if (!stat.isFile()) continue;
			const raw = await fsp.readFile(full, "utf8");
			const trimmed = raw.trim();
			if (!trimmed) continue;
			const sliced =
				trimmed.length > CLAUDE_MD_MAX_BYTES
					? `${trimmed.slice(0, CLAUDE_MD_MAX_BYTES)}\n\n[... truncated]`
					: trimmed;
			out.push(`# ${rel} (${absDir})\n\n${sliced}`);
		} catch {
			// missing or unreadable — skip silently
		}
	}
	return out;
}

/**
 * 主动读取项目 CLAUDE.md 链 + 用户级 CLAUDE.md，拼成可注入到 systemPrompt.append
 * 的纯文本块。Claude Code CLI 的 preset 会从 settingSources 自动注入这些内容，
 * 但为了防御性确保 CLAUDE.md 总是被看到（无论 settingSources/动态章节配置），
 * 我们在主进程显式读取并 append 一次。
 *
 * 顺序：~/.claude/CLAUDE.md → 项目 CLAUDE.md → 项目 CLAUDE.local.md → 项目 .claude/CLAUDE.md
 */
export async function loadClaudeMdChain(cwd: string): Promise<string> {
	const blocks: string[] = [];
	try {
		const home = os.homedir();
		if (home) {
			const homeClaudeDir = path.join(home, ".claude");
			const homeBlocks = await readClaudeMdAt(homeClaudeDir);
			blocks.push(...homeBlocks);
			// 也尝试 ~/CLAUDE.md（少见但合法）
			const homeRootBlocks = await readClaudeMdAt(home);
			blocks.push(...homeRootBlocks);
		}
	} catch {}
	try {
		if (cwd && cwd.trim()) {
			const cwdBlocks = await readClaudeMdAt(cwd);
			blocks.push(...cwdBlocks);
		}
	} catch {}
	if (blocks.length === 0) return "";
	return blocks.join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Directory & path expansion
// ---------------------------------------------------------------------------

export function expandHomePath(rawPath: string): string {
	const v = String(rawPath || "").trim();
	if (!v) return "";
	if (v === "~") return app.getPath("home");
	if (v.startsWith("~/")) return path.join(app.getPath("home"), v.slice(2));
	return v;
}

export async function resolveExistingDirectory(
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

export async function normalizeAdditionalDirectories(
	cwd: string,
	input: unknown,
): Promise<string[]> {
	if (!Array.isArray(input)) return [];
	const resolved = await Promise.all(
		input.map((item) => resolveExistingDirectory(String(item || ""), cwd)),
	);
	return uniqStrings(resolved.filter((item): item is string => Boolean(item)));
}

// ---------------------------------------------------------------------------
// Plugins
// ---------------------------------------------------------------------------

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

export async function normalizePlugins(
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

// ---------------------------------------------------------------------------
// Isolated Claude config mirror
// ---------------------------------------------------------------------------

const CLAUDE_CONFIG_RESOURCE_DIRS = [
	"agents",
	"commands",
	"output-styles",
	"plugins",
	"skills",
];

async function removeIfExists(targetPath: string): Promise<void> {
	await fsp.rm(targetPath, { recursive: true, force: true }).catch(() => {});
}

async function linkOrCopyDirectory(src: string, dest: string): Promise<void> {
	await removeIfExists(dest);
	try {
		await fsp.symlink(src, dest, "dir");
		return;
	} catch {
		// 某些打包/权限环境不允许 symlink，降级为复制。
	}
	await fsp.cp(src, dest, {
		recursive: true,
		dereference: true,
		errorOnExist: false,
		force: true,
	});
}

// 从用户 ~/.claude/settings.json 中剥除会干扰 App 内 Agent 运行的字段：
// - hooks: 外部 shell hooks 会导致 "Error in hook callback hook_1" 中断
// - env: 可能含有 ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN，会覆盖 App 的供应商配置
// - model: 会覆盖 App 通过 sdk.query options 传入的模型选择
// - apiKeyHelper: 外部脚本获取 API key，与 App 自身的 key 管理冲突
function stripExternalHooksFromSettings(
	settingsObj: unknown,
): Record<string, unknown> {
	const source =
		settingsObj && typeof settingsObj === "object"
			? { ...(settingsObj as Record<string, unknown>) }
			: {};
	delete source.hooks;
	delete source.env;
	delete source.model;
	delete source.apiKeyHelper;
	return source;
}

/**
 * 为 App 内 Agent 准备一份隔离的 Claude 配置目录。
 *
 * 直接把 CLAUDE_CONFIG_DIR 指到 ~/.claude 会让用户级 shell hooks 进入 SDK 子进程；
 * 这类外部 hook 一旦抛错，会让整轮 Agent 以 "Error in hook callback hook_1"
 * 中断。这里保留 agents / commands / skills 等资源，但从 settings.json 中移除
 * hooks，让应用内 Agent 的运行时稳定性不再受外部 hook 命令影响。
 */
export async function prepareIsolatedClaudeConfigDir(opts: {
	sourceClaudeConfigDir: string;
}): Promise<string> {
	const targetRoot = path.join(app.getPath("userData"), "claude-sdk-config");
	await fsp.mkdir(targetRoot, { recursive: true });

	const sourceSettingsPath = path.join(
		opts.sourceClaudeConfigDir,
		"settings.json",
	);
	const targetSettingsPath = path.join(targetRoot, "settings.json");
	let settingsObj: Record<string, unknown> = {};
	try {
		const raw = await fsp.readFile(sourceSettingsPath, "utf8");
		settingsObj = stripExternalHooksFromSettings(JSON.parse(raw));
	} catch {
		settingsObj = {};
	}
	await fsp.writeFile(
		targetSettingsPath,
		JSON.stringify(settingsObj, null, 2),
		"utf8",
	);

	for (const dirName of CLAUDE_CONFIG_RESOURCE_DIRS) {
		const src = path.join(opts.sourceClaudeConfigDir, dirName);
		const dest = path.join(targetRoot, dirName);
		try {
			const stat = await fsp.stat(src);
			if (!stat.isDirectory()) {
				await removeIfExists(dest);
				continue;
			}
			await linkOrCopyDirectory(src, dest);
		} catch {
			await removeIfExists(dest);
		}
	}

	return targetRoot;
}

// ---------------------------------------------------------------------------
// Claude config dir settings (API key approval)
// ---------------------------------------------------------------------------

export async function writeClaudeConfigSettings(opts: {
	claudeConfigDir: string;
	anthropicApiKey: string;
}): Promise<void> {
	const settingsPath = path.join(opts.claudeConfigDir, "settings.json");
	const approvedKey = opts.anthropicApiKey.slice(-20);

	let settingsObj: any = {};
	try {
		const raw = await fsp.readFile(settingsPath, "utf8");
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object") settingsObj = parsed;
	} catch {}

	if (!settingsObj.customApiKeyResponses)
		settingsObj.customApiKeyResponses = {};
	if (!Array.isArray(settingsObj.customApiKeyResponses.approved))
		settingsObj.customApiKeyResponses.approved = [];
	if (!Array.isArray(settingsObj.customApiKeyResponses.rejected))
		settingsObj.customApiKeyResponses.rejected = [];

	if (!settingsObj.customApiKeyResponses.approved.includes(approvedKey)) {
		settingsObj.customApiKeyResponses.approved.push(approvedKey);
	}

	await fsp.mkdir(path.dirname(settingsPath), { recursive: true });
	await fsp.writeFile(
		settingsPath,
		JSON.stringify(settingsObj, null, 2),
		"utf8",
	);
}
