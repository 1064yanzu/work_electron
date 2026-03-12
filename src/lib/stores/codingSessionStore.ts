/**
 * Coding Session Store
 * 管理编程工作区的会话状态：消息流、工具调用、权限请求、用量统计
 * 与 codingWorkspaceStore 解耦，后者专注于项目/文件/布局管理
 */

import { createStore, createUseStore, createUseStoreSelector } from './createStore';
import type {
	CodingSessionMessage,
	SessionPermissionRequest,
	SessionStatus,
	SessionToolCall,
	SessionUsage,
	SubagentActivity,
	TaskNotification,
	TeamActivity,
	TeammateInfo,
} from './codingSessionTypes';

// === State ===

export interface CodingSessionState {
	/** SDK session ID，用于 resume */
	sdkSessionId: string | null;
	/** 当前 IPC 运行 ID */
	runId: string | null;
	/** 会话运行状态 */
	status: SessionStatus;
	/** 消息列表 */
	messages: CodingSessionMessage[];
	/** 当前正在流式输出的消息 ID */
	streamingMessageId: string | null;
	/** 待审批的权限请求 */
	pendingPermission: SessionPermissionRequest | null;
	/** Token 用量统计 */
	usage: SessionUsage;
	/** 活跃子代理（跟踪当前 session 中所有 subagent） */
	activeSubagents: SubagentActivity[];
	/** 当前团队信息 */
	currentTeam: TeamActivity | null;
}

/** Session 快照（用于多线程切换时保存/恢复） */
export type SessionSnapshot = CodingSessionState;

const initialState: CodingSessionState = {
	sdkSessionId: null,
	runId: null,
	status: 'idle',
	messages: [],
	streamingMessageId: null,
	pendingPermission: null,
	usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
	activeSubagents: [],
	currentTeam: null,
};

// === Store Instance ===

const store = createStore<CodingSessionState>(initialState);

// === 多线程 Session 快照管理 ===

/** 各线程的 session 快照 Map<threadId, snapshot> */
const sessionSnapshots = new Map<string, SessionSnapshot>();

/** 保存当前 session 状态为指定线程的快照 */
function saveSnapshot(threadId: string) {
	sessionSnapshots.set(threadId, { ...store.getState() });
}

/** 从快照恢复指定线程的 session 状态 */
function loadSnapshot(threadId: string): boolean {
	const snapshot = sessionSnapshots.get(threadId);
	if (!snapshot) return false;
	store.setState(() => snapshot);
	return true;
}

/** 切换到指定线程：保存当前快照 → 加载目标快照（或初始化） */
function switchToThread(currentThreadId: string | null, targetThreadId: string) {
	// 保存当前线程快照
	if (currentThreadId) {
		saveSnapshot(currentThreadId);
	}
	// 加载目标线程快照，不存在则初始化
	if (!loadSnapshot(targetThreadId)) {
		store.setState(() => initialState);
	}
}

/** 删除指定线程的快照 */
function deleteSnapshot(threadId: string) {
	sessionSnapshots.delete(threadId);
}

/** 获取指定线程的快照（不切换） */
function getSnapshot(threadId: string): SessionSnapshot | undefined {
	return sessionSnapshots.get(threadId);
}

// === Helper: 生成唯一 ID ===

