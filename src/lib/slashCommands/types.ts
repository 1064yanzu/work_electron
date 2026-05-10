/**
 * Claude Code 风格斜杠命令 —— 类型契约单一事实源。
 *
 * 本文件仅定义类型与错误类，不引入任何副作用代码，供 `registry.ts`、
 * `context.ts`、`executor.ts`、`filter.ts`、UI 层以及 `builtin/` 下的
 * 内置命令共享使用。
 *
 * 设计原则：
 * 1. 严格 TypeScript，任何需要宽松类型的位置必须使用 `unknown`，而非 `any`。
 * 2. 不持有任何运行时状态（store / DOM / IPC 句柄），保证可被纯测试导入。
 * 3. 与 `design.md` 的 "Data Models" 小节字段一一对应，不私自扩展。
 */

import type { ChatSession } from "../chat/types";
import type { Model } from "../../components/chat/ModelSelector";

// ---------------------------------------------------------------------------
// 可用性三态
// ---------------------------------------------------------------------------

/**
 * 命令在当前上下文下的可用性。
 * - `available`：正常可用。
 * - `disabled`：在菜单中以降低对比度的方式渲染，hover / focus 时展示 `reason`；
 *   `reason` 应使用中文短句，**运行时长度上限为 120 个字符**（由 Registry 做守护，
 *   类型系统仅在注释中声明）。
 * - `hidden`：不渲染，不计入列表长度（见 Requirement 7.3）。
 */
export type CommandAvailability =
	| { state: "available" }
	| {
			state: "disabled";
			/** 禁用原因（中文），建议 ≤ 120 字符。 */
			reason: string;
	  }
	| { state: "hidden" };

// ---------------------------------------------------------------------------
// 分组与命令形态
// ---------------------------------------------------------------------------

/** 命令所属分组，对应 SlashMenu 二级菜单的视觉分区。 */
export type CommandGroupId =
	| "session"
	| "runtime"
	| "inspect"
	| "workspace"
	| "custom";

/**
 * 命令形态：
 * - `action`：直接执行，无子菜单。
 * - `submenu`：需要展开三级子菜单再选中具体选项后执行。
 * - `prompt`：把预设文案回填到输入框，由用户进一步提交（自定义命令默认形态）。
 */
export type CommandKind = "action" | "submenu" | "prompt";

// ---------------------------------------------------------------------------
// 子菜单选项（仅 kind=submenu 使用）
// ---------------------------------------------------------------------------

/** 三级子菜单的单个选项。 */
export interface SlashCommandSubOption {
	/** 子选项标识，例如 `plan` / `acceptEdits` / `claude-sonnet-4`。 */
	id: string;
	/** 中文标签，展示在菜单中。 */
	label: string;
	/** 可选的中文补充描述。 */
	description?: string;
	/** 子选项自身的可用性（允许子项独立禁用）。 */
	availability?: CommandAvailability;
}

// ---------------------------------------------------------------------------
// 设置快照（与 settingsStore 的持久化键一一对应）
// ---------------------------------------------------------------------------

/**
 * 斜杠命令相关的用户偏好快照，由 `settingsStore` 装配。
 *
 * 对应持久化键：
 * - `slashCommands.enabled`
 * - `slashCommands.visibility`
 * - `slashCommands.defaultColorThemeId`
 * - `slashCommands.customScanEnabled`
 */
export interface SlashCommandsSettingsSnapshot {
	/** 「命令」类别总开关；关闭后 SlashMenu 不展示该类别。 */
	enabled: boolean;
	/** 每条命令的显隐偏好，`undefined` 视为 `show`。 */
	visibility: Record<string, "show" | "hide">;
	/** `/theme` 的默认代码高亮主题 id。 */
	defaultColorThemeId: string;
	/** 是否扫描 `.claude/commands/` 以注入自定义命令。 */
	customScanEnabled: boolean;
}

// ---------------------------------------------------------------------------
// 命令执行结果
// ---------------------------------------------------------------------------

/** 命令执行完成后的结构化结果。 */
export type ExecuteOutcome =
	| {
			kind: "ok";
			/** 可选的成功提示 Toast；面板切换类命令通常不产出。 */
			toast?: { type: "success" | "info"; message: string };
	  }
	| {
			kind: "failed";
			/** 中文失败摘要，用于 Toast 展示。 */
			message: string;
			/** 是否允许「重试」按钮；与 `AgentSdkEventPayload.retryable` 对齐。 */
			retryable?: boolean;
			/** 原始错误，仅用于日志，不直接展示给用户。 */
			cause?: unknown;
	  };

// ---------------------------------------------------------------------------
// 可恢复会话片段（用于 /resume 子菜单）
// ---------------------------------------------------------------------------

/** `/resume` 子菜单展示的历史会话最小字段集合。 */
export type ResumableSessionBrief = Pick<
	ChatSession,
	"id" | "title" | "updatedAt"
> & {
	/** `buildCommandContext` 保证已通过 `isSdkSessionId` 校验且为非空字符串。 */
	sdkSessionId: string;
};

// ---------------------------------------------------------------------------
// 命令执行上下文
// ---------------------------------------------------------------------------

