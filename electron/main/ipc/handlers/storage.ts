import path from "node:path";
import { dialog, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import { slugifyName } from "../../storage/settings";
import {
	getStorageSettings,
	updateStorageSettings,
} from "../../storage/settings";
import { migrateAllRecordsToVault } from "../../storage/sync";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createStorageHandlers(db: DbContext) {
	const storage_get_settings: Handler<"storage_get_settings"> = async () => {
		return getStorageSettings(db);
	};

	const storage_update_settings: Handler<"storage_update_settings"> = async (
		_event,
		input,
	) => {
		const current = await getStorageSettings(db);
		const next = await updateStorageSettings(db, input.settings ?? {});

		let migration:
			| {
					backup_path: string;
					sources: number;
					outputs: number;
			  }
			| undefined;
		const shouldMigrate =
			Boolean(input.migrate_existing) ||
			(current.vault_root !== next.vault_root &&
				input.migrate_existing !== false);
		if (shouldMigrate) {
			migration = await migrateAllRecordsToVault(db);
		}

		return {
			settings: await getStorageSettings(db),
			migration,
		};
	};

	const storage_pick_directory: Handler<
		"storage_pick_directory"
	> = async () => {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory", "createDirectory"],
			title: "选择 Vault 根目录",
		});
		if (result.canceled || result.filePaths.length === 0) {
			return { path: null };
		}
		return { path: result.filePaths[0] };
	};

	const system_pick_directory: Handler<
		"system_pick_directory"
	> = async (_event, input) => {
		const result = await dialog.showOpenDialog({
			properties: ["openDirectory", "createDirectory"],
			title: input?.title || "选择系统目录",
		});
		if (result.canceled || result.filePaths.length === 0) {
			return { path: null };
		}
		return { path: result.filePaths[0] };
	};

	const storage_reveal_vault_root: Handler<
		"storage_reveal_vault_root"
	> = async () => {
		const settings = await getStorageSettings(db);
		const error = await shell.openPath(settings.vault_root);
		if (error) {
			return { success: false, error };
		}
		return { success: true };
	};

	const project_reveal_directory: Handler<"project_reveal_directory"> = async (
		_event,
		input,
	) => {
		const settings = await getStorageSettings(db);
		const rows = await db.client.execute({
			sql: "SELECT name FROM projects WHERE id = ? LIMIT 1",
			args: [input.project_id],
		});
		if (rows.rows.length === 0) {
			throw new Error("项目不存在");
		}
		const projectName = (rows.rows[0].name as string) || "project";
		const projectDir = path.join(
			settings.vault_root,
			"Projects",
			slugifyName(projectName),
			"Docs",
		);
		const fs = await import("node:fs/promises");
		await fs.mkdir(projectDir, { recursive: true });
		const error = await shell.openPath(projectDir);
		if (error) {
			return { success: false, path: projectDir, error };
		}
		return { success: true, path: projectDir };
	};

	return {
		storage_get_settings,
		storage_update_settings,
		storage_pick_directory,
		system_pick_directory,
		storage_reveal_vault_root,
		project_reveal_directory,
	};
}
