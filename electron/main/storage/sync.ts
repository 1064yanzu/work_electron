import fs from "node:fs/promises";
import path from "node:path";
import type {
	OutputAsset,
	Source,
	StorageSettings,
	Theme,
} from "../../shared/types";
import type { DbContext } from "../db/client";
import {
	backupDatabaseToVault,
	ensureVaultStructure,
	getStorageSettings,
	sanitizeFileStem,
	saveStorageSettings,
	slugifyName,
} from "./settings";

function quoteYaml(value: string): string {
	return JSON.stringify(value ?? "");
}

function renderStringList(items: string[]): string {
	if (items.length === 0) return "[]";
	return `\n${items.map((item) => `  - ${quoteYaml(item)}`).join("\n")}`;
}

function createFrontmatter(input: {
	id: string;
	title: string;
	scope: "global" | "project";
	projectId?: string;
	themes: string[];
	tags: string[];
	sourceType: string;
	createdAt: number;
	updatedAt: number;
	entityType: "source" | "output";
	kind?: string;
}): string {
	const projectValue = input.projectId ? quoteYaml(input.projectId) : "null";
	const kindLine = input.kind ? `kind: ${quoteYaml(input.kind)}\n` : "";
	return `---\nid: ${quoteYaml(input.id)}\ntitle: ${quoteYaml(input.title)}\nentity_type: ${quoteYaml(input.entityType)}\nscope: ${quoteYaml(input.scope)}\nproject_id: ${projectValue}\nthemes:${renderStringList(input.themes)}\ntags:${renderStringList(input.tags)}\nsource_type: ${quoteYaml(input.sourceType)}\n${kindLine}created_at: ${input.createdAt}\nupdated_at: ${input.updatedAt}\n---\n`;
}

async function getProjectSlug(
	db: DbContext,
	projectId?: string,
): Promise<string> {
	if (!projectId) return "unassigned";
	const rows = await db.client.execute({
		sql: "SELECT name FROM projects WHERE id = ? LIMIT 1",
		args: [projectId],
	});
	if (rows.rows.length === 0) return `project-${projectId.slice(0, 8)}`;
	const name = (rows.rows[0].name as string) || "project";
	return slugifyName(name);
}

async function getSourceThemes(
	db: DbContext,
	sourceId: string,
): Promise<Theme[]> {
	const rows = await db.client.execute({
		sql: `SELECT t.id, t.name, t.slug, t.created_at, t.updated_at
      FROM file_themes ft
      JOIN themes t ON t.id = ft.theme_id
      WHERE ft.source_id = ?
      ORDER BY t.name ASC`,
		args: [sourceId],
	});
	return rows.rows.map((row) => ({
		id: row.id as string,
		name: row.name as string,
		slug: row.slug as string,
		created_at: row.created_at as number,
		updated_at: row.updated_at as number,
	}));
}

async function resolveUniquePath(
	targetPath: string,
	settings: StorageSettings,
	existingPath?: string,
): Promise<string> {
	if (existingPath && path.resolve(existingPath) === path.resolve(targetPath)) {
		return targetPath;
	}

	try {
		await fs.access(targetPath);
	} catch {
		return targetPath;
	}

	if (settings.conflict_strategy === "prevent_overwrite") {
		throw new Error(`目标文件已存在: ${targetPath}`);
	}

	const ext = path.extname(targetPath);
	const base = targetPath.slice(0, targetPath.length - ext.length);
	let index = 2;
	while (true) {
		const candidate = `${base}-${index}${ext}`;
		try {
			await fs.access(candidate);
			index += 1;
		} catch {
			return candidate;
		}
	}
}

async function writeMarkdownFile(
	absolutePath: string,
	content: string,
): Promise<void> {
	await fs.mkdir(path.dirname(absolutePath), { recursive: true });
	await fs.writeFile(absolutePath, content, "utf-8");
}

