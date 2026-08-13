import type { ProviderConfig } from "../types";
import { anthropicPassthroughAdapter } from "./anthropicPassthrough";
import { openaiCompatibleAdapter } from "./openaiCompatible";
import type { ProxyProviderAdapter } from "./types";

/**
 * 按 provider_type 查表分发；未注册的类型一律走 OpenAI 兼容模板
 * （与拆分前 callProvider/callProviderStream 的分支行为一致）。
 */
const adapterByProviderType = new Map<string, ProxyProviderAdapter>([
	["anthropic", anthropicPassthroughAdapter],
]);

const defaultAdapter = openaiCompatibleAdapter;

export function resolveProxyProviderAdapter(
	provider: ProviderConfig,
): ProxyProviderAdapter {
	return adapterByProviderType.get(provider.provider_type) ?? defaultAdapter;
}
