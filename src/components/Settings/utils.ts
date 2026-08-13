import type { CSSProperties } from "react";
import {
	PROVIDER_TEMPLATES,
	type Provider,
	type ProviderTemplate,
} from "./constants";

/**
 * 打开外部链接
 */
export const openUrl = (url: string) => {
	// Prefer opening via OS default browser in desktop (Electron).
	if (
		typeof window !== "undefined" &&
		typeof window.electronAPI?.invoke === "function"
	) {
		window.electronAPI
			.invoke("open_external_url", { url })
			.catch(() => window.open(url, "_blank", "noopener,noreferrer"));
		return;
	}

	window.open(url, "_blank", "noopener,noreferrer");
};

/**
 * 根据 Provider 获取对应的模板
 */
export const getTemplateForProvider = (
	provider: Provider,
): ProviderTemplate | undefined => {
	const templateId = provider.templateId || provider.metadata?.templateId;
	if (templateId) {
		const found = PROVIDER_TEMPLATES.find((t) => t.templateId === templateId);
		if (found) return found;
	}
	return PROVIDER_TEMPLATES.find(
		(t) => t.providerType === provider.providerType,
	);
};

/**
 * Provider 品牌色渲染 props。
 * 模板 JSON 的 color 字段存 hex 值（Tailwind content 扫描不到 JSON 里的类名，
 * 动态类会在构建中被裁掉），hex 走 inline style；无 color 或旧格式走中性兜底类。
 */
export const getProviderColorProps = (
	color: string | undefined,
): { className: string; style?: CSSProperties } => {
	if (color?.startsWith("#")) {
		return { className: "text-white", style: { backgroundColor: color } };
	}
	return { className: "bg-warm-300 text-text-secondary" };
};

/**
 * 将模型列表按前缀分组
 */
export const groupModels = (models: string[]): Record<string, string[]> => {
	const groups: Record<string, string[]> = {};

	models.forEach((model) => {
		// 按 - 分割，取前两部分作为组名
		const parts = model.split("-");
		let groupName: string;

		if (parts.length >= 2) {
			// gpt-4o-mini -> gpt-4o
			// claude-3-5-sonnet -> claude-3
			groupName = parts.slice(0, 2).join("-");
		} else {
			groupName = "default";
		}

		if (!groups[groupName]) {
			groups[groupName] = [];
		}
		groups[groupName].push(model);
	});

	return groups;
};

/**
 * 格式化分组名称用于显示
 */
export const formatGroupName = (groupName: string): string => {
	if (groupName === "default") return "默认分组";
	return groupName;
};
