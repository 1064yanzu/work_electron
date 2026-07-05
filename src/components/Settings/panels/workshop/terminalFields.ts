/**
 * FIELDS — 创作与工具 · 终端 的可搜索字段清单
 */
import type { FieldDescriptor } from "../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "workshop.terminal",
		anchorId: "workshop.terminal.defaultCwd",
		label: "默认工作目录",
		description: "新建终端时的起始目录模式：线程目录或主目录。",
		keywords: ["cwd", "directory", "terminal", "工作目录", "终端", "起始目录"],
	},
	{
		tabId: "workshop.terminal",
		anchorId: "workshop.terminal.shellPath",
		label: "自定义 Shell 路径",
		description: "指定终端使用的 Shell 程序路径；留空使用系统默认。",
		keywords: [
			"shell",
			"bash",
			"zsh",
			"fish",
			"cmd",
			"powershell",
			"终端",
			"Shell",
		],
	},
	{
		tabId: "workshop.terminal",
		anchorId: "workshop.terminal.scrollback",
		label: "回滚缓冲行数",
		description: "终端可回滚查看的历史输出行数；修改后对新开的终端生效。",
		keywords: [
			"scrollback",
			"buffer",
			"terminal",
			"回滚",
			"缓冲",
			"历史",
			"行数",
			"终端",
		],
	},
	{
		tabId: "workshop.terminal",
		anchorId: "workshop.terminal.openOnLaunch",
		label: "启动时自动打开终端",
		description: "应用启动后自动展开终端面板。",
		keywords: [
			"terminal",
			"launch",
			"auto",
			"启动",
			"自动打开",
			"终端",
			"开机",
		],
	},
];
