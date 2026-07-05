import { randomUUID } from "node:crypto";
import { shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { FileRecord, Theme } from "../../../shared/types";
import type { DbContext } from "../../db/client";
import { slugifyName } from "../../storage/settings";
import {
	moveFileToVaultTrash,
	syncOutputToVault,
	syncSourceToVault,
} from "../../storage/sync";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

type SourceRow = Record<string, unknown>;
type OutputRow = Record<string, unknown>;

function parseJsonArray(raw: unknown): string[] {
	if (typeof raw !== "string" || !raw.trim()) return [];
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) {
			return parsed.map((item) => String(item)).filter(Boolean);
		}
	} catch {
		// ignore
	}
	return [];
}

function toNumber(value: unknown, fallback = 0): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseSourceRowToFileRecord(
	row: SourceRow,
	themes: string[],
): FileRecord {
	return {
		id: row.id as string,
		entity_type: "source",
		title: (row.title as string) || "未命名资料",
		scope: ((row.scope as string) || "global") as FileRecord["scope"],
		project_id: (row.project_id as string) || undefined,
		tags: parseJsonArray(row.tags),
		themes,
		storage_path: (row.storage_path as string) || undefined,
		origin_type: ((row.origin_type as string) ||
			"manual") as FileRecord["origin_type"],
		source_type: (row.source_type as FileRecord["source_type"]) || "manual",
		updated_at: toNumber(row.updated_at),
		created_at: toNumber(row.created_at),
		is_deleted: toNumber(row.is_deleted) === 1,
	};
}

function parseOutputRowToFileRecord(row: OutputRow): FileRecord {
	return {
		id: row.id as string,
		entity_type: "output",
		title: (row.title as string) || "未命名文档",
		scope: ((row.scope as string) || "project") as FileRecord["scope"],
		project_id: (row.project_id as string) || undefined,
		tags: parseJsonArray(row.tags),
		themes: [],
		storage_path: (row.storage_path as string) || undefined,
		origin_type: "agent_output",
		output_type: row.output_type as FileRecord["output_type"],
		updated_at: toNumber(row.updated_at),
		created_at: toNumber(row.created_at),
		is_deleted: toNumber(row.is_deleted) === 1,
	};
}

async function getSourceThemesMap(
	db: DbContext,
	sourceIds: string[],
): Promise<Map<string, string[]>> {
	if (sourceIds.length === 0) return new Map();
	const placeholders = sourceIds.map(() => "?").join(",");
	const rows = await db.client.execute({
		sql: `SELECT ft.source_id, t.name
      FROM file_themes ft
      JOIN themes t ON t.id = ft.theme_id
      WHERE ft.source_id IN (${placeholders})
      ORDER BY t.name ASC`,
		args: sourceIds,
	});
	const map = new Map<string, string[]>();
	for (const row of rows.rows) {
		const sourceId = row.source_id as string;
		const name = row.name as string;
		const list = map.get(sourceId) || [];
		list.push(name);
		map.set(sourceId, list);
	}
	return map;
}

function hasAllTokens(target: string[], expected: string[]): boolean {
	if (expected.length === 0) return true;
	const set = new Set(target.map((item) => item.toLowerCase()));
	return expected.every((token) => set.has(token.toLowerCase()));
}

async function listSourceFiles(
	db: DbContext,
	input: IPCSchema["file_list"]["input"],
): Promise<FileRecord[]> {
	let sql = "SELECT * FROM sources WHERE 1=1";
	const args: (string | number)[] = [];
	if (!input.include_deleted) {
		sql += " AND is_deleted = 0";
	}
	if (input.project_id) {
		sql += " AND (scope = 'global' OR project_id = ?)";
		args.push(input.project_id);
	}
	if (input.scope) {
		sql += " AND scope = ?";
		args.push(input.scope);
	}
	sql += " ORDER BY updated_at DESC";

	const rows = await db.client.execute({ sql, args });
	const sourceIds = rows.rows.map((row) => row.id as string);
	const themeMap = await getSourceThemesMap(db, sourceIds);

	let result = rows.rows.map((row) =>
		parseSourceRowToFileRecord(
			row as SourceRow,
			themeMap.get(row.id as string) || [],
		),
	);

	if (input.tags && input.tags.length > 0) {
		result = result.filter((record) =>
			hasAllTokens(record.tags, input.tags || []),
		);
	}
	if (input.themes && input.themes.length > 0) {
		result = result.filter((record) =>
			hasAllTokens(record.themes, input.themes || []),
		);
	}

	return result;
}