function genId(prefix = 'msg') {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// === 消息操作 ===

/** 添加用户消息 */
function addUserMessage(content: string): string {
	const id = genId();
	const message: CodingSessionMessage = {
		id,
		role: 'user',
		timestamp: Date.now(),
		content,
		isStreaming: false,
		thinkingBlocks: [],
		toolCalls: [],
		subagents: [],
		notifications: [],
	};
	store.setState((s) => ({
		...s,
		messages: [...s.messages, message],
	}));
	return id;
}

/** 创建 assistant 占位消息（开始流式输出时调用） */
function createAssistantMessage(backend: 'claude-code' | 'codex'): string {
	const id = genId();
	const message: CodingSessionMessage = {
		id,
		role: 'assistant',
		timestamp: Date.now(),
		content: '',
		isStreaming: true,
		thinkingBlocks: [],
		toolCalls: [],
		subagents: [],
		notifications: [],
		metadata: { backend },
	};
	store.setState((s) => ({
		...s,
		messages: [...s.messages, message],
		streamingMessageId: id,
		status: 'running',
	}));
	return id;
}

/** 追加文本到当前流式消息 */
function appendText(content: string) {
	const { streamingMessageId } = store.getState();
	if (!streamingMessageId) return;
	store.setState((s) => ({
		...s,
		messages: s.messages.map((m) =>
			m.id === streamingMessageId
				? { ...m, content: m.content + content }
				: m,
		),
	}));
}

/** 追加/更新思考块 */
function appendThinking(content: string, title = '思考过程') {
	const { streamingMessageId } = store.getState();
	if (!streamingMessageId) return;
	store.setState((s) => ({
		...s,
		messages: s.messages.map((m) => {
			if (m.id !== streamingMessageId) return m;
			const blocks = [...m.thinkingBlocks];
			// 追加到最后一个 streaming 块，或创建新块
			const lastBlock = blocks[blocks.length - 1];
			if (lastBlock && lastBlock.isStreaming) {
				blocks[blocks.length - 1] = {
					...lastBlock,
					content: lastBlock.content + content,
				};
			} else {
				blocks.push({
					id: genId('think'),
					content,
					title,
					isStreaming: true,
				});
			}
			return { ...m, thinkingBlocks: blocks };
		}),
	}));
}

/** 结束当前思考块的流式状态 */
function finalizeThinking() {
	const { streamingMessageId } = store.getState();
	if (!streamingMessageId) return;
	store.setState((s) => ({
		...s,
		messages: s.messages.map((m) => {
			if (m.id !== streamingMessageId) return m;
			return {
				...m,
				thinkingBlocks: m.thinkingBlocks.map((b) => ({
					...b,
					isStreaming: false,
				})),
			};
		}),
	}));
}

/** 添加工具调用记录 */
function addToolCall(toolCall: Omit<SessionToolCall, 'isError'> & { isError?: boolean }) {
	const { streamingMessageId } = store.getState();
	if (!streamingMessageId) return;
	const tc: SessionToolCall = {
		...toolCall,
		isError: toolCall.isError ?? false,
	};
	store.setState((s) => ({
		...s,
		messages: s.messages.map((m) =>
			m.id === streamingMessageId
				? { ...m, toolCalls: [...m.toolCalls, tc] }
				: m,
		),
	}));
}

/** 更新工具调用记录 */
function updateToolCall(toolCallId: string, updates: Partial<SessionToolCall>) {
	const { streamingMessageId } = store.getState();
	if (!streamingMessageId) return;
	store.setState((s) => ({
		...s,
		messages: s.messages.map((m) =>
			m.id === streamingMessageId
				? {
						...m,
						toolCalls: m.toolCalls.map((tc) =>
							tc.id === toolCallId ? { ...tc, ...updates } : tc,
						),
					}
				: m,
		),
	}));
}

// === 会话状态操作 ===

/** 设置运行状态 */
function setStatus(status: SessionStatus) {
	store.setState((s) => ({ ...s, status }));
}

/** 设置 SDK session ID（用于 resume） */
function setSdkSessionId(sessionId: string) {
	store.setState((s) => ({ ...s, sdkSessionId: sessionId }));
}

/** 设置当前运行 ID */
function setRunId(runId: string | null) {
	store.setState((s) => ({ ...s, runId }));
}

/** 设置权限请求 */
function setPermission(request: SessionPermissionRequest | null) {
	store.setState((s) => ({
		...s,
		pendingPermission: request,
		status: request ? 'awaiting_permission' : s.status === 'awaiting_permission' ? 'running' : s.status,
	}));
}

/** 解除权限请求 */
function resolvePermission() {
	store.setState((s) => ({
		...s,
		pendingPermission: null,
		status: s.status === 'awaiting_permission' ? 'running' : s.status,
	}));
}

/** 结束当前流式消息 */
function finalizeStreamingMessage(durationMs?: number) {
	const { streamingMessageId } = store.getState();
	if (!streamingMessageId) return;
	store.setState((s) => ({
		...s,
		messages: s.messages.map((m) =>
			m.id === streamingMessageId
				? {
						...m,
						isStreaming: false,
						thinkingBlocks: m.thinkingBlocks.map((b) => ({
							...b,
							isStreaming: false,
						})),
						metadata: m.metadata
							? { ...m.metadata, durationMs }
							: undefined,
					}
				: m,
		),
		streamingMessageId: null,
	}));
}

/** 添加系统消息 */
function addSystemMessage(content: string) {
	const id = genId('sys');
	const message: CodingSessionMessage = {
		id,
		role: 'system',
		timestamp: Date.now(),
		content,
		isStreaming: false,
		thinkingBlocks: [],
		toolCalls: [],
		subagents: [],
		notifications: [],
	};
	store.setState((s) => ({
		...s,
		messages: [...s.messages, message],
	}));
}

/** 更新用量统计 */
function updateUsage(partial: Partial<SessionUsage>) {
	store.setState((s) => ({
		...s,
		usage: { ...s.usage, ...partial },
	}));
}

// === 多 Agent 操作 ===

/** 添加子代理活动（到当前流式消息 + 全局跟踪） */
function addSubagent(subagent: SubagentActivity) {
	const { streamingMessageId } = store.getState();
	store.setState((s) => ({
		...s,
		activeSubagents: [...s.activeSubagents, subagent],
		messages: streamingMessageId
			? s.messages.map((m) =>
					m.id === streamingMessageId
						? { ...m, subagents: [...m.subagents, subagent] }
						: m,
				)
			: s.messages,
	}));
}

/** 更新子代理状态 */
function updateSubagent(agentId: string, updates: Partial<SubagentActivity>) {
	const { streamingMessageId } = store.getState();
	const updater = (sa: SubagentActivity) =>
		sa.agentId === agentId ? { ...sa, ...updates } : sa;

	store.setState((s) => ({
		...s,
		activeSubagents: s.activeSubagents.map(updater),
		messages: streamingMessageId
			? s.messages.map((m) =>
					m.id === streamingMessageId
						? { ...m, subagents: m.subagents.map(updater) }
						: m,
				)
			: s.messages,
	}));
}

/** 设置团队信息 */
function setTeam(team: TeamActivity) {
	const { streamingMessageId } = store.getState();
	store.setState((s) => ({
		...s,
		currentTeam: team,
		messages: streamingMessageId
			? s.messages.map((m) =>
					m.id === streamingMessageId ? { ...m, team } : m,
				)
			: s.messages,
	}));
}

/** 更新团队成员状态 */
function updateTeammate(name: string, updates: Partial<TeammateInfo>) {
	const { streamingMessageId, currentTeam } = store.getState();
	if (!currentTeam) return;

	const updatedTeammates = currentTeam.teammates.map((t) =>
		t.name === name ? { ...t, ...updates } : t,
	);
	// 如果成员不存在，添加到列表
	if (!currentTeam.teammates.find((t) => t.name === name)) {
		updatedTeammates.push({ name, status: 'running', ...updates } as TeammateInfo);
	}
	const updatedTeam = { ...currentTeam, teammates: updatedTeammates };

	store.setState((s) => ({
		...s,
		currentTeam: updatedTeam,
		messages: streamingMessageId
			? s.messages.map((m) =>
					m.id === streamingMessageId ? { ...m, team: updatedTeam } : m,
				)
			: s.messages,
	}));
}

/** 添加任务通知（到当前流式消息） */
function addNotification(notification: Omit<TaskNotification, 'id' | 'timestamp'>) {
	const { streamingMessageId } = store.getState();
	if (!streamingMessageId) return;
	const full: TaskNotification = {
		...notification,
		id: genId('notif'),
		timestamp: Date.now(),
	};
	store.setState((s) => ({
		...s,
		messages: s.messages.map((m) =>
			m.id === streamingMessageId
				? { ...m, notifications: [...m.notifications, full] }
				: m,
		),
	}));
}

/** 追加 summary 到指定工具调用（用于 tool_use_summary 事件） */
function appendToolUseSummary(toolCallIds: string[], summary: string) {
	const { streamingMessageId } = store.getState();
	if (!streamingMessageId) return;
	const idSet = new Set(toolCallIds);
	store.setState((s) => ({
		...s,
		messages: s.messages.map((m) =>
			m.id === streamingMessageId
				? {
						...m,
						toolCalls: m.toolCalls.map((tc) =>
							idSet.has(tc.id)
								? { ...tc, output: summary }
								: tc,
						),
					}
				: m,
		),
	}));
}

/** 清空会话（新建对话） */
function clear() {
	store.setState(() => initialState);
}

// === 导出 ===

export const codingSessionStore = {
	...store,
	addUserMessage,
	createAssistantMessage,
	appendText,
	appendThinking,
	finalizeThinking,
	addToolCall,
	updateToolCall,
	setStatus,
	setSdkSessionId,
	setRunId,
	setPermission,
	resolvePermission,
	finalizeStreamingMessage,
	addSystemMessage,
	updateUsage,
	addSubagent,
	updateSubagent,
	setTeam,
	updateTeammate,
	addNotification,
	appendToolUseSummary,
	clear,
	// 多线程快照管理
	saveSnapshot,
	loadSnapshot,
	switchToThread,
	deleteSnapshot,
	getSnapshot,
};

export const useCodingSessionStore = createUseStore(store);
export const useCodingSessionSelector = createUseStoreSelector(store);
