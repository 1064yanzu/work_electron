/**
 * customMascot.ts — 自定义桌宠的 IPC handlers（导入 / 列表 / 删除 / 编辑）
 */

import { dialog, type IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import { createLogger } from "../../logging/logger";
import {
	deleteCustomMascot,
	importCustomMascotFromZip,
	importCustomMascotFromDir,
	listCustomMascots,
	updateCustomMascotMeta,
	getCustomMascotAssetPath,
	broadcastMascotListChanged,
} from "../../services/customMascotService";
import {
	getMascotBroadcastTargets,
	broadcastMascotChange,
} from "../../services/petWindowService";
import { getPetWindowSettings } from "../../storage/petWindowSettings";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createCustomMascotHandlers() {
	const logger = createLogger();

	const refreshAndBroadcast = async () => {
		const mascots = await listCustomMascots();
		broadcastMascotListChanged(getMascotBroadcastTargets, mascots);
		return mascots;
	};

	return {
		mascot_list_custom: (async () => {
			const mascots = await listCustomMascots();
			return { mascots };
		}) satisfies Handler<"mascot_list_custom">,

		mascot_import_custom: (async (_event, input) => {
			let zipPath = input.zipPath;
			if (!zipPath) {
				const result = await dialog.showOpenDialog({
					title: "选择自定义桌宠包",
					properties: ["openFile"],
					filters: [{ name: "桌宠包", extensions: ["zip"] }],
				});
				if (result.canceled || result.filePaths.length === 0) {
					return { success: false, error: "用户取消选择" };
				}
				zipPath = result.filePaths[0];
			}

			try {
				const { mascot, finalId, renamed } =
					await importCustomMascotFromZip(zipPath);
				await refreshAndBroadcast();
				return { success: true, mascot, finalId, renamed };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.warn({ msg: "Custom mascot import failed", error: message });
				return { success: false, error: message };
			}
		}) satisfies Handler<"mascot_import_custom">,

		mascot_import_custom_dir: (async (_event, input) => {
			let dirPath = input.dirPath;
			if (!dirPath) {
				const result = await dialog.showOpenDialog({
					title: "选择自定义桌宠目录（兼容 codex hatch-pet）",
					properties: ["openDirectory"],
				});
				if (result.canceled || result.filePaths.length === 0) {
					return { success: false, error: "用户取消选择" };
				}
				dirPath = result.filePaths[0];
			}
			try {
				const { mascot, finalId, renamed } =
					await importCustomMascotFromDir(dirPath);
				await refreshAndBroadcast();
				return { success: true, mascot, finalId, renamed };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.warn({
					msg: "Custom mascot dir import failed",
					error: message,
				});
				return { success: false, error: message };
			}
		}) satisfies Handler<"mascot_import_custom_dir">,

		mascot_delete_custom: (async (_event, input) => {
			try {
				await deleteCustomMascot(input.id);
				// 若被删除的是当前选中桌宠，回退到 efficiency 并广播
				const settings = getPetWindowSettings();
				if (settings.mascotId === input.id) {
					broadcastMascotChange("efficiency", "system");
				}
				await refreshAndBroadcast();
				return { success: true };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.warn({
					msg: "Custom mascot delete failed",
					id: input.id,
					error: message,
				});
				return { success: false, error: message };
			}
		}) satisfies Handler<"mascot_delete_custom">,

		mascot_update_custom_meta: (async (_event, input) => {
			try {
				const { id, ...patch } = input;
				const mascot = await updateCustomMascotMeta(id, patch);
				await refreshAndBroadcast();
				return { success: true, mascot };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				logger.warn({
					msg: "Custom mascot meta update failed",
					id: input.id,
					error: message,
				});
				return { success: false, error: message };
			}
		}) satisfies Handler<"mascot_update_custom_meta">,

		mascot_get_custom_asset_url: (async (_event, input) => {
			const filePath = getCustomMascotAssetPath(input.id, input.slot);
			if (!filePath) return { url: null };
			// 渲染层应优先用 mascot:// protocol；这里返回 mascot:// URL
			let ext: string;
			if (input.slot === "atlas") ext = "webp";
			else if (input.slot === "loading") ext = "mp4";
			else if (input.slot === "spritesheet") ext = "webp";
			else ext = "png";
			return {
				url: `mascot://${input.id}/${input.slot}.${ext}`,
			};
		}) satisfies Handler<"mascot_get_custom_asset_url">,
	};
}
