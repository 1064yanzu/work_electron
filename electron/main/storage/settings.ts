import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { StorageSettings } from "../../shared/types";
import type { DbContext } from "../db/client";

export const STORAGE_SETTINGS_KEY = "storage_settings";
const DEFAULT_VAULT_DIR_NAME = "IPO-Workbench-Vault";

export function getDefaultVaultRoot(): string {
	return path.join(app.getPath("documents"), DEFAULT_VAULT_DIR_NAME);
}

export function getDefaultStorageSettings(): StorageSettings {
	return {
		vault_root: getDefaultVaultRoot(),
		obsidian_frontmatter: true,
		obsidian_wiki_links: true,
		conflict_strategy: "append_suffix",
	};
}

function toBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (["1", "true", "yes", "on"].includes(normalized)) return true;
		if (["0", "false", "no", "off"].includes(normalized)) return false;
	}
	return fallback;
}

function normalizeConflictStrategy(
	value: unknown,
): StorageSettings["conflict_strategy"] {
	return value === "prevent_overwrite" ? "prevent_overwrite" : "append_suffix";
}

async function readConfigValue(
	db: DbContext,
	key: string,
): Promise<string | null> {
	const rows = await db.client.execute({
		sql: "SELECT value FROM app_config WHERE key = ?",
		args: [key],
	});
	if (rows.rows.length === 0) return null;
	return (rows.rows[0].value as string) || null;
}

async function writeConfigValue(
	db: DbContext,
	key: string,
	value: string,
): Promise<void> {
	const timestamp = Date.now();
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [key, value, timestamp],
	});
}

export async function ensureVaultStructure(vaultRoot: string): Promise<void> {
	const directories = [
		"Projects",
		"Global/WebClips",
		"Global/Shared",
		"Themes",
		".ipo-workbench/meta",
		".ipo-workbench/backup",
		".ipo-workbench/trash",
	];

	await fs.mkdir(vaultRoot, { recursive: true });
	for (const rel of directories) {
		await fs.mkdir(path.join(vaultRoot, rel), { recursive: true });
	}
}

export async function assertDirectoryWritable(dirPath: string): Promise<void> {
	if (!path.isAbsolute(dirPath)) {
		throw new Error("vault_root 必须是绝对路径");
	}
	await fs.mkdir(dirPath, { recursive: true });
	const probeDir = path.join(dirPath, ".ipo-workbench");
	await fs.mkdir(probeDir, { recursive: true });
	const probePath = path.join(probeDir, `.write-test-${Date.now()}`);
	await fs.writeFile(probePath, "ok", "utf-8");
	await fs.unlink(probePath);
}

export async function getStorageSettings(db: DbContext): Promise<StorageSettings> {
	const defaults = getDefaultStorageSettings();
	const raw = await readConfigValue(db, STORAGE_SETTINGS_KEY);
	if (!raw) {
		await ensureVaultStructure(defaults.vault_root);
		await writeConfigValue(db, STORAGE_SETTINGS_KEY, JSON.stringify(defaults));
		return defaults;
	}

	try {
		const parsed = JSON.parse(raw) as Partial<StorageSettings>;
		const merged: StorageSettings = {
			vault_root:
				typeof parsed.vault_root === "string" && parsed.vault_root.trim()
					? parsed.vault_root
					: defaults.vault_root,
			obsidian_frontmatter: toBoolean(
				parsed.obsidian_frontmatter,
				defaults.obsidian_frontmatter,
			),
			obsidian_wiki_links: toBoolean(
				parsed.obsidian_wiki_links,
				defaults.obsidian_wiki_links,
			),
			conflict_strategy: normalizeConflictStrategy(parsed.conflict_strategy),
			last_migrated_at:
				typeof parsed.last_migrated_at === "number"
					? parsed.last_migrated_at
					: undefined,
		};
		await ensureVaultStructure(merged.vault_root);
		return merged;
	} catch {
		await ensureVaultStructure(defaults.vault_root);
		await writeConfigValue(db, STORAGE_SETTINGS_KEY, JSON.stringify(defaults));
		return defaults;
	}
}

export async function saveStorageSettings(
	db: DbContext,
	settings: StorageSettings,
): Promise<void> {
	await writeConfigValue(db, STORAGE_SETTINGS_KEY, JSON.stringify(settings));
}

export async function updateStorageSettings(
	db: DbContext,
	updates: Partial<StorageSettings>,
): Promise<StorageSettings> {
	const current = await getStorageSettings(db);
	const next: StorageSettings = {
		...current,
		...(updates.vault_root !== undefined
			? { vault_root: String(updates.vault_root || "").trim() }
			: {}),
		...(updates.obsidian_frontmatter !== undefined
			? { obsidian_frontmatter: Boolean(updates.obsidian_frontmatter) }
			: {}),
		...(updates.obsidian_wiki_links !== undefined
			? { obsidian_wiki_links: Boolean(updates.obsidian_wiki_links) }
			: {}),
		...(updates.conflict_strategy !== undefined
			? { conflict_strategy: normalizeConflictStrategy(updates.conflict_strategy) }
			: {}),
		...(updates.last_migrated_at !== undefined
			? { last_migrated_at: updates.last_migrated_at }
			: {}),
	};

	if (!next.vault_root) {
		throw new Error("vault_root 不能为空");
	}

	await assertDirectoryWritable(next.vault_root);
	await ensureVaultStructure(next.vault_root);
	await saveStorageSettings(db, next);
	return next;
}

export async function backupDatabaseToVault(
	db: DbContext,
	vaultRoot: string,
): Promise<string> {
	const backupDir = path.join(vaultRoot, ".ipo-workbench", "backup");
	await fs.mkdir(backupDir, { recursive: true });
	const backupPath = path.join(backupDir, `db-${Date.now()}.sqlite`);
	await fs.copyFile(db.filePath, backupPath);
	return backupPath;
}

export function slugifyName(input: string): string {
	const normalized = String(input || "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "untitled";
}

export function sanitizeFileStem(input: string): string {
	const cleaned = String(input || "")
		.trim()
		.replace(/[\\/:*?"<>|]/g, "-")
		.replace(/\s+/g, " ")
		.slice(0, 80)
		.trim();
	return cleaned || "untitled";
}
