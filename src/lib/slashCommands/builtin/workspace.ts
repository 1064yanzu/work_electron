/**
 * Claude Code 风格斜杠命令 —— 工作区组内置命令（Phase 6 + 2026-05 重构）。
 *
 * 命令真实化策略：
 * - `/init` `/review` `/security-review`：直接把命令交给 SDK，让 Claude Code CLI 真正执行；
 *   `/init` 在 SDK 失败时降级到本地静态 CLAUDE.md 模板。
 * - `/agents` `/permissions` `/hooks`：先在本地打开设置面板 Agent 分页（更适合 GUI 操作），
 *   同时把命令发给 SDK，让 CLI 输出当前状态，两路反馈互补。
 * - `/add-dir`：弹原生目录选择器，把所选目录传给 SDK。
 * - `/settings`：纯本地，打开设置面板。
 */

import type { IPCSchema } from "../../../../electron/shared/ipc-schema";
import { dispatchToSdk } from "../dispatchToSdk";
import { EVENTS, events } from "../../events";
import { safeInvoke } from "../../tauriBridge";
import { SLASH_MESSAGES } from "../messages";
import { showLoading } from "../toast";
import type {
	CommandContext,
	ExecuteOutcome,
	SlashCommandDefinition,
} from "../types";

// ---------------------------------------------------------------------------
// 共用辅助
// ---------------------------------------------------------------------------

/** 拿到 SDK 调用时的 cwd：优先 session.cwd → workspacePath。 */
function pickWorkingDirectory(ctx: CommandContext): string | undefined {
	const fromSession = ctx.activeSession?.cwd;
	if (fromSession && fromSession.trim()) return fromSession;
	if (ctx.workspacePath && ctx.workspacePath.trim()) return ctx.workspacePath;
	return undefined;
}

// ---------------------------------------------------------------------------
// /review —— 让 CLI 自己读 git diff 并审查；失败回退到本地实现
// ---------------------------------------------------------------------------

/** 构建中文代码审查 prompt（六维度）—— SDK 不识别 /review 时的降级 prompt。 */
function buildReviewPrompt(diff: string, stat: string): string {
	const { reviewPrompt } = SLASH_MESSAGES;
	const dimensions = reviewPrompt.dimensions
		.map((d, i) => `${i + 1}. ${d}`)
		.join("\n");
	return [
		reviewPrompt.header,
		"",
		"## 变更摘要 (git diff --stat)",
		"```",
		stat.trim() || "(空)",
		"```",
		"",
		"## 变更内容 (git diff)",
		"```diff",
		diff.trim() || "(空)",
		"```",
		"",
		"## 审查维度",
		dimensions,
		"",
		reviewPrompt.footer,
	].join("\n");
}

async function fallbackLocalReview(
	ctx: CommandContext,
	workspace: string,
): Promise<ExecuteOutcome> {
	const lockedSessionId = ctx.activeSession?.id ?? null;
	const handle = showLoading(SLASH_MESSAGES.toast.review.loading);
	try {
		const result = await safeInvoke<
			IPCSchema["slash_commands_git_diff"]["output"]
		>("slash_commands_git_diff", {
			workspace_dir: workspace,
			max_bytes: 2 * 1024 * 1024,
		});
		if (!result.has_changes) {
			handle.dismiss();
			return {
				kind: "ok",
				toast: {
					type: "info",
					message: SLASH_MESSAGES.toast.review.noChanges,
				},
			};
		}
		const message = buildReviewPrompt(result.diff, result.stat);
		if (lockedSessionId) {
			try {
				const { chatStore } = await import("../../chat/store");
				if (chatStore.getState().activeSessionId !== lockedSessionId) {
					chatStore.setActiveSession(lockedSessionId);
				}
			} catch (err) {
				console.warn("[slashCommands] /review 对齐触发时会话失败。", err);
			}
		}
		events.emit(EVENTS.SLASH_SUBMIT_MESSAGE, {
			sessionId: lockedSessionId,
			message,
			auto: true,
		});
		handle.replaceSuccess(SLASH_MESSAGES.toast.review.success);
		return { kind: "ok" };
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		handle.replaceFailed(SLASH_MESSAGES.toast.review.failed(reason), {
			retryable: true,
		});
		return {
			kind: "failed",
			message: SLASH_MESSAGES.toast.review.failed(reason),
			retryable: true,
			cause: err,
		};
	}
}

