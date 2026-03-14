/**
 * CLI 历史同步 IPC Handlers
 * 提供 Codex CLI 和 Claude Code CLI 历史会话的读取接口
 */
import type { IpcMainInvokeEvent } from "electron";
import {
	isCodexHistoryAvailable,
	listCodexThreads,
	readCodexThread,
} from "../../services/codexHistoryService";
import {
	isClaudeCodeHistoryAvailable,
	listClaudeCodeSessions,
	readClaudeCodeSession,
} from "../../services/claudeCodeHistoryService";
import type {
	CliHistoryListParams,
	CliHistoryReadParams,
} from "../../../shared/external-history-types";

export function createCliHistoryHandlers() {
	return {
		/** 列出 Codex CLI 历史线程 */
		cli_history_codex_list: async (
			_event: IpcMainInvokeEvent,
			input: CliHistoryListParams,
		) => {
			const available = await isCodexHistoryAvailable();
			if (!available) {
				return { available: false, threads: [] };
			}
			const threads = await listCodexThreads(input);
			return { available: true, threads };
		},

		/** 读取 Codex CLI 完整会话 */
		cli_history_codex_read: async (
			_event: IpcMainInvokeEvent,
			input: CliHistoryReadParams,
		) => {
			const result = await readCodexThread(input.threadId, input.maxMessages);
			return result;
		},

		/** 列出 Claude Code CLI 历史会话 */
		cli_history_claude_code_list: async (
			_event: IpcMainInvokeEvent,
			input: CliHistoryListParams,
		) => {
			const available = await isClaudeCodeHistoryAvailable();
			if (!available) {
				return { available: false, threads: [] };
			}
			const threads = await listClaudeCodeSessions(input);
			return { available: true, threads };
		},

		/** 读取 Claude Code CLI 完整会话 */
		cli_history_claude_code_read: async (
			_event: IpcMainInvokeEvent,
			input: CliHistoryReadParams,
		) => {
			const result = await readClaudeCodeSession(
				input.threadId,
				input.maxMessages,
			);
			return result;
		},

		/** 检查 CLI 历史可用性 */
		cli_history_check_available: async () => {
			const [codex, claudeCode] = await Promise.all([
				isCodexHistoryAvailable(),
				isClaudeCodeHistoryAvailable(),
			]);
			return { codex, claudeCode };
		},
	};
}
