// 内置全局快捷键 + 展示型条目（速查表/设置面板可见）
//
// App 挂载时调用 registerDefaultShortcuts() 一次性注册。
// scoped 快捷键（沙盒 Alt+1/2、对话 ⌘.）由对应组件在挂载时自行注册。

import { commandPaletteStore } from "../stores/commandPaletteStore";
import { layoutStore } from "../stores/layoutStore";
import { terminalStore } from "../stores/terminalStore";
import { workspaceStore } from "../workspaceStore";
import { shortcutRegistry } from "./registry";
import type { ShortcutDefinition } from "./types";

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
