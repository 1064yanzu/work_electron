/**
 * CLI 历史导入器
 * 将外部 CLI 历史消息转换为本应用的 CodingSessionMessage 格式
 * 直接构建快照保存，不影响当前活跃 session
 */
import type {
	ExternalThreadMeta,
	ExternalSessionMessage,
	CliHistoryReadResult,
} from "../../../electron/shared/external-history-types";
import type {
	CodingSessionMessage,
	SessionToolCall,
	ThinkingBlock,
} from "../stores/codingSessionTypes";
import type { CodingThread } from "../stores/codingThreadTypes";
import type { CodingSessionState } from "../stores/codingSessionStore";
import { codingSessionStore } from "../stores/codingSessionStore";
import { codingThreadStore } from "../stores/codingThreadStore";
import { invoke as desktopInvoke } from "../tauriCompat";

async function invoke<T>(command: string, args?: Record<string, unknown>) {
	return desktopInvoke<T>(command, args);
}

/**
 * 将外部线程导入为本地线程并加载历史消息
 */
export async function importExternalThread(
	meta: ExternalThreadMeta,
): Promise<CodingThread | null> {
	// 读取完整会话内容
	const command =
		meta.source === "codex-cli"
			? "cli_history_codex_read"
			: "cli_history_claude_code_read";

	const result = (await invoke(command, {
		threadId: meta.id,
		maxMessages: 200,
	})) as CliHistoryReadResult | null;

	if (!result) return null;

	// 创建本地线程
	const backend = meta.source === "codex-cli" ? "codex" : "claude-code";
	const thread = codingThreadStore.createThread(meta.cwd, {
		title: meta.title,
		backend: backend as "codex" | "claude-code",
		model: meta.model || (backend === "codex" ? "" : "claude-sonnet-4-6"),
		source: meta.source,
		externalThreadId: meta.id,
	});

	if (!thread) return null;

	// 转换消息并直接保存为快照（不影响当前 session）
	const messages = convertExternalMessages(result.messages, backend);
	saveMessagesAsSnapshot(thread.id, messages);

	return thread;
}

/**
 * 仅加载外部线程的消息（不创建新线程，用于预览）
 */
export async function previewExternalThread(
	meta: ExternalThreadMeta,
): Promise<CodingSessionMessage[]> {
	const command =
		meta.source === "codex-cli"
			? "cli_history_codex_read"
			: "cli_history_claude_code_read";

	const result = (await invoke(command, {
		threadId: meta.id,
		maxMessages: 100,
	})) as CliHistoryReadResult | null;

	if (!result) return [];

	const backend = meta.source === "codex-cli" ? "codex" : "claude-code";
	return convertExternalMessages(result.messages, backend);
}

/**
 * 将 ExternalSessionMessage[] 转换为 CodingSessionMessage[]
 */
function convertExternalMessages(
	messages: ExternalSessionMessage[],
	backend: "codex" | "claude-code",
): CodingSessionMessage[] {
	return messages.map((msg, index) => {
		const toolCalls: SessionToolCall[] = (msg.toolCalls || []).map((tc) => ({
			id: tc.id,
			name: tc.name,
			input: tc.input,
			output: tc.output,
			status: tc.status === "error" ? "error" : "completed",
			isError: tc.status === "error",
		}));

		const thinkingBlocks: ThinkingBlock[] = msg.thinking
			? [
					{
						id: `thinking_${msg.id}`,
						content: msg.thinking,
						title: backend === "codex" ? "Codex 思考" : "Claude 思考",
						isStreaming: false,
					},
				]
			: [];

		return {
			id: msg.id || `imported_${index}`,
			role: msg.role,
			timestamp: msg.timestamp,
			content: msg.content,
			isStreaming: false,
			thinkingBlocks,
			toolCalls,
			subagents: [],
			notifications: [],
			metadata: {
				backend: backend as "claude-code" | "codex",
			},
		};
	});
}

/**
 * 直接构建 session 状态并保存为快照（不影响当前活跃 session）
 */
function saveMessagesAsSnapshot(
	threadId: string,
	messages: CodingSessionMessage[],
): void {
	const snapshotState: CodingSessionState = {
		sdkSessionId: null,
		runId: null,
		status: "completed",
		messages,
		streamingMessageId: null,
		pendingPermission: null,
		usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
		activeSubagents: [],
		currentTeam: null,
	};
	codingSessionStore.saveExternalSnapshot(threadId, snapshotState);
}
