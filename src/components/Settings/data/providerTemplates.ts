import {
	Box,
	Gauge,
	Globe,
	Hexagon,
	Layers,
	type LucideIcon,
	MessageSquare,
	Network,
	Plug,
	SearchCode,
	SlidersHorizontal,
	Terminal,
	Wind,
	Workflow,
} from "lucide-react";
import { ProviderType } from "../../../types";
import providerTemplatesJson from "../data/providerTemplates.json";

export interface ProviderTemplate {
	templateId: string;
	name: string;
	providerType: ProviderType;
	icon: LucideIcon;
	color: string;
	defaultEnabled: boolean;
	defaultApiBase?: string;
	defaultModels: string[];
	homeUrl?: string;
	apiKeyUrl?: string;
	docsUrl?: string;
	modelsUrl?: string;
}

/**
 * Lucide 图标 string key → Component 解码表。
 * 数据 JSON 内 `icon` 字段是字符串；本表把字符串转为渲染期可用的组件。
 * 新增图标时同步更新该映射 + JSON 即可。
 */
const ICON_MAP: Record<string, LucideIcon> = {
	Box,
	Gauge,
	Globe,
	Hexagon,
	Layers,
	MessageSquare,
	Network,
	Plug,
	SearchCode,
	SlidersHorizontal,
	Terminal,
	Wind,
	Workflow,
};

interface RawProviderTemplate {
	templateId: string;
	name: string;
	providerType: string;
	icon: string;
	color: string;
	defaultEnabled: boolean;
	defaultApiBase?: string;
	defaultModels: string[];
	homeUrl?: string;
	apiKeyUrl?: string;
	docsUrl?: string;
	modelsUrl?: string;
}

function decodeIcon(name: string, templateId: string): LucideIcon {
	const icon = ICON_MAP[name];
	if (!icon) {
		console.warn(
			`[providerTemplates] unknown icon "${name}" for "${templateId}", falling back to Box`,
		);
		return Box;
	}
	return icon;
}

function decodeProviderType(value: string, templateId: string): ProviderType {
	const known = Object.values(ProviderType) as string[];
	if (known.includes(value)) return value as ProviderType;
	console.warn(
		`[providerTemplates] unknown providerType "${value}" for "${templateId}", falling back to Custom`,
	);
	return ProviderType.Custom;
}

const RAW_TEMPLATES = providerTemplatesJson as RawProviderTemplate[];

export const PROVIDER_TEMPLATES: ProviderTemplate[] = RAW_TEMPLATES.map(
	(t) => ({
		templateId: t.templateId,
		name: t.name,
		providerType: decodeProviderType(t.providerType, t.templateId),
		icon: decodeIcon(t.icon, t.templateId),
		color: t.color,
		defaultEnabled: t.defaultEnabled,
		defaultApiBase: t.defaultApiBase,
		defaultModels: t.defaultModels ?? [],
		homeUrl: t.homeUrl,
		apiKeyUrl: t.apiKeyUrl,
		docsUrl: t.docsUrl,
		modelsUrl: t.modelsUrl,
	}),
);
