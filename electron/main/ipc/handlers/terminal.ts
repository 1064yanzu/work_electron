/**
 * 终端 IPC Handler
 * 处理前端与终端服务之间的通信
 */
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import { getTerminalService } from "../../services/terminalService";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

export function createTerminalHandlers(deps: {
	getMainWindow: () => BrowserWindow | null;
}) {
	const service = getTerminalService();

	// 跟踪每个终端的数据回调注销函数
	const dataUnsubscribers = new Map<string, () => void>();
	const exitUnsubscribers = new Map<string, () => void>();

	const terminal_create: Handler<"terminal_create"> = async (_event, input) => {
		const info = service.createTerminal(input.id, {
			cwd: input.cwd,
			shell: input.shell,
			env: input.env,
			cols: input.cols,
			rows: input.rows,
		});

		// 清理旧的监听
		dataUnsubscribers.get(input.id)?.();
		exitUnsubscribers.get(input.id)?.();

		// 注册数据输出回调 -> 推送到前端
		const unsubData = service.onData(input.id, (data) => {
			const win = deps.getMainWindow();
			if (win && !win.isDestroyed()) {
				win.webContents.send("terminal-data", { id: input.id, data });
			}
		});
		dataUnsubscribers.set(input.id, unsubData);

		// 注册退出回调 -> 通知前端
		const unsubExit = service.onExit(input.id, (exitCode, signal) => {
			const win = deps.getMainWindow();
			if (win && !win.isDestroyed()) {
				win.webContents.send("terminal-exit", {
					id: input.id,
					exitCode,
					signal,
				});
			}
			// 清理
			dataUnsubscribers.delete(input.id);
			exitUnsubscribers.delete(input.id);
		});
		exitUnsubscribers.set(input.id, unsubExit);

		return info;
	};

	const terminal_write: Handler<"terminal_write"> = async (_event, input) => {
		const ok = service.writeTerminal(input.id, input.data);
		return { success: ok };
	};

	const terminal_resize: Handler<"terminal_resize"> = async (_event, input) => {
		const ok = service.resizeTerminal(input.id, input.cols, input.rows);
		return { success: ok };
	};

	const terminal_destroy: Handler<"terminal_destroy"> = async (_event, input) => {
		// 清理监听
		dataUnsubscribers.get(input.id)?.();
		dataUnsubscribers.delete(input.id);
		exitUnsubscribers.get(input.id)?.();
		exitUnsubscribers.delete(input.id);

		const ok = service.destroyTerminal(input.id);
		return { success: ok };
	};

	const terminal_list: Handler<"terminal_list"> = async () => {
		return service.getTerminals();
	};

	return {
		terminal_create,
		terminal_write,
		terminal_resize,
		terminal_destroy,
		terminal_list,
	};
}
