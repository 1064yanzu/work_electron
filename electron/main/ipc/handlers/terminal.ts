/**
 * 终端 IPC Handler
 * 处理前端与终端服务之间的通信
 */
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import { getTerminalService } from "../../services/terminalService";
import { BatchedSender } from "../../utils/batchedSender";

/**
 * 远控 pty 的 terminalId 前缀。
 *
 * 这类终端由 PtyBridgeService 创建并管理生命周期，桌面端只能「看 + 写」，
 * 不允许从前端调 destroy / resize：
 *   - destroy：会绕过 PtyBridgeService 留下 stale session 与 IM 卡片
 *   - resize：会破坏 IM 端期望的窄屏渲染（默认 48x24）
 *
 * 二者在 handler 里直接返回 success=false。前端 TerminalTabBar 的「关闭」按钮
 * 在远控 tab 上应走 detachRemote（仅前端列表移除），不调本 IPC。
 */
const REMOTE_PTY_PREFIX = "remote-pty-";

/**
 * Harness Hub pty 的 terminalId 前缀。
 *
 * 与远控 pty 同理：这���终端由 harnessHub/ptyLauncher 创建并管理生命周期
 * （虚拟屏就绪探测 + 交接指令注入 + 输出回灌 canonical 表），
 * 前端直接 destroy / resize 会绕过这套链路，故一并挡掉。
 */
const HARNESS_PTY_PREFIX = "harness-pty-";

/** 由主进程托管生命周期、前端不得 destroy/resize 的 pty 前缀。 */
const MANAGED_PTY_PREFIXES = [REMOTE_PTY_PREFIX, HARNESS_PTY_PREFIX];

/** 是否为主进程托管的 pty。 */
function isManagedPty(id: string): boolean {
	return MANAGED_PTY_PREFIXES.some((prefix) => id.startsWith(prefix));
}

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

	// 所有终端共享一个 BatchedSender：节流式输出（如 npm install / 编译）的 IPC 频次
	const terminalDataSender = new BatchedSender<{ id: string; data: string }>(
		"terminal-data",
		deps.getMainWindow,
	);

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

		// 注册数据输出回调 -> 推送到前端（合并成 batched IPC）
		const unsubData = service.onData(input.id, (data) => {
			terminalDataSender.send({ id: input.id, data });
		});
		dataUnsubscribers.set(input.id, unsubData);

		// 注册退出回调 -> 通知前端
		const unsubExit = service.onExit(input.id, (exitCode, signal) => {
			// 退出前 flush，确保最后一段输出被前端先收到
			terminalDataSender.flush();
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
		// 远控 pty 的尺寸由 PtyBridgeService 在创建时锁定为 IM 端期望的窄屏，
		// 桌面 xterm 的 fit() 调用必须被屏蔽，否则远端卡片会错乱。
		// harness pty 同理：尺寸由 ptyLauncher 锁定，虚拟屏就绪探测依赖固定列宽。
		if (isManagedPty(input.id)) {
			return { success: false };
		}
		const ok = service.resizeTerminal(input.id, input.cols, input.rows);
		return { success: ok };
	};

	const terminal_destroy: Handler<"terminal_destroy"> = async (
		_event,
		input,
	) => {
		// 远控 pty 的生命周期由 PtyBridgeService 独占管理（包括 IM 端卡片关闭、
		// session 清理、监听卸载）。从前端绕过它直接 destroy 会留下 stale session
		// 与"已关闭"的卡片消息。前端 TerminalTabBar 在远控 tab 上要走 detachRemote
		// 路径（仅本地列表移除），不调本 IPC。
		// harness pty 同理，走 harness_pty_close。
		if (isManagedPty(input.id)) {
			return { success: false };
		}

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
