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

	// ---------- AI 入口互通（协作层） ----------
	{
		tabId: "integrations.harnessHub",
		anchorId: "integrations.harnessHub.handoffPolicy",
		label: "接力策略",
		description: "会话搬到另一个入口时用哪一档：原生续接 / 原文接力 / 蒸馏接力",
		keywords: ["handoff", "接力", "续接", "resume", "蒸馏", "distill", "jieli"],
	},
	{
		tabId: "integrations.harnessHub",
		anchorId: "integrations.harnessHub.bridge",
		label: "把其他入口当作工具",
		description:
			"让本应用的 Copilot 调用 ChatGPT / Gemini / Claude Code / Codex",
		keywords: [
			"bridge",
			"tool",
			"互为工具",
			"桥接",
			"ask_web",
			"ask_agent",
			"qiaojie",
		],
	},
	{
		tabId: "integrations.harnessHub",
		anchorId: "integrations.harnessHub.mcpServer",
		label: "让外部 CLI 调用本应用",
		description:
			"暴露 MCP 服务器，Claude Code / Codex 可用你已登录的 Web AI 与历史会话",
		keywords: ["mcp", "server", "反向", "token", "端口", "fanxiang"],
	},
	{
		tabId: "integrations.harnessHub",
		anchorId: "integrations.harnessHub.routes",
		label: "能力路由",
		description: "长上下文 / 联网研究 / 代码改写等任务分别优先派给哪个入口",
		keywords: ["route", "路由", "capability", "能力", "luyou"],
	},
	{
		tabId: "integrations.harnessHub",
		anchorId: "integrations.harnessHub.quota",
		label: "额度状态",
		description: "从真实转录里检测各入口的限额提示，路由会自动绕开",
		keywords: ["quota", "额度", "限额", "rate limit", "edu", "xiane"],
	},
	{
		tabId: "integrations.harnessHub",
		anchorId: "integrations.harnessHub.automation",
		label: "定时任务",
		description: "让 AI 在夜间等额度空闲的时段自动跑任务",
		keywords: [
			"automation",
			"自动化",
			"定时",
			"schedule",
			"cron",
			"夜间",
			"dingshi",
			"zidonghua",
		],
	},
	{
		tabId: "integrations.harnessHub",
		anchorId: "integrations.harnessHub.automationRetry",
		label: "自动化失败处理",
		description: "429 / 5xx / 断连时自动等待并续跑，卡死判定阈值与失败通知",
		keywords: [
			"retry",
			"重试",
			"失败",
			"429",
			"卡死",
			"stalled",
			"通知",
			"chongshi",
			"shibai",
		],
	},

	// ---------- 剪藏服务 ----------
	{
		tabId: "integrations.clip",
		anchorId: "integrations.clip.status",
		label: "剪藏服务状态",
		description: "本机 Clip HTTP 服务的运行状态与实际端口",
		keywords: [
			"clip",
			"剪藏",
			"jiancang",
			"http",
			"port",
			"端口",
			"服务",
			"bookmark",
		],
	},
	{
		tabId: "integrations.clip",
		anchorId: "integrations.clip.token",
		label: "剪藏访问 token",
		description: "调用 /api/clip 所需的 token，可复制或轮换",
		keywords: ["clip", "token", "剪藏", "密钥", "轮换", "rotate", "api key"],
	},
	{
		tabId: "integrations.clip",
		anchorId: "integrations.clip.bookmarklet",
		label: "剪藏书签脚本",
		description: "一键复制 bookmarklet，拖进浏览器书签栏即可剪藏网页",
		keywords: [
			"bookmarklet",
			"书签",
			"shuqian",
			"剪藏",
			"浏览器",
			"browser",
			"脚本",
		],
	},

	// ---------- AI 代理 ----------
	{
		tabId: "integrations.aiProxy",
		anchorId: "integrations.aiProxy.status",
		label: "AI 代理健康状态",
		description: "本机 Anthropic 兼容代理的健康监测、自动恢复与手动重启",
		keywords: [
			"proxy",
			"代理",
			"daili",
			"anthropic",
			"健康",
			"health",
			"重启",
			"restart",
			"端口",
			"port",
		],
	},
	{
		tabId: "integrations.aiProxy",
		anchorId: "integrations.aiProxy.token",
		label: "AI 代理访问 token",
		description: "Agent SDK 调用本地代理所需的 token，可查看或轮换",
		keywords: ["proxy", "token", "代理", "密钥", "轮换", "rotate", "api key"],
	},
];
