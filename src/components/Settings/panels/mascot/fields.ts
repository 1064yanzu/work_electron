/**
 * panels/mascot/fields.ts — `workshop.mascot` 面板可搜索字段声明
 */
import type { FieldDescriptor } from "../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "workshop.mascot",
		anchorId: "workshop.mascot.window",
		label: "桌面宠物窗口",
		description: "显示 / 隐藏宠物、置顶、点击穿透、初始位置",
		keywords: ["mascot", "pet", "桌宠", "宠物", "桌面"],
	},
	{
		tabId: "workshop.mascot",
		anchorId: "workshop.mascot.emotion",
		label: "情绪表情",
		description: "心情切换与触发条件",
		keywords: ["emotion", "情绪", "表情"],
	},
	{
		tabId: "workshop.mascot",
		anchorId: "workshop.mascot.motion",
		label: "动作与动画",
		description: "动作组、空闲循环、互动反馈",
		keywords: ["motion", "动作", "动画"],
	},
];
