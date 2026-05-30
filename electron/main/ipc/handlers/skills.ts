import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { type IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import { getManagedSkillsRootDir } from "./skillRoots";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

type SkillMetadata = IPCSchema["list_skills"]["output"][number];

const KEY_POLICY_V2 = "skills.policy.v2_applied";

async function ensureDir(dir: string) {
	await fs.mkdir(dir, { recursive: true });
}

// -----------------------------------------------------------------------------
// Frontmatter 解析
//
// 仅做我们关心的字段，不引入额外依赖：
//   - 顶层 name / description（支持单行、双引号、`|` / `>` 块标量）
//   - od:
//       mode / category（用于 modeClass 分类）
// 失败一律回退 fallbackName + 空描述。
// -----------------------------------------------------------------------------

interface ParsedFrontmatter {
	name: string;
	description: string;
	odMode?: string;
	odCategory?: string;
}

function stripQuotes(s: string): string {
	const t = s.trim();
	if (
		(t.startsWith('"') && t.endsWith('"')) ||
		(t.startsWith("'") && t.endsWith("'"))
	) {
		return t.slice(1, -1);
	}
	return t;
}

function parseFrontmatter(md: string, fallbackName: string): ParsedFrontmatter {
	const trimmed = md.trim();
	if (!trimmed.startsWith("---")) {
		// 无 frontmatter，尝试用第一段 markdown 推断
		const lines = trimmed.split(/\r?\n/);
		const heading = lines.find((l) => /^#{1,2}\s+/.test(l.trim()));
		const name = heading
			? heading.replace(/^#{1,2}\s+/, "").trim() || fallbackName
			: fallbackName;
		return { name, description: "" };
	}

	const lines = md.split(/\r?\n/);
	const startIdx = lines.findIndex((l) => l.trim() === "---");
	const endIdx = lines.slice(startIdx + 1).findIndex((l) => l.trim() === "---");
	if (endIdx < 0) return { name: fallbackName, description: "" };
	const block = lines.slice(startIdx + 1, startIdx + 1 + endIdx);

	let name = fallbackName;
	let description = "";
	let odMode: string | undefined;
	let odCategory: string | undefined;

	let i = 0;
	while (i < block.length) {
		const line = block[i];
		// 顶层（无缩进）key
		const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
		if (!m) {
			i += 1;
			continue;
		}
		const key = m[1];
		const rest = m[2] ?? "";

		// 块标量 `|` / `>` 处理
		if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
			const collected: string[] = [];
			i += 1;
			while (i < block.length) {
				const next = block[i];
				if (next.length > 0 && !/^\s/.test(next)) break;
				collected.push(next.replace(/^\s+/, ""));
				i += 1;
			}
			const value = collected.join(rest.startsWith(">") ? " " : "\n").trim();
			if (key === "name") name = value || fallbackName;
			else if (key === "description") description = value;
			continue;
		}

		// 嵌套对象：`od:` 后跟带缩进的子项
		if (rest === "") {
			if (key === "od") {
				i += 1;
				while (i < block.length) {
					const next = block[i];
					if (next.length > 0 && !/^\s/.test(next)) break;
					const childMatch = next.match(/^\s+([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
					if (childMatch) {
						const childKey = childMatch[1];
						const childVal = stripQuotes(childMatch[2] ?? "");
						if (childKey === "mode" && childVal) odMode = childVal;
						else if (childKey === "category" && childVal) odCategory = childVal;
					}
					i += 1;
				}
				continue;
			}
			// 其他未知嵌套块：跳过
			i += 1;
			while (i < block.length && /^\s/.test(block[i])) i += 1;
			continue;
		}

		const value = stripQuotes(rest);
		if (key === "name") name = value || fallbackName;
		else if (key === "description") description = value;
		i += 1;
	}

	return { name, description, odMode, odCategory };
}

// -----------------------------------------------------------------------------
// 模式分类
//
// 规则：
//   1) frontmatter 显式声明了 od.mode：
//        utility / general → general
//        其余（prototype / deck / template / design-system / image / video /
//        audio / 3d / poster / ...）→ design
//   2) 未声明时按关键字启发判断；命中即 design，否则 general。
//      关键字来源：技能名 + 描述（小写后扫描）。
// -----------------------------------------------------------------------------

const DESIGN_MODE_KEYWORDS = [
	"design",
	"template",
	"deck",
	"slide",
	"slides",
	"ppt",
	"pptx",
	"poster",
	"mockup",
	"mascot",
	"figma",
	"theme",
	"palette",
	"color",
	"font",
	"typography",
	"illustration",
	"art",
	"editorial",
	"swiss",
	"brand",
	"motion",
	"animation",
	"animate",
	"cinema",
	"video",
	"gif",
	"image",
	"photo",
	"graphic",
	"visual",
	"sticker",
	"avatar",
	"music",
	"voice",
	"speech",
	"audio",
	"tts",
	"sora",
	"imagen",
	"shader",
	"3d",
	"lottie",
	"gsap",
	"three",
	"frontend",
	"figma-",
	"open-design",
];

const GENERAL_MODE_KEYWORDS_NAME = new Set([
	"agent-browser",
	"brainstorming",
	"claude-api",
	"claude-code-guide",
	"competitive-ads-extractor",
	"copywriting",
	"creative-director",
	"design-brief",
	"design-consultation",
	"domain-name-brainstormer",
	"electron",
	"enhance-prompt",
	"fewer-permission-prompts",
	"find-skills",
	"init",
	"keybindings-help",
	"loop",
	"marketing-psychology",
	"paywall-upgrade-cro",
	"react-performance-optimization",
	"replicate",
	"review",
	"security-review",
	"simplify",
	"taste-skill",
	"ui-skills",
	"update-config",
	"video-downloader",
	"web-design-guidelines",
	"youtube-clipper",
]);

function classifyMode(
	name: string,
	description: string,
	odMode?: string,
): "design" | "general" {
	if (odMode) {
		const m = odMode.toLowerCase().trim();
		if (m === "utility" || m === "general") return "general";
		return "design";
	}

	const lowerName = name.toLowerCase();
	if (GENERAL_MODE_KEYWORDS_NAME.has(lowerName)) return "general";

	const haystack = `${lowerName} ${description.toLowerCase()}`;
	for (const kw of DESIGN_MODE_KEYWORDS) {
		if (haystack.includes(kw)) return "design";
	}
	return "general";
}

function sanitizeDirName(name: string) {
	const cleaned = name
		.trim()
		.replace(/[\\/:"*?<>|]+/g, "-")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^\.+/, "")
		.slice(0, 80);
	return cleaned || `skill-${randomUUID().slice(0, 8)}`;
}

// -----------------------------------------------------------------------------
// app_config 读写
// -----------------------------------------------------------------------------

async function loadOverrideMap(db: DbContext): Promise<Map<string, boolean>> {
	const rows = await db.client.execute({
		sql: `SELECT key, value FROM app_config WHERE key LIKE 'skills.enabled.%'`,
		args: [],
	});
	const map = new Map<string, boolean>();
	for (const r of rows.rows as unknown as Array<{
		key: unknown;
		value: unknown;
	}>) {
		const k = String(r.key ?? "");
		const name = k.replace(/^skills\.enabled\./, "");
		if (!name) continue;
		const v = String(r.value ?? "1");
		map.set(name, v === "1" || v === "true");
	}
	return map;
}

async function readConfigBool(
	db: DbContext,
	key: string,
	fallback: boolean,
): Promise<boolean> {
	const rows = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ?`,
		args: [key],
	});
	if (rows.rows.length === 0) return fallback;
	const v = String((rows.rows[0] as unknown as { value: unknown }).value ?? "");
	return v === "1" || v === "true";
}

async function writeConfig(db: DbContext, key: string, value: string) {
	const ts = Date.now();
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [key, value, ts],
	});
}

async function setSkillEnabledInDb(
	db: DbContext,
	name: string,
	enabled: boolean,
) {
	await writeConfig(db, `skills.enabled.${name}`, enabled ? "1" : "0");
}

async function clearAllOverrides(db: DbContext) {
	await db.client.execute({
		sql: `DELETE FROM app_config WHERE key LIKE 'skills.enabled.%'`,
		args: [],
	});
}

/**
 * 一次性迁移：把"默认 112 全开"的旧行为重置为"按 modeClass 决定"。
 * 触发后清空所有 skills.enabled.* override，并打 v2 flag 防止重复执行。
 * 用户的"我手动开过 X"在迁移前的语义和迁移后不同，因此一次性清空是符合用户意图的。
 */
async function ensurePolicyV2Migrated(db: DbContext) {
	const applied = await readConfigBool(db, KEY_POLICY_V2, false);
	if (applied) return;
	await clearAllOverrides(db);
	await writeConfig(db, KEY_POLICY_V2, "1");
}

// -----------------------------------------------------------------------------
// 计算有效启用状态
// -----------------------------------------------------------------------------

function computeEffectiveEnabled(override: boolean | undefined): {
	enabled: boolean;
	userOverride: boolean;
} {
	if (typeof override === "boolean") {
		return { enabled: override, userOverride: true };
	}
	return { enabled: true, userOverride: false };
}

// -----------------------------------------------------------------------------
// Handler 工厂
// -----------------------------------------------------------------------------

export function createSkillsHandlers(db: DbContext) {
	async function collectSkillsFromDir(
		dir: string,
		overrideMap: Map<string, boolean>,
	): Promise<SkillMetadata[]> {
		const results: SkillMetadata[] = [];
		let entries: Dirent[];
		try {
			entries = (await fs.readdir(dir, { withFileTypes: true })) as Dirent[];
		} catch {
			return results;
		}

		for (const ent of entries) {
			// 同时支持真实目录和符号链接（symlink 指向目录），
			// ent.isDirectory() 对 symlink 返回 false，需用 fs.stat 跟随链接确认。
			if (!ent.isDirectory() && !ent.isSymbolicLink()) continue;
			const entryName = String(ent.name);
			const location = path.join(dir, entryName);
			if (ent.isSymbolicLink()) {
				try {
					const st = await fs.stat(location); // 跟随 symlink
					if (!st.isDirectory()) continue;
				} catch {
					continue; // 断链或无权限，跳过
				}
			}
			const skillMd = path.join(location, "SKILL.md");
			try {
				const md = await fs.readFile(skillMd, "utf-8");
				const parsed = parseFrontmatter(md, entryName);
				const modeClass = classifyMode(
					parsed.name,
					parsed.description,
					parsed.odMode,
				);
				const override = overrideMap.get(parsed.name);
				const { enabled, userOverride } = computeEffectiveEnabled(override);
				results.push({
					name: parsed.name,
					description: parsed.description,
					location,
					enabled,
					modeClass,
					modeTag: parsed.odMode,
					userOverride,
				});
			} catch {
				// 没有 SKILL.md 的目录视为非 skill，跳过
			}
		}

		return results;
	}

	const list_skills: Handler<"list_skills"> = async () => {
		await ensurePolicyV2Migrated(db);
		const overrideMap = await loadOverrideMap(db);
		const managedRoot = getManagedSkillsRootDir();
		try {
			await ensureDir(managedRoot);
		} catch {
			// noop
		}

		const skills = await collectSkillsFromDir(managedRoot, overrideMap);
		skills.sort((a, b) => a.name.localeCompare(b.name));
		return skills;
	};

	const import_skill: Handler<"import_skill"> = async (_event, input) => {
		const sourcePath = String(input.sourcePath ?? "").trim();
		if (!sourcePath) throw new Error("sourcePath 不能为空");

		const stat = await fs.stat(sourcePath);
		if (!stat.isDirectory()) throw new Error("sourcePath 必须是目录");

		const skillMdPath = path.join(sourcePath, "SKILL.md");
		const md = await fs.readFile(skillMdPath, "utf-8");
		const parsed = parseFrontmatter(md, path.basename(sourcePath));

		const root = getManagedSkillsRootDir();
		await ensureDir(root);

		const destName = sanitizeDirName(parsed.name || path.basename(sourcePath));
		const destDir = path.join(root, destName);

		let destExists = false;
		try {
			await fs.access(destDir);
			destExists = true;
		} catch {
			// ENOENT：目标目录不存在，正常继续
		}

		if (destExists) {
			// 幂等：skill 已存在于 managedRoot，读取现有元数据返回，不再报错。
			// 这样拖拽重复导入时前端能正常刷新列表，不会出现"明明存在却不显示"的问题。
			const existingMdPath = path.join(destDir, "SKILL.md");
			let existingMd = "";
			try {
				existingMd = await fs.readFile(existingMdPath, "utf-8");
			} catch {
				// SKILL.md 不可读时降级用目录名
			}
			const existingParsed = existingMd
				? parseFrontmatter(existingMd, destName)
				: { name: destName, description: "", odMode: undefined, odCategory: undefined };
			const overrideMap = await loadOverrideMap(db);
			const override = overrideMap.get(existingParsed.name);
			const { enabled, userOverride } = computeEffectiveEnabled(override);
			return {
				name: existingParsed.name,
				description: existingParsed.description,
				location: destDir,
				enabled,
				modeClass: classifyMode(existingParsed.name, existingParsed.description, existingParsed.odMode),
				modeTag: existingParsed.odMode,
				userOverride,
			};
		}

		await fs.cp(sourcePath, destDir, {
			recursive: true,
			dereference: true,
			errorOnExist: true,
		});

		const modeClass = classifyMode(
			parsed.name,
			parsed.description,
			parsed.odMode,
		);
		const { enabled, userOverride } = computeEffectiveEnabled(undefined);

		return {
			name: parsed.name,
			description: parsed.description,
			location: destDir,
			enabled,
			modeClass,
			modeTag: parsed.odMode,
			userOverride,
		};
	};

	const delete_skill: Handler<"delete_skill"> = async (_event, input) => {
		const skillName = String(input.skillName ?? "").trim();
		if (!skillName) throw new Error("skillName 不能为空");

		const skills = await list_skills({} as IpcMainInvokeEvent, {});
		const target = skills.find((s) => s.name === skillName);
		if (!target) return { success: true };

		await fs.rm(target.location, { recursive: true, force: true });
		// 删除时清除 override，避免重新安装后被旧 override 重新点亮
		await db.client.execute({
			sql: `DELETE FROM app_config WHERE key = ?`,
			args: [`skills.enabled.${skillName}`],
		});
		return { success: true };
	};

	const set_skill_enabled: Handler<"set_skill_enabled"> = async (
		_event,
		input,
	) => {
		const skillName = String(input.skillName ?? "").trim();
		if (!skillName) throw new Error("skillName 不能为空");
		await setSkillEnabledInDb(db, skillName, Boolean(input.enabled));
		return { success: true };
	};

	return {
		list_skills,
		import_skill,
		delete_skill,
		set_skill_enabled,
	};
}
