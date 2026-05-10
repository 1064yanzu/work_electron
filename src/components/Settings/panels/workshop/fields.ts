/**
 * FIELDS — 创作与工具 · 工作区布局 面板的可搜索字段清单
 *
 * 与 `LayoutPanel.tsx` 内渲染的 `data-settings-anchor` 一一对应。
 */
import type { FieldDescriptor } from "../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "workshop.layout",
		anchorId: "workshop.layout.center.defaultView",
		label: "中间栏默认视图",
		description: "启动托管模式时中间栏显示的内容（运行图 / 预览）。",
		keywords: [
			"center",
			"defaultView",
			"graph",
			"preview",
			"默认视图",
			"中间栏",
		],
	},
	{
		tabId: "workshop.layout",
		anchorId: "workshop.layout.center.artifactClick",
		label: "产物节点点击行为",
		description: "在运行图上点击产物节点时的默认动作。",
		keywords: ["artifact", "click", "产物", "节点"],
	},
	{
		tabId: "workshop.layout",
		anchorId: "workshop.layout.center.infoDensity",
		label: "信息密度",
		description: "运行图与抽屉的信息呈现密度（紧凑 / 舒适）。",
		keywords: ["density", "density", "compact", "信息密度"],
	},
	{
		tabId: "workshop.layout",
		anchorId: "workshop.layout.center.graphFollow",
		label: "运行图自动跟随",
		description: "自动聚焦到当前活动节点。",
		keywords: ["follow", "auto-follow", "自动跟随"],
	},
	{
		tabId: "workshop.layout",
		anchorId: "workshop.layout.sandbox.breakpoint",
		label: "默认断点",
		description: "沙盒预览的默认响应式断点（mobile / tablet / desktop）。",
		keywords: ["breakpoint", "responsive", "断点"],
	},
	{
		tabId: "workshop.layout",
		anchorId: "workshop.layout.sandbox.autoStart",
		label: "自动启动开发服务器",
		description: "检测到 package.json 后自动启动 dev server。",
		keywords: ["dev", "server", "autoStart", "自动启动", "dev server"],
	},
	{
		tabId: "workshop.layout",
		anchorId: "workshop.layout.sandbox.packageManager",
		label: "包管理器",
		description: "自动检测失败时使用的默认包管理器。",
		keywords: ["package", "manager", "npm", "yarn", "pnpm", "包管理"],
	},
	{
		tabId: "workshop.layout",
		anchorId: "workshop.layout.sandbox.devCommand",
		label: "自定义 dev 命令",
		description: "覆盖默认的 dev server 启动命令模板。",
		keywords: ["dev", "command", "命令", "devCommand", "启动命令"],
	},
	{
		tabId: "workshop.layout",
		anchorId: "workshop.layout.sandbox.portRange",
		label: "端口范围",
		description: "沙盒预览服务器使用的端口范围。",
		keywords: ["port", "range", "端口", "端口范围"],
	},
];
