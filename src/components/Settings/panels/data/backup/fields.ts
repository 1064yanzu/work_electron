/**
 * panels/data/backup/fields.ts — `data.backup` 面板可搜索字段声明
 */
import type { FieldDescriptor } from "../../../fieldRegistry";

export const FIELDS: FieldDescriptor[] = [
	{
		tabId: "data.backup",
		anchorId: "data.backup.local_dir",
		label: "本地备份目录",
		description: "选择 Workbench 数据的本地备份路径",
		keywords: ["backup", "本地", "目录"],
	},
	{
		tabId: "data.backup",
		anchorId: "data.backup.local_actions",
		label: "数据备份与恢复",
		description: "本地备份、恢复、导出 JSON",
		keywords: ["export", "import", "导出", "导入", "JSON"],
	},
	{
		tabId: "data.backup",
		anchorId: "data.backup.webdav_enabled",
		label: "WebDAV 云同步",
		description: "启用或关闭 WebDAV 云同步",
		keywords: ["webdav", "云同步", "sync"],
	},
	{
		tabId: "data.backup",
		anchorId: "data.backup.webdav_provider",
		label: "WebDAV 服务商",
		description: "选择坚果云 / Nextcloud / ownCloud 等预设",
		keywords: ["webdav", "provider", "服务商", "坚果云"],
	},
	{
		tabId: "data.backup",
		anchorId: "data.backup.webdav_url",
		label: "WebDAV 地址",
		description: "WebDAV 服务器 URL",
		keywords: ["webdav", "url", "host", "地址"],
	},
	{
		tabId: "data.backup",
		anchorId: "data.backup.webdav_username",
		label: "WebDAV 账号",
		description: "WebDAV 登录用户名",
		keywords: ["webdav", "user", "账号", "用户名"],
	},
	{
		tabId: "data.backup",
		anchorId: "data.backup.webdav_password",
		label: "WebDAV 密码",
		description: "WebDAV 登录密码（坚果云须使用应用密码）",
		keywords: ["webdav", "password", "密码"],
	},
	{
		tabId: "data.backup",
		anchorId: "data.backup.webdav_path",
		label: "WebDAV 同步路径",
		description: "远端用于存放备份的目录",
		keywords: ["webdav", "path", "路径"],
	},
	{
		tabId: "data.backup",
		anchorId: "data.backup.webdav_test",
		label: "测试 WebDAV 连接",
		description: "验证 WebDAV 配置是否可用",
		keywords: ["test", "测试", "连接"],
	},
	{
		tabId: "data.backup",
		anchorId: "data.backup.webdav_actions",
		label: "备份到 WebDAV / 从 WebDAV 恢复",
		description: "手动备份与恢复",
		keywords: ["backup", "restore", "恢复"],
	},
];
