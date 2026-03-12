import type {
	CodingApprovalMode,
	CodingBackendId,
	RuntimeControlAction,
} from "../../../electron/shared/coding-workspace";
import type { SettingsTabId } from "../../components/Settings/types";
import { getOrCreateSessionManager } from "./sessionManagerFactory";
import { pickAndAttachContextFiles } from "./contextFiles";
import { codingSessionStore } from "../stores/codingSessionStore";
import { codingAgentStore, type CodingMode } from "../stores/codingAgentStore";
import { codingThreadStore } from "../stores/codingThreadStore";
import { codingRuntimeStore } from "../stores/codingRuntimeStore";
import { codingWorkspaceStore } from "../stores/codingWorkspaceStore";

export interface CommandContext {
	threadId: string | null;
	projectPath: string | null;
	onOpenSettings?: (tab?: SettingsTabId) => void;
}

export interface CommandResult {
	success: boolean;
	error?: string;
}

function getActiveThread(context: CommandContext) {
	return context.threadId ? codingThreadStore.getThread(context.threadId) : null;
}

async function applyRuntimeControl(
	threadId: string,
	action: RuntimeControlAction,
): Promise<{ success: boolean; error?: string }> {
	const thread = codingThreadStore.getThread(threadId);
	if (!thread) {
		return { success: false, error: "当前线程不存在。" };
	}
	const manager = getOrCreateSessionManager(threadId, thread.backend);
	return manager.control(action);
}

async function persistProjectDefaults(
	projectPath: string | null,
	updates: {
		defaultBackend?: CodingBackendId;
		defaultModel?: string;
		defaultApprovalMode?: CodingApprovalMode;
	},
): Promise<void> {
	if (!projectPath) return;
	await codingRuntimeStore.updateProfileDefaults({
		projectPath,
		defaultBackend: updates.defaultBackend,
		defaultModel: updates.defaultModel,
		defaultApprovalMode: updates.defaultApprovalMode,
	});
}

export async function executeCodingCommand(
	actionId: string,
	context: CommandContext,
	payload?: Record<string, unknown>,
): Promise<CommandResult> {
	switch (actionId) {
		case "clear_conversation":
			return executeClear(context);
		case "set_mode":
			return executeSetMode(context, payload?.mode as CodingMode);
		case "set_backend":
			return executeSetBackend(context, payload?.backend as CodingBackendId);
		case "set_model":
			return executeSetModel(context, payload?.model as string);
		case "set_approval_mode":
			return executeSetApprovalMode(
				context,
				payload?.approvalMode as CodingApprovalMode,
			);
			case "resume_session":
				return executeResume(context);
			case "open_settings":
				context.onOpenSettings?.("aiCoding");
				return { success: true };
			case "open_memory_panel":
				return openRightPanelTab("memory");
			case "open_activity_panel":
				return openRightPanelTab("activity");
			case "open_context_panel":
				return openRightPanelTab("context");
			case "pick_context_files":
				return executePickContextFiles(context);
			default:
				return { success: false, error: `未知命令: ${actionId}` };
		}
}

function openRightPanelTab(
	tab: "changes" | "git" | "activity" | "memory" | "context",
): CommandResult {
	codingWorkspaceStore.setRightPanelTab(tab);
	return { success: true };
}

async function executePickContextFiles(
	context: CommandContext,
): Promise<CommandResult> {
	if (!context.projectPath) {
		return { success: false, error: "请先打开一个项目。" };
	}
	const result = await pickAndAttachContextFiles(context.projectPath);
	codingWorkspaceStore.setRightPanelTab("context");
	if (result.added === 0 && result.skipped === 0) {
		return { success: false, error: "未选择任何文件。" };
	}
	if (result.added === 0) {
		return { success: false, error: "所选文件已在当前线程上下文中。" };
	}
	return { success: true };
}

async function executeClear(context: CommandContext): Promise<CommandResult> {
	codingSessionStore.clear();
	if (context.threadId) {
		codingSessionStore.saveSnapshot(context.threadId);
		codingThreadStore.updateThread(context.threadId, {
			lastRunSummary: "会话已清空",
		});
	}
	return { success: true };
}

async function executeSetMode(
	context: CommandContext,
	mode: CodingMode,
): Promise<CommandResult> {
	if (!mode) return { success: false, error: "缺少目标模式。" };
	codingAgentStore.setCodingMode(mode);
	if (context.threadId) {
		codingThreadStore.updateThread(context.threadId, { codingMode: mode });
	}
	return { success: true };
}

async function executeSetBackend(
	context: CommandContext,
	backend: CodingBackendId,
): Promise<CommandResult> {
	if (!backend) return { success: false, error: "缺少目标后端。" };
	const capability = codingRuntimeStore.getState().capabilities[backend];
	const defaultModel = capability?.defaultModel ?? (backend === "codex" ? "gpt-5-codex" : "claude-sonnet-4-6");
	const defaultApprovalMode = backend === "codex" ? "on-request" : "acceptEdits";
	codingAgentStore.setCodingBackend(backend);
	if (context.threadId) {
		codingThreadStore.updateThread(context.threadId, {
			backend,
			model: defaultModel,
			approvalMode: defaultApprovalMode,
			capabilitiesSnapshot: capability ?? undefined,
		});
	}
	await persistProjectDefaults(context.projectPath, {
		defaultBackend: backend,
		defaultModel,
		defaultApprovalMode,
	});
	return { success: true };
}

async function executeSetModel(
	context: CommandContext,
	model: string,
): Promise<CommandResult> {
	if (!model) return { success: false, error: "缺少目标模型。" };
	const thread = getActiveThread(context);
	if (!thread) return { success: false, error: "当前没有活跃线程。" };
	codingThreadStore.updateThread(thread.id, { model });
	await persistProjectDefaults(context.projectPath, { defaultModel: model });
	if (codingSessionStore.getState().status === "running") {
		const result = await applyRuntimeControl(thread.id, {
			type: "set_model",
			model,
		});
		if (!result.success) return result;
	}
	return { success: true };
}

async function executeSetApprovalMode(
	context: CommandContext,
	approvalMode: CodingApprovalMode,
): Promise<CommandResult> {
	if (!approvalMode) return { success: false, error: "缺少目标审批模式。" };
	const thread = getActiveThread(context);
	if (!thread) return { success: false, error: "当前没有活跃线程。" };
	codingThreadStore.updateThread(thread.id, { approvalMode });
	await persistProjectDefaults(context.projectPath, {
		defaultApprovalMode: approvalMode,
	});
	if (codingSessionStore.getState().status === "running") {
		const result = await applyRuntimeControl(thread.id, {
			type: "set_approval_mode",
			approvalMode,
		});
		if (!result.success) return result;
	}
	return { success: true };
}

async function executeResume(context: CommandContext): Promise<CommandResult> {
	const thread = getActiveThread(context);
	if (!thread) return { success: false, error: "当前没有活跃线程。" };
	const sessionId = thread.runtimeSessionId ?? thread.sdkSessionId;
	if (!sessionId) {
		return { success: false, error: "当前线程没有可恢复的会话 ID。" };
	}
	const result = await applyRuntimeControl(thread.id, {
		type: "resume",
		sessionId,
	});
	if (!result.success) return result;
	codingThreadStore.updateThread(thread.id, {
		runtimeSessionId: thread.backend === "codex" ? sessionId : thread.runtimeSessionId,
		sdkSessionId: thread.backend === "claude-code" ? sessionId : thread.sdkSessionId,
	});
	return { success: true };
}