export const reviewCommand: SlashCommandDefinition = {
	id: "review",
	name: SLASH_MESSAGES.commands.review.name,
	description: SLASH_MESSAGES.commands.review.description,
	group: "workspace",
	kind: "action",
	availability(ctx: CommandContext) {
		if (!ctx.workspacePath) {
			return {
				state: "disabled",
				reason: SLASH_MESSAGES.disabled.reason.noWorkspace,
			};
		}
		return { state: "available" };
	},
	async execute(ctx: CommandContext): Promise<ExecuteOutcome> {
		const workspace = ctx.workspacePath;
		if (!workspace) {
			return {
				kind: "failed",
				message: SLASH_MESSAGES.disabled.reason.noWorkspace,
			};
		}

		// 先尝试让 CLI 真实跑 /review（CLI 内部会读 diff、写审查），SDK 失败再回退
		const sdkOutcome = await dispatchToSdk("/review", {
			workingDirectory: workspace,
			resumeSessionId: ctx.sdkSessionId ?? undefined,
			timeoutMs: 120_000,
			loadingMessage: SLASH_MESSAGES.toast.review.loading,
			successMessage: SLASH_MESSAGES.toast.review.success,
		});
		if (sdkOutcome.kind === "ok") return sdkOutcome;
		// SDK 失败 → 走本地审查 prompt 降级路径，保证用户能拿到结果
		console.warn(
			"[slashCommands] /review 走 SDK 失败，回退到本地审查 prompt。",
			sdkOutcome.message,
		);
		return fallbackLocalReview(ctx, workspace);
	},
};

// ---------------------------------------------------------------------------
// /init —— 让 CLI 真实扫描项目生成 CLAUDE.md；失败回退到静态模板
// ---------------------------------------------------------------------------

async function confirmOverwrite(): Promise<boolean> {
	if (typeof window === "undefined") {
		return false;
	}
	const { confirmDialog } = await import(
		"../../../components/ui/ConfirmDialog"
	);
	return confirmDialog.show({
		title: "覆盖确认",
		message: SLASH_MESSAGES.toast.init.existsPrompt,
		type: "warning",
		confirmText: "覆盖",
		cancelText: "取消",
	});
}

async function fallbackWriteInitTemplate(
	workspace: string,
): Promise<ExecuteOutcome> {
	const handle = showLoading(SLASH_MESSAGES.toast.init.loading);
	try {
		let result = await safeInvoke<
			IPCSchema["slash_commands_write_init"]["output"]
		>("slash_commands_write_init", {
			workspace_dir: workspace,
			overwrite: false,
		});
		if (result.error === "exists") {
			handle.dismiss();
			const proceed = await confirmOverwrite();
			if (!proceed) {
				return { kind: "ok" };
			}
			const retryHandle = showLoading(SLASH_MESSAGES.toast.init.loading);
			try {
				result = await safeInvoke<
					IPCSchema["slash_commands_write_init"]["output"]
				>("slash_commands_write_init", {
					workspace_dir: workspace,
					overwrite: true,
				});
				retryHandle.replaceSuccess(
					SLASH_MESSAGES.toast.init.overwrittenSuccess,
				);
				return { kind: "ok" };
			} catch (err2) {
				const reason = err2 instanceof Error ? err2.message : String(err2);
				retryHandle.replaceFailed(SLASH_MESSAGES.toast.init.failed(reason), {
					retryable: true,
				});
				return {
					kind: "failed",
					message: SLASH_MESSAGES.toast.init.failed(reason),
					retryable: true,
					cause: err2,
				};
			}
		}
		handle.replaceSuccess(SLASH_MESSAGES.toast.init.success);
		return { kind: "ok" };
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		handle.replaceFailed(SLASH_MESSAGES.toast.init.failed(reason), {
			retryable: true,
		});
		return {
			kind: "failed",
			message: SLASH_MESSAGES.toast.init.failed(reason),
			retryable: true,
			cause: err,
		};
	}
}

