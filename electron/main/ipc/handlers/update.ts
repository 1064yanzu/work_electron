/**
 * 应用更新 IPC handlers
 */
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import {
	checkForUpdates,
	downloadUpdate,
	quitAndInstall,
	getUpdateState,
	revealDownloadedUpdate,
} from "../../services/updateService";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createUpdateHandlers() {
	const update_check: Handler<"update_check"> = async () => {
		const state = await checkForUpdates();
		return state;
	};

	const update_download: Handler<"update_download"> = async () => {
		const state = await downloadUpdate();
		return state;
	};

	const update_install: Handler<"update_install"> = async () => {
		quitAndInstall();
		return { success: true };
	};

	const update_get_state: Handler<"update_get_state"> = async () => {
		return getUpdateState();
	};

	const update_reveal_pending: Handler<"update_reveal_pending"> = async () => {
		return revealDownloadedUpdate();
	};

	return {
		update_check,
		update_download,
		update_install,
		update_get_state,
		update_reveal_pending,
	};
}
