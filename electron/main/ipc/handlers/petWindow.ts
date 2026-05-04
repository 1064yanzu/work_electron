/**
 * petWindow.ts — 桌面宠物窗口的 IPC handlers
 */

import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import {
	getPetWindowState,
	setPetWindowEnabled,
	setPetWindowPosition,
	setPetWindowThroughClicks,
} from "../../services/petWindowService";

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
	dragEnd: () => { moved: boolean; x: number; y: number };
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
			dragStart(input.mouseX, input.mouseY);
			return { success: true };
		}) satisfies Handler<"pet_window_drag_start">,

		pet_window_drag_move: (async (_event, input) => {
			dragMove(input.mouseX, input.mouseY);
			return { success: true };
		}) satisfies Handler<"pet_window_drag_move">,

		pet_window_drag_end: (async () => {
			const result = dragEnd();
			return { success: true, ...result };
		}) satisfies Handler<"pet_window_drag_end">,
	};
}
