import {
	Archive,
	BarChart3,
	Blocks,
	Cpu,
	Database,
	Gauge,
	Image,
	Keyboard,
	type LucideIcon,
	MessageSquare,
	Plug,
	Settings as SettingsIcon,
	Shield,
	Smartphone,
	Sparkles,
} from "lucide-react";
import type { ProviderType } from "../../types";
import {
	PROVIDER_TEMPLATES,
	type ProviderTemplate,
} from "./data/providerTemplates";

export type { ProviderTemplate } from "./data/providerTemplates";
export { PROVIDER_TEMPLATES } from "./data/providerTemplates";

export const SETTINGS_MENU = [
	{ id: "dashboard", label: "使用统计", icon: BarChart3 },
	{ id: "models", label: "模型配置", icon: Cpu },
	{ id: "prompts", label: "提示词配置", icon: MessageSquare },
	{ id: "imagegen", label: "AI 生图", icon: Image },
	{ id: "mascot", label: "桌面宠物", icon: Sparkles },
	{ id: "agent", label: "Agent 设置", icon: Shield },
	{ id: "skills", label: "Agent 技能", icon: Blocks },
	{ id: "mcp", label: "MCP 配置", icon: Plug },
	{ id: "remoteControl", label: "远程控制", icon: Smartphone },
	{ id: "general", label: "常规设置", icon: SettingsIcon },
	{ id: "shortcuts", label: "键盘快捷键", icon: Keyboard },
	{ id: "performance", label: "性能优化", icon: Gauge },
	{ id: "data", label: "数据与同步", icon: Database },
	{ id: "artifacts", label: "产物管理", icon: Archive },
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
	"cherryin",
	"ovms",
	"ocoolai",
	"alayanew",
	"aionly",
	"burncloud",
	"cephalon",
	"lanyun",
	"ph8",
	"sophnet",
	"dashscope",
	"modelscope",
	"doubao",
	"minimax",
	"minimax-global",
	"baichuan",
	"stepfun",
	"yi",
	"zai",
	"xirang",
	"hunyuan",
	"tencent-cloud-ti",
	"baidu-cloud",
	"voyageai",
	"qiniu",
	"longcat",
	"infini",
	"grok",
	"nvidia",
	"jina",
	"ppio",
	"302ai",
	"dmxapi",
	"tokenflux",
	"huggingface",
	"poe",
	"mimo",
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
