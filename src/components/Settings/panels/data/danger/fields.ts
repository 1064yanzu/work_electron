/**
 * panels/data/danger/fields.ts — `data.danger` 面板可搜索字段声明
 */
import type { FieldDescriptor } from "../../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "data.danger",
		anchorId: "data.danger.clear_all",
		label: "清空全部数据",
		description: "危险操作：删除资料、配置、个性化设置",
		keywords: ["reset", "delete", "清空", "重置", "危险"],
	},
];