export async function syncSourceToVault(
	db: DbContext,
	sourceId: string,
): Promise<string | null> {
	const settings = await getStorageSettings(db);
	await ensureVaultStructure(settings.vault_root);

	const sourceRows = await db.client.execute({
		sql: "SELECT * FROM sources WHERE id = ? LIMIT 1",
		args: [sourceId],
	});
	if (sourceRows.rows.length === 0) return null;

	const row = sourceRows.rows[0];
	if (Number(row.is_deleted ?? 0) === 1) return row.storage_path as string;

	let tags: string[] = [];
	try {
		tags = JSON.parse((row.tags as string) || "[]");
	} catch {
		tags = [];
	}

	const source: Source = {
		id: row.id as string,
		title: (row.title as string) || "未命名资料",
		kind: (row.kind as Source["kind"]) || "text",
		tags,
		scope: ((row.scope as string) || "global") as Source["scope"],
		url: row.url as string | undefined,
		project_id: row.project_id as string | undefined,
		folder_id: row.folder_id as string | undefined,
		source_type: (row.source_type as Source["source_type"]) || "manual",
		origin_type:
			(row.origin_type as Source["origin_type"]) ||
			(source_typeToOriginType((row.source_type as string) || "manual") as
				| "manual"
				| "web_clip"
				| "import"
				| "agent_output"),
		category: (row.category as Source["category"]) || "article",
		storage_path: row.storage_path as string | undefined,
		is_deleted: Number(row.is_deleted ?? 0) === 1,
		description: row.description as string | undefined,
		thumbnail: row.thumbnail as string | undefined,
		author: row.author as string | undefined,
		published_at: row.published_at as number | undefined,
		created_at: row.created_at as number,
		updated_at: row.updated_at as number,
	};

	const noteRows = await db.client.execute({
		sql: "SELECT content FROM notes WHERE source_id = ? ORDER BY updated_at DESC LIMIT 1",
		args: [sourceId],
	});
	const noteContent =
		noteRows.rows.length > 0 ? String(noteRows.rows[0].content || "") : "";

	const themes = await getSourceThemes(db, source.id);
	const themeNames = themes.map((theme) => theme.name);

	let relativeDir = "Global/Shared";
	if (themes.length > 0) {
		relativeDir = path.join("Themes", themes[0].slug);
	} else if (source.scope === "project" && source.project_id) {
		const projectSlug = await getProjectSlug(db, source.project_id);
		relativeDir = path.join("Projects", projectSlug, "Docs");
	} else if (source.source_type === "browser_clip") {
		relativeDir = "Global/WebClips";
	}

	const fileStem = `${sanitizeFileStem(source.title)}-${source.id.slice(0, 8)}`;
	const targetBasePath = path.join(
		settings.vault_root,
		relativeDir,
		`${fileStem}.md`,
	);
	const finalPath = await resolveUniquePath(
		targetBasePath,
		settings,
		source.storage_path,
	);

	const markdown = [
		createFrontmatter({
			id: source.id,
			title: source.title,
			scope: (source.scope || "global") as "global" | "project",
			projectId: source.project_id,
			themes: themeNames,
			tags: source.tags,
			sourceType: source.source_type || "manual",
			createdAt: source.created_at,
			updatedAt: source.updated_at,
			entityType: "source",
			kind: source.kind,
		}),
		noteContent || source.description || source.url || "",
	]
		.filter(Boolean)
		.join("\n\n");

	await writeMarkdownFile(finalPath, markdown);

	if (source.storage_path && source.storage_path !== finalPath) {
		try {
			await fs.unlink(source.storage_path);
		} catch {
			// ignore
		}
	}

	await db.client.execute({
		sql: "UPDATE sources SET storage_path = ? WHERE id = ?",
		args: [finalPath, source.id],
	});

	return finalPath;
}

function source_typeToOriginType(sourceType: string): string {
	if (sourceType === "browser_clip") return "web_clip";
	if (sourceType === "import") return "import";
	return "manual";
}

