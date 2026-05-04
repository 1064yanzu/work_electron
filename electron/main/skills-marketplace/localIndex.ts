/**
 * Local Marketplace Index
 *
 * 维护 ~/.claude/skills/.marketplace.json —— 已通过 marketplace 安装的 skill 元数据。
 * 文件以点开头，不会被 list_skills 当作 skill 子目录扫描。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getManagedSkillsRootDir } from "../ipc/handlers/skillRoots";
import type { InstalledRecord, LocalMarketplaceIndex } from "./types";

const INDEX_FILE = ".marketplace.json";

function indexPath() {
	return path.join(getManagedSkillsRootDir(), INDEX_FILE);
}

async function ensureRoot() {
	await fs.mkdir(getManagedSkillsRootDir(), { recursive: true });
}

const EMPTY: LocalMarketplaceIndex = { version: 1, installed: {} };

export async function loadLocalIndex(): Promise<LocalMarketplaceIndex> {
	try {
		const raw = await fs.readFile(indexPath(), "utf-8");
		const parsed = JSON.parse(raw) as Partial<LocalMarketplaceIndex>;
		if (parsed && parsed.version === 1 && parsed.installed) {
			return { version: 1, installed: parsed.installed };
		}
		return { ...EMPTY };
	} catch (e) {
		const code = (e as NodeJS.ErrnoException).code;
		if (code === "ENOENT") return { ...EMPTY };
		// 损坏文件不抛，回退空索引（保护用户已装的 skills）
		return { ...EMPTY };
	}
}

export async function saveLocalIndex(
	idx: LocalMarketplaceIndex,
): Promise<void> {
	await ensureRoot();
	const tmp = `${indexPath()}.tmp`;
	await fs.writeFile(tmp, JSON.stringify(idx, null, 2), "utf-8");
	await fs.rename(tmp, indexPath());
}

export async function upsertInstalledRecord(
	skillName: string,
	record: InstalledRecord,
): Promise<void> {
	const idx = await loadLocalIndex();
	idx.installed[skillName] = record;
	await saveLocalIndex(idx);
}

export async function removeInstalledRecord(skillName: string): Promise<void> {
	const idx = await loadLocalIndex();
	if (idx.installed[skillName]) {
		delete idx.installed[skillName];
		await saveLocalIndex(idx);
	}
}

export async function getInstalledRecord(
	skillName: string,
): Promise<InstalledRecord | null> {
	const idx = await loadLocalIndex();
	return idx.installed[skillName] ?? null;
}
