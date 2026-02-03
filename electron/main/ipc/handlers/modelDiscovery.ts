import type { IpcMainInvokeEvent } from "electron";
import { net } from "electron";

import type { IPCSchema } from "../../../shared/ipc-schema";
import {
	getOpenAICompatibleAuthHeaders,
	normalizeAnthropicBaseUrl,
	normalizeOpenAICompatibleBaseUrl,
} from "../../llm/providerHttp";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function stripTrailingSlash(value: string) {
	return String(value || "")
		.trim()
		.replace(/\/+$/, "");
}

function resolveTemplateId(input: any): string | undefined {
	const direct =
		typeof input?.templateId === "string"
			? input.templateId
			: typeof input?.template_id === "string"
				? input.template_id
				: undefined;
	if (direct && direct.trim()) return direct.trim();

	const meta =
		input?.metadata &&
		typeof input.metadata === "object" &&
		typeof input.metadata.templateId === "string"
			? String(input.metadata.templateId).trim()
			: "";
	return meta || undefined;
}

export function createModelDiscoveryHandlers() {
	const provider_fetch_models: Handler<"provider_fetch_models"> = async (
		_event,
		input,
	) => {
		const providerTypeRaw =
			typeof (input as any).providerType === "string"
				? (input as any).providerType
				: typeof (input as any).provider_type === "string"
					? (input as any).provider_type
					: "";
		const providerType = providerTypeRaw.trim();

		const apiBaseRaw =
			typeof (input as any).apiBase === "string"
				? (input as any).apiBase
				: typeof (input as any).api_base === "string"
					? (input as any).api_base
					: "";
		const apiBase = stripTrailingSlash(apiBaseRaw);

		const apiKeyRaw =
			typeof (input as any).apiKey === "string"
				? (input as any).apiKey
				: typeof (input as any).api_key === "string"
					? (input as any).api_key
					: "";
		const apiKey = apiKeyRaw.trim() || undefined;

		if (!apiBase) return { models: [], error: "未配置 API Base URL" };

		const templateId = resolveTemplateId(input as any);
		const providerLike = {
			provider_type: providerType,
			api_base: apiBase,
			template_id: templateId,
			metadata:
				(input as any).metadata && typeof (input as any).metadata === "object"
					? ((input as any).metadata as Record<string, unknown>)
					: null,
		};

		const url =
			providerType === "anthropic"
				? `${normalizeAnthropicBaseUrl(apiBase)}/v1/models`
				: `${normalizeOpenAICompatibleBaseUrl(providerLike, apiBase)}/models`;

		const headers: Record<string, string> = {
			Accept: "application/json",
		};

		if (providerType === "anthropic") {
			headers["x-api-key"] = apiKey || "";
			headers["anthropic-version"] = "2023-06-01";
		} else {
			Object.assign(
				headers,
				getOpenAICompatibleAuthHeaders(providerLike, apiKey),
			);
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 20_000);
		try {
			const response = await net.fetch(url, {
				method: "GET",
				headers,
				signal: controller.signal,
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(`请求失败 (${response.status}): ${text.slice(0, 120)}`);
			}

			const data = (await response.json()) as any;

			if (data && Array.isArray(data.data)) {
				return { models: data.data };
			}

			if (data && Array.isArray(data.models)) {
				return {
					models: data.models.map((m: any) => ({
						...m,
						id: m.name || m.id,
					})),
				};
			}

			if (Array.isArray(data)) {
				return { models: data };
			}

			return { models: [], error: "无法识别的响应格式" };
		} catch (error) {
			return {
				models: [],
				error: error instanceof Error ? error.message : String(error),
			};
		} finally {
			clearTimeout(timer);
		}
	};

	return { provider_fetch_models };
}
