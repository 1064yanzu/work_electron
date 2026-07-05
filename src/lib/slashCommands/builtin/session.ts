/**
 * Claude Code 风格斜杠命令 —— 会话组内置命令（Phase 3 + 2026-05 重构）。
 *
 * `/compact` `/clear` 已迁移到统一的 `dispatchToSdk` 入口，让 SDK 真实执行；
 * `/new` `/fork` `/resume` `/rename` `/export` 仍是本地会话操作。
 *
 * 所有命令使用 `SLASH_MESSAGES` 的中文文案，禁止硬编码英文或本地字符串。
 */

import type { IPCSchema } from "../../../../electron/shared/ipc-schema";
import { chatStore } from "../../chat/store";
import {
	createMessage,
	type ChatMessage,
	type ChatSession,
} from "../../chat/types";
import { dispatchToSdk } from "../dispatchToSdk";
import { EVENTS, events } from "../../events";
import { markFork } from "../forkIntentStore";
import { SLASH_MESSAGES } from "../messages";
import { safeInvoke } from "../../tauriBridge";
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
// /compact —— 把 "/compact" 字符串发给 SDK，由 Claude Code CLI 压缩上下文。
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
		// 关键：CLI 按 `cwd + sessionId` 定位会话文件；必须用当初创建会话的 cwd。
		const workingDirectory =
			(ctx.activeSession?.cwd && ctx.activeSession.cwd.trim()) ||
			(ctx.workspacePath && ctx.workspacePath.trim()) ||
			undefined;

		return dispatchToSdk("/compact", {
			workingDirectory,
			resumeSessionId: ctx.sdkSessionId ?? undefined,
			timeoutMs: 60_000,
			loadingMessage: SLASH_MESSAGES.toast.compact.loading,
			successMessage: SLASH_MESSAGES.toast.compact.success,
		});
	},
};

// ---------------------------------------------------------------------------
// /clear —— 本地清空消息 + 同步通知 SDK 清上下文
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

		// 1) 本地：清空消息（保留 sdkSessionId）+ 插入快照
		chatStore.replaceSessionMessages(session.id, []);
		const snapshot = createMessage(
			"system",
			SLASH_MESSAGES.systemSnapshot.clear,
		);
		chatStore.addMessage(session.id, snapshot);

		// 2) SDK：如果有活跃会话，同步通知 CLI 清上下文；fire-and-forget，
		//    SDK 失败不影响本地清空体验（UI 已经清了，不能"回滚"消息）。
		if (ctx.sdkSessionId) {
			const workingDirectory =
				(session.cwd && session.cwd.trim()) ||
				(ctx.workspacePath && ctx.workspacePath.trim()) ||
				undefined;
			void dispatchToSdk("/clear", {
				workingDirectory,
				resumeSessionId: ctx.sdkSessionId,
				timeoutMs: 30_000,
				waitForSettlement: false,
			});
		}

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

		// sqlite 后端：克隆前确保源会话消息全文已加载（避免 fork 出空会话）
		await chatStore.ensureSessionLoaded(src.id);
		const srcLoaded =
			chatStore.getState().sessions.find((item) => item.id === src.id) ?? src;

		// 1) 新建一条 fork session（标题加 "(Fork)" 后缀）
		const forkedTitle = `${src.title}（Fork）`;
		// 2) 通过 chatStore 暴露的 API 创建 session；
		//    chatStore.createFreshSession 会同时插入并切换激活，这里直接用它即可
		const created = chatStore.createFreshSession(forkedTitle);

		// 3) 深拷贝原 session 的消息到新 session；新 session 的 sdkSessionId 保持 undefined
		chatStore.replaceSessionMessages(
			created.id,
			cloneMessages(srcLoaded.messages),
		);

		// 4) 关键：把源会话的 cwd 继承到 fork 会话，否则下一次提交时 useAgentHandler
		//    用的 cwd 与源会话 cwd 不一致，CLI 按 cwd+sessionId 找不到源会话
		//    （resume_session_at 会报 "No conversation found"）。
		if (src.cwd && src.cwd.trim()) {
			chatStore.setSessionCwd(created.id, src.cwd);
		}

		// 5) 登记 fork 意图，待下一次提交时 useAgentHandler 注入 fork_session + resume_session_at
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
	async execute(ctx: CommandContext, option?: SlashCommandSubOption) {
		if (!option) {
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.disabled.reason.unknownSubOption,
			};
		}
		chatStore.setActiveSession(option.id);

		// 如果选中的历史会话没有绑定 cwd，提示用户可能恢复失败。
		// CLI 按 `cwd+sessionId` 定位会话文件，缺 cwd 会在下次提交时走 process.cwd
		// 兜底，极大概率对不上当初的会话目录。
		const selected = ctx.recentResumableSessions.find(
			(s) => s.id === option.id,
		);
		if (selected && !(selected.cwd && selected.cwd.trim())) {
			return {
				kind: "ok" as const,
				toast: {
					type: "info",
					message:
						"已切换到该历史会话，但该会话没有绑定工作目录，下次提交可能因 cwd 不匹配而无法恢复原上下文。",
				},
			};
		}
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
// /export —— 把当前会话消息导出为 Markdown 文件
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number): string {
	const d = new Date(ts);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
		d.getHours(),
	)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function extractMessageText(msg: ChatMessage): string {
	const blocks = msg.metadata?.blocks;
	if (Array.isArray(blocks) && blocks.length > 0) {
		const parts: string[] = [];
		for (const b of blocks) {
			if (
				b &&
				b.type === "text" &&
				typeof b.text === "string" &&
				b.text.trim()
			) {
				parts.push(b.text);
			}
		}
		if (parts.length > 0) return parts.join("\n");
	}
	return typeof msg.content === "string" ? msg.content : "";
}

