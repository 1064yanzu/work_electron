/**
 * petWindow.ts — 桌面宠物窗口的 IPC handlers
 */

import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import {
	broadcastMascotChange,
	broadcastPetSettingsChange,
	cancelPetWindowAnimation,
	getPetWindowPosition,
	getPetWindowState,
	setPetWindowEnabled,
	setPetWindowPosition,
	setPetWindowThroughClicks,
	snapPetWindowToNearestEdge,
} from "../../services/petWindowService";
import { getPetWindowSettings } from "../../storage/petWindowSettings";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createPetWindowHandlers({
	focusMainWindow,
	sendChatToMainWindow,
	dragStart,
	dragMove,
	dragEnd,
}: {
	focusMainWindow: () => void;
	sendChatToMainWindow: (text: string) => void;
	dragStart: (mouseX: number, mouseY: number) => void;
	dragMove: (mouseX: number, mouseY: number) => void;
	dragEnd: (
		vx?: number,
		vy?: number,
	) => {
		moved: boolean;
		x: number;
		y: number;
	};
}) {
	return {
		pet_window_get_state: (async () => {
			return getPetWindowState();
		}) satisfies Handler<"pet_window_get_state">,

		pet_window_set_enabled: (async (_event, input) => {
			setPetWindowEnabled(input.enabled);
			return { success: true };
		}) satisfies Handler<"pet_window_set_enabled">,

		pet_window_set_position: (async (_event, input) => {
			setPetWindowPosition(input.x, input.y);
			return { success: true };
		}) satisfies Handler<"pet_window_set_position">,

		pet_window_set_through_clicks: (async (_event, input) => {
			setPetWindowThroughClicks(input.enabled);
			return { success: true };
		}) satisfies Handler<"pet_window_set_through_clicks">,

		pet_window_focus_main: (async () => {
			focusMainWindow();
			return { success: true };
		}) satisfies Handler<"pet_window_focus_main">,

		pet_window_send_chat: (async (_event, input) => {
			sendChatToMainWindow(input.text);
			return { success: true };
		}) satisfies Handler<"pet_window_send_chat">,

		pet_window_drag_start: (async (_event, input) => {
			cancelPetWindowAnimation();
			dragStart(input.mouseX, input.mouseY);
			return { success: true };
		}) satisfies Handler<"pet_window_drag_start">,

		pet_window_drag_move: (async (_event, input) => {
			dragMove(input.mouseX, input.mouseY);
			return { success: true };
		}) satisfies Handler<"pet_window_drag_move">,

		pet_window_drag_end: (async (_event, input) => {
			const vx = (input as { vx?: number })?.vx;
			const vy = (input as { vy?: number })?.vy;
			const result = dragEnd(vx, vy);
			return { success: true, ...result };
		}) satisfies Handler<"pet_window_drag_end">,

		pet_window_snap_to_edge: (async (_event, input) => {
			const result = snapPetWindowToNearestEdge(input?.threshold);
			return { success: true, ...result };
		}) satisfies Handler<"pet_window_snap_to_edge">,

		pet_window_get_position: (async () => {
			return getPetWindowPosition();
		}) satisfies Handler<"pet_window_get_position">,

		pet_window_set_size_preset: (async (_event, input) => {
			broadcastPetSettingsChange({ sizePreset: input.preset });
			return { success: true };
		}) satisfies Handler<"pet_window_set_size_preset">,

		pet_window_set_dwell_preset: (async (_event, input) => {
			broadcastPetSettingsChange({ dwellPreset: input.preset });
			return { success: true };
		}) satisfies Handler<"pet_window_set_dwell_preset">,

		pet_window_set_dnd: (async (_event, input) => {
			broadcastPetSettingsChange({
				dndStart: input.start,
				dndEnd: input.end,
			});
			return { success: true };
		}) satisfies Handler<"pet_window_set_dnd">,

		// IP 同步
		mascot_set_id: (async (_event, input) => {
			broadcastMascotChange(input.id, input.source ?? "system");
			return { success: true };
		}) satisfies Handler<"mascot_set_id">,

		mascot_get_id: (async () => {
			const settings = getPetWindowSettings();
			return { id: settings.mascotId };
		}) satisfies Handler<"mascot_get_id">,

		// 用于触发番茄钟 / 外部提醒（铺接入点，本次不实装触发器）
		// 这里 handler 只做转发：把 reminder payload 直接 forwardToPetWindow。
		// 注意：本 handler 不在 IPCSchema 中（避免乱配）；通过 ipcMain.on 注册即可。
	};
}