export const initCommand: SlashCommandDefinition = {
	id: "init",
	name: SLASH_MESSAGES.commands.init.name,
	description: SLASH_MESSAGES.commands.init.description,
	group: "workspace",
	kind: "action",
	availability(ctx: CommandContext) {
		if (!ctx.workspacePath) {
			return {
				state: "disabled",
				reason: SLASH_MESSAGES.disabled.reason.noWorkspace,
			};
		}
		return { state: "available" };
	},
	async execute(ctx: CommandContext): Promise<ExecuteOutcome> {
		const workspace = ctx.workspacePath;
		if (!workspace) {
			return {
				kind: "failed",
				message: SLASH_MESSAGES.disabled.reason.noWorkspace,
			};
		}

		// 优先：CLI 真的扫描项目并生成 CLAUDE.md
		const sdkOutcome = await dispatchToSdk("/init", {
			workingDirectory: workspace,
			resumeSessionId: ctx.sdkSessionId ?? undefined,
			timeoutMs: 180_000,
			loadingMessage: "正在让 Claude 扫描项目并生成 CLAUDE.md…",
			successMessage: SLASH_MESSAGES.toast.init.success,
		});
		if (sdkOutcome.kind === "ok") return sdkOutcome;
		console.warn(
			"[slashCommands] /init 走 SDK 失败，回退到静态模板写入。",
			sdkOutcome.message,
		);
		return fallbackWriteInitTemplate(workspace);
	},
};

// ---------------------------------------------------------------------------
// /settings —— 打开设置面板
// ---------------------------------------------------------------------------

export const settingsCommand: SlashCommandDefinition = {
	id: "settings",
	name: SLASH_MESSAGES.commands.settings.name,
	description: SLASH_MESSAGES.commands.settings.description,
	group: "workspace",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute() {
		events.emit(EVENTS.OPEN_SETTINGS, { tab: "ai.agent" });
		return { kind: "ok" as const };
	},
};

// ---------------------------------------------------------------------------
// /agents、/permissions、/hooks —— 打开设置 Agent 分页 + 同时让 CLI 输出状态
// ---------------------------------------------------------------------------

interface SettingsBridgeOptions {
	id: "agents" | "permissions" | "hooks";
	commandLine: string;
	loadingMessage: string;
}

async function executeSettingsBridge(
	ctx: CommandContext,
	options: SettingsBridgeOptions,
): Promise<ExecuteOutcome> {
	// 1) 本地：立即打开设置面板 Agent 分页（不等 SDK，避免感知卡顿）
	events.emit(EVENTS.OPEN_SETTINGS, { tab: "ai.agent" });

	// 2) SDK：让 CLI 真实输出当前状态；fire-and-forget，用 toast 提示
	void dispatchToSdk(options.commandLine, {
		workingDirectory: pickWorkingDirectory(ctx),
		resumeSessionId: ctx.sdkSessionId ?? undefined,
		timeoutMs: 30_000,
		loadingMessage: options.loadingMessage,
		waitForSettlement: false,
	});

	return { kind: "ok" as const };
}

export const agentsCommand: SlashCommandDefinition = {
	id: "agents",
	name: SLASH_MESSAGES.commands.agents.name,
	description: SLASH_MESSAGES.commands.agents.description,
	group: "workspace",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute(ctx) {
		return executeSettingsBridge(ctx, {
			id: "agents",
			commandLine: "/agents",
			loadingMessage: SLASH_MESSAGES.toast.agents.loading,
		});
	},
};

