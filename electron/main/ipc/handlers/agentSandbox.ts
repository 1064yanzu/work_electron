import fs from "node:fs/promises";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { app } from "electron";

export function createAgentSandboxHandlers() {
	const agent_get_sandbox_dir = async (
		_event: IpcMainInvokeEvent,
		input: { taskId: string },
	): Promise<{ path: string }> => {
		const taskId = String(input.taskId ?? "").trim();
		if (!taskId) throw new Error("taskId 不能为空");
		if (taskId.includes("\0")) throw new Error("taskId 非法");

		const root = path.join(app.getPath("userData"), "agent-sandboxes");
		const dir = path.join(root, taskId);
		await fs.mkdir(dir, { recursive: true });
		return { path: dir };
	};

	return { agent_get_sandbox_dir };
}
