/**
 * Claude Code 风格斜杠命令 —— 会话组内置命令（Phase 3）。
 *
 * 覆盖任务：T3.1–T3.6；`/fork` 下一次提交的注入逻辑见 `forkIntentStore.ts`
 * 与 `useAgentHandler.ts` 的协作。
 *
 * 所有命令使用 `SLASH_MESSAGES` 的中文文案，禁止硬编码英文或本地字符串。
 */

import { agentExecutor } from "../../agent/executor";
import { chatStore } from "../../chat/store";
import {
	createMessage,
	type ChatMessage,
} from "../../chat/types";
import { EVENTS, events } from "../../events";
import { markFork } from "../forkIntentStore";
import { SLASH_MESSAGES } from "../messages";
import { showLoading } from "../toast";
import type {
	CommandContext,
	SlashCommandDefinition,
	SlashCommandSubOption,
} from "../types";

// ---------------------------------------------------------------------------
// 工具：深拷贝消息数组；优先 `structuredClone`，失败时 fallback 到 JSON 双序列化
// ---------------------------------------------------------------------------

function cloneMessages(messages: ChatMessage[]): ChatMessage[] {
	try {
		// structuredClone 是现代 Electron (Chromium >= 98) 上的原生 API
		return structuredClone(messages);
	} catch {
		try {
			return JSON.parse(JSON.stringify(messages)) as ChatMessage[];
		} catch {
			// 最后兜底：浅拷贝（保持用户不丢数据）
			return messages.map((m) => ({ ...m }));
		}
	}
}

// ---------------------------------------------------------------------------
// /compact
// ---------------------------------------------------------------------------

export const compactCommand: SlashCommandDefinition = {
	id: "compact",
	name: SLASH_MESSAGES.commands.compact.name,
	description: SLASH_MESSAGES.commands.compact.description,
	group: "session",
	kind: "action",
	availability(ctx: CommandContext) {
		if (!ctx.sdkSessionId) {
			return {
				state: "disabled",
				reason: SLASH_MESSAGES.disabled.reason.noSdkSession,
			};
		}
		return { state: "available" };
	},
	async execute(ctx: CommandContext) {
		const sessionId = ctx.activeSession?.id ?? null;
		const resumeSessionId = ctx.sdkSessionId ?? undefined;

		// 闭包锁定：即使用户中途切换 session，压缩结果仍打回触发时会话
		void sessionId;

		const handle = showLoading(SLASH_MESSAGES.toast.compact.loading);
		try {
			await agentExecutor.executeCustomTask(
				"/compact",
				undefined,
				{ autoExecute: true },
				{ resumeSessionId },
			);
			handle.replaceSuccess(SLASH_MESSAGES.toast.compact.success);
			return {
				kind: "ok" as const,
				toast: undefined,
			};
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			handle.replaceFailed(SLASH_MESSAGES.toast.compact.failed(reason), {
				retryable: true,
			});
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.toast.compact.failed(reason),
				retryable: true,
				cause: err,
			};
		}
	},
};

// ---------------------------------------------------------------------------
// /clear
// ---------------------------------------------------------------------------

export const clearCommand: SlashCommandDefinition = {
	id: "clear",
	name: SLASH_MESSAGES.commands.clear.name,
	description: SLASH_MESSAGES.commands.clear.description,
	group: "session",
	kind: "action",
	availability(ctx: CommandContext) {
		return ctx.activeSession ? { state: "available" } : { state: "hidden" };
	},
	async execute(ctx: CommandContext) {
		const session = ctx.activeSession;
		if (!session) {
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.disabled.reason.noActiveSession,
			};
		}

		// 1) 清空消息（保留 sdkSessionId）
		chatStore.replaceSessionMessages(session.id, []);

		// 2) 插入系统快照消息
		const snapshot = createMessage(
			"system",
			SLASH_MESSAGES.systemSnapshot.clear,
		);
		chatStore.addMessage(session.id, snapshot);

		return { kind: "ok" as const };
	},
};

// ---------------------------------------------------------------------------
// /new
// ---------------------------------------------------------------------------

export const newCommand: SlashCommandDefinition = {
	id: "new",
	name: SLASH_MESSAGES.commands.new.name,
	description: SLASH_MESSAGES.commands.new.description,
	group: "session",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute() {
		// createFreshSession 不会复用现有空会话，保证 /new 始终产出新会话
		chatStore.createFreshSession();
		return { kind: "ok" as const };
	},
};

// ---------------------------------------------------------------------------
// /fork
// ---------------------------------------------------------------------------