function roleLabel(role: ChatMessage["role"]): string {
	switch (role) {
		case "user":
			return "用户";
		case "assistant":
			return "Claude";
		case "system":
			return "系统";
		case "trace":
			return "追踪";
		default:
			return String(role);
	}
}

/** 把一条 ChatSession 序列化为 Markdown 文档。 */
export function serializeSessionToMarkdown(session: ChatSession): string {
	const lines: string[] = [];
	lines.push(`# ${session.title || "未命名会话"}`);
	lines.push("");
	lines.push(`> 导出时间：${formatTimestamp(Date.now())}`);
	lines.push(`> 会话 ID：${session.id}`);
	if (session.sdkSessionId) {
		lines.push(`> SDK 会话：${session.sdkSessionId}`);
	}
	if (session.cwd) {
		lines.push(`> 工作目录：${session.cwd}`);
	}
	lines.push(`> 消息数：${session.messages.length}`);
	lines.push("");
	lines.push("---");
	lines.push("");

	for (const msg of session.messages) {
		const stamp = formatTimestamp(msg.timestamp);
		const modelSuffix = msg.model ? ` (${msg.model})` : "";
		lines.push(`## ${roleLabel(msg.role)}${modelSuffix} — ${stamp}`);
		lines.push("");
		const text = extractMessageText(msg).trim();
		lines.push(text || "_（空消息）_");
		const usage = msg.metadata?.tokenUsage;
		if (usage) {
			const cost =
				typeof usage.costUsd === "number"
					? ` · cost: $${usage.costUsd.toFixed(4)}`
					: "";
			lines.push("");
			lines.push(
				`> token: ${usage.promptTokens} → ${usage.completionTokens} (total ${usage.totalTokens})${cost}`,
			);
		}
		lines.push("");
		lines.push("---");
		lines.push("");
	}
	return lines.join("\n");
}

export const exportCommand: SlashCommandDefinition = {
	id: "export",
	name: SLASH_MESSAGES.commands.export.name,
	description: SLASH_MESSAGES.commands.export.description,
	group: "session",
	kind: "action",
	availability(ctx: CommandContext) {
		return ctx.activeSession ? { state: "available" } : { state: "hidden" };
	},
	async execute(ctx: CommandContext) {
		let session = ctx.activeSession;
		if (!session) {
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.disabled.reason.noActiveSession,
			};
		}
		// sqlite 后端：导出前确保消息全文已加载
		await chatStore.ensureSessionLoaded(session.id);
		session =
			chatStore.getState().sessions.find((item) => item.id === session?.id) ??
			session;
		if (!session.messages || session.messages.length === 0) {
			return {
				kind: "ok" as const,
				toast: {
					type: "info" as const,
					message: SLASH_MESSAGES.toast.export.emptyMessages,
				},
			};
		}

		const safeTitle = (session.title || "session")
			.replace(/[\\/:*?"<>|]/g, "_")
			.slice(0, 60);
		const defaultFileName = `${safeTitle}-${Date.now()}.md`;

		let pick: IPCSchema["slash_commands_save_dialog"]["output"];
		try {
			pick = await safeInvoke<
				IPCSchema["slash_commands_save_dialog"]["output"]
			>("slash_commands_save_dialog", {
				title: "导出会话为 Markdown",
				default_path: defaultFileName,
				filters: [{ name: "Markdown", extensions: ["md"] }],
			});
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.toast.export.failed(reason),
				cause: err,
			};
		}
		if (pick.canceled || !pick.path) {
			return {
				kind: "ok" as const,
				toast: {
					type: "info" as const,
					message: SLASH_MESSAGES.toast.export.canceled,
				},
			};
		}

		const content = serializeSessionToMarkdown(session);
		try {
			await safeInvoke<IPCSchema["slash_commands_export_session_md"]["output"]>(
				"slash_commands_export_session_md",
				{
					path: pick.path,
					content,
				},
			);
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.toast.export.failed(reason),
				cause: err,
			};
		}

		return {
			kind: "ok" as const,
			toast: {
				type: "success" as const,
				message: SLASH_MESSAGES.toast.export.success(pick.path),
			},
		};
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
	exportCommand,
];
