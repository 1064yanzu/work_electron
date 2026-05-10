/**
 * Claude Code 风格斜杠命令 —— 诊断组内置命令（Phase 4）。
 *
 * 覆盖任务：T4.1–T4.6。
 *
 * 本组所有"切 tab"命令都只负责两件事：
 * 1. `setRightPanelTab(target)`；
 * 2. `workspaceStore.setRightSidebarVisible(true)`。
 *
 * 额外副作用（/context 滚动、/memory 预热、/mcp 预拉）由各命令独立触发。
 */

import type { ChatMessage } from "../../chat/types";
import { EVENTS, events } from "../../events";
import { memoryStore } from "../../agent/memoryStore";
import { setRightPanelTab } from "../../stores/rightPanelTabStore";
import { workspaceStore } from "../../workspaceStore";
import { SLASH_MESSAGES } from "../messages";
import type {
	CommandContext,
	ExecuteOutcome,
	SlashCommandDefinition,
} from "../types";

// ---------------------------------------------------------------------------
// /copy：复制最近一条助手回复
// ---------------------------------------------------------------------------

/**
 * 从 `ChatMessage` 提取纯文本；优先 `metadata.blocks` 中的 `text` 块，
 * fallback 到 `msg.content`。
 *
 * 导出供测试。
 */
export function extractPlainText(msg: ChatMessage): string {
	const blocks = msg.metadata?.blocks;
	if (Array.isArray(blocks) && blocks.length > 0) {
		const parts: string[] = [];
		for (const b of blocks) {
			if (b && b.type === "text" && typeof b.text === "string" && b.text.trim()) {
				parts.push(b.text);
			}
		}
		if (parts.length > 0) return parts.join("\n");
	}
	return typeof msg.content === "string" ? msg.content : "";
}

export const copyCommand: SlashCommandDefinition = {
	id: "copy",
	name: SLASH_MESSAGES.commands.copy.name,
	description: SLASH_MESSAGES.commands.copy.description,
	group: "inspect",
	kind: "action",
	availability(ctx: CommandContext) {
		return ctx.activeSession ? { state: "available" } : { state: "hidden" };
	},
	async execute(ctx: CommandContext): Promise<ExecuteOutcome> {
		const session = ctx.activeSession;
		if (!session) {
			return {
				kind: "failed",
				message: SLASH_MESSAGES.disabled.reason.noActiveSession,
			};
		}
		// 最近一条 assistant 消息
		let assistantMsg: ChatMessage | null = null;
		for (let i = session.messages.length - 1; i >= 0; i--) {
			const m = session.messages[i];
			if (m && m.role === "assistant") {
				assistantMsg = m;
				break;
			}
		}
		if (!assistantMsg) {
			return {
				kind: "ok",
				toast: { type: "info", message: SLASH_MESSAGES.toast.copy.empty },
			};
		}
		const text = extractPlainText(assistantMsg);
		if (!text.trim()) {
			return {
				kind: "ok",
				toast: { type: "info", message: SLASH_MESSAGES.toast.copy.empty },
			};
		}
		try {
			if (
				typeof navigator === "undefined" ||
				!navigator.clipboard ||
				typeof navigator.clipboard.writeText !== "function"
			) {
				throw new Error("当前环境不支持剪贴板 API");
			}
			await navigator.clipboard.writeText(text);
			return {
				kind: "ok",
				toast: { type: "success", message: SLASH_MESSAGES.toast.copy.success },
			};
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			return {
				kind: "failed",
				message: SLASH_MESSAGES.toast.copy.failed(reason),
				cause: err,
			};
		}
	},
};

// ---------------------------------------------------------------------------
// 内部：通用"切 tab + 显示右侧栏"工具
// ---------------------------------------------------------------------------

function switchToTab(tab: "changes" | "git" | "context" | "memory" | "mcp"): void {
	setRightPanelTab(tab);
	try {
		workspaceStore.setRightSidebarVisible(true);
	} catch (err) {
		console.warn("[slashCommands] setRightSidebarVisible 调用失败。", err);
	}
}

// ---------------------------------------------------------------------------
// /diff /status /context /memory /mcp
// ---------------------------------------------------------------------------

export const diffCommand: SlashCommandDefinition = {
	id: "diff",
	name: SLASH_MESSAGES.commands.diff.name,
	description: SLASH_MESSAGES.commands.diff.description,
	group: "inspect",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute() {
		switchToTab("changes");
		return { kind: "ok" as const };
	},
};

export const statusCommand: SlashCommandDefinition = {
	id: "status",
	name: SLASH_MESSAGES.commands.status.name,
	description: SLASH_MESSAGES.commands.status.description,
	group: "inspect",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute() {
		switchToTab("git");
		return { kind: "ok" as const };
	},
};

export const contextCommand: SlashCommandDefinition = {
	id: "context",
	name: SLASH_MESSAGES.commands.context.name,
	description: SLASH_MESSAGES.commands.context.description,
	group: "inspect",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute(ctx: CommandContext) {
		switchToTab("context");
		events.emit(EVENTS.SLASH_SCROLL_TO_CONTEXT, {
			sessionId: ctx.activeSession?.id ?? null,
		});
		return { kind: "ok" as const };
	},
};

export const memoryCommand: SlashCommandDefinition = {
	id: "memory",
	name: SLASH_MESSAGES.commands.memory.name,
	description: SLASH_MESSAGES.commands.memory.description,
	group: "inspect",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute() {
		// memoryStore.cache 为 private，无法外部判空；做一次 searchMemories("", 1) 轻量预热，
		// 后端命中缓存时开销可忽略（内部有 5 分钟 searchCache）。
		try {
			await memoryStore.searchMemories("", 1);
		} catch (err) {
			console.warn("[slashCommands] /memory 预热失败，已忽略。", err);
		}
		switchToTab("memory");
		return { kind: "ok" as const };
	},
};

export const mcpCommand: SlashCommandDefinition = {
	id: "mcp",
	name: SLASH_MESSAGES.commands.mcp.name,
	description: SLASH_MESSAGES.commands.mcp.description,
	group: "inspect",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute() {
		// 预拉一次 MCP 清单；失败不阻塞切换（降级为仅切 tab）
		try {
			const { listMcpServers } = await import("../../config/mcp");
			await listMcpServers();
		} catch (err) {
			console.warn("[slashCommands] /mcp 预拉 MCP 列表失败，已忽略。", err);
		}
		switchToTab("mcp");
		return { kind: "ok" as const };
	},
};

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export const INSPECT_COMMANDS: readonly SlashCommandDefinition[] = [
	copyCommand,
	diffCommand,
	statusCommand,
	contextCommand,
	memoryCommand,
	mcpCommand,
];
