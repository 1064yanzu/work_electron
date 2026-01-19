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
 * 主要支持 OpenAI 兼容格式的接口 (GET /v1/models)
 */
export async function fetchModelsFromProvider(
	provider: Provider,
): Promise<FetchModelsResult> {
	if (!provider.apiBase) {
		return { models: [], error: "未配置 API Base URL" };
	}

	// 移除末尾的斜杠
	const baseUrl = provider.apiBase.replace(/\/$/, "");
	const url = `${baseUrl}/models`;

	// 如果 baseUrl 不包含 /v1 且不是特殊的 endpoint，尝试添加 /v1
	// 这里做一个简单的启发式处理，但通常用户填写的 apiBase 应该包含版本号如果需要的话
	// 不过很多用户只会填 https://api.openai.com，所以如果失败可以重试

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	if (provider.apiKey) {
		headers["Authorization"] = `Bearer ${provider.apiKey}`;
	}

	// 特殊处理：Anthropic 需要 x-api-key
	if (provider.providerType === "anthropic") {
		headers["x-api-key"] = provider.apiKey || "";
		headers["anthropic-version"] = "2023-06-01";
		delete headers["Authorization"];
		// Anthropic 官方 API 目前没有标准的 list models 接口，通常是硬编码的。
		// 但如果是通过中转（OpenAI 兼容），则走下面的流程。
		// 如果是官方 endpoint，这个请求可能会失败。
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
