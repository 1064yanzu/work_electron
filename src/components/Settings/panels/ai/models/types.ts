/**
 * panels/ai/models/types.ts — ModelSettings 拆分过程中被多个子组件共用的小工具
 *
 * Phase 4 · 对应 tasks.md 4.1–4.6。把原 `panels/ModelSettings.tsx` 里
 * 与 endpoint 元数据相关的判定、读写、preview URL 拼接逻辑统一抽出，
 * 让 ProviderApiBaseSection / ProviderModelSection 共享同一套事实源。
 */
import { ProviderType } from "../../../../../types";
import type { Provider } from "../../../constants";

// =====================================================================
// Endpoint 类型
// =====================================================================

export type EndpointType = "chat_completions" | "responses";
export type ModelEndpointSelection = "inherit" | EndpointType;

/** OpenAI 兼容型端点类型可配置的服务商（其它服务商不展示"端点类型"字段） */
export function isEndpointConfigurableProvider(
	providerType: ProviderType,
): boolean {
	return (
		providerType === ProviderType.OpenAi ||
		providerType === ProviderType.Custom ||
		providerType === ProviderType.Deepseek
	);
}

/** 从 provider.metadata 里安全读出「模型级端点类型覆盖表」 */
export function getModelEndpointTypes(
	metadata: Record<string, unknown> | undefined,
): Record<string, EndpointType> {
	const raw = metadata?.model_endpoint_types;
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

	const result: Record<string, EndpointType> = {};
	for (const [model, value] of Object.entries(raw as Record<string, unknown>)) {
		if (value === "chat_completions" || value === "responses") {
			result[model] = value;
		}
	}
	return result;
}

/** 从 provider.metadata 里取默认端点类型；非 "responses" 统一视为 "chat_completions" */
export function getDefaultEndpointType(
	metadata: Record<string, unknown> | undefined,
): EndpointType {
	return metadata?.openai_endpoint_type === "responses"
		? "responses"
		: "chat_completions";
}

/**
 * 根据服务商当前的 apiBase + 模板类型 + 默认端点类型，
 * 计算真实调用时的请求预览 URL。与原 `panels/ModelSettings.tsx` 行为严格对齐。
 */
export function computeApiPreviewUrl(
	provider: Provider,
	endpointType: EndpointType,
): string {
	if (!provider.apiBase) return "";
	const stripTrailingSlash = (s: string) => String(s || "").replace(/\/+$/, "");
	const rawBase = stripTrailingSlash(provider.apiBase);

	if (provider.providerType === ProviderType.Anthropic) {
		const base = rawBase.endsWith("/v1")
			? rawBase.slice(0, -"/v1".length)
			: rawBase;
		return `${base}/v1/messages`;
	}

	const templateId = provider.templateId || provider.metadata?.templateId;
	const base = (() => {
		if (templateId === "gemini") {
			return rawBase.includes("/v1beta/openai")
				? rawBase
				: `${rawBase}/v1beta/openai`;
		}
		if (
			templateId === "perplexity" ||
			templateId === "github" ||
			templateId === "zhipu"
		) {
			return rawBase;
		}
		if (/\/v\d+(?:beta\d*)?(?:\/|$)/i.test(rawBase)) return rawBase;
		return `${rawBase}/v1`;
	})();

	return endpointType === "responses"
		? `${base}/responses`
		: `${base}/chat/completions`;
}

/**
 * 从多行 / 逗号分隔的字符串里提取纯净、去重的 API Key 列表。
 * 与原 `panels/ModelSettings.tsx` 中的 `normalizeApiKeys` 行为一致。
 */
export function normalizeApiKeys(value: string): string[] {
	const items = value
		.split(/[\n,，]/g)
		.map((key) => key.trim())
		.filter(Boolean);
	const seen = new Set<string>();
	const ordered: string[] = [];
	for (const item of items) {
		if (seen.has(item)) continue;
		seen.add(item);
		ordered.push(item);
	}
	return ordered;
}