/**
 * 一次命令执行所需的纯数据上下文。
 *
 * 通过 `buildCommandContext()` 从各 store / React 上下文装配，**不持有任何
 * 可变引用**，保证命令执行器可被单测（包括 PBT）。
 */
export interface CommandContext {
	// ---- 会话相关 ----
	/** 当前聊天侧边栏选中的会话；无选中时为 `null`。 */
	activeSession: ChatSession | null;
	/** Active Session 的 SDK 会话 id；`null` 表示尚未建立。 */
	sdkSessionId: string | null;
	/**
	 * `/resume` 候选列表：按 `updatedAt` 倒序、已通过 `isSdkSessionId` 校验，
	 * 上限建议 20 条（由装配函数保证）。
	 */
	recentResumableSessions: ResumableSessionBrief[];

	// ---- 运行时 ----
	/** 当前生效的模型 id；无选中时为 `null`。 */
	currentModel: string | null;
	/** 模型选择器可见的模型列表。 */
	availableModels: Model[];
	/** 规划模式是否开启（来自 `planModeStore`）。 */
	planModeEnabled: boolean;
	/** 当前审批模式（来自 `toolPermissionStore` / `permissionStore`）。 */
	permissionMode: string;

	// ---- 工作区 ----
	/** 当前工作目录绝对路径；未打开工作区时为 `null`。 */
	workspacePath: string | null;
	/** 当前工作区是否存在 Git 仓库（供 `/review` / `/status` 使用）。 */
	hasGitRepo: boolean;

	// ---- UI ----
	/** 右侧面板是否可见（来自 `workspaceStore`）。 */
	rightSidebarVisible: boolean;
	/** 当前代码高亮主题 id。 */
	currentColorThemeId: string;

	// ---- Settings ----
	/** 斜杠命令自身的偏好快照。 */
	settings: SlashCommandsSettingsSnapshot;

	// ---- 组件桥接 ----
	/**
	 * 由 `ChatInput` 通过 React 上下文注入的模型切换闭包；命令执行器只依赖
	 * 该方法，不直接持有组件 props，避免 UI 与业务耦合。
	 */
	invokeSelectModel: (modelId: string) => void;
}

// ---------------------------------------------------------------------------
// 命令定义
// ---------------------------------------------------------------------------

/**
 * 斜杠命令的静态元数据 + 行为契约。
 *
 * 约束：
 * - `action` 命令必须实现 `execute`。
 * - `submenu` 命令必须同时实现 `getSubmenu` 与 `execute`（`execute` 接收选中项）。
 * - `prompt` 命令由自定义扫描生成，本迭代同样走 `execute`（回填输入框）。
 *
 * 运行时由 `CommandRegistry` 做结构校验；类型系统仅给出最宽的签名，避免 union
 * 爆炸。
 */
export interface SlashCommandDefinition {
	/** 命令 id（不含前导 `/`），全局唯一；UI 展示时由渲染层添加 `/`。 */
	id: string;
	/** 中文标签，展示在菜单主文本位置。 */
	name: string;
	/** 一行中文描述，展示在菜单副文本位置。 */
	description: string;
	/** 所属分组，决定二级菜单内的分区。 */
	group: CommandGroupId;
	/** 命令形态。 */
	kind: CommandKind;
	/** 同 group 内的排序权重；值越小越靠前，缺省视为 `0`。 */
	priority?: number;
	/**
	 * 对应 `SlashCommandsSettingsSnapshot.visibility` 中的键；缺省视为 `id`。
	 * 自定义命令可共享同一个 key 以便批量隐藏。
	 */
	visibilityKey?: string;

	/**
	 * 依据上下文返回可用性；注册表会进一步把 `settings.visibility` 的 `hide`
	 * 转成 `hidden` 态，调用方只需关注「此时是否可用」。
	 */
	availability(ctx: CommandContext): CommandAvailability;

	/**
	 * 执行命令副作用。
	 * - 对于 `action`：`option` 始终为 `undefined`。
	 * - 对于 `submenu`：`option` 为用户选中的子项。
	 * - 对于 `prompt`：`option` 始终为 `undefined`（自定义命令走回填输入框路径）。
	 */
	execute?(
		ctx: CommandContext,
		option?: SlashCommandSubOption,
	): Promise<ExecuteOutcome>;

	/** 仅 `submenu` 命令实现；返回三级子菜单的选项列表。 */
	getSubmenu?(ctx: CommandContext): SlashCommandSubOption[];
}

// ---------------------------------------------------------------------------
// 注册表异常
// ---------------------------------------------------------------------------

/**
 * 命令 id 冲突时由 `CommandRegistry` 抛出。
 *
 * 冲突策略：内置 > 项目级 > 用户级；任何重复 id 都会被拒绝而不是静默覆盖，
 * 由调用方决定是否捕获。
 */
export class SlashCommandConflictError extends Error {
	constructor(
		public readonly commandId: string,
		message?: string,
	) {
		super(
			message ?? `斜杠命令 id 冲突：${commandId}，已存在同名命令，已拒绝覆盖。`,
		);
		this.name = "SlashCommandConflictError";
		// 保持原型链在 transpile 到 ES5 后依然正确（防御性写法，对 ES2020 无副作用）。
		Object.setPrototypeOf(this, SlashCommandConflictError.prototype);
	}
}