export async function syncOutputToVault(
	db: DbContext,
	outputId: string,
): Promise<string | null> {
	const settings = await getStorageSettings(db);
	await ensureVaultStructure(settings.vault_root);

	const rows = await db.client.execute({
		sql: "SELECT * FROM output_assets WHERE id = ? LIMIT 1",
		args: [outputId],
	});
	if (rows.rows.length === 0) return null;
	const row = rows.rows[0];
	if (Number(row.is_deleted ?? 0) === 1) return row.storage_path as string;

	// 设计产物（output_type=design）的 storage_path 直接指向 work_dir/index.html，
	// 不能像普通笔记/产物那样改写为 .md 文件再 unlink 原始 html —— 那会让 BrowserShell
	// 预览的 file:// 链路 404。Design 自有 export 流水线（design_export / finish_to_thread）
	// 负责把成果搬到 vault 或线程目录，sync 不重复参与。
	if ((row.output_type as string) === "design") {
		return (row.storage_path as string | undefined) ?? null;
	}

	let tags: string[] = [];
	try {
		tags = JSON.parse((row.tags as string) || "[]");
	} catch {
		tags = [];
	}

	const output: OutputAsset = {
		id: row.id as string,
		title: (row.title as string) || "未命名文档",
		content: (row.content as string) || "",
		output_type: row.output_type as OutputAsset["output_type"],
		related_notes: (() => {
			try {
				return JSON.parse((row.related_notes as string) || "[]");
			} catch {
				return [];
			}
		})(),
		scope: ((row.scope as string) || "project") as OutputAsset["scope"],
		tags,
		storage_path: row.storage_path as string | undefined,
		is_deleted: Number(row.is_deleted ?? 0) === 1,
		project_id: row.project_id as string | undefined,
		version: (row.version as number) || 1,
		created_at: row.created_at as number,
		updated_at: row.updated_at as number,
	};

	const relativeDir =
		output.scope === "project" && output.project_id
			? path.join(
					"Projects",
					await getProjectSlug(db, output.project_id),
					"Docs",
				)
			: "Global/Shared";
	const fileStem = `${sanitizeFileStem(output.title)}-${output.id.slice(0, 8)}`;
	const targetBasePath = path.join(
		settings.vault_root,
		relativeDir,
		`${fileStem}.md`,
	);
	const finalPath = await resolveUniquePath(
		targetBasePath,
		settings,
		output.storage_path,
	);

	const markdown = [
		createFrontmatter({
			id: output.id,
			title: output.title,
			scope: (output.scope || "project") as "global" | "project",
			projectId: output.project_id,
			themes: [],
			tags: output.tags || [],
			sourceType: "agent_output",
			createdAt: output.created_at,
			updatedAt: output.updated_at,
			entityType: "output",
			kind: output.output_type,
		}),
		output.content,
	]
		.filter(Boolean)
		.join("\n\n");

	await writeMarkdownFile(finalPath, markdown);

	if (output.storage_path && output.storage_path !== finalPath) {
		try {
			await fs.unlink(output.storage_path);
		} catch {
			// ignore
		}
	}

	await db.client.execute({
		sql: "UPDATE output_assets SET storage_path = ? WHERE id = ?",
		args: [finalPath, output.id],
	});

	return finalPath;
}

export async function moveFileToVaultTrash(
	db: DbContext,
	filePath?: string,
): Promise<string | null> {
	if (!filePath) return null;
	const settings = await getStorageSettings(db);
	const trashDir = path.join(settings.vault_root, ".ipo-workbench", "trash");
	await fs.mkdir(trashDir, { recursive: true });
	const targetPath = path.join(
		trashDir,
		`${Date.now()}-${sanitizeFileStem(path.basename(filePath))}`,
	);
	try {
		await fs.rename(filePath, targetPath);
		return targetPath;
	} catch {
		try {
			await fs.copyFile(filePath, targetPath);
			await fs.unlink(filePath);
			return targetPath;
		} catch {
			return null;
		}
	}
}

export async function migrateAllRecordsToVault(db: DbContext): Promise<{
	backup_path: string;
	sources: number;
	outputs: number;
}> {
	const settings = await getStorageSettings(db);
	await ensureVaultStructure(settings.vault_root);
	const backupPath = await backupDatabaseToVault(db, settings.vault_root);

	const sourceRows = await db.client.execute({
		sql: "SELECT id FROM sources WHERE is_deleted = 0",
		args: [],
	});
	let sourceCount = 0;
	for (const row of sourceRows.rows) {
		const id = row.id as string;
		await syncSourceToVault(db, id);
		sourceCount += 1;
	}

	const outputRows = await db.client.execute({
		sql: "SELECT id FROM output_assets WHERE is_deleted = 0",
		args: [],
	});
	let outputCount = 0;
	for (const row of outputRows.rows) {
		const id = row.id as string;
		await syncOutputToVault(db, id);
		outputCount += 1;
	}

	await saveStorageSettings(db, {
		...settings,
		last_migrated_at: Date.now(),
	});

	return {
		backup_path: backupPath,
		sources: sourceCount,
		outputs: outputCount,
	};
}
