import type { LucideIcon } from "lucide-react";

/**
 * 命令面板的单条命令。
 *
 * - `id` 全局唯一，用于 React key 与可能的最近使用持久化
 * - `keywords` 是搜索附加关键字（中英文别名），主搜索字段是 title + description
 * - `group` 是分组标题（"项目"、"导航"、"设置"、"主题" 等）
 * - `shortcut` 是右侧灰色显示的键位提示（如 ["Cmd", "K"]），不参与匹配
 */
export interface CommandItem {
	id: string;
	title: string;
	description?: string;
	icon?: LucideIcon;
	keywords?: string[];
	group: string;
	shortcut?: string[];
	/** 触发后是否保持打开（默认 false：选中后关闭） */
	keepOpen?: boolean;
	action: () => void | Promise<void>;
}