async function listOutputFiles(
	db: DbContext,
	input: IPCSchema["file_list"]["input"],
): Promise<FileRecord[]> {
	let sql = "SELECT * FROM output_assets WHERE 1=1";
	const args: (string | number)[] = [];
	if (!input.include_deleted) {
		sql += " AND is_deleted = 0";
	}
	if (input.project_id) {
		sql += " AND (scope = 'global' OR project_id = ?)";
		args.push(input.project_id);
	}
	if (input.scope) {
		sql += " AND scope = ?";
		args.push(input.scope);
	}
	sql += " ORDER BY updated_at DESC";

	const rows = await db.client.execute({ sql, args });
	let result = rows.rows.map((row) =>
		parseOutputRowToFileRecord(row as OutputRow),
	);

	if (input.tags && input.tags.length > 0) {
		result = result.filter((record) =>
			hasAllTokens(record.tags, input.tags || []),
		);
	}
	return result;
}

async function fetchSingleRecord(
	db: DbContext,
	entityType: "source" | "output",
	id: string,
): Promise<FileRecord | null> {
	const list =
		entityType === "source"
			? await listSourceFiles(db, {
					entity_type: "source",
					include_deleted: true,
				})
			: await listOutputFiles(db, {
					entity_type: "output",
					include_deleted: true,
				});
	return list.find((record) => record.id === id) || null;
}

async function setSourceTheme(
	db: DbContext,
	sourceId: string,
	themeId: string,
): Promise<void> {
	await db.client.execute({
		sql: `INSERT OR IGNORE INTO file_themes (source_id, theme_id, created_at)
      VALUES (?, ?, ?)`,
		args: [sourceId, themeId, Date.now()],
	});
}

