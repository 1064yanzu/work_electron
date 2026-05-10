/**
 * panels/data/stats/fields.ts — `data.stats` 面板可搜索字段声明
 */
import type { FieldDescriptor } from "../../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "data.stats",
		anchorId: "data.stats.overview",
		label: "使用统计",
		description: "Token 消耗、知识库统计、365 天活跃度",
		keywords: ["stats", "token", "dashboard", "统计", "使用量"],
	},
];
