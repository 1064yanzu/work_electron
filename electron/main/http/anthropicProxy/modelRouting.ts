const MODEL_ROUTE_PREFIX = "ipo-route/v1/";

export function encodeIpoRoutedModel(opts: {
	providerId: string;
	agentKey: string;
	modelId: string;
}): string {
	const providerId = String(opts.providerId || "").trim();
	const agentKey = String(opts.agentKey || "").trim();
	const modelId = String(opts.modelId || "").trim();

	if (!providerId || !agentKey || !modelId) return modelId || "";

	// agentKey should be a stable ASCII key like "fast_search" or "custom-1".
	const safeAgentKey = agentKey.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
	const encodedModelId = encodeURIComponent(modelId);
	return `${MODEL_ROUTE_PREFIX}${providerId}/${safeAgentKey}/${encodedModelId}`;
}

export function decodeIpoRoutedModel(model: unknown): {
	providerId: string;
	agentKey: string;
	modelId: string;
} | null {
	if (typeof model !== "string") return null;
	const raw = model.trim();
	if (!raw.startsWith(MODEL_ROUTE_PREFIX)) return null;

	const rest = raw.slice(MODEL_ROUTE_PREFIX.length);
	const parts = rest.split("/");
	if (parts.length < 3) return null;
	const providerId = parts[0]?.trim() || "";
	const agentKey = parts[1]?.trim() || "";
	const encodedModelId = parts.slice(2).join("/").trim();

	if (!providerId || !agentKey || !encodedModelId) return null;

	let modelId = "";
	try {
		modelId = decodeURIComponent(encodedModelId).trim();
	} catch {
		return null;
	}
	if (!modelId) return null;

	return { providerId, agentKey, modelId };
}
