/**
 * Sources IPC Handlers
 */
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type {
	Source,
	SourceCategory,
	SourceKind,
	SourceOrigin,
} from "../../../shared/types";
import type { DbContext } from "../../db/client";
import { syncSourceToVault } from "../../storage/sync";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function parseSource(row: Record<string, unknown>): Source {
	let tags: string[] = [];
	try {
		tags = JSON.parse((row.tags as string) || "[]");
	} catch {
		tags = [];
	}

	return {
		id: row.id as string,
		title: row.title as string,
		kind: (row.kind as SourceKind) || "text",
		tags,
		scope: (row.scope as Source["scope"]) || "global",
		url: row.url as string | undefined,
		project_id: row.project_id as string | undefined,
		folder_id: row.folder_id as string | undefined,
		source_type: (row.source_type as SourceOrigin) || "manual",
		origin_type: (row.origin_type as Source["origin_type"]) || "manual",
		category: (row.category as SourceCategory) || "article",
		storage_path: row.storage_path as string | undefined,
		is_deleted: Number(row.is_deleted ?? 0) === 1,
		description: row.description as string | undefined,
		thumbnail: row.thumbnail as string | undefined,
		author: row.author as string | undefined,
		published_at: row.published_at as number | undefined,
		created_at: row.created_at as number,
		updated_at: row.updated_at as number,
	};
}

export function createSourceHandlers(db: DbContext) {
	const now = () => Date.now();

	const listSources: Handler<"list_sources"> = async (_event, input) => {
		let sql = `SELECT * FROM sources WHERE COALESCE(is_deleted, 0) = 0`;
		const args: (string | number)[] = [];

		if (input.project_id) {
			sql += ` AND (scope = 'global' OR project_id = ?)`;
			args.push(input.project_id);
		}
		if (input.folder_id) {
			sql += ` AND folder_id = ?`;
			args.push(input.folder_id);
		}
		sql += ` ORDER BY updated_at DESC`;
		if (input.limit) {
			sql += ` LIMIT ?`;
			args.push(input.limit);
		}

		const rows = await db.client.execute({ sql, args });
		return rows.rows.map((row) => parseSource(row as Record<string, unknown>));
	};

	const getSource: Handler<"get_source"> = async (_event, input) => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM sources WHERE id = ?`,
			args: [input.id],
		});
		if (rows.rows.length === 0) return null;
		return parseSource(rows.rows[0] as Record<string, unknown>);
	};

	const getSourceDetail: Handler<"get_source_detail"> = async (
		_event,
		input,
	) => {
		const sourceRows = await db.client.execute({
			sql: `SELECT * FROM sources WHERE id = ?`,
			args: [input.id],
		});
		if (sourceRows.rows.length === 0) return null;

		const source = parseSource(sourceRows.rows[0] as Record<string, unknown>);

		const noteRows = await db.client.execute({
			sql: `SELECT * FROM notes WHERE source_id = ? LIMIT 1`,
			args: [input.id],
		});

		const note =
			noteRows.rows.length > 0
				? {
						id: noteRows.rows[0].id as string,
						source_id: noteRows.rows[0].source_id as string | undefined,
						content: noteRows.rows[0].content as string,
						content_html: noteRows.rows[0].content_html as string | undefined,
						created_at: noteRows.rows[0].created_at as number,
						updated_at: noteRows.rows[0].updated_at as number,
					}
				: null;

		return { source, note };
	};

	const createSource: Handler<"create_source"> = async (_event, input) => {
		const id = randomUUID();
		const timestamp = now();
		const tags = JSON.stringify(input.tags ?? []);
		const scope: Source["scope"] = "global";
		const originType: Source["origin_type"] =
			input.source_type === "browser_clip"
				? "web_clip"
				: input.source_type === "import"
					? "import"
					: "manual";

		await db.client.execute({
			sql: `INSERT INTO sources (id, title, kind, scope, tags, url, project_id, folder_id, source_type, origin_type, category, description, author, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.title,
				input.kind,
				scope,
				tags,
				input.url ?? null,
				null,
				input.folder_id ?? null,
				input.source_type ?? "manual",
				originType,
				input.category ?? "article",
				input.description ?? null,
				input.author ?? null,
				timestamp,
				timestamp,
			],
		});

		await syncSourceToVault(db, id);

		return {
			id,
			title: input.title,
			kind: input.kind,
			tags: input.tags ?? [],
			scope,
			url: input.url,
			project_id: undefined,
			folder_id: input.folder_id,
			source_type: input.source_type ?? "manual",
			origin_type: originType,
			category: input.category ?? "article",
			description: input.description,
			author: input.author,
			created_at: timestamp,
			updated_at: timestamp,
		};
	};

	const updateSource: Handler<"update_source"> = async (_event, input) => {
		const updates: string[] = [];
		const args: (string | number | null)[] = [];

		if (input.title !== undefined) {
			updates.push("title = ?");
			args.push(input.title);
		}
		if (input.tags !== undefined) {
			updates.push("tags = ?");
			args.push(JSON.stringify(input.tags));
		}
		if (input.folder_id !== undefined) {
			updates.push("folder_id = ?");
			args.push(input.folder_id);
		}
		if (input.category !== undefined) {
			updates.push("category = ?");
			args.push(input.category);
		}
		if (input.description !== undefined) {
			updates.push("description = ?");
			args.push(input.description ?? null);
		}

		const timestamp = now();
		updates.push("updated_at = ?");
		args.push(timestamp);
		args.push(input.id);

		await db.client.execute({
			sql: `UPDATE sources SET ${updates.join(", ")} WHERE id = ?`,
			args,
		});

		await syncSourceToVault(db, input.id);

		const result = await getSource({} as IpcMainInvokeEvent, { id: input.id });
		if (!result) throw new Error(`Source not found: ${input.id}`);
		return result;
	};

	const deleteSource: Handler<"delete_source"> = async (_event, input) => {
		// notes 通过外键级联删除
		await db.client.execute({
			sql: `UPDATE sources SET is_deleted = 1, updated_at = ? WHERE id = ?`,
			args: [now(), input.id],
		});
		return { success: true };
	};

	const searchSources: Handler<"search_sources"> = async (_event, input) => {
		const limit = Math.min(input.limit ?? 20, 100);
		const rawQuery =
			typeof input.query === "string" && input.query.trim()
				? input.query.trim()
				: typeof (input as any).keyword === "string"
					? String((input as any).keyword).trim()
					: "";
		if (!rawQuery) return [];

		let sql = `SELECT * FROM sources WHERE COALESCE(is_deleted, 0) = 0 AND title LIKE ?`;
		const args: (string | number)[] = [`%${rawQuery}%`];

		if (input.project_id) {
			sql += ` AND (scope = 'global' OR project_id = ?)`;
			args.push(input.project_id);
		}
		sql += ` ORDER BY updated_at DESC LIMIT ?`;
		args.push(limit);

		const rows = await db.client.execute({ sql, args });
		return rows.rows.map((row) => parseSource(row as Record<string, unknown>));
	};

	return {
		list_sources: listSources,
		get_source: getSource,
		get_source_detail: getSourceDetail,
		create_source: createSource,
		update_source: updateSource,
		delete_source: deleteSource,
		search_sources: searchSources,
	};
}
