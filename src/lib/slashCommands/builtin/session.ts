/**
 * Claude Code 风格斜杠命令 —— 会话组内置命令（Phase 3）。
 *
 * 覆盖任务：T3.1–T3.6；`/fork` 下一次提交的注入逻辑见 `forkIntentStore.ts`
 * 与 `useAgentHandler.ts` 的协作。
 *
 * 所有命令使用 `SLASH_MESSAGES` 的中文文案，禁止硬编码英文或本地字符串。
 */

import { agentExecutor } from "../../agent/executor";
import { agentStore } from "../../agent/store";
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

/**
 * 判断错误字符串是否属于"SDK session 已失效"类型。
 *
 * Claude Code CLI 的会话是按 `cwd + uuid` 存文件的，本地渲染端 chatStore 中
 * 的 `sdkSessionId` 可能与 CLI 侧不同步（例如：CLI 清理过会话目录、工作目录
 * 变了、用户在别处手动删除了 `.claude/projects/...`）。此时 `resume` 会报
 * "No conversation found" —— 这不是用户的错，不应当成普通错误。
 */
function isSdkSessionMissingError(message: string): boolean {
	const m = String(message || "");
	return (
		m.includes("No conversation found with session ID") ||
		m.includes("--resume requires a valid session ID")
	);
}

/**
 * 等待 `agentStore` 上的 currentTask 触发 `task_completed` 或 `task_error` 事件。
 *
 * 超时则返回 `{ kind: "timeout" }`；默认 60s（/compact 可能需要较长时间）。
 */
function waitForAgentTaskSettlement(options: {
	timeoutMs?: number;
} = {}): Promise<
	| { kind: "completed"; result: string }
	| { kind: "error"; error: string }
	| { kind: "timeout" }
> {
	const timeoutMs = options.timeoutMs ?? 60_000;
	return new Promise((resolve) => {
		let timer: ReturnType<typeof setTimeout> | null = null;
		const off = agentStore.onEvent((event) => {
			if (event.type === "task_completed") {
				if (timer) clearTimeout(timer);
				off();
				resolve({ kind: "completed", result: event.result ?? "" });
			} else if (event.type === "task_error") {
				if (timer) clearTimeout(timer);
				off();
				resolve({ kind: "error", error: event.error ?? "未知错误" });
			}
		});
		timer = setTimeout(() => {
			off();
			resolve({ kind: "timeout" });
		}, timeoutMs);
	});
}

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

		// 关键：Claude Code CLI 按 `cwd + sessionId` 定位会话文件（~/.claude/projects/<hash>/<uuid>.jsonl）。
		// /compact 必须用"当初跑这条会话时使用的 cwd"——也就是 session.cwd，否则 SDK 会
		// 报 "No conversation found with session ID"（cwd hash 对不上）。
		const workingDirectory =
			(ctx.activeSession?.cwd && ctx.activeSession.cwd.trim()) ||
			(ctx.workspacePath && ctx.workspacePath.trim()) ||
			undefined;

		// 闭包锁定：即使用户中途切换 session，结果反馈仍打回触发时会话
		const lockedSessionId = sessionId;

		const handle = showLoading(SLASH_MESSAGES.toast.compact.loading);

		// 同时启动：executeCustomTask（不抛错，失败时走 agentStore.failTask）
		// 与 agentStore 事件监听；用后者决定最终反馈。
		const settlePromise = waitForAgentTaskSettlement({ timeoutMs: 60_000 });

		try {
			await agentExecutor.executeCustomTask(
				"/compact",
				undefined,
				{ autoExecute: true },
				{ resumeSessionId, workingDirectory },
			);
		} catch (err) {
			// executeCustomTask 自己几乎不会抛；但为鲁棒性兜底
			const reason = err instanceof Error ? err.message : String(err);
			handle.replaceFailed(SLASH_MESSAGES.toast.compact.failed(reason));
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.toast.compact.failed(reason),
				cause: err,
			};
		}

		const settlement = await settlePromise;

		if (settlement.kind === "completed") {
			handle.replaceSuccess(SLASH_MESSAGES.toast.compact.success);
			return { kind: "ok" as const };
		}

		if (settlement.kind === "timeout") {
			handle.replaceFailed(
				SLASH_MESSAGES.toast.compact.failed("等待压缩结果超时"),
			);
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.toast.compact.failed("等待压缩结果超时"),
			};
		}

		// settlement.kind === "error"
		if (isSdkSessionMissingError(settlement.error)) {
			// 最常见原因：当前 cwd 与当初创建 session 时的 cwd 不同，CLI 按
			// `cwd + sessionId` 定位文件，cwd 对不上就找不到。
			// 不自动清 chatStore 里的 sdkSessionId（会话文件本身多半还在，切回正确 cwd 就能找回）。
			const hint =
				"Claude Code 无法在当前工作目录下找到该会话记录。这通常是因为当前会话的工作目录与会话最初创建时不同（CLI 按 cwd+sessionId 定位会话文件）。请确认会话工作目录是否正确，或发起一条新消息重建会话。";
			handle.replaceFailed(hint);
			if (lockedSessionId) {
				console.warn(
					`[slashCommands] /compact 会话 id 在当前 cwd 下未找到 (sessionId=${lockedSessionId}, cwd=${
						workingDirectory ?? "(process.cwd)"
					}, sdkSessionId=${resumeSessionId ?? "(none)"})`,
				);
			}
			return { kind: "failed" as const, message: hint };
		}

		handle.replaceFailed(
			SLASH_MESSAGES.toast.compact.failed(settlement.error),
		);
		return {
			kind: "failed" as const,
			message: SLASH_MESSAGES.toast.compact.failed(settlement.error),
		};
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
		const selected = ctx.recentResumableSessions.find((s) => s.id === option.id);
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
