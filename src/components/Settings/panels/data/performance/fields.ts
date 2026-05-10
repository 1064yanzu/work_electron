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
];
