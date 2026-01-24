import type { Provider } from "../components/Settings/constants";

export interface DiscoveredModel {
	id: string;
	object?: string;
	created?: number;
	owned_by?: string;
}

export interface FetchModelsResult {
	models: DiscoveredModel[];
	error?: string;
}

/**
 * 从服务商 API 获取模型列表
 * 主要支持：
 * - OpenAI 兼容格式：GET {base}/models（base 可能需要补齐 /v1）
 * - Anthropic：GET {base}/v1/models
 * - Gemini（OpenAI-compat）：GET {base}/models（base 需要补齐 /v1beta/openai）
 */
export async function fetchModelsFromProvider(
	provider: Provider,
): Promise<FetchModelsResult> {
	if (!provider.apiBase) {
		return { models: [], error: "未配置 API Base URL" };
	}

	const stripTrailingSlash = (s: string) => String(s || "").replace(/\/+$/, "");
	const baseRaw = stripTrailingSlash(provider.apiBase);

	const getPrimaryApiKey = (raw?: string) => {
		const parts = String(raw || "")
			.split(/[\n,，]/g)
			.map((k) => k.trim())
			.filter(Boolean);
		return parts[0];
	};

	const apiKey = getPrimaryApiKey(provider.apiKey);

	const normalizeAnthropicBase = (raw: string) => {
		const base = stripTrailingSlash(raw);
		return base.endsWith("/v1") ? base.slice(0, -"/v1".length) : base;
	};

	const normalizeOpenAICompatBase = () => {
		const templateId = provider.templateId || provider.metadata?.templateId;
		// Gemini OpenAI-compat is hosted under /v1beta/openai
		if (templateId === "gemini") {
			if (baseRaw.includes("/v1beta/openai")) return baseRaw;
			return `${baseRaw}/v1beta/openai`;
		}
		// Some OpenAI-compatible providers do not use /v1.
		if (
			templateId === "perplexity" ||
			templateId === "github" ||
			templateId === "zhipu"
		) {
			return baseRaw;
		}
		// If user already provided a version segment, keep it.
		if (/\/v\d+(?:beta\d*)?(?:\/|$)/i.test(baseRaw)) return baseRaw;
		// Common OpenAI-compat providers expect /v1.
		return `${baseRaw}/v1`;
	};

	const url =
		provider.providerType === "anthropic"
			? `${normalizeAnthropicBase(baseRaw)}/v1/models`
			: `${normalizeOpenAICompatBase()}/models`;

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	// 特殊处理：Anthropic 需要 x-api-key
	if (provider.providerType === "anthropic") {
		headers["x-api-key"] = apiKey || "";
		headers["anthropic-version"] = "2023-06-01";
	} else if (apiKey) {
		const templateId = provider.templateId || provider.metadata?.templateId;
		if (templateId === "gemini") {
			headers["x-goog-api-key"] = apiKey;
		} else {
			headers["Authorization"] = `Bearer ${apiKey}`;
		}
	}

	try {
		console.log(`[ModelDiscovery] Fetching models from ${url}...`);
		const response = await fetch(url, {
			method: "GET",
			headers,
		});

		if (!response.ok) {
			const text = await response.text();
			console.error(`[ModelDiscovery] Failed: ${response.status} ${text}`);
			throw new Error(`请求失败 (${response.status}): ${text.slice(0, 100)}`);
		}

		const data = await response.json();

		// 标准 OpenAI 格式: { data: [...] }
		if (data && Array.isArray(data.data)) {
			return { models: data.data };
		}

		// Ollama 格式: { models: [...] }
		if (data && Array.isArray(data.models)) {
			// Ollama 的 name 字段是模型 ID
			return {
				models: data.models.map((m: any) => ({ ...m, id: m.name || m.id })),
			};
		}

		// 数组直接返回
		if (Array.isArray(data)) {
			return { models: data };
		}

		return { models: [], error: "无法识别的响应格式" };
	} catch (error: any) {
		console.error("[ModelDiscovery] Error:", error);
		return { models: [], error: error.message || "网络请求失败" };
	}
}
