import {
	PROVIDER_TEMPLATES,
	type Provider,
	type ProviderTemplate,
} from "./constants";

/**
 * 打开外部链接
 */
export const openUrl = (url: string) => {
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
