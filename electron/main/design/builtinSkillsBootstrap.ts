/**
 * Bootstrap：把内置设计 skill 同步到用户的 `~/.claude/skills/ipo-...` 目录。
 *
 * 设计原则：
 *   - 幂等：基于 SKILL.md frontmatter 的 version，已是同版本则跳过
 *   - 用户优先：如果用户改过同名 skill（version 不一致且 isBuiltin=false），保留用户版
 *   - 标 isBuiltin：在 marketplace 索引里标记，让 SkillsView 区分"系统内置" vs "市场安装"
 *
 * 与 marketplace installer 不同的是：本流程不下载、不解压，直接从 extraResources/builtin-skills
 * （或开发模式下从源码）复制到目标目录。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getManagedSkillsRootDir } from "../ipc/handlers/skillRoots";
import {
	getInstalledRecord,
	upsertInstalledRecord,
} from "../skills-marketplace/localIndex";
import type { InstalledRecord } from "../skills-marketplace/types";
import {
	getDesignBuiltinSkillsRoot,
	getDesignTemplatesRoot,
} from "./resourcePaths";

interface BuiltinSkill {
	name: string;
	version: string;
	description: string;
	triggers: string[];
	dir: string;
}

const BUILTIN_SOURCE_ID = "ipo:builtin:design";

async function readSkillFrontmatter(skillDir: string): Promise<BuiltinSkill | null> {
	const skillFile = path.join(skillDir, "SKILL.md");
	let content: string;
	try {
		content = await fs.readFile(skillFile, "utf-8");
	} catch {
		return null;
	}

	const name = path.basename(skillDir);
	let version = "0.0.0";
	let description = "";
	let triggers: string[] = [];

	if (content.startsWith("---")) {
		const end = content.indexOf("\n---", 3);
		if (end !== -1) {
			const fm = content.slice(3, end);
			for (const rawLine of fm.split("\n")) {
				const line = rawLine.trim();
				const colon = line.indexOf(":");
				if (colon === -1) continue;
				const key = line.slice(0, colon).trim();
				const value = line.slice(colon + 1).trim();
				if (key === "version") version = value;
				else if (key === "description") description = value;
				else if (key === "triggers" && value.startsWith("[")) {
					triggers = value
						.slice(1, -1)
						.split(",")
						.map((s) => s.trim().replace(/^["']|["']$/g, ""))
						.filter(Boolean);
				}
			}
		}
	}

	return { name, version, description, triggers, dir: skillDir };
}

async function copyDir(src: string, dest: string): Promise<void> {
	await fs.mkdir(dest, { recursive: true });
	await fs.cp(src, dest, { recursive: true, force: true });
}

export interface BootstrapResult {
	installed: string[];
	skipped: string[];
	failed: Array<{ name: string; error: string }>;
}

export async function bootstrapDesignBuiltinSkills(): Promise<BootstrapResult> {
	const result: BootstrapResult = { installed: [], skipped: [], failed: [] };
	const sourceRoot = getDesignBuiltinSkillsRoot();

	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(sourceRoot, { withFileTypes: true });
	} catch (err) {
		console.warn(
			"[bootstrapDesignBuiltinSkills] source dir missing:",
			sourceRoot,
			err,
		);
		return result;
	}

	const targetRoot = getManagedSkillsRootDir();
	await fs.mkdir(targetRoot, { recursive: true });

	for (const ent of entries) {
		if (!ent.isDirectory()) continue;
		const skillName = ent.name;
		const srcDir = path.join(sourceRoot, skillName);

		try {
			const skillMeta = await readSkillFrontmatter(srcDir);
			if (!skillMeta) {
				result.failed.push({ name: skillName, error: "missing SKILL.md" });
				continue;
			}

			const existing = await getInstalledRecord(skillName);

			// 用户改过 (非内置且版本不同) 时不覆盖
			if (
				existing &&
				existing.sourceId !== BUILTIN_SOURCE_ID &&
				existing.version !== skillMeta.version
			) {
				result.skipped.push(skillName);
				continue;
			}

			// 同版本内置 → 跳过
			if (
				existing &&
				existing.sourceId === BUILTIN_SOURCE_ID &&
				existing.version === skillMeta.version
			) {
				result.skipped.push(skillName);
				continue;
			}

			const destDir = path.join(targetRoot, skillName);
			await copyDir(srcDir, destDir);

			const record: InstalledRecord = {
				sourceId: BUILTIN_SOURCE_ID,
				entryId: `${BUILTIN_SOURCE_ID}/${skillName}`,
				name: skillName,
				version: skillMeta.version,
				installedAt: Date.now(),
			};
			await upsertInstalledRecord(skillName, record);
			result.installed.push(skillName);
		} catch (err) {
			result.failed.push({
				name: skillName,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return result;
}

export async function listBuiltinSkills(): Promise<
	Array<{
		name: string;
		description: string;
		version: string;
		triggers: string[];
	}>
> {
	const sourceRoot = getDesignBuiltinSkillsRoot();
	let entries: import("node:fs").Dirent[];
	try {
		entries = await fs.readdir(sourceRoot, { withFileTypes: true });
	} catch {
		return [];
	}

	const out: Array<{
		name: string;
		description: string;
		version: string;
		triggers: string[];
	}> = [];

	for (const ent of entries) {
		if (!ent.isDirectory()) continue;
		const meta = await readSkillFrontmatter(path.join(sourceRoot, ent.name));
		if (meta) {
			out.push({
				name: meta.name,
				description: meta.description,
				version: meta.version,
				triggers: meta.triggers,
			});
		}
	}
	return out;
}

export const BUILTIN_DESIGN_SKILLS_SOURCE_ID = BUILTIN_SOURCE_ID;

export async function getTemplateHtml(templateId: string): Promise<{
	html: string;
	placeholders: string[];
}> {
	const templatesRoot = getDesignTemplatesRoot();
	const safe = templateId.replace(/[^\w-/]/g, "");
	// 支持子目录形态，如 "devices/iphone-15-pro"
	const filePath = path.join(templatesRoot, `${safe}.html`);
	const html = await fs.readFile(filePath, "utf-8");
	const placeholders = Array.from(html.matchAll(/\{\{\s*([\w-]+)\s*\}\}/g)).map(
		(m) => m[1],
	);
	return { html, placeholders: Array.from(new Set(placeholders)) };
}
