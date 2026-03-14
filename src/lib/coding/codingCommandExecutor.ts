import type {
	CodingApprovalMode,
	CodingBackendId,
	RuntimeControlAction,
} from "../../../electron/shared/coding-workspace";
import type { SettingsTabId } from "../../components/Settings/types";
import { getOrCreateSessionManager } from "./sessionManagerFactory";
import { pickAndAttachContextFiles } from "./contextFiles";
import { forkCurrentSession } from "./forkSession";
import { startCodeReview } from "./codeReview";
import { initProjectConfig } from "./initConfig";
import { codingSessionStore } from "../stores/codingSessionStore";
import { codingAgentStore, type CodingMode } from "../stores/codingAgentStore";
import { codingThreadStore } from "../stores/codingThreadStore";
import { codingRuntimeStore } from "../stores/codingRuntimeStore";
import { DEFAULT_AI_CODING_SETTINGS } from "../coding/codingSettings";
import { codingWorkspaceStore } from "../stores/codingWorkspaceStore";
import { terminalStore } from "../stores/terminalStore";

export interface CommandContext {
	threadId: string | null;
	projectPath: string | null;
	onOpenSettings?: (tab?: SettingsTabId) => void;
}

export interface CommandResult {
	success: boolean;
	error?: string;
	/** 命令执行成功后的反馈信息（用于 toast 通知，而非假的聊天消息） */
	message?: string;
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
				return openRightPanelTab("git");
			case "open_activity_panel":
				return openRightPanelTab("terminal-log");
			case "open_context_panel":
				return openRightPanelTab("git");
			case "pick_context_files":
				return executePickContextFiles(context);
			// ── 新增命令 ──
			case "new_thread":
				return executeNewThread(context);
			case "rename_thread":
				return executeRenameThread(context);
			case "fork_session":
				return executeForkSession(context);
			case "copy_last_output":
				return executeCopyLastOutput();
			case "start_review":
				return executeStartReview(context);
			case "init_config":
				return executeInitConfig(context);
			case "set_mode_plan":
				return executeSetMode(context, "plan");
			case "open_mcp_panel":
				return { success: true, message: "MCP 面板功能正在开发中，敬请期待。" };
			case "list_terminals":
				return executeListTerminals();
			case "clean_terminals":
				return executeCleanTerminals();
			case "set_theme":
				return executeSetTheme(payload?.theme as string);
			case "set_reasoning_effort":
				return executeSetReasoningEffort(context, payload?.reasoningEffort as string);
			case "open_feedback":
				return { success: true, message: "感谢您的反馈意愿！反馈功能即将上线。" };
			default:
				return { success: false, error: `未知命令: ${actionId}` };
		}
}

function openRightPanelTab(
	tab: "git" | "session-changes" | "terminal-log",
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
	codingWorkspaceStore.setRightPanelTab("git");
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
	return { success: true, message: "会话已清空" };
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
	const modeLabels: Record<string, string> = { code: "Code", plan: "Plan", ask: "Ask" };
	return { success: true, message: `已切换到 ${modeLabels[mode] || mode} 模式` };
}

async function executeSetBackend(
	context: CommandContext,
	backend: CodingBackendId,
): Promise<CommandResult> {
	if (!backend) return { success: false, error: "缺少目标后端。" };
	const capability = codingRuntimeStore.getState().capabilities[backend];
	const defaultModel = capability?.defaultModel
		?? (backend === "codex" ? DEFAULT_AI_CODING_SETTINGS.codexDefaultModel : DEFAULT_AI_CODING_SETTINGS.claudeDefaultModel);
	const defaultApprovalMode = backend === "codex"
		? DEFAULT_AI_CODING_SETTINGS.codexDefaultApprovalMode
		: DEFAULT_AI_CODING_SETTINGS.claudeDefaultApprovalMode;
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
	const backendLabels: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex" };
	return { success: true, message: `已切换到 ${backendLabels[backend] || backend} 后端` };
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
	return { success: true, message: `已切换模型为 ${model}` };
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
	return { success: true, message: "审批模式已更新" };
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
	return { success: true, message: "会话已恢复" };
}

// ── 新增命令执行函数 ──

async function executeNewThread(context: CommandContext): Promise<CommandResult> {
	if (!context.projectPath) {
		return { success: false, error: "请先打开一个项目。" };
	}
	const backend = codingAgentStore.getState().codingBackend;
	const mode = codingAgentStore.getState().codingMode;
	const capability = codingRuntimeStore.getState().capabilities[backend];

	// 保存当前线程快照
	if (context.threadId) {
		codingSessionStore.saveSnapshot(context.threadId);
	}

	const newThread = codingThreadStore.createThread(context.projectPath, {
		backend,
		codingMode: mode,
		model: capability?.defaultModel ?? undefined,
		capabilitiesSnapshot: capability ?? undefined,
	});

	// 切换 session 到新线程
	codingSessionStore.switchToThread(context.threadId, newThread.id);

	return { success: true, message: "已创建新线程。" };
}

