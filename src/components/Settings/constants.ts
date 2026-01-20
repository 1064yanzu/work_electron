import type { LucideIcon } from "lucide-react";
import {
	Archive,
	BarChart3,
	Brain,
	Cpu,
	Database,
	Globe,
	MessageSquare,
	Plug,
	Settings as SettingsIcon,
	Shield,
	Sparkles,
	Terminal,
	Workflow,
	Zap,
} from "lucide-react";
import { ProviderType } from "../../types";

export const SETTINGS_MENU = [
	{ id: "dashboard", label: "使用统计", icon: BarChart3 },
	{ id: "models", label: "模型配置", icon: Sparkles },
	{ id: "prompts", label: "提示词配置", icon: MessageSquare },
	{ id: "agent", label: "Agent 设置", icon: Shield },
	{ id: "skills", label: "Agent 技能", icon: Zap },
	{ id: "mcp", label: "MCP 配置", icon: Plug },
	{ id: "general", label: "常规设置", icon: SettingsIcon },
	{ id: "data", label: "数据与同步", icon: Database },
	{ id: "artifacts", label: "产物管理", icon: Archive },
];

export interface ProviderTemplate {
	templateId: string;
	name: string;
	providerType: ProviderType;
	icon: LucideIcon;
	color: string;
	defaultEnabled: boolean;
	defaultApiBase?: string;
	defaultModels: string[];
	docsUrl?: string; // 官方文档/API 密钥获取链接
	homeUrl?: string; // 官网首页
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
	// 主流 AI 厂商
	{
		templateId: "openai",
		name: "OpenAI",
		providerType: ProviderType.OpenAi,
		icon: Sparkles,
		color: "bg-[#10A37F]",
		defaultEnabled: true,
		defaultApiBase: "https://api.openai.com/v1",
		defaultModels: ["gpt-5", "gpt-5-mini", "gpt-4.1", "o3-mini", "gpt-4o"],
		docsUrl: "https://platform.openai.com/api-keys",
		homeUrl: "https://openai.com",
	},
	{
		templateId: "anthropic",
		name: "Claude",
		providerType: ProviderType.Anthropic,
		icon: Sparkles,
		color: "bg-[#D97757]",
		defaultEnabled: false,
		defaultApiBase: "https://api.anthropic.com",
		defaultModels: [
			"claude-sonnet-4-5",
			"claude-opus-4-5",
			"claude-3.7-sonnet",
			"claude-3.5-sonnet",
			"claude-3-haiku",
		],
		docsUrl: "https://console.anthropic.com/settings/keys",
		homeUrl: "https://anthropic.com",
	},
	{
		templateId: "gemini",
		name: "Google Gemini",
		providerType: ProviderType.Custom,
		icon: Sparkles,
		color: "bg-[#4285F4]",
		defaultEnabled: false,
		defaultApiBase: "https://generativelanguage.googleapis.com/v1beta/openai",
		defaultModels: [
			"gemini-2.5-flash",
			"gemini-2.0-flash-exp",
			"gemini-1.5-pro",
			"gemini-1.5-flash",
		],
		docsUrl: "https://aistudio.google.com/apikey",
		homeUrl: "https://ai.google.dev",
	},
	{
		templateId: "deepseek",
		name: "DeepSeek",
		providerType: ProviderType.Deepseek,
		icon: Sparkles,
		color: "bg-[#4D6BFE]",
		defaultEnabled: false,
		defaultApiBase: "https://api.deepseek.com",
		defaultModels: ["deepseek-chat", "deepseek-reasoner", "deepseek-r1"],
		docsUrl: "https://platform.deepseek.com/api_keys",
		homeUrl: "https://deepseek.com",
	},
	{
		templateId: "groq",
		name: "Groq",
		providerType: ProviderType.Custom,
		icon: Sparkles,
		color: "bg-[#F55036]",
		defaultEnabled: false,
		defaultApiBase: "https://api.groq.com/openai/v1",
		defaultModels: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
		docsUrl: "https://console.groq.com/keys",
		homeUrl: "https://groq.com",
	},
	// 本地部署
	{
		templateId: "ollama",
		name: "Ollama",
		providerType: ProviderType.Ollama,
		icon: Terminal,
		color: "bg-zinc-800",
		defaultEnabled: false,
		defaultApiBase: "http://localhost:11434",
		defaultModels: ["llama3.3", "qwen2.5", "deepseek-r1"],
		docsUrl: "https://ollama.com/library",
		homeUrl: "https://ollama.com",
	},
	// 国内代理/聚合
	{
		templateId: "silicon",
		name: "硅基流动",
		providerType: ProviderType.Custom,
		icon: Cpu,
		color: "bg-[#5B6EF8]",
		defaultEnabled: false,
		defaultApiBase: "https://api.siliconflow.cn/v1",
		defaultModels: ["Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3"],
		docsUrl: "https://cloud.siliconflow.cn/account/ak",
		homeUrl: "https://siliconflow.cn",
	},
	{
		templateId: "zhipu",
		name: "智谱 AI",
		providerType: ProviderType.Custom,
		icon: Brain,
		color: "bg-[#3B5998]",
		defaultEnabled: false,
		defaultApiBase: "https://open.bigmodel.cn/api/paas/v4",
		defaultModels: ["glm-4-plus", "glm-4-flash"],
		docsUrl: "https://open.bigmodel.cn/usercenter/apikeys",
		homeUrl: "https://open.bigmodel.cn",
	},
	{
		templateId: "moonshot",
		name: "Moonshot (Kimi)",
		providerType: ProviderType.Custom,
		icon: Globe,
		color: "bg-[#000000]",
		defaultEnabled: false,
		defaultApiBase: "https://api.moonshot.cn/v1",
		defaultModels: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
		docsUrl: "https://platform.moonshot.cn/console/api-keys",
		homeUrl: "https://moonshot.cn",
	},
	// 工作流/Agent
	{
		templateId: "dify",
		name: "Dify",
		providerType: ProviderType.Dify,
		icon: Workflow,
		color: "bg-indigo-600",
		defaultEnabled: false,
		defaultApiBase: "https://api.dify.ai/v1",
		defaultModels: [],
		docsUrl: "https://docs.dify.ai/",
		homeUrl: "https://dify.ai",
	},
	// 自定义
	{
		templateId: "custom",
		name: "自定义 OpenAI 兼容",
		providerType: ProviderType.Custom,
		icon: Plug,
		color: "bg-zinc-500",
		defaultEnabled: false,
		defaultModels: [],
	},
];

// 核心服务商 - 这些会在初始化时自动创建
export const CORE_PROVIDER_IDS = [
	"openai",
	"anthropic",
	"gemini",
	"deepseek",
	"dify",
];

// 可选服务商模板 - 用户可以手动添加（所有非核心的模板）
export const OPTIONAL_TEMPLATES: ProviderTemplate[] = PROVIDER_TEMPLATES.filter(
	(t) => !CORE_PROVIDER_IDS.includes(t.templateId),
);

export interface Provider {
	id: string;
	templateId?: string;
	providerType: ProviderType;
	name: string;
	icon?: LucideIcon;
	color: string;
	isEnabled: boolean;
	apiKey?: string;
	apiBase?: string;
	models: string[];
	metadata?: Record<string, any>;
}

export const DEFAULT_PROVIDERS: Provider[] = PROVIDER_TEMPLATES.map(
	(template) => ({
		id: template.templateId,
		templateId: template.templateId,
		providerType: template.providerType,
		name: template.name,
		icon: template.icon,
		color: template.color,
		isEnabled: template.defaultEnabled,
		apiBase: template.defaultApiBase,
		models: template.defaultModels,
		metadata: { templateId: template.templateId },
	}),
);
