// 内置全局快捷键 + 展示型条目（速查表/设置面板可见）
//
// App 挂载时调用 registerDefaultShortcuts() 一次性注册。
// scoped 快捷键（沙盒 Alt+1/2、对话 ⌘.）由对应组件在挂载时自行注册。

import { getLastKnowledgeTab } from "../../components/resource/knowledgeSection";
import { EVENTS, events } from "../events";
import { commandPaletteStore } from "../stores/commandPaletteStore";
import { layoutStore } from "../stores/layoutStore";
import { terminalStore } from "../stores/terminalStore";
import { workspaceStore } from "../workspaceStore";
import { shortcutRegistry } from "./registry";
import type { ShortcutDefinition } from "./types";

type LeftSidebarView = ReturnType<
	typeof layoutStore.getState
>["leftSidebarView"];

/**
 * ⌘1..4 对应 SidebarRail 的四个入口。
 * 「知识」是资料库 / 卡片 / Wiki 三个 tab 的合集，跳回上次看的那个，
 * 与点 rail 的行为保持一致。
 */
const LEFT_SIDEBAR_TARGETS: Array<{
	view: LeftSidebarView | "knowledge";
	label: string;
	commandId: string;
}> = [
	{ view: "files", label: "文件", commandId: "nav.left.files" },
	{ view: "threads", label: "对话", commandId: "nav.left.threads" },
	{ view: "knowledge", label: "知识", commandId: "nav.left.knowledge" },
	{ view: "skills", label: "技能", commandId: "nav.left.skills" },
];

function focusLeftSidebarView(view: LeftSidebarView | "knowledge") {
	layoutStore.setLeftSidebarView(
		view === "knowledge" ? getLastKnowledgeTab() : view,
	);
	layoutStore.setLeftSidebarCollapsed(false);
}

const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
	{
		id: "global.command-palette",
		keys: "mod+k",
		label: "打开命令面板",
		description: "搜索命令、设置、主题",
		group: "全局",
		handler: () => commandPaletteStore.toggle(),
	},
	{
		id: "global.toggle-right-sidebar",
		keys: "mod+l",
		label: "切换 AI 对话栏",
		description: "显示或隐藏右侧 Copilot",
		group: "全局",
		commandId: "ws.toggle-right-sidebar",
		handler: () => workspaceStore.toggleRightSidebar(),
	},
	{
		id: "global.toggle-left-sidebar",
		keys: "mod+b",
		label: "折叠/展开资源栏",
		description: "收起左侧资源面板，专注中间工作区",
		group: "全局",
		commandId: "ws.toggle-left-sidebar",
		handler: () =>
			layoutStore.setLeftSidebarCollapsed(
				!layoutStore.getState().leftSidebarCollapsed,
			),
	},
	{
		id: "global.toggle-terminal",
		keys: "mod+`",
		label: "切换终端",
		description: "在中栏下方打开/关闭终端",
		group: "全局",
		commandId: "ws.open-terminal",
		handler: () => terminalStore.toggleVisible(),
	},
	{
		id: "global.cheat-sheet",
		keys: "mod+/",
		label: "快捷键速查表",
		description: "查看全部可用快捷键",
		group: "全局",
		commandId: "ws.shortcut-cheat-sheet",
		handler: () => shortcutRegistry.toggleCheatSheet(),
	},
	{
		id: "global.open-settings",
		keys: "mod+,",
		label: "打开设置",
		description: "打开设置面板（系统级习惯键位）",
		group: "全局",
		commandId: "settings.open",
		handler: () => events.emit(EVENTS.OPEN_SETTINGS, {}),
	},
	{
		id: "global.new-thread",
		keys: "mod+n",
		label: "新建对话",
		description: "选择工作目录并开一个新会话",
		group: "全局",
		commandId: "nav.new-thread",
		handler: () => {
			focusLeftSidebarView("threads");
			events.emit(EVENTS.NEW_THREAD_REQUEST, undefined);
		},
	},

	// ===== ⌘1..4 切左栏视图（Alt+1..9 已被中栏标签页占用，不冲突）=====
	...LEFT_SIDEBAR_TARGETS.map((target, index) => ({
		id: `global.left-sidebar-${target.view}`,
		keys: `mod+${index + 1}`,
		label: `左栏 · ${target.label}`,
		group: "全局" as const,
		hidden: true,
		commandId: target.commandId,
		handler: () => focusLeftSidebarView(target.view),
	})),
	{
		id: "global.left-sidebar-nth",
		keys: "mod+1",
		keysDisplay: ["⌘", "1", "…", "4"],
		label: "切换左栏视图",
		description: "1 文件 · 2 对话 · 3 知识 · 4 技能",
		group: "全局",
		displayOnly: true,
	},

	// ===== 展示型条目（局部实现的交互，收进速查表让用户可见）=====
	{
		id: "chat.send",
		keys: "enter",
		label: "发送消息",
		group: "对话",
		displayOnly: true,
	},
	{
		id: "chat.newline",
		keys: "shift+enter",
		label: "换行",
		group: "对话",
		displayOnly: true,
	},
	{
		id: "palette.navigate",
		keys: "arrows",
		keysDisplay: ["↑", "↓"],
		label: "命令面板 · 选择候选",
		group: "面板与对话框",
		displayOnly: true,
	},
	{
		id: "palette.run",
		keys: "enter",
		label: "命令面板 · 执行",
		group: "面板与对话框",
		displayOnly: true,
	},
	{
		id: "modal.close",
		keys: "escape",
		label: "关闭 Modal / 面板 / 菜单",
		group: "面板与对话框",
		displayOnly: true,
	},
	{
		id: "modal.focus-cycle",
		keys: "tab",
		keysDisplay: ["Tab", "/", "⇧Tab"],
		label: "Modal 内切换焦点",
		group: "面板与对话框",
		displayOnly: true,
	},
	{
		id: "panel.resize",
		keys: "arrows",
		keysDisplay: ["←", "→"],
		label: "聚焦分隔条后微调面板宽度",
		description: "Tab 聚焦到面板分隔条，方向键调整，双击重置",
		group: "工作区",
		displayOnly: true,
	},
];

export function registerDefaultShortcuts(): () => void {
	return shortcutRegistry.register(DEFAULT_SHORTCUTS);
}
