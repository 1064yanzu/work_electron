import {
	Package,
	BarChart3,
	Cpu,
	Database,
	Activity,
	Keyboard,
	Palette,
	MessageSquare,
	Plug,
	Settings as SettingsIcon,
	Shield,
	Smartphone,
	Sparkles,
	Monitor,
	type LucideIcon,
} from "lucide-react";
import type {
	SettingsExperienceMode,
	SettingsNavGroup,
	SettingsTabId,
} from "./types";

export interface SettingsNavItem {
	id: SettingsTabId;
	label: string;
	icon: LucideIcon;
	group: SettingsNavGroup;
	simpleMode: "full" | "summary";
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
	{
		id: "dashboard",
		label: "使用统计",
		icon: BarChart3,
		group: "common",
		simpleMode: "full",
	},
	{
		id: "models",
		label: "模型配置",
		icon: Cpu,
		group: "common",
		simpleMode: "full",
	},
	{
		id: "prompts",
		label: "提示词配置",
		icon: MessageSquare,
		group: "common",
		simpleMode: "full",
	},
	{
		id: "imagegen",
		label: "AI 生图",
		icon: Palette,
		group: "common",
		simpleMode: "full",
	},
	{
		id: "mascot",
		label: "桌面宠物",
		icon: Sparkles,
		group: "common",
		simpleMode: "full",
	},
	{
		id: "general",
		label: "常规设置",
		icon: SettingsIcon,
		group: "common",
		simpleMode: "full",
	},
	{
		id: "shortcuts",
		label: "键盘快捷键",
		icon: Keyboard,
		group: "common",
		simpleMode: "full",
	},
	{
		id: "data",
		label: "数据与同步",
		icon: Database,
		group: "common",
		simpleMode: "full",
	},
	{
		id: "agent",
		label: "Agent 设置",
		icon: Shield,
		group: "technical",
		simpleMode: "summary",
	},

	{
		id: "memory",
		label: "Agent 记忆",
		icon: Database,
		group: "technical",
		simpleMode: "summary",
	},
	{
		id: "mcp",
		label: "MCP 配置",
		icon: Plug,
		group: "technical",
		simpleMode: "summary",
	},
	{
		id: "remoteControl",
		label: "远程控制",
		icon: Smartphone,
		group: "technical",
		simpleMode: "summary",
	},
	{
		id: "performance",
		label: "性能优化",
		icon: Activity,
		group: "technical",
		simpleMode: "summary",
	},
	{
		id: "artifacts",
		label: "产物管理",
		icon: Package,
		group: "technical",
		simpleMode: "summary",
	},
	{
		id: "sandboxPreview",
		label: "沙盒预览",
		icon: Monitor,
		group: "technical",
		simpleMode: "summary",
	},
];

export const SETTINGS_NAV_GROUPS: Array<{
	id: SettingsNavGroup;
	label: string;
}> = [
	{ id: "common", label: "常用设置" },
	{ id: "technical", label: "技术与集成" },
];

export function getSettingsNavItemsByGroup(group: SettingsNavGroup) {
	return SETTINGS_NAV_ITEMS.filter((item) => item.group === group);
}

export function getSettingsNavItem(tabId: SettingsTabId) {
	return SETTINGS_NAV_ITEMS.find((item) => item.id === tabId) ?? null;
}

export function shouldExpandSettingsGroup(params: {
	group: SettingsNavGroup;
	mode: SettingsExperienceMode;
	activeTab: SettingsTabId;
	technicalGroupExpanded: boolean;
}) {
	const { group, mode, activeTab, technicalGroupExpanded } = params;
	if (group === "common") return true;
	if (mode === "geek") return true;
	if (activeTab && getSettingsNavItem(activeTab)?.group === "technical") {
		return true;
	}
	return technicalGroupExpanded;
}