export function createFileHandlers(db: DbContext) {
	const file_list: Handler<"file_list"> = async (_event, input) => {
		const mode = input.entity_type || "all";
		const sourceRecords =
			mode === "output" ? [] : await listSourceFiles(db, input);
		const outputRecords =
			mode === "source" ? [] : await listOutputFiles(db, input);
		return [...sourceRecords, ...outputRecords].sort(
			(a, b) => b.updated_at - a.updated_at,
		);
	};

	const file_move: Handler<"file_move"> = async (_event, input) => {
		const entityType = input.entity_type || "source";
		if (entityType === "source") {
			const row = await db.client.execute({
				sql: "SELECT * FROM sources WHERE id = ? LIMIT 1",
				args: [input.id],
			});
			if (row.rows.length === 0) throw new Error("资料不存在");
			const now = Date.now();
			let scope = (row.rows[0].scope as string) || "global";
			let projectId = (row.rows[0].project_id as string | null) || null;
			let sourceType = (row.rows[0].source_type as string) || "manual";

			switch (input.destination) {
				case "project_docs":
					scope = "project";
					projectId = input.project_id || projectId;
					if (!projectId) {
						throw new Error("移动到项目目录时 project_id 必填");
					}
					break;
				case "global_shared":
					scope = "global";
					projectId = null;
					break;
				case "global_webclips":
					scope = "global";
					projectId = null;
					sourceType = "browser_clip";
					break;
				case "theme":
					if (!input.theme_id) {
						throw new Error("移动到主题目录时 theme_id 必填");
					}
					await setSourceTheme(db, input.id, input.theme_id);
					scope = "global";
					projectId = null;
					break;
				default:
					break;
			}

			await db.client.execute({
				sql: "UPDATE sources SET scope = ?, project_id = ?, source_type = ?, updated_at = ? WHERE id = ?",
				args: [scope, projectId, sourceType, now, input.id],
			});
			await syncSourceToVault(db, input.id);
		} else {
			const row = await db.client.execute({
				sql: "SELECT * FROM output_assets WHERE id = ? LIMIT 1",
				args: [input.id],
			});
			if (row.rows.length === 0) throw new Error("文档不存在");
			const now = Date.now();
			let scope = (row.rows[0].scope as string) || "project";
			let projectId = (row.rows[0].project_id as string | null) || null;

			switch (input.destination) {
				case "project_docs":
					scope = "project";
					projectId = input.project_id || projectId;
					if (!projectId) throw new Error("移动到项目目录时 project_id 必填");
					break;
				case "global_shared":
				case "global_webclips":
				case "theme":
					scope = "global";
					projectId = null;
					break;
				default:
					break;
			}

			await db.client.execute({
				sql: "UPDATE output_assets SET scope = ?, project_id = ?, updated_at = ? WHERE id = ?",
				args: [scope, projectId, now, input.id],
			});
			await syncOutputToVault(db, input.id);
		}

		const record = await fetchSingleRecord(db, entityType, input.id);
		if (!record) throw new Error("文件不存在");
		return record;
	};

	const file_delete: Handler<"file_delete"> = async (_event, input) => {
		const entityType = input.entity_type || "source";
		if (entityType === "source") {
			const rows = await db.client.execute({
				sql: "SELECT storage_path FROM sources WHERE id = ? LIMIT 1",
				args: [input.id],
			});
			if (rows.rows.length === 0) throw new Error("资料不存在");
			await moveFileToVaultTrash(db, rows.rows[0].storage_path as string);
			await db.client.execute({
				sql: "UPDATE sources SET is_deleted = 1, updated_at = ? WHERE id = ?",
				args: [Date.now(), input.id],
			});
		} else {
			const rows = await db.client.execute({
				sql: "SELECT storage_path FROM output_assets WHERE id = ? LIMIT 1",
				args: [input.id],
			});
			if (rows.rows.length === 0) throw new Error("文档不存在");
			await moveFileToVaultTrash(db, rows.rows[0].storage_path as string);
			await db.client.execute({
				sql: "UPDATE output_assets SET is_deleted = 1, updated_at = ? WHERE id = ?",
				args: [Date.now(), input.id],
			});
		}
		return { success: true };
	};

	const file_restore: Handler<"file_restore"> = async (_event, input) => {
		const entityType = input.entity_type || "source";
		if (entityType === "source") {
			await db.client.execute({
				sql: "UPDATE sources SET is_deleted = 0, updated_at = ? WHERE id = ?",
				args: [Date.now(), input.id],
			});
			await syncSourceToVault(db, input.id);
		} else {
			await db.client.execute({
				sql: "UPDATE output_assets SET is_deleted = 0, updated_at = ? WHERE id = ?",
				args: [Date.now(), input.id],
			});
			await syncOutputToVault(db, input.id);
		}
		return { success: true };
	};

	const file_reveal_in_finder: Handler<"file_reveal_in_finder"> = async (
		_event,
		input,
	) => {
		const entityType = input.entity_type || "source";
		const table = entityType === "source" ? "sources" : "output_assets";
		const rows = await db.client.execute({
			sql: `SELECT storage_path FROM ${table} WHERE id = ? LIMIT 1`,
			args: [input.id],
		});
		if (rows.rows.length === 0) throw new Error("文件不存在");
		const storagePath = (rows.rows[0].storage_path as string) || "";
		if (!storagePath) throw new Error("该文件没有落地路径");
		shell.showItemInFolder(storagePath);
		return { success: true, path: storagePath };
	};

	const file_set_scope: Handler<"file_set_scope"> = async (_event, input) => {
		const entityType = input.entity_type || "source";
		const nextProjectId =
			input.scope === "global" ? null : (input.project_id ?? null);
		if (input.scope === "project" && !nextProjectId) {
			throw new Error("project scope 需要 project_id");
		}

		if (entityType === "source") {
			await db.client.execute({
				sql: "UPDATE sources SET scope = ?, project_id = ?, updated_at = ? WHERE id = ?",
				args: [input.scope, nextProjectId, Date.now(), input.id],
			});
			await syncSourceToVault(db, input.id);
		} else {
			await db.client.execute({
				sql: "UPDATE output_assets SET scope = ?, project_id = ?, updated_at = ? WHERE id = ?",
				args: [input.scope, nextProjectId, Date.now(), input.id],
			});
			await syncOutputToVault(db, input.id);
		}

		const record = await fetchSingleRecord(db, entityType, input.id);
		if (!record) throw new Error("文件不存在");
		return record;
	};

	const file_set_tags: Handler<"file_set_tags"> = async (_event, input) => {
		const entityType = input.entity_type || "source";
		const payload = JSON.stringify(input.tags || []);
		if (entityType === "source") {
			await db.client.execute({
				sql: "UPDATE sources SET tags = ?, updated_at = ? WHERE id = ?",
				args: [payload, Date.now(), input.id],
			});
			await syncSourceToVault(db, input.id);
		} else {
			await db.client.execute({
				sql: "UPDATE output_assets SET tags = ?, updated_at = ? WHERE id = ?",
				args: [payload, Date.now(), input.id],
			});
			await syncOutputToVault(db, input.id);
		}
		const record = await fetchSingleRecord(db, entityType, input.id);
		if (!record) throw new Error("文件不存在");
		return record;
	};

	const theme_list: Handler<"theme_list"> = async () => {
		const rows = await db.client.execute({
			sql: "SELECT * FROM themes ORDER BY name ASC",
			args: [],
		});
		return rows.rows.map((row) => ({
			id: row.id as string,
			name: row.name as string,
			slug: row.slug as string,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		}));
	};

	const theme_create: Handler<"theme_create"> = async (_event, input) => {
		const baseSlug = slugifyName(input.name);
		let slug = baseSlug;
		let index = 1;
		while (true) {
			const exists = await db.client.execute({
				sql: "SELECT id FROM themes WHERE slug = ? LIMIT 1",
				args: [slug],
			});
			if (exists.rows.length === 0) break;
			index += 1;
			slug = `${baseSlug}-${index}`;
		}
		const theme: Theme = {
			id: randomUUID(),
			name: input.name.trim(),
			slug,
			created_at: Date.now(),
			updated_at: Date.now(),
		};
		await db.client.execute({
			sql: "INSERT INTO themes (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
			args: [
				theme.id,
				theme.name,
				theme.slug,
				theme.created_at,
				theme.updated_at,
			],
		});
		return theme;
	};

	const theme_rename: Handler<"theme_rename"> = async (_event, input) => {
		const existing = await db.client.execute({
			sql: "SELECT * FROM themes WHERE id = ? LIMIT 1",
			args: [input.id],
		});
		if (existing.rows.length === 0) throw new Error("主题不存在");

		const baseSlug = slugifyName(input.name);
		let slug = baseSlug;
		let index = 1;
		while (true) {
			const rows = await db.client.execute({
				sql: "SELECT id FROM themes WHERE slug = ? AND id <> ? LIMIT 1",
				args: [slug, input.id],
			});
			if (rows.rows.length === 0) break;
			index += 1;
			slug = `${baseSlug}-${index}`;
		}

		const updatedAt = Date.now();
		await db.client.execute({
			sql: "UPDATE themes SET name = ?, slug = ?, updated_at = ? WHERE id = ?",
			args: [input.name.trim(), slug, updatedAt, input.id],
		});

		return {
			id: input.id,
			name: input.name.trim(),
			slug,
			created_at: existing.rows[0].created_at as number,
			updated_at: updatedAt,
		};
	};

	const theme_delete: Handler<"theme_delete"> = async (_event, input) => {
		await db.client.execute({
			sql: "DELETE FROM file_themes WHERE theme_id = ?",
			args: [input.id],
		});
		await db.client.execute({
			sql: "DELETE FROM themes WHERE id = ?",
			args: [input.id],
		});
		return { success: true };
	};

	return {
		file_list,
		file_move,
		file_delete,
		file_restore,
		file_reveal_in_finder,
		file_set_scope,
		file_set_tags,
		theme_list,
		theme_create,
		theme_rename,
		theme_delete,
	};
}
