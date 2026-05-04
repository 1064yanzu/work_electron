/**
 * 预览服务器 IPC Handler
 * 处理前端与预览服务器服务之间的通信
 * 包括：启动/停止预览服务器、查询状态、弹出预览窗口、保存沙盒文件
 */
import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import { getPreviewServerService } from "../../services/previewServerService";
import { openPreviewWindow } from "../../services/previewWindowService";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

/**
 * 沙盒根目录
 * 与 agentSandbox.ts 中的路径保持一致
 */
function getAgentSandboxRoot(): string {
	return path.join(app.getPath("userData"), "agent-sandboxes");
}

export function createPreviewServerHandlers(deps: {
	getMainWindow: () => BrowserWindow | null;
}) {
	const getService = () => getPreviewServerService(deps.getMainWindow);

	/**
	 * 启动预览服务器
	 */
	const preview_server_start: Handler<"preview_server_start"> = async (
		_event,
		input,
	) => {
		const { taskId, sandboxDir, mode } = input;

		// 校验 sandboxDir 路径合法性
		const resolvedDir = path.resolve(sandboxDir);
		const service = getService();
		const result = await service.start(taskId, resolvedDir, mode);

		return {
			port: result.port,
			url: result.url,
			mode: result.mode,
			processId: result.processId,
		};
	};

	/**
	 * 停止预览服务器
	 */
	const preview_server_stop: Handler<"preview_server_stop"> = async (
		_event,
		input,
	) => {
		const service = getService();
		const success = await service.stop(input.taskId);
		return { success };
	};

	/**
	 * 查询预览服务器状态
	 */
	const preview_server_status: Handler<"preview_server_status"> = async (
		_event,
		input,
	) => {
		const service = getService();
		return service.status(input.taskId);
	};

	/**
	 * 弹出独立预览窗口
	 */
	const preview_window_open: Handler<"preview_window_open"> = async (
		_event,
		input,
	) => {
		const { taskId, url } = input;

		// 如果未传入 url，尝试从服务获取
		let previewUrl = url;
		if (!previewUrl) {
			const service = getService();
			const status = service.status(taskId);
			if (status.url) {
				previewUrl = status.url;
			} else {
				// 尝试获取 single 模式的文件路径
				const filePath = await service.getSingleFilePath(taskId);
				if (filePath) {
					previewUrl = `file://${filePath}`;
				} else {
					throw new Error(
						`任务 ${taskId} 没有正在运行的预览服务器，且未提供 url`,
					);
				}
			}
		}

		const result = openPreviewWindow(taskId, previewUrl);
		return { windowId: result.windowId };
	};

	/**
	 * 保存沙盒文件（Monaco 编辑器用）
	 * 安全校验：路径必须在 agent-sandboxes/{taskId} 下
	 */
	const sandbox_save_file: Handler<"sandbox_save_file"> = async (
		_event,
		input,
	) => {
		const { taskId, relPath, content } = input;

		// 校验 taskId 合法性
		const sanitizedTaskId = String(taskId ?? "").trim();
		if (!sanitizedTaskId) throw new Error("taskId 不能为空");
		if (sanitizedTaskId.includes("\0") || sanitizedTaskId.includes("..")) {
			throw new Error("taskId 非法");
		}

		// 校验 relPath 合法性（防路径穿越）
		const sanitizedRelPath = String(relPath ?? "").trim();
		if (!sanitizedRelPath) throw new Error("relPath 不能为空");
		if (
			sanitizedRelPath.includes("\0") ||
			sanitizedRelPath.includes("..") ||
			path.isAbsolute(sanitizedRelPath)
		) {
			throw new Error("relPath 非法");
		}

		// 拼接并校验最终路径必须在沙盒目录下
		const sandboxRoot = getAgentSandboxRoot();
		const taskDir = path.join(sandboxRoot, sanitizedTaskId);
		const targetPath = path.resolve(taskDir, sanitizedRelPath);

		if (!targetPath.startsWith(taskDir + path.sep) && targetPath !== taskDir) {
			throw new Error("路径越权：文件必须在沙盒目录内");
		}

		// 确保父目录存在
		const parentDir = path.dirname(targetPath);
		await fs.mkdir(parentDir, { recursive: true });

		// 写入文件
		await fs.writeFile(targetPath, content, "utf8");

		return { success: true };
	};

	return {
		preview_server_start,
		preview_server_stop,
		preview_server_status,
		preview_window_open,
		sandbox_save_file,
	};
}
