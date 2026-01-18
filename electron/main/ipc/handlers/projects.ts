/**
 * Projects IPC Handlers
 */
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createProjectHandlers(db: DbContext) {
	const now = () => Date.now();

	const listProjects: Handler<"list_projects"> = async () => {
		const rows = await db.client.execute(
			`SELECT * FROM projects WHERE is_archived = 0 ORDER BY updated_at DESC`,
		);
		return rows.rows.map((row) => ({
			id: row.id as string,
			name: row.name as string,
			description: row.description as string | undefined,
			color: (row.color as string) || "#6366f1",
			icon: (row.icon as string) || "folder",
			is_archived: Boolean(row.is_archived),
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		}));
	};

	const getProject: Handler<"get_project"> = async (_event, input) => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM projects WHERE id = ?`,
			args: [input.id],
		});
		if (rows.rows.length === 0) return null;
		const row = rows.rows[0];
		return {
			id: row.id as string,
			name: row.name as string,
			description: row.description as string | undefined,
			color: (row.color as string) || "#6366f1",
			icon: (row.icon as string) || "folder",
			is_archived: Boolean(row.is_archived),
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		};
	};

	const createProject: Handler<"create_project"> = async (_event, input) => {
		const id = randomUUID();
		const timestamp = now();
		await db.client.execute({
			sql: `INSERT INTO projects (id, name, description, color, icon, is_archived, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
			args: [
				id,
				input.name,
				input.description ?? null,
				input.color ?? "#6366f1",
				input.icon ?? "folder",
				timestamp,
				timestamp,
			],
		});
		return {
			id,
			name: input.name,
			description: input.description,
			color: input.color ?? "#6366f1",
			icon: input.icon ?? "folder",
			is_archived: false,
			created_at: timestamp,
			updated_at: timestamp,
		};
	};

	const updateProject: Handler<"update_project"> = async (_event, input) => {
		const updates: string[] = [];
		const args: (string | number | null)[] = [];

		if (input.name !== undefined) {
			updates.push("name = ?");
			args.push(input.name);
		}
		if (input.description !== undefined) {
			updates.push("description = ?");
			args.push(input.description ?? null);
		}
		if (input.color !== undefined) {
			updates.push("color = ?");
			args.push(input.color);
		}
		if (input.icon !== undefined) {
			updates.push("icon = ?");
			args.push(input.icon);
		}
		if (input.is_archived !== undefined) {
			updates.push("is_archived = ?");
			args.push(input.is_archived ? 1 : 0);
		}

		const timestamp = now();
		updates.push("updated_at = ?");
		args.push(timestamp);
		args.push(input.id);

		await db.client.execute({
			sql: `UPDATE projects SET ${updates.join(", ")} WHERE id = ?`,
			args,
		});

		const result = await getProject({} as IpcMainInvokeEvent, { id: input.id });
		if (!result) throw new Error(`Project not found: ${input.id}`);
		return result;
	};

	const deleteProject: Handler<"delete_project"> = async (_event, input) => {
		// 先删除访问记录
		await db.client.execute({
			sql: `DELETE FROM project_visits WHERE project_id = ?`,
			args: [input.id],
		});
		// 再删除项目
		await db.client.execute({
			sql: `DELETE FROM projects WHERE id = ?`,
			args: [input.id],
		});
		return { success: true };
	};

	const getRecentProjects: Handler<"get_recent_projects"> = async (
		_event,
		input,
	) => {
		const limit = input.limit ?? 5;
		const rows = await db.client.execute({
			sql: `SELECT DISTINCT p.* FROM projects p
            INNER JOIN project_visits v ON p.id = v.project_id
            WHERE p.is_archived = 0
            ORDER BY v.visited_at DESC
            LIMIT ?`,
			args: [limit],
		});
		return rows.rows.map((row) => ({
			id: row.id as string,
			name: row.name as string,
			description: row.description as string | undefined,
			color: (row.color as string) || "#6366f1",
			icon: (row.icon as string) || "folder",
			is_archived: Boolean(row.is_archived),
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		}));
	};

	const recordProjectVisit: Handler<"record_project_visit"> = async (
		_event,
		input,
	) => {
		const id = randomUUID();
		await db.client.execute({
			sql: `INSERT INTO project_visits (id, project_id, visited_at) VALUES (?, ?, ?)`,
			args: [id, input.project_id, now()],
		});
		return { success: true };
	};

	return {
		list_projects: listProjects,
		get_project: getProject,
		create_project: createProject,
		update_project: updateProject,
		delete_project: deleteProject,
		get_recent_projects: getRecentProjects,
		record_project_visit: recordProjectVisit,
	};
}
