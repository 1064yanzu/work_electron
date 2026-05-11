import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import { app, type IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import { getManagedSkillsRootDir } from "./skillRoots";

/**
 * 额外扫描的只读 Skill 仓库（plugin 市场已安装的 skills）。
 * 这些 skill 由 Claude Code plugins 体系管理，本应用只读取并允许启用/禁用，
 * 不允许通过本面板删除或移动。
 */
function getReadonlySkillRoots(): string[] {
	const home = app.getPath("home");
	return [path.join(home, ".claude", "plugins", "marketplaces")];
}

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

type SkillMetadata = IPCSchema["list_skills"]["output"][number];

async function ensureDir(dir: string) {
	await fs.mkdir(dir, { recursive: true });
}

function parseSkillMetadataFromMarkdown(
	md: string,
	fallbackName: string,
): Pick<SkillMetadata, "name" | "description"> {
	const trimmed = md.trim();
	if (!trimmed) return { name: fallbackName, description: "" };

	const lines = trimmed.split(/\r?\n/);
	const frontmatterStart = lines[0]?.trim() === "---";
	if (frontmatterStart) {
		const endIdx = lines.slice(1).findIndex((l) => l.trim() === "---");
		if (endIdx >= 0) {
			const fmLines = lines.slice(1, endIdx + 1);
			const kv = new Map<string, string>();
			for (const l of fmLines) {
				const m = l.match(/^([A-Za-z0-9_-]+)\s*:\s*(.+)\s*$/);
				if (!m) continue;
				const key = m[1].toLowerCase();
				let value = m[2] ?? "";
				value = value.replace(/^['"]|['"]$/g, "").trim();
				kv.set(key, value);
			}
			const name = kv.get("name") || fallbackName;
			const description = kv.get("description") || "";
			return { name, description };
		}
	}

	const heading = lines.find((l) => /^#{1,2}\s+/.test(l.trim()));
	let name = fallbackName;
	if (heading) {
		name = heading.replace(/^#{1,2}\s+/, "").trim() || fallbackName;
	}

	const firstParagraphLines: string[] = [];
	let started = false;
	for (const l of lines) {
		const t = l.trim();
		if (!started) {
			if (!t) continue;
			if (/^#{1,6}\s+/.test(t)) continue;
			started = true;
		}
		if (!t) break;
		firstParagraphLines.push(t);
	}

	return { name, description: firstParagraphLines.join(" ").trim() };
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

async function loadEnabledMap(db: DbContext): Promise<Map<string, boolean>> {
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

async function setSkillEnabledInDb(
	db: DbContext,
	name: string,
	enabled: boolean,
) {
	const key = `skills.enabled.${name}`;
	const timestamp = Date.now();
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [key, enabled ? "1" : "0", timestamp],
	});
}

export function createSkillsHandlers(db: DbContext) {
	async function collectSkillsFromDir(
		dir: string,
		enabledMap: Map<string, boolean>,
		options: { readonly: boolean },
	): Promise<SkillMetadata[]> {
		const results: SkillMetadata[] = [];
		let entries: Dirent[];
		try {
			entries = (await fs.readdir(dir, { withFileTypes: true })) as Dirent[];
		} catch {
			return results;
		}

		for (const ent of entries) {
			if (!ent.isDirectory()) continue;
			const entryName = String(ent.name);
			const location = path.join(dir, entryName);
			const skillMd = path.join(location, "SKILL.md");
			try {
				const md = await fs.readFile(skillMd, "utf-8");
				const parsed = parseSkillMetadataFromMarkdown(md, entryName);
				const enabled = enabledMap.get(parsed.name) ?? true;
				results.push({
					name: parsed.name,
					description: parsed.description,
					location,
					enabled,
					...(options.readonly ? { readonly: true } : null),
				} as SkillMetadata);
			} catch {
				// 没有 SKILL.md 的目录视为非 skill，递归一层看是否是 plugin 容器
				if (!options.readonly) continue;
				const nested = await collectSkillsFromDir(location, enabledMap, options);
				results.push(...nested);
			}
		}

		return results;
	}

	const list_skills: Handler<"list_skills"> = async () => {
		const enabledMap = await loadEnabledMap(db);
		const managedRoot = getManagedSkillsRootDir();
		try {
			await ensureDir(managedRoot);
		} catch {
			// noop —— 不影响只读路径扫描
		}

		const collected = new Map<string, SkillMetadata>();

		// 1) 用户托管目录（可读写）
		const managedSkills = await collectSkillsFromDir(managedRoot, enabledMap, {
			readonly: false,
		});
		for (const skill of managedSkills) {
			collected.set(skill.name, skill);
		}

		// 2) 只读仓库（plugin 市场已安装的 skills），同名不覆盖托管目录
		for (const root of getReadonlySkillRoots()) {
			let subdirs: Dirent[];
			try {
				subdirs = (await fs.readdir(root, {
					withFileTypes: true,
				})) as Dirent[];
			} catch {
				continue;
			}
			for (const ent of subdirs) {
				if (!ent.isDirectory()) continue;
				// plugin 市场的结构：<marketplace>/plugins/<plugin>/skills/<skill>
				const pluginsDir = path.join(root, String(ent.name), "plugins");
				let plugins: Dirent[];
				try {
					plugins = (await fs.readdir(pluginsDir, {
						withFileTypes: true,
					})) as Dirent[];
				} catch {
					continue;
				}
				for (const plugin of plugins) {
					if (!plugin.isDirectory()) continue;
					const skillsDir = path.join(
						pluginsDir,
						String(plugin.name),
						"skills",
					);
					const found = await collectSkillsFromDir(skillsDir, enabledMap, {
						readonly: true,
					});
					for (const skill of found) {
						if (!collected.has(skill.name)) collected.set(skill.name, skill);
					}
				}
			}
		}

		const skills = [...collected.values()];
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
		const parsed = parseSkillMetadataFromMarkdown(
			md,
			path.basename(sourcePath),
		);

		const root = getManagedSkillsRootDir();
		await ensureDir(root);

		const destName = sanitizeDirName(parsed.name || path.basename(sourcePath));
		const destDir = path.join(root, destName);

		try {
			await fs.access(destDir);
			throw new Error(`技能已存在: ${destName}`);
		} catch {}

		await fs.cp(sourcePath, destDir, {
			recursive: true,
			dereference: true,
			errorOnExist: true,
		});

		return {
			name: parsed.name,
			description: parsed.description,
			location: destDir,
			enabled: true,
		};
	};

	const delete_skill: Handler<"delete_skill"> = async (_event, input) => {
		const skillName = String(input.skillName ?? "").trim();
		if (!skillName) throw new Error("skillName 不能为空");

		const skills = await list_skills({} as IpcMainInvokeEvent, {});
		const target = skills.find((s) => s.name === skillName);
		if (!target) return { success: true };

		if ((target as { readonly?: boolean }).readonly) {
			throw new Error(
				"该技能由 Claude 插件市场管理，请在源插件处卸载，不能从此处删除",
			);
		}

		await fs.rm(target.location, { recursive: true, force: true });
		await setSkillEnabledInDb(db, skillName, false);
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