export const permissionsCommand: SlashCommandDefinition = {
	id: "permissions",
	name: SLASH_MESSAGES.commands.permissions.name,
	description: SLASH_MESSAGES.commands.permissions.description,
	group: "workspace",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute(ctx) {
		return executeSettingsBridge(ctx, {
			id: "permissions",
			commandLine: "/permissions",
			loadingMessage: SLASH_MESSAGES.toast.permissions.loading,
		});
	},
};

export const hooksCommand: SlashCommandDefinition = {
	id: "hooks",
	name: SLASH_MESSAGES.commands.hooks.name,
	description: SLASH_MESSAGES.commands.hooks.description,
	group: "workspace",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute(ctx) {
		return executeSettingsBridge(ctx, {
			id: "hooks",
			commandLine: "/hooks",
			loadingMessage: SLASH_MESSAGES.toast.hooks.loading,
		});
	},
};

// ---------------------------------------------------------------------------
// /add-dir —— 弹原生目录选择 → 把目录交给 SDK
// ---------------------------------------------------------------------------

export const addDirCommand: SlashCommandDefinition = {
	id: "add-dir",
	name: SLASH_MESSAGES.commands.addDir.name,
	description: SLASH_MESSAGES.commands.addDir.description,
	group: "workspace",
	kind: "action",
	availability() {
		return { state: "available" };
	},
	async execute(ctx) {
		let pick: IPCSchema["slash_commands_pick_directory"]["output"];
		try {
			pick = await safeInvoke<
				IPCSchema["slash_commands_pick_directory"]["output"]
			>("slash_commands_pick_directory", {
				title: "选择要加入 SDK 的目录",
				default_path: ctx.workspacePath ?? undefined,
			});
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.toast.generic.failed(reason),
				cause: err,
			};
		}
		if (pick.canceled || !pick.path) {
			return {
				kind: "ok" as const,
				toast: {
					type: "info" as const,
					message: SLASH_MESSAGES.toast.addDir.canceled,
				},
			};
		}

		// 把路径加引号，避免路径里有空格被 CLI 当作多个参数
		const commandLine = `/add-dir "${pick.path}"`;
		return dispatchToSdk(commandLine, {
			workingDirectory: pickWorkingDirectory(ctx),
			resumeSessionId: ctx.sdkSessionId ?? undefined,
			timeoutMs: 30_000,
			loadingMessage: SLASH_MESSAGES.toast.addDir.loading(pick.path),
		});
	},
};

// ---------------------------------------------------------------------------
// /security-review —— 让 CLI 真实跑 security-review skill
// ---------------------------------------------------------------------------

export const securityReviewCommand: SlashCommandDefinition = {
	id: "security-review",
	name: SLASH_MESSAGES.commands.securityReview.name,
	description: SLASH_MESSAGES.commands.securityReview.description,
	group: "workspace",
	kind: "action",
	availability(ctx) {
		if (!ctx.workspacePath) {
			return {
				state: "disabled",
				reason: SLASH_MESSAGES.disabled.reason.noWorkspace,
			};
		}
		return { state: "available" };
	},
	async execute(ctx) {
		const workspace = ctx.workspacePath;
		if (!workspace) {
			return {
				kind: "failed" as const,
				message: SLASH_MESSAGES.disabled.reason.noWorkspace,
			};
		}
		return dispatchToSdk("/security-review", {
			workingDirectory: workspace,
			resumeSessionId: ctx.sdkSessionId ?? undefined,
			timeoutMs: 180_000,
			loadingMessage: SLASH_MESSAGES.toast.securityReview.loading,
		});
	},
};

// ---------------------------------------------------------------------------
// 导出
// ---------------------------------------------------------------------------

export const WORKSPACE_COMMANDS: readonly SlashCommandDefinition[] = [
	reviewCommand,
	initCommand,
	settingsCommand,
	agentsCommand,
	permissionsCommand,
	hooksCommand,
	addDirCommand,
	securityReviewCommand,
];
