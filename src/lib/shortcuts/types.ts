// 快捷键注册中心 — 类型定义
//
// 单一事实源：全局 keydown 分发、设置面板展示、⌘/ 速查表、
// 命令面板的快捷键提示都从 registry 读取，不再各自手写静态表。

export type ShortcutGroup =
	| "全局"
	| "工作区"
	| "对话"
	| "沙盒"
	| "面板与对话框";

/**
 * 作用域仅作为元信息（分组展示、冲突判定）；
 * 生效范围由注册生命周期决定 —— scoped 快捷键随所属视图挂载注册、卸载反注册。
 */
export type ShortcutScope = "global" | "sandbox" | "chat";

export interface ShortcutDefinition {
	/** 稳定 id，如 "global.command-palette" */
	id: string;
	/**
	 * 规范化按键串："mod+k" | "alt+1" | "mod+shift+p"。
	 * mod 在 mac 上是 ⌘（兼容 Ctrl），其他平台是 Ctrl。
	 * displayOnly 条目可填任意描述串并配合 keysDisplay 使用。
	 */
	keys: string;
	/** 展示名，如 "打开命令面板" */
	label: string;
	description?: string;
	group: ShortcutGroup;
	scope?: ShortcutScope;
	/** 额外启用条件（如 "停止响应" 仅在执行中可用） */
	when?: () => boolean;
	/** 焦点位于 input/textarea/contentEditable 时是否仍触发，默认 false */
	allowInInput?: boolean;
	handler?: (e: KeyboardEvent) => void;
	/** 仅在速查表/设置面板展示（如 "Esc 关闭 Modal"），不参与分发 */
	displayOnly?: boolean;
	/** 覆盖展示用 kbd 序列（用于 "↑ ↓" 这类无法解析的组合） */
	keysDisplay?: string[];
	/** 关联命令面板命令 id，供 useCommands 自动带出快捷键提示 */
	commandId?: string;
}
