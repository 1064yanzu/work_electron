/**
 * panels/reader/fields.ts — `workshop.reader` 面板可搜索字段声明
 */
import type { FieldDescriptor } from "../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "workshop.reader",
		anchorId: "workshop.reader.typography",
		label: "阅读器排版",
		description: "字号、行距、字间距、字体族、对齐、首行缩进",
		keywords: [
			"font",
			"typography",
			"line-height",
			"字号",
			"字体",
			"行距",
			"排版",
		],
	},
	{
		tabId: "workshop.reader",
		anchorId: "workshop.reader.theme",
		label: "阅读器主题",
		description: "纸张色与文字色组合（米白、深棕、夜读 …）",
		keywords: ["theme", "色彩", "纸张", "夜读", "暗色"],
	},
	{
		tabId: "workshop.reader",
		anchorId: "workshop.reader.immersion",
		label: "沉浸阅读",
		description: "翻页方式、自动滚动、勾画与笔记的可见性",
		keywords: ["immersion", "scroll", "翻页", "沉浸", "笔记"],
	},
];
