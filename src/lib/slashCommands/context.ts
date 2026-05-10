/**
 * Claude Code 风格斜杠命令 —— CommandContext 装配器。
 *
 * 任务：T1.6。
 *
 * 职责：
 * - 从各 store 实时组合出一份纯数据 `CommandContext`；
 * - 不持有任何可变引用、不产生副作用、不抛错（任何读取异常都降级为安全默认值并 `console.warn`）；
 * - `recentResumableSessions` 用 `isSdkSessionId` 校验后按 `updatedAt` 倒序取前 20。
 *
 * 与 store 的依赖关系（均为现有事实源，不引入平行状态）：
 * - `chatStore`     → activeSession / sessions / sdkSessionId
 * - `planModeStore` → planModeEnabled
 * - `permissionStore` → permissionMode（来自 policy.defaultMode）
 * - `workspaceStore`  → workspacePath（currentThreadPath 回退到 activeSession.cwd）、rightSidebarVisible
 * - `settingsStore`   → currentModel、availableModels、SlashCommandsSettingsSnapshot
 * - `themeManager`    → currentColorThemeId
 * - `SlashCommandContext`（由 Task 5.6 Provider 提供）→ invokeSelectModel
 *
 * 注意：本模块不直接订阅 React 上下文，`invokeSelectModel` 由调用方
 * （典型：`useCommandContext` Hook 或 UI 层）在装配时注入。
 */

import type { Model } from "../../components/chat/ModelSelector";
import { planModeStore } from "../agent/planModeStore";
import { permissionStore } from "../agent/permissionStore";
import { isSdkSessionId } from "../agent/context/sessionId";
import { chatStore } from "../chat/store";
import type { ChatSession } from "../chat/types";
import { settingsStore } from "../settingsStore";
import {
	buildSlashCommandsSettingsSnapshot,
	type PrefsChangeListener,
} from "./settingsSnapshot";
import { themeManager } from "../theme";
import { workspaceStore } from "../workspaceStore";
import type {
	CommandContext,
	ResumableSessionBrief,
	SlashCommandsSettingsSnapshot,
} from "./types";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** `/resume` 子菜单展示的历史会话上限；与 design 约定一致。 */
const RESUMABLE_SESSIONS_LIMIT = 20;

// ---------------------------------------------------------------------------
// 子装配器
// ---------------------------------------------------------------------------

/**
 * 从 `chatStore.sessions` 中筛选出可用于 `/resume` 的会话。
 *
 * 规则：
 * 1. 必须带 `sdkSessionId` 且通过 `isSdkSessionId` 校验；
 * 2. 归档会话也允许恢复（与现有 /resume 语义一致）；
 * 3. 按 `updatedAt` 倒序；
 * 4. 最多返回 {@link RESUMABLE_SESSIONS_LIMIT} 条。
 */
function buildRecentResumableSessions(): ResumableSessionBrief[] {
	try {
		const sessions = chatStore.getState().sessions;
		const filtered: ResumableSessionBrief[] = [];
		for (const s of sessions) {
			if (!s.sdkSessionId) continue;
			if (!isSdkSessionId(s.sdkSessionId)) continue;
			filtered.push({
				id: s.id,
				title: s.title,
				sdkSessionId: s.sdkSessionId,
				updatedAt: s.updatedAt,
				cwd: s.cwd,
			});
		}
		filtered.sort((a, b) => b.updatedAt - a.updatedAt);
		return filtered.slice(0, RESUMABLE_SESSIONS_LIMIT);
	} catch (err) {
		console.warn("[slashCommands] buildRecentResumableSessions 失败，已返回空数组。", err);
		return [];
	}
}

/**
 * 从 settingsStore 组合出 `availableModels` 列表（仅取 `isEnabled` 的 provider）。
 *
 * ModelSelector 侧的 `Model` 形状为 `{ id, provider }`，这里保持同形状。
 */
function buildAvailableModels(): Model[] {
	try {
		const providers = settingsStore.getProviders();
		const models: Model[] = [];
		for (const p of providers) {
			if (!p.isEnabled) continue;
			for (const modelId of p.models ?? []) {
				models.push({ id: modelId, provider: p.name });
			}
		}
		return models;
	} catch (err) {
		console.warn("[slashCommands] buildAvailableModels 失败，已返回空数组。", err);
		return [];
	}
}

