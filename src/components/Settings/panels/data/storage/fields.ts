/**
 * panels/data/storage/fields.ts — `data.storage` 面板可搜索字段声明
 *
 * 对接 `fieldRegistry.ts`：本文件 export `FIELDS: FieldDescriptor[]`，
 * `SettingsSearch` 通过 `SETTINGS_FIELD_INDEX` 命中后跳到对应 anchorId。
 */
import type { FieldDescriptor } from "../../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "data.storage",
		anchorId: "data.storage.vault_root",
		label: "Vault 根目录",
		description: "统一存放资料、笔记与产物的 Obsidian 风格目录",
		keywords: ["vault", "根目录", "存储目录", "obsidian"],
	},
	{
		tabId: "data.storage",
		anchorId: "data.storage.obsidian_frontmatter",
		label: "Obsidian Frontmatter",
		description: "为 Markdown 写入 YAML 元信息",
		keywords: ["frontmatter", "yaml", "元信息"],
	},
	{
		tabId: "data.storage",
		anchorId: "data.storage.obsidian_wiki_links",
		label: "Wiki Link",
		description: "使用 [[文档]] 互链语法",
		keywords: ["wikilink", "互链"],
	},
	{
		tabId: "data.storage",
		anchorId: "data.storage.conflict_strategy",
		label: "重名冲突策略",
		description: "同名文件的处理方式",
		keywords: ["conflict", "冲突", "重名"],
	},
	{
		tabId: "data.storage",
		anchorId: "data.storage.themes",
		label: "主题目录",
		description: "管理 Vault 下 Themes/ 子目录",
		keywords: ["theme", "主题", "目录"],
	},
	{
		tabId: "data.storage",
		anchorId: "data.storage.soft_delete_retention",
		label: "软删除保留期",
		description: "已删除资料与输出文稿的自动物理清除周期；0 = 永不清除",
		keywords: [
			"soft delete",
			"retention",
			"recycle",
			"软删除",
			"保留期",
			"回收",
			"清理",
			"删除",
		],
	},
	{
		tabId: "data.storage",
		anchorId: "data.storage.directories",
		label: "数据目录 · 数据库",
		description: "应用数据与数据库路径、迁移数据库、清除缓存",
		keywords: ["database", "迁移", "缓存", "cache"],
	},
];
