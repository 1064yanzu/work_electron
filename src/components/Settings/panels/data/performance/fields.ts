/**
 * panels/data/performance/fields.ts — `data.performance` 面板可搜索字段声明
 */
import type { FieldDescriptor } from "../../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "data.performance",
		anchorId: "data.performance.overview",
		label: "性能优化",
		description: "资料刷新 / 远程同步间隔 / UI 热路径日志",
		keywords: ["performance", "refresh", "sync", "debug", "刷新", "同步"],
	},
	{
		tabId: "data.performance",
		anchorId: "data.performance.observability",
		label: "性能观测",
		description: "冷启动耗时趋势 / 渲染端长任务 / 慢 IPC Top 10",
		keywords: [
			"performance",
			"observability",
			"startup",
			"longtask",
			"slow ipc",
			"启动耗时",
			"长任务",
			"慢调用",
			"观测",
			"图表",
		],
	},
];
