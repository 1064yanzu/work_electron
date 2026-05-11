/**
 * Claude Code 风格斜杠命令 —— 自定义命令扫描器（Phase 9）。
 *
 * 覆盖任务：T9.1 / T9.2 / T9.3 / T9.4。
 *
 * 职责：
 * - 调用主进程 `slash_commands_scan` IPC 拉取 `.claude/commands/` 下的 Markdown；
 * - 将 raw 结构映射为 `kind="prompt"` 的 `SlashCommandDefinition`，降级文案；
 * - 通过 `commandRegistry.replaceCustom(defs)` 做热更新（替换所有 group=custom）；
 * - 失败路径降级为"清空 custom 命令"，不冒泡异常。
 *
 * 约束：
 * - 不直接触达 `chatStore` 等业务状态，纯粹处理扫描与注册；
 * - 冲突策略（内置 > 项目 > 用户）由 `registry.replaceCustom` 内置实现；
 * - 供 `App.tsx` 在启动与工作区目录变化时调用。
 */

import type { IPCSchema } from "../../../electron/shared/ipc-schema";
import { safeInvoke } from "../tauriBridge";
import { EVENTS, events } from "../events";
import { commandRegistry } from "./registry";
import { buildSlashCommandsSettingsSnapshot } from "./settingsSnapshot";
import type { SlashCommandDefinition } from "./types";
import { workspaceStore } from "../workspaceStore";

// ---------------------------------------------------------------------------
// 类型别名
// ---------------------------------------------------------------------------

type ScanOutput = IPCSchema["slash_commands_scan"]["output"];
type ScanItem = ScanOutput[number];

// ---------------------------------------------------------------------------
// 单条 raw → Definition 转换（导出供测试）
// ---------------------------------------------------------------------------

const CUSTOM_ID_PREFIX = "custom-";

/**
 * 将 raw 扫描项转成 `SlashCommandDefinition`。
 *
 * 降级规则：
 * - `name` 为空 → 回退到 raw.id（文件名规范化后的字符串）。
 * - `description` 为空 → 回退到 "自定义命令"。
 * - prompt 在执行时通过 `EVENTS.SLASH_FILL_INPUT` 事件回填到输入框，
 *   不会直接调用 SDK。
 */
export function toDefinition(raw: ScanItem): SlashCommandDefinition {
	const id = `${CUSTOM_ID_PREFIX}${raw.id}`;
	const name = raw.name && raw.name.trim() ? raw.name.trim() : raw.id;
	const description =
		raw.description && raw.description.trim()
			? raw.description.trim()
			: "自定义命令";
	const prompt = typeof raw.prompt === "string" ? raw.prompt : "";

	return {
		id,
		name,
		description,
		group: "custom",
		kind: "prompt",
		visibilityKey: id,
		availability: () => ({ state: "available" }),
		async execute() {
			// 把模板回填到输入框，由用户决定下一步
			events.emit(EVENTS.SLASH_FILL_INPUT, { text: prompt });
			return { kind: "ok" as const };
		},
	};
}

// ---------------------------------------------------------------------------
// 主 API
// ---------------------------------------------------------------------------

/**
 * 扫描当前工作区 `.claude/commands/` 与用户目录 `~/.claude/commands/`，
 * 返回映射好的自定义命令定义列表。
 *
 * 失败（IPC 超时 / 拒绝 / 主进程抛错）时返回空数组并 `console.warn`。
 */
export async function scanCustomCommands(): Promise<SlashCommandDefinition[]> {
	const settings = safeBuildSettings();
	if (!settings.customScanEnabled) return [];

	const workspaceDir = safeGetWorkspaceDir();
	if (!workspaceDir) return [];

	try {
		const raw = await safeInvoke<ScanOutput>("slash_commands_scan", {
			workspace_dir: workspaceDir,
			include_user_home: true,
			max_files: 500,
		});
		if (!Array.isArray(raw)) return [];
		return raw.map(toDefinition);
	} catch (err) {
		console.warn("[slashCommands] 扫描自定义命令失败。", err);
		return [];
	}
}

/**
 * 扫描 + 注册到 Registry。
 *
 * - 若开关关闭：传入空数组给 `replaceCustom`，清除所有 custom 条目；
 * - 若扫描失败：同样清空，保证 UI 不展示陈旧数据。
 */
export async function rescanCustomSlashCommands(): Promise<void> {
	const defs = await scanCustomCommands();
	try {
		commandRegistry.replaceCustom(defs);
	} catch (err) {
		console.warn("[slashCommands] replaceCustom 失败。", err);
	}
}

// ---------------------------------------------------------------------------
// 内部：防御性读取（避免启动期 settingsStore 未就绪时抛错）
// ---------------------------------------------------------------------------

function safeBuildSettings(): ReturnType<
	typeof buildSlashCommandsSettingsSnapshot
> {
	try {
		return buildSlashCommandsSettingsSnapshot();
	} catch (err) {
		console.warn("[slashCommands] customScanner 读取偏好失败。", err);
		return {
			enabled: true,
			visibility: {},
			defaultColorThemeId: "",
			customScanEnabled: true,
		};
	}
}

function safeGetWorkspaceDir(): string | null {
	try {
		const core = workspaceStore.getCoreState();
		const path = core.currentThreadPath;
		if (typeof path === "string" && path.trim()) return path;
		return null;
	} catch (err) {
		console.warn(
			"[slashCommands] customScanner 读取 workspacePath 失败。",
			err,
		);
		return null;
	}
}
