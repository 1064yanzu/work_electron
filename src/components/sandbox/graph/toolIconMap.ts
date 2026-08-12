/**
 * 工具调用图标映射
 * 根据 ToolCall.name 推断合适的图标，用于运行图中 ToolNode 的分类展示
 */

import {
	Archive,
	Code2,
	Edit3,
	Eye,
	FileText,
	FolderSearch,
	GitBranch,
	Globe,
	MessageSquare,
	PenLine,
	Plug,
	Search,
	Terminal,
	Trash2,
} from "lucide-react";
import type { ComponentType } from "react";

interface ToolIconConfig {
	icon: ComponentType<{ className?: string }>;
	label: string;
	color: string;
}

/** 工具名称模式 → 图标映射规则（按优先级排列） */
const toolPatterns: Array<{
	test: (name: string) => boolean;
	config: ToolIconConfig;
}> = [
	{
		test: (n) => /^(bash|execute_command|run_command|shell)/.test(n),
		config: {
			icon: Terminal,
			label: "命令",
			color: "text-amber-600 dark:text-amber-400",
		},
	},
	{
		test: (n) => /^(read_file|file_read|cat)/.test(n),
		config: {
			icon: FileText,
			label: "读取",
			color: "text-blue-600 dark:text-blue-400",
		},
	},
	{
		test: (n) => /^(write_file|file_write|create_file|save_file)/.test(n),
		config: {
			icon: PenLine,
			label: "写入",
			color: "text-emerald-600 dark:text-emerald-400",
		},
	},
	{
		test: (n) => /^(edit_file|file_edit|replace|patch|multi_edit)/.test(n),
		config: {
			icon: Edit3,
			label: "编辑",
			color: "text-orange-600 dark:text-orange-400",
		},
	},
	{
		test: (n) => /^(delete_file|file_delete|remove|rm)/.test(n),
		config: {
			icon: Trash2,
			label: "删除",
			color: "text-rose-600 dark:text-rose-400",
		},
	},
	{
		test: (n) =>
			/^(search|grep|find|ripgrep|glob|list_dir|directory_tree|ls)/.test(n),
		config: {
			icon: FolderSearch,
			label: "搜索",
			color: "text-violet-600 dark:text-violet-400",
		},
	},
	{
		test: (n) => /^(web_search|tavily|brave_search|google_search)/.test(n),
		config: {
			icon: Search,
			label: "网络搜索",
			color: "text-sky-600 dark:text-sky-400",
		},
	},
	{
		test: (n) =>
			/^(browser|navigate|screenshot|page_|click|scroll|fetch_url)/.test(n),
		config: {
			icon: Globe,
			label: "浏览器",
			color: "text-indigo-600 dark:text-indigo-400",
		},
	},
	{
		test: (n) => /^(view|preview|inspect|look)/.test(n),
		config: {
			icon: Eye,
			label: "查看",
			color: "text-cyan-600 dark:text-cyan-400",
		},
	},
	{
		test: (n) =>
			/^(chat|ask|send_message|message|llm|anthropic|openai)/.test(n),
		config: {
			icon: MessageSquare,
			label: "对话",
			color: "text-purple-600 dark:text-purple-400",
		},
	},
	{
		test: (n) => /^(subagent|spawn|delegate|dispatch)/.test(n),
		config: { icon: GitBranch, label: "子代理", color: "text-primary" },
	},
	{
		test: (n) => /^(compress|archive|zip|tar|pack)/.test(n),
		config: {
			icon: Archive,
			label: "压缩",
			color: "text-cream-600 dark:text-cream-400",
		},
	},
	{
		test: (n) => /^(code|compile|build|test|lint|format|typecheck)/.test(n),
		config: {
			icon: Code2,
			label: "代码",
			color: "text-teal-600 dark:text-teal-400",
		},
	},
	{
		test: (n) => /^mcp_/.test(n),
		config: {
			icon: Plug,
			label: "MCP",
			color: "text-fuchsia-600 dark:text-fuchsia-400",
		},
	},
];

const defaultConfig: ToolIconConfig = {
	icon: MessageSquare,
	label: "工具",
	color: "text-cream-500 dark:text-cream-400",
};

/** 根据工具名称获取图标配置 */
export function getToolIconConfig(toolName: string): ToolIconConfig {
	const name = toolName.toLowerCase().trim();
	for (const pattern of toolPatterns) {
		if (pattern.test(name)) return pattern.config;
	}
	return defaultConfig;
}
