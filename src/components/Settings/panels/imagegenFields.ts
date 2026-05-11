/**
 * panels/imagegenFields.ts — `workshop.imagegen` 面板可搜索字段声明
 *
 * 因为 ImageGenSettings 还是单文件结构，没有专属子目录，故 fields 平铺在
 * `panels/` 下。后续若拆分到 `panels/imagegen/`，可以把本文件挪过去。
 */
import type { FieldDescriptor } from "../fieldRegistry";

export const IMAGEGEN_FIELDS: FieldDescriptor[] = [
	{
		tabId: "workshop.imagegen",
		anchorId: "workshop.imagegen.overview",
		label: "AI 生图",
		description: "图像生成模型、尺寸、风格预设、批量参数",
		keywords: [
			"image",
			"generate",
			"draw",
			"图像生成",
			"绘图",
			"sd",
			"midjourney",
		],
	},
];
