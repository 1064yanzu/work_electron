/**
 * panels/integrationsFields.ts — `integrations.*` 面板可搜索字段声明
 *
 * MCP 与远程控制目前还在 panels/ 根目录（MCPSettings.tsx / RemoteControlSettings.tsx），
 * 故 fields 也平铺在此。后续拆分时可以挪到 panels/integrations/<sub>/fields.ts。
 */
import type { FieldDescriptor } from "../fieldRegistry";

export const INTEGRATIONS_FIELDS: FieldDescriptor[] = [
	// ---------- MCP ----------
	{
		tabId: "integrations.mcp",
		anchorId: "integrations.mcp.servers",
		label: "MCP 服务器",
		description: "管理已配置的 Model Context Protocol 服务器",
		keywords: ["mcp", "server", "服务器", "tools"],
	},
	{
		tabId: "integrations.mcp",
		anchorId: "integrations.mcp.env",
		label: "MCP 运行环境",
		description: "Node.js / NPX 检测，Shell PATH",
		keywords: ["node", "npx", "环境", "path"],
	},
	// ---------- Remote Control ----------
	{
		tabId: "integrations.remote",
		anchorId: "integrations.remote.overview",
		label: "远程控制总开关",
		description: "启用远程控制并查看运行状态、活跃运行数",
		keywords: ["remote", "远程", "总开关", "enabled"],
	},
	{
		tabId: "integrations.remote",
		anchorId: "integrations.remote.channels",
		label: "远程通道",
		description: "飞书 / Telegram / Slack / Discord / 微信 / QQ Bot 接入",
		keywords: [
			"feishu",
			"telegram",
			"slack",
			"discord",
			"wechat",
			"qq",
			"通道",
		],
	},
	{
		tabId: "integrations.remote",
		anchorId: "integrations.remote.pairing",
		label: "配对与会话",
		description: "审批配对请求、撤销授权、终止远程会话",
		keywords: ["pair", "session", "配对", "会话"],
	},
	{
		tabId: "integrations.remote",
		anchorId: "integrations.remote.cloud_node",
		label: "云端节点",
		description: "把本机注册到云端中继，支持跨网络远程控制",
		keywords: ["cloud", "relay", "云端", "中继", "node"],
	},
];
