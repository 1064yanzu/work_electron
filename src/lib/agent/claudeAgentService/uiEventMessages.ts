import type { UIEvent } from "@/lib/agent/streamState";
import type { AgentMessage } from "./types";

/**
 * 把纯通知类 UI 事件映射为 system 类型的 AgentMessage。
 * 非通知类事件（text_delta / tool_call_* / result 等）返回 null，由调用方继续处理。
 */
export function mapNotificationEventToMessage(
	event: UIEvent,
): AgentMessage | null {
	switch (event.type) {
		case "session_start":
			return {
				type: "system",
				content: `会话开始（source=${String(event.source || "unknown")}）`,
				status: "running",
				metadata: {
					agentRole: event.agentRole,
					teamId: event.teamId,
					leaderRunId: event.leaderRunId,
					parentSessionId: event.parentSessionId,
					teammateMode: event.teammateMode,
					delegationMode: event.delegationMode,
				},
			};
		case "session_end":
			return {
				type: "system",
				content: `会话结束（reason=${String(event.reason || "unknown")}）`,
				status: "running",
			};
		case "subagent_start":
			return {
				type: "system",
				content: `子代理启动：${String(event.agentType || event.agentId || "unknown")}`,
				status: "running",
				metadata: {
					agentRole: "subagent",
				},
			};
		case "subagent_stop":
			return {
				type: "system",
				content: `子代理结束：${String(event.agentType || event.agentId || "unknown")}`,
				status: "running",
			};
		case "system_notice":
			return {
				type: "system",
				content: event.content,
				status: event.level === "error" ? "error" : "running",
			};
		case "task_notification": {
			const summary =
				typeof event.summary === "string" && event.summary.trim()
					? event.summary
					: typeof event.message === "string" && event.message.trim()
						? event.message
						: "任务通知";
			return {
				type: "system",
				content: summary,
				status:
					event.status === "failed" || event.status === "stopped"
						? "error"
						: "running",
			};
		}
		case "leader_start":
			return {
				type: "system",
				content: `协作编排已启动（mode=${String(event.delegationMode || "unknown")}）`,
				status: "running",
				metadata: {
					agentRole: event.agentRole || "leader",
					teamId: event.teamId,
					leaderRunId: event.leaderRunId,
					parentSessionId: event.parentSessionId,
					teammateMode: event.teammateMode,
					delegationMode: event.delegationMode,
				},
			};
		case "teammate_idle":
			return {
				type: "system",
				content: `Teammate 空闲：${String(event.teammateName || "unknown")}`,
				status: "running",
				metadata: {
					teamId: event.teamId,
					leaderRunId: event.leaderRunId,
					parentSessionId: event.parentSessionId,
					teammateMode: event.teammateMode,
					delegationMode: event.delegationMode,
				},
			};
		case "teammate_complete":
			return {
				type: "system",
				content: `Teammate 完成：${String(event.teammateName || "unknown")} · ${String(event.summary || "已返回结果")}`,
				status: "running",
				metadata: {
					teamId: event.teamId,
					leaderRunId: event.leaderRunId,
					parentSessionId: event.parentSessionId,
					teammateMode: event.teammateMode,
					delegationMode: event.delegationMode,
				},
			};
		case "leader_merge":
			return {
				type: "system",
				content: `Leader 汇总：${String(event.summary || "已合并 teammate 结果")}`,
				status: "running",
				metadata: {
					teamId: event.teamId,
					leaderRunId: event.leaderRunId,
					parentSessionId: event.parentSessionId,
					teammateMode: event.teammateMode,
					delegationMode: event.delegationMode,
				},
			};
		case "delegation_fallback":
			return {
				type: "system",
				content: `Teammate 不可用，已回退到 Task 子代理：${String(event.error || "unknown")}`,
				status: "error",
				metadata: {
					teamId: event.teamId,
					leaderRunId: event.leaderRunId,
					parentSessionId: event.parentSessionId,
					teammateMode: event.teammateMode,
					delegationMode: event.delegationMode,
				},
			};
		case "tool_use_summary":
			return {
				type: "system",
				content: event.summary || "",
				status: "running",
			};
		case "files_persisted": {
			const fileCount = Array.isArray(event.files) ? event.files.length : 0;
			const failedCount = Array.isArray(event.failed) ? event.failed.length : 0;
			return {
				type: "system",
				content: `文件持久化完成：成功 ${fileCount}，失败 ${failedCount}`,
				status: failedCount > 0 ? "error" : "running",
			};
		}
		case "auth_status": {
			const base = event.isAuthenticating
				? "认证中…"
				: event.error
					? "认证失败"
					: "认证状态更新";
			return {
				type: "system",
				content: event.error ? `${base}: ${event.error}` : base,
				status: event.error ? "error" : "running",
			};
		}
		default:
			return null;
	}
}
