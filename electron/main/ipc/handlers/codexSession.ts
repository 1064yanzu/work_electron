import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type { ChildProcess } from "node:child_process";
import type { RuntimeControlAction } from "../../../shared/coding-workspace";
import { getBackendCapabilityMatrix } from "../../services/codingWorkspaceService";
import {
	findCodexBinary,
	spawnCodexSession,
	type CodexOutputEvent,
	type CodexSessionOptions,
} from "../../services/codexService";

const activeSessions = new Map<string, ChildProcess>();

interface CodexHandlerDeps {
	getMainWindow: () => BrowserWindow | null;
}

function emitCodexEvent(
	window: BrowserWindow | null,
	runId: string,
	event: CodexOutputEvent,
) {
	window?.webContents?.send("codex-session-event", {
		runId,
		...event,
	});
}

export function createCodexSessionHandlers(deps: CodexHandlerDeps) {
	return {
		codex_check_available: async (_event: IpcMainInvokeEvent) => {
			const binary = findCodexBinary();
			return { available: !!binary, path: binary };
		},

		codex_get_capabilities: async (_event: IpcMainInvokeEvent) => {
			return getBackendCapabilityMatrix("codex");
		},

		codex_session_start: async (
			_event: IpcMainInvokeEvent,
			input: {
				prompt: string;
				cwd: string;
				model?: string;
				approvalMode?: "untrusted" | "on-failure" | "on-request" | "never";
				resumeSessionId?: string;
				workspaceContext?: string;
			},
		) => {
			const binary = findCodexBinary();
			if (!binary) {
				throw new Error("Codex CLI 未找到，请先安装 codex。");
			}

			const runId = `codex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			const win = deps.getMainWindow();
			const options: CodexSessionOptions = {
				prompt: input.prompt,
				cwd: input.cwd,
				model: input.model,
				approvalMode: input.approvalMode,
				resumeSessionId: input.resumeSessionId,
				workspaceContext: input.workspaceContext,
			};

			const proc = spawnCodexSession(binary, options, (event: CodexOutputEvent) => {
				emitCodexEvent(win, runId, event);
				if (event.type === "done" || event.type === "error") {
					activeSessions.delete(runId);
				}
			});

			activeSessions.set(runId, proc);
			return runId;
		},

		codex_session_abort: async (
			_event: IpcMainInvokeEvent,
			input: { runId: string },
		) => {
			const proc = activeSessions.get(input.runId);
			if (proc) {
				proc.kill("SIGTERM");
				activeSessions.delete(input.runId);
			}
			return { success: true };
		},

		codex_runtime_control: async (
			_event: IpcMainInvokeEvent,
			input: { runId: string; action: RuntimeControlAction },
		) => {
			const proc = activeSessions.get(input.runId);
			if (!proc) {
				return { success: false, error: "未找到对应的 Codex 运行实例。" };
			}

			if (input.action.type === "interrupt") {
				proc.kill("SIGTERM");
				activeSessions.delete(input.runId);
				return { success: true };
			}

			return {
				success: false,
				error: `Codex 当前不支持运行中执行 ${input.action.type} 控制。`,
			};
		},
	};
}