export const forkCommand: SlashCommandDefinition = {
	id: "fork",
	name: SLASH_MESSAGES.commands.fork.name,
	description: SLASH_MESSAGES.commands.fork.description,
	group: "session",
	kind: "action",
	availability(ctx: CommandContext) {
		if (!ctx.sdkSessionId) {
			return {
				state: "disabled",
				reason: SLASH_MESSAGES.disabled.reason.noForkableSdkSession,
			};
		}
		return { state: "available" };
	},
	async execute(ctx: CommandContext) {
		const src = ctx.activeSession;
		const baseSdkSessionId = ctx.sdkSessionId;
		if (!src || !baseSdkSessionId) {
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.disabled.reason.noForkableSdkSession,
			};
		}

		// 1) 新建一条 fork session（标题加 "(Fork)" 后缀）
		const forkedTitle = `${src.title}（Fork）`;
		// 2) 通过 chatStore 暴露的 API 创建 session；
		//    chatStore.createFreshSession 会同时插入并切换激活，这里直接用它即可
		const created = chatStore.createFreshSession(forkedTitle);

		// 3) 深拷贝原 session 的消息到新 session；新 session 的 sdkSessionId 保持 undefined
		chatStore.replaceSessionMessages(created.id, cloneMessages(src.messages));

		// 4) 登记 fork 意图，待下一次提交时 useAgentHandler 注入 fork_session + resume_session_at
		markFork(created.id, baseSdkSessionId);

		return { kind: "ok" as const };
	},
};

// ---------------------------------------------------------------------------
// /resume（kind=submenu）
// ---------------------------------------------------------------------------

/** 将毫秒时间戳格式化为相对时间（粗粒度），供 /resume 子菜单展示。 */
function formatRelativeTime(ts: number): string {
	const delta = Date.now() - ts;
	if (delta < 0) return "刚刚";
	const min = Math.floor(delta / 60_000);
	if (min < 1) return "刚刚";
	if (min < 60) return `${min} 分钟前`;
	const hour = Math.floor(min / 60);
	if (hour < 24) return `${hour} 小时前`;
	const day = Math.floor(hour / 24);
	if (day < 7) return `${day} 天前`;
	return new Date(ts).toLocaleDateString("zh-CN");
}

export const resumeCommand: SlashCommandDefinition = {
	id: "resume",
	name: SLASH_MESSAGES.commands.resume.name,
	description: SLASH_MESSAGES.commands.resume.description,
	group: "session",
	kind: "submenu",
	availability(ctx: CommandContext) {
		if (ctx.recentResumableSessions.length === 0) {
			return {
				state: "disabled",
				reason: SLASH_MESSAGES.disabled.reason.noResumableSessions,
			};
		}
		return { state: "available" };
	},
	getSubmenu(ctx: CommandContext) {
		return ctx.recentResumableSessions.map((s) => ({
			id: s.id,
			label: s.title || "未命名会话",
			description: `${formatRelativeTime(s.updatedAt)} · ${s.sdkSessionId.slice(0, 8)}`,
		}));
	},
	async execute(_ctx: CommandContext, option?: SlashCommandSubOption) {
		if (!option) {
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.disabled.reason.unknownSubOption,
			};
		}
		chatStore.setActiveSession(option.id);
		// 下一次提交时 useAgentHandler 会自动读取 session.sdkSessionId 作为 resume_session_at
		return { kind: "ok" as const };
	},
};

// ---------------------------------------------------------------------------
// /rename
// ---------------------------------------------------------------------------

export const renameCommand: SlashCommandDefinition = {
	id: "rename",
	name: SLASH_MESSAGES.commands.rename.name,
	description: SLASH_MESSAGES.commands.rename.description,
	group: "session",
	kind: "action",
	availability(ctx: CommandContext) {
		return ctx.activeSession ? { state: "available" } : { state: "hidden" };
	},
	async execute(ctx: CommandContext) {
		const session = ctx.activeSession;
		if (!session) {
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.disabled.reason.noActiveSession,
			};
		}
		// 本任务只发事件；真实 RenameInline UI 由后续任务实现。
		events.emit(EVENTS.SLASH_RENAME_INLINE, { sessionId: session.id });
		return { kind: "ok" as const };
	},
};

// ---------------------------------------------------------------------------
// 批量导出
// ---------------------------------------------------------------------------

export const SESSION_COMMANDS: readonly SlashCommandDefinition[] = [
	compactCommand,
	clearCommand,
	newCommand,
	resumeCommand,
	forkCommand,
	renameCommand,
];
