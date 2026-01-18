/**
 * Output Assets & Dashboard IPC Handlers
 */
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { OutputAsset, OutputType } from "../../../shared/types";
import type { DbContext } from "../../db/client";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function parseOutputAsset(row: Record<string, unknown>): OutputAsset {
	let relatedNotes: string[] = [];
	try {
		relatedNotes = JSON.parse((row.related_notes as string) || "[]");
	} catch {
		relatedNotes = [];
	}

	return {
		id: row.id as string,
		title: row.title as string,
		content: row.content as string,
		output_type: row.output_type as OutputType,
		related_notes: relatedNotes,
		project_id: row.project_id as string | undefined,
		version: (row.version as number) || 1,
		created_at: row.created_at as number,
		updated_at: row.updated_at as number,
	};
}

export function createOutputHandlers(db: DbContext) {
	const now = () => Date.now();

	const listOutputAssets: Handler<"list_output_assets"> = async (
		_event,
		input,
	) => {
		let sql = `SELECT * FROM output_assets`;
		const args: (string | number)[] = [];

		if (input.project_id) {
			sql += ` WHERE project_id = ? OR project_id IS NULL`;
			args.push(input.project_id);
		}
		sql += ` ORDER BY updated_at DESC`;

		const rows = await db.client.execute({ sql, args });
		return rows.rows.map((row) =>
			parseOutputAsset(row as Record<string, unknown>),
		);
	};

	const createOutputAsset: Handler<"create_output_asset"> = async (
		_event,
		input,
	) => {
		const id = randomUUID();
		const timestamp = now();
		const relatedNotes = JSON.stringify(input.related_notes ?? []);

		await db.client.execute({
			sql: `INSERT INTO output_assets (id, title, content, output_type, related_notes, project_id, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
			args: [
				id,
				input.title,
				input.content,
				input.output_type,
				relatedNotes,
				input.project_id ?? null,
				timestamp,
				timestamp,
			],
		});

		return {
			id,
			title: input.title,
			content: input.content,
			output_type: input.output_type,
			related_notes: input.related_notes ?? [],
			project_id: input.project_id,
			version: 1,
			created_at: timestamp,
			updated_at: timestamp,
		};
	};

	const updateOutputAsset: Handler<"update_output_asset"> = async (
		_event,
		input,
	) => {
		const updates: string[] = [];
		const args: (string | number | null)[] = [];

		if (input.title !== undefined) {
			updates.push("title = ?");
			args.push(input.title);
		}
		if (input.content !== undefined) {
			updates.push("content = ?");
			args.push(input.content);
		}
		if (input.output_type !== undefined) {
			updates.push("output_type = ?");
			args.push(input.output_type);
		}
		if (input.related_notes !== undefined) {
			updates.push("related_notes = ?");
			args.push(JSON.stringify(input.related_notes));
		}

		// 增加版本号
		updates.push("version = version + 1");

		const timestamp = now();
		updates.push("updated_at = ?");
		args.push(timestamp);
		args.push(input.id);

		await db.client.execute({
			sql: `UPDATE output_assets SET ${updates.join(", ")} WHERE id = ?`,
			args,
		});

		const rows = await db.client.execute({
			sql: `SELECT * FROM output_assets WHERE id = ?`,
			args: [input.id],
		});
		if (rows.rows.length === 0)
			throw new Error(`Output asset not found: ${input.id}`);
		return parseOutputAsset(rows.rows[0] as Record<string, unknown>);
	};

	const deleteOutputAsset: Handler<"delete_output_asset"> = async (
		_event,
		input,
	) => {
		await db.client.execute({
			sql: `DELETE FROM output_assets WHERE id = ?`,
			args: [input.id],
		});
		return { success: true };
	};

	const dashboardStats: Handler<"dashboard_stats"> = async () => {
		const sourcesRows = await db.client.execute(
			`SELECT COUNT(*) as count FROM sources`,
		);
		const notesRows = await db.client.execute(
			`SELECT COUNT(*) as count FROM notes`,
		);
		const projectsRows = await db.client.execute(
			`SELECT COUNT(*) as count FROM projects WHERE is_archived = 0`,
		);
		const outputsRows = await db.client.execute(
			`SELECT COUNT(*) as count FROM output_assets`,
		);

		return {
			sources_count: (sourcesRows.rows[0]?.count as number) || 0,
			notes_count: (notesRows.rows[0]?.count as number) || 0,
			projects_count: (projectsRows.rows[0]?.count as number) || 0,
			outputs_count: (outputsRows.rows[0]?.count as number) || 0,
		};
	};

	return {
		list_output_assets: listOutputAssets,
		create_output_asset: createOutputAsset,
		update_output_asset: updateOutputAsset,
		delete_output_asset: deleteOutputAsset,
		dashboard_stats: dashboardStats,
	};
}
