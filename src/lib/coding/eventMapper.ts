/**
 * 事件映射器
 * 将 UIEvent（来自 streamState.ts / agent-sdk-event）映射为 codingSessionStore 操作
 */

import type { UIEvent } from "../agent/streamState";
import { codingThreadStore } from "../stores/codingThreadStore";
import { codingSessionStore } from "../stores/codingSessionStore";
import { diffStore, type FileDiff } from "../stores/diffStore";
import {
	generateDiff,
	inferLanguage,
	parseDiffStats,
} from "../utils/diffUtils";

/** 文件操作工具集合（包含 Claude Code CLI 原始名称和内部名称） */
const FILE_WRITE_TOOLS = new Set([
	"Edit",
	"Write",
	"Patch",
	"MultiEdit",
	// Claude Code CLI 原始名称
	"file_editor",
	"text_editor",
	"str_replace_editor",
	"text_editor_20250124",
	"text_editor_20241022",
	"edit_file",
	"file_edit",
	"apply_diff",
	"replace_in_file",
	"insert_code_in_file",
	"write_file",
	"create_file",
	"file_write",
	"save_file",
	"apply_patch",
	"file_patch",
]);

/** 处理单个 UIEvent */
export function processUIEvent(event: UIEvent): void {
	switch (event.type) {
		case "text":
		case "text_delta": {
			codingSessionStore.appendText(event.content);
			break;
		}

		case "thought_delta": {
			codingSessionStore.appendThinking(
				event.content,
				event.title || "思考过程",
			);
			break;
		}

		case "tool_call_start": {
			codingSessionStore.addToolCall({
				id: event.id,
				name: event.name,
				input: event.input,
				status: "running",
			});
			break;
		}

		case "tool_input_complete": {
			codingSessionStore.updateToolCall(event.id, {
				input: event.input,
			});
			break;
		}

		case "tool_call_end": {
			const updates: Partial<
				import("../stores/codingSessionTypes").SessionToolCall
			> = {
				output: event.output,
				status: event.isError ? "error" : "completed",
				isError: event.isError,
				durationMs: event.duration,
			};

			// 如果是文件写入工具，生成 diff 记录
			const state = codingSessionStore.getState();
			const streamingMsg = state.messages.find(
				(m) => m.id === state.streamingMessageId,
			);
			const toolCall = streamingMsg?.toolCalls.find((tc) => tc.id === event.id);

			if (toolCall && FILE_WRITE_TOOLS.has(toolCall.name)) {
				const input = toolCall.input;
				const filePath = (input.file_path || input.path || "") as string;
				if (filePath) {
					const oldContent = (input.old_string as string) || "";
					const newContent =
						(input.new_string as string) || (input.content as string) || "";
					const diffId = `diff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
					const diff: FileDiff = {
						id: diffId,
						filePath,
						oldContent,
						newContent,
						status: "pending",
						timestamp: Date.now(),
						toolCallId: event.id,
						toolName: toolCall.name,
						language: inferLanguage(filePath),
					};
					diffStore.addDiff(diff);
					updates.diffId = diffId;

					const activeThreadId = codingThreadStore.getState().activeThreadId;
					if (activeThreadId) {
						const thread = codingThreadStore.getThread(activeThreadId);
						if (thread) {
							const stats = parseDiffStats(
								generateDiff(oldContent, newContent),
							);
							codingThreadStore.updateThread(activeThreadId, {
								diffStats: {
									additions:
										(thread.diffStats?.additions ?? 0) + stats.additions,
									deletions:
										(thread.diffStats?.deletions ?? 0) + stats.deletions,
								},
							});
						}
					}
				}
			}

			codingSessionStore.updateToolCall(event.id, updates);
			break;
		}

		case "session_init": {
			codingSessionStore.setSdkSessionId(event.sessionId);
			break;
		}

		case "result": {
			if (event.isError || event.subtype === "error") {
				codingSessionStore.setStatus("error");
			} else if (event.subtype === "cancelled") {
				codingSessionStore.setStatus("idle");
			} else {
				codingSessionStore.setStatus("completed");
			}
			codingSessionStore.finalizeStreamingMessage(event.durationMs);
			break;
		}

		case "turn_complete": {
			// 结束当前思考块
			codingSessionStore.finalizeThinking();
			break;
		}

		case "system_notice": {
			codingSessionStore.addSystemMessage(event.content);
			break;
		}

		// === 多 Agent 事件映射 ===

		case "session_start": {
			const parts: string[] = ["会话开始"];
			if (event.model) parts.push(`模型: ${event.model}`);
			if (event.agentType) parts.push(`代理类型: ${event.agentType}`);
			if (event.agentRole) parts.push(`角色: ${event.agentRole}`);
			codingSessionStore.addSystemMessage(parts.join(" · "));
			break;
		}

		case "session_end": {
			codingSessionStore.addSystemMessage(
				`会话结束${event.reason ? `: ${event.reason}` : ""}`,
			);
			break;
		}

		case "subagent_start": {
			const id = `sa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
			codingSessionStore.addSubagent({
				id,
				agentId: event.agentId ?? null,
				agentType: event.agentType ?? null,
				status: "running",
				startedAt: Date.now(),
			});
			break;
		}

		case "subagent_stop": {
			if (event.agentId) {
				codingSessionStore.updateSubagent(event.agentId, {
					status: "completed",
					transcriptPath: event.transcriptPath ?? undefined,
				});
			}
			break;
		}

		case "leader_start": {
			codingSessionStore.setTeam({
				teamId: event.teamId ?? `team_${Date.now()}`,
				teamName: event.agentType ?? null,
				leaderRunId: event.leaderRunId,
				delegationMode: event.delegationMode,
				teammateMode: event.teammateMode,
				teammates: [],
			});
			break;
		}

		case "teammate_idle": {
			if (event.teammateName) {
				codingSessionStore.updateTeammate(event.teammateName, {
					status: "idle",
				});
			}
			break;
		}

		case "teammate_complete": {
			if (event.teammateName) {
				codingSessionStore.updateTeammate(event.teammateName, {
					status: "completed",
					taskSummary: event.summary ?? undefined,
				});
			}
			break;
		}

		case "leader_merge": {
			codingSessionStore.addNotification({
				title: "团队合并",
				summary: event.summary ?? undefined,
				taskId: event.taskId ?? undefined,
			});
			break;
		}

		case "delegation_fallback": {
			codingSessionStore.addNotification({
				title: "委派降级",
				message: event.error ?? `工具 ${event.toolName ?? "未知"} 降级执行`,
			});
			break;
		}

		case "task_notification": {
			codingSessionStore.addNotification({
				taskId: event.taskId,
				status: event.status,
				title: event.title ?? "任务通知",
				message: event.message ?? undefined,
				summary: event.summary,
			});
			break;
		}

		case "tool_use_summary": {
			if (event.precedingToolUseIds?.length) {
				codingSessionStore.appendToolUseSummary(
					event.precedingToolUseIds,
					event.summary,
				);
			}
			break;
		}

		case "files_persisted":
		case "auth_status":
		case "tool_block_stop":
			// 静默忽略
			break;

		default:
			// unknown event type
			break;
	}
}

/** 批量处理 UIEvent 数组 */
export function processUIEvents(events: UIEvent[]): void {
	for (const event of events) {
		processUIEvent(event);
	}
}
