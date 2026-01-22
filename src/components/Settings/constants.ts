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
	{
		templateId: "mistral",
		name: "Mistral AI",
		providerType: ProviderType.Custom,
		icon: Sparkles,
		color: "bg-[#FF4F00]",
		defaultEnabled: false,
		defaultApiBase: "https://api.mistral.ai",
		defaultModels: ["mistral-large-latest", "mistral-medium-latest"],
		docsUrl: "https://console.mistral.ai/api-keys/",
		homeUrl: "https://mistral.ai",
	},
	{
		templateId: "together",
		name: "Together AI",
		providerType: ProviderType.Custom,
		icon: Sparkles,
		color: "bg-[#6366F1]",
		defaultEnabled: false,
		defaultApiBase: "https://api.together.xyz",
		defaultModels: ["meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo"],
		docsUrl: "https://api.together.xyz/settings/api-keys",
		homeUrl: "https://together.ai",
	},
	{
		templateId: "openrouter",
		name: "OpenRouter",
		providerType: ProviderType.Custom,
		icon: Sparkles,
		color: "bg-[#9333EA]",
		defaultEnabled: false,
		defaultApiBase: "https://openrouter.ai/api/v1/",
		defaultModels: [],
		docsUrl: "https://openrouter.ai/keys",
		homeUrl: "https://openrouter.ai",
	},
	{
		templateId: "fireworks",
		name: "Fireworks AI",
		providerType: ProviderType.Custom,
		icon: Sparkles,
		color: "bg-[#FF6B6B]",
		defaultEnabled: false,
		defaultApiBase: "https://api.fireworks.ai/inference",
		defaultModels: ["accounts/fireworks/models/llama-v3p3-70b-instruct"],
		docsUrl: "https://fireworks.ai/api-keys",
		homeUrl: "https://fireworks.ai",
	},
	{
		templateId: "perplexity",
		name: "Perplexity",
		providerType: ProviderType.Custom,
		icon: Sparkles,
		color: "bg-[#20808D]",
		defaultEnabled: false,
		defaultApiBase: "https://api.perplexity.ai/",
		defaultModels: ["llama-3.1-sonar-large-128k-online"],
		docsUrl: "https://www.perplexity.ai/settings/api",
		homeUrl: "https://perplexity.ai",
	},
	{
		templateId: "cerebras",
		name: "Cerebras AI",
		providerType: ProviderType.Custom,
		icon: Sparkles,
		color: "bg-[#00C4B3]",
		defaultEnabled: false,
		defaultApiBase: "https://api.cerebras.ai/v1",
		defaultModels: ["llama3.1-70b"],
		docsUrl: "https://cloud.cerebras.ai/",
		homeUrl: "https://cerebras.ai",
	},
	{
		templateId: "hyperbolic",
		name: "Hyperbolic",
		providerType: ProviderType.Custom,
		icon: Sparkles,
		color: "bg-[#7C3AED]",
		defaultEnabled: false,
		defaultApiBase: "https://api.hyperbolic.xyz",
		defaultModels: ["meta-llama/Meta-Llama-3.1-70B-Instruct"],
		docsUrl: "https://app.hyperbolic.xyz/settings",
		homeUrl: "https://hyperbolic.xyz",
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
	{
		templateId: "lmstudio",
		name: "LM Studio",
		providerType: ProviderType.Custom,
		icon: Terminal,
		color: "bg-zinc-700",
		defaultEnabled: false,
		defaultApiBase: "http://localhost:1234",
		defaultModels: [],
		docsUrl: "https://lmstudio.ai/docs",
		homeUrl: "https://lmstudio.ai",
	},
	{
		templateId: "newapi",
		name: "New API",
		providerType: ProviderType.Custom,
		icon: Terminal,
		color: "bg-blue-600",
		defaultEnabled: false,
		defaultApiBase: "http://localhost:3000",
		defaultModels: [],
		docsUrl: "https://github.com/Calcium-Ion/new-api",
		homeUrl: "https://github.com/Calcium-Ion/new-api",
	},
	{
		templateId: "github",
		name: "GitHub Models",
		providerType: ProviderType.Custom,
		icon: Sparkles,
		color: "bg-[#24292F]",
		defaultEnabled: false,
		defaultApiBase: "https://models.github.ai/inference",
		defaultModels: ["gpt-4o", "gpt-4o-mini"],
		docsUrl: "https://github.com/settings/tokens",
		homeUrl: "https://github.com/marketplace/models",
	},
	// 国内代理/聚合
	{
		templateId: "silicon",
		name: "Silicon Flow",
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
		templateId: "aihubmix",
		name: "AiHubMix",
		providerType: ProviderType.Custom,
		icon: Cpu,
		color: "bg-[#10B981]",
		defaultEnabled: false,
		defaultApiBase: "https://aihubmix.com",
		defaultModels: [],
		docsUrl: "https://doc.aihubmix.com/",
		homeUrl: "https://aihubmix.com",
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
// 注意：新增的服务商默认不会自动创建，需要用户手动添加
// 后端会自动创建这21个核心服务商模板
export const CORE_PROVIDER_IDS = [
	"openai",
	"anthropic",
	"gemini",
	"deepseek",
	"zhipu",
	"moonshot",
	"silicon",
	"aihubmix",
	"openrouter",
	"together",
	"groq",
	"fireworks",
	"mistral",
	"ollama",
	"lmstudio",
	"newapi",
	"github",
	"perplexity",
	"cerebras",
	"hyperbolic",
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
