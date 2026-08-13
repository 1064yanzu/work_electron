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
			color: "text-text-muted",
		},
	},
	{
		test: (n) => /^(read_file|file_read|cat)/.test(n),
		config: {
			icon: FileText,
			label: "读取",
			color: "text-text-muted",
		},
	},
	{
		test: (n) => /^(write_file|file_write|create_file|save_file)/.test(n),
		config: {
			icon: PenLine,
			label: "写入",
			color: "text-text-muted",
		},
	},
	{
		test: (n) => /^(edit_file|file_edit|replace|patch|multi_edit)/.test(n),
		config: {
			icon: Edit3,
			label: "编辑",
			color: "text-text-muted",
		},
	},
	{
		test: (n) => /^(delete_file|file_delete|remove|rm)/.test(n),
		config: {
			icon: Trash2,
			label: "删除",
			color: "text-text-muted",
		},
	},
	{
		test: (n) =>
			/^(search|grep|find|ripgrep|glob|list_dir|directory_tree|ls)/.test(n),
		config: {
			icon: FolderSearch,
			label: "搜索",
			color: "text-text-muted",
		},
	},
	{
		test: (n) => /^(web_search|tavily|brave_search|google_search)/.test(n),
		config: {
			icon: Search,
			label: "网络搜索",
			color: "text-text-muted",
		},
	},
	{
		test: (n) =>
			/^(browser|navigate|screenshot|page_|click|scroll|fetch_url)/.test(n),
		config: {
			icon: Globe,
			label: "浏览器",
			color: "text-text-muted",
		},
	},
	{
		test: (n) => /^(view|preview|inspect|look)/.test(n),
		config: {
			icon: Eye,
			label: "查看",
			color: "text-text-muted",
		},
	},
	{
		test: (n) =>
			/^(chat|ask|send_message|message|llm|anthropic|openai)/.test(n),
		config: {
			icon: MessageSquare,
			label: "对话",
			color: "text-text-muted",
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
			color: "text-text-muted",
		},
	},
	{
		test: (n) => /^(code|compile|build|test|lint|format|typecheck)/.test(n),
		config: {
			icon: Code2,
			label: "代码",
			color: "text-text-muted",
		},
	},
	{
		test: (n) => /^mcp_/.test(n),
		config: {
			icon: Plug,
			label: "MCP",
			color: "text-text-muted",
		},
	},
];

const defaultConfig: ToolIconConfig = {
	icon: MessageSquare,
	label: "工具",
	color: "text-text-muted",
};

/** 根据工具名称获取图标配置 */
export function getToolIconConfig(toolName: string): ToolIconConfig {
	const name = toolName.toLowerCase().trim();
	for (const pattern of toolPatterns) {
		if (pattern.test(name)) return pattern.config;
	}
	return defaultConfig;
}
