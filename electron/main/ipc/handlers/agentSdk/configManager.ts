/**
 * configManager.ts
 *
 * Configuration, normalization, and skill/directory helpers for the Agent SDK.
 * Includes shell PATH resolution, settings normalizers, skill syncing,
 * directory resolution, and plugin normalization.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";

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
	return "auto:5";
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
// Skills home directory & sync
// ---------------------------------------------------------------------------

export function getHomeSkillsRootDir() {
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
 * Compare SKILL.md modification times between source and destination.
 * Returns true if source is newer than dest (or dest doesn't exist).
 */
async function isSkillNewer(
	srcDir: string,
	destDir: string,
): Promise<boolean> {
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
) {
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
		stderr(`[agent_sdk_start] Home skills dir not found: ${srcRoot}`);
		return;
	}

	const dirEntries = entries.filter((e) => e.isDirectory());
	stderr(
		`[agent_sdk_start] Syncing skills: src=${srcRoot} -> dest=${destRoot} (dirs=${dirEntries.length})`,
	);

	let newCount = 0;
	let updatedCount = 0;

	for (const ent of dirEntries) {
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

	if (newCount > 0 || updatedCount > 0) {
		stderr(
			`[agent_sdk_start] Skills sync complete: ${newCount} new, ${updatedCount} updated`,
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