/** 当前活跃会话；读取异常时返回 null。 */
function getActiveSession(): ChatSession | null {
	try {
		const state = chatStore.getState();
		if (!state.activeSessionId) return null;
		return state.sessions.find((s) => s.id === state.activeSessionId) ?? null;
	} catch (err) {
		console.warn("[slashCommands] getActiveSession 失败，已返回 null。", err);
		return null;
	}
}

/** 工作区绝对路径；优先当前线程路径，其次活跃会话 cwd。 */
function getWorkspacePath(active: ChatSession | null): string | null {
	try {
		// 与 `useAgentHandler`（agent 提交消息时使用的 cwd）对齐：
		// 1) 优先当前 session.cwd —— 即"跑这条会话所用的工作目录"，
		//    保证 /compact /review /init 等命令与 agent 当初落盘时的 cwd 一致。
		// 2) 否则退到 workspaceStore.currentThreadPath（线程面板当前目录）。
		if (active?.cwd && active.cwd.trim()) return active.cwd;
		const core = workspaceStore.getCoreState();
		if (core.currentThreadPath && core.currentThreadPath.trim()) {
			return core.currentThreadPath;
		}
		return null;
	} catch (err) {
		console.warn("[slashCommands] getWorkspacePath 失败，已返回 null。", err);
		return null;
	}
}

// ---------------------------------------------------------------------------
// 主装配器
// ---------------------------------------------------------------------------

/**
 * 装配 `CommandContext`。
 *
 * @param overrides 可选覆写，目前仅用于注入 `invokeSelectModel`（由 UI 层传入）。
 *                  未传时使用 no-op，保证 context 自洽。
 */
export function buildCommandContext(overrides?: {
	invokeSelectModel?: (modelId: string) => void;
}): CommandContext {
	const active = getActiveSession();
	const sdkSessionId = active?.sdkSessionId ?? null;

	let planModeEnabled = false;
	try {
		planModeEnabled = planModeStore.getState().enabled;
	} catch (err) {
		console.warn("[slashCommands] 读取 planModeEnabled 失败。", err);
	}

	let permissionMode = "default";
	try {
		permissionMode = permissionStore.getState().policy.defaultMode;
	} catch (err) {
		console.warn("[slashCommands] 读取 permissionMode 失败。", err);
	}

	const availableModels = buildAvailableModels();

	let currentModel: string | null = null;
	try {
		currentModel = settingsStore.getActiveModel() || null;
	} catch (err) {
		console.warn("[slashCommands] 读取 currentModel 失败。", err);
	}

	const workspacePath = getWorkspacePath(active);
	// 我们没有一个同步且零开销的 Git 仓库判定；design 中 `/review` 通过 IPC 读 git diff
	// 返回的 has_changes 做最终判定，这里仅以 workspacePath 是否存在作为粗略标记。
	const hasGitRepo = workspacePath !== null;

	let rightSidebarVisible = true;
	try {
		rightSidebarVisible = Boolean(
			(workspaceStore.getState() as { rightSidebarVisible?: boolean })
				.rightSidebarVisible,
		);
	} catch (err) {
		console.warn("[slashCommands] 读取 rightSidebarVisible 失败。", err);
	}

	let currentColorThemeId = "classic";
	try {
		currentColorThemeId = themeManager.getColorThemeId();
	} catch (err) {
		console.warn("[slashCommands] 读取 currentColorThemeId 失败。", err);
	}

	let settings: SlashCommandsSettingsSnapshot;
	try {
		settings = buildSlashCommandsSettingsSnapshot();
	} catch (err) {
		console.warn("[slashCommands] 组合 settings snapshot 失败，使用默认值。", err);
		settings = {
			enabled: true,
			visibility: {},
			defaultColorThemeId: currentColorThemeId,
			customScanEnabled: true,
		};
	}

	const recentResumableSessions = buildRecentResumableSessions();

	return {
		activeSession: active,
		sdkSessionId,
		recentResumableSessions,
		currentModel,
		availableModels,
		planModeEnabled,
		permissionMode,
		workspacePath,
		hasGitRepo,
		rightSidebarVisible,
		currentColorThemeId,
		settings,
		invokeSelectModel:
			overrides?.invokeSelectModel ??
			((_modelId: string): void => {
				// 无 UI 桥接的裸调用：no-op。测试与非 UI 路径不应依赖它生效。
			}),
	};
}

// 重导出 settings 订阅回调类型，方便 UI 直接消费
export type { PrefsChangeListener };