async function executeRenameThread(context: CommandContext): Promise<CommandResult> {
	const thread = getActiveThread(context);
	if (!thread) return { success: false, error: "当前没有活跃线程。" };

	const newTitle = window.prompt("请输入新的线程标题：", thread.title);
	if (!newTitle || newTitle.trim() === "") {
		return { success: false, error: "已取消重命名。" };
	}

	codingThreadStore.updateThread(thread.id, { title: newTitle.trim() });
	return { success: true, message: `线程已重命名为「${newTitle.trim()}」` };
}

async function executeForkSession(context: CommandContext): Promise<CommandResult> {
	if (!context.threadId) {
		return { success: false, error: "当前没有活跃线程。" };
	}
	if (!context.projectPath) {
		return { success: false, error: "请先打开一个项目。" };
	}

	const result = await forkCurrentSession(context.threadId, context.projectPath);
	if (!result.success) {
		return { success: false, error: result.error };
	}

	// 切换 thread store 到新线程
	if (result.newThreadId) {
		codingThreadStore.switchThread(result.newThreadId);
	}
	return { success: true };
}

async function executeCopyLastOutput(): Promise<CommandResult> {
	const messages = codingSessionStore.getState().messages;
	// 从后往前找最后一条 assistant 消息
	const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
	if (!lastAssistant) {
		return { success: false, error: "没有找到 AI 回复消息。" };
	}

	const content = lastAssistant.content;
	if (!content.trim()) {
		return { success: false, error: "最后一条 AI 回复内容为空。" };
	}

	try {
		await navigator.clipboard.writeText(content);
		return { success: true, message: "已将最后一条 AI 回复复制到剪贴板。" };
	} catch {
		return { success: false, error: "写入剪贴板失败，请检查浏览器权限。" };
	}
}

async function executeStartReview(context: CommandContext): Promise<CommandResult> {
	if (!context.projectPath) {
		return { success: false, error: "请先打开一个项目。" };
	}
	if (!context.threadId) {
		return { success: false, error: "当前没有活跃线程。" };
	}

	const reviewResult = await startCodeReview(context.projectPath);
	if (!reviewResult.success || !reviewResult.prompt) {
		return { success: false, error: reviewResult.error || "代码审查启动失败。" };
	}

	// 通过 session manager 发送 review prompt
	const thread = codingThreadStore.getThread(context.threadId);
	if (!thread) {
		return { success: false, error: "当前线程不存在。" };
	}

	const manager = getOrCreateSessionManager(context.threadId, thread.backend);
	codingSessionStore.addUserMessage(reviewResult.prompt);

	try {
		await manager.send(reviewResult.prompt, {
			cwd: context.projectPath,
			mode: thread.codingMode || "code",
			model: thread.model,
			approvalMode: thread.approvalMode,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { success: false, error: `发送审查请求失败: ${message}` };
	}

	return { success: true };
}

async function executeInitConfig(context: CommandContext): Promise<CommandResult> {
	if (!context.projectPath) {
		return { success: false, error: "请先打开一个项目。" };
	}

	const backend = codingAgentStore.getState().codingBackend;
	const result = await initProjectConfig(context.projectPath, backend);

	if (!result.success) {
		return { success: false, error: result.error };
	}

	const fileName = backend === "claude-code" ? "CLAUDE.md" : "AGENTS.md";
	return { success: true, message: `已为当前项目创建 ${fileName} 配置文件: ${result.filePath}` };
}

function executeListTerminals(): CommandResult {
	const { terminals } = terminalStore.getState();
	if (terminals.length === 0) {
		return { success: true, message: "当前没有活跃的终端实例。" };
	}

	const lines = terminals.map(
		(t, i) =>
			`  ${i + 1}. [${t.id}] ${t.name} — PID: ${t.pid}, 目录: ${t.cwd}`,
	);
	return { success: true, message: `当前活跃终端 (${terminals.length} 个):\n${lines.join("\n")}` };
}

async function executeCleanTerminals(): Promise<CommandResult> {
	const { terminals } = terminalStore.getState();
	if (terminals.length === 0) {
		return { success: true, message: "没有需要清理的终端。" };
	}

	const count = terminals.length;
	await terminalStore.destroyAll();
	return { success: true, message: `已清理 ${count} 个终端实例。` };
}

async function executeSetTheme(theme?: string): Promise<CommandResult> {
	if (!theme) {
		return { success: false, error: "请通过 /theme 子菜单选择一个主题。" };
	}

	const { setAICodingSettings } = await import("./codingSettings");
	await setAICodingSettings({ highlightTheme: theme });
	return { success: true, message: `代码高亮主题已切换为: ${theme}` };
}

async function executeSetReasoningEffort(
	_context: CommandContext,
	effort?: string,
): Promise<CommandResult> {
	if (!effort || !["low", "medium", "high"].includes(effort)) {
		return { success: false, error: "请通过 /thinking 子菜单选择思考深度（低/中/高）。" };
	}
	codingAgentStore.setCodexReasoningEffort(effort as "low" | "medium" | "high");
	const effortLabels: Record<string, string> = { low: "低", medium: "中", high: "高" };
	return { success: true, message: `Codex 思考深度已设置为: ${effortLabels[effort]}` };
}
