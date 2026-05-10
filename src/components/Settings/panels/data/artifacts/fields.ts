/**
 * panels/data/artifacts/fields.ts — `data.artifacts` 面板可搜索字段声明
 *
 * 旧 `ArtifactSettings` 的字段没有单独抽出；这里仅声明一个总入口锚点供搜索定位。
 */
import type { FieldDescriptor } from "../../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "data.artifacts",
		anchorId: "data.artifacts.overview",
		label: "产物管理",
		description: "Agent 产物存储路径、清理策略、总容量限制",
		keywords: ["artifact", "产物", "清理"],
	},
];
