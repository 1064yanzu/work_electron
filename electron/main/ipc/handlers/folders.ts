/**
 * Folders IPC Handlers
 */
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createFolderHandlers(db: DbContext) {
	const now = () => Date.now();

	const listFolders: Handler<"list_folders"> = async (_event, input) => {
		let sql = `SELECT * FROM folders`;
		const args: (string | number)[] = [];

		if (input.project_id) {
			sql += ` WHERE project_id = ? OR project_id IS NULL`;
			args.push(input.project_id);
		}
		sql += ` ORDER BY name ASC`;

		const rows = await db.client.execute({ sql, args });
		return rows.rows.map((row) => ({
			id: row.id as string,
			project_id: row.project_id as string | undefined,
			parent_id: row.parent_id as string | undefined,
			name: row.name as string,
			color: row.color as string | undefined,
			icon: row.icon as string | undefined,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		}));
	};

	const createFolder: Handler<"create_folder"> = async (_event, input) => {
		const id = randomUUID();
		const timestamp = now();
		await db.client.execute({
			sql: `INSERT INTO folders (id, project_id, parent_id, name, color, icon, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.project_id ?? null,
				input.parent_id ?? null,
				input.name,
				input.color ?? null,
				input.icon ?? null,
				timestamp,
				timestamp,
			],
		});
		return {
			id,
			project_id: input.project_id,
			parent_id: input.parent_id,
			name: input.name,
			color: input.color,
			icon: input.icon,
			created_at: timestamp,
			updated_at: timestamp,
		};
	};

	const updateFolder: Handler<"update_folder"> = async (_event, input) => {
		const updates: string[] = [];
		const args: (string | number | null)[] = [];

		if (input.name !== undefined) {
			updates.push("name = ?");
			args.push(input.name);
		}
		if (input.parent_id !== undefined) {
			updates.push("parent_id = ?");
			args.push(input.parent_id ?? null);
		}
		if (input.color !== undefined) {
			updates.push("color = ?");
			args.push(input.color ?? null);
		}
		if (input.icon !== undefined) {
			updates.push("icon = ?");
			args.push(input.icon ?? null);
		}

		const timestamp = now();
		updates.push("updated_at = ?");
		args.push(timestamp);
		args.push(input.id);

		await db.client.execute({
			sql: `UPDATE folders SET ${updates.join(", ")} WHERE id = ?`,
			args,
		});

		const rows = await db.client.execute({
			sql: `SELECT * FROM folders WHERE id = ?`,
			args: [input.id],
		});
		if (rows.rows.length === 0)
			throw new Error(`Folder not found: ${input.id}`);
		const row = rows.rows[0];
		return {
			id: row.id as string,
			project_id: row.project_id as string | undefined,
			parent_id: row.parent_id as string | undefined,
			name: row.name as string,
			color: row.color as string | undefined,
			icon: row.icon as string | undefined,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		};
	};

	const deleteFolder: Handler<"delete_folder"> = async (_event, input) => {
		// 级联删除由外键处理
		await db.client.execute({
			sql: `DELETE FROM folders WHERE id = ?`,
			args: [input.id],
		});
		return { success: true };
	};

	const moveSourcesToFolder: Handler<"move_sources_to_folder"> = async (
		_event,
		input,
	) => {
		const placeholders = input.source_ids.map(() => "?").join(",");
		await db.client.execute({
			sql: `UPDATE sources SET folder_id = ?, updated_at = ? WHERE id IN (${placeholders})`,
			args: [input.folder_id, now(), ...input.source_ids],
		});
		return { success: true, count: input.source_ids.length };
	};

	return {
		list_folders: listFolders,
		create_folder: createFolder,
		update_folder: updateFolder,
		delete_folder: deleteFolder,
		move_sources_to_folder: moveSourcesToFolder,
	};
}
