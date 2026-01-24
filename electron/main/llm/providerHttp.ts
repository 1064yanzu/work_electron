type ProviderLike = {
	provider_type?: string;
	api_base?: string;
	template_id?: string;
	metadata?: Record<string, unknown> | null;
};

function stripTrailingSlash(url: string): string {
	return String(url || "")
		.trim()
		.replace(/\/+$/, "");
}

function getTemplateId(provider: ProviderLike): string | undefined {
	const fromTemplateId =
		typeof provider.template_id === "string" && provider.template_id.trim()
			? provider.template_id.trim()
			: undefined;
	if (fromTemplateId) return fromTemplateId;
	const fromMetadata =
		provider.metadata &&
		typeof provider.metadata === "object" &&
		typeof (provider.metadata as any).templateId === "string"
			? String((provider.metadata as any).templateId).trim()
			: "";
	return fromMetadata || undefined;
}

function hasVersionSegment(path: string): boolean {
	// Matches /v1, /v2, /v4, /v1beta, /v1beta2, etc as a path segment.
	return /\/v\d+(?:beta\d*)?(?:\/|$)/i.test(path);
}

const V1_SUFFIX_TEMPLATE_IDS = new Set([
	"openai",
	"deepseek",
	"groq",
	"mistral",
	"together",
	"silicon",
	"fireworks",
	"moonshot",
	"cerebras",
	"hyperbolic",
]);

const NO_V1_SUFFIX_TEMPLATE_IDS = new Set([
	"perplexity",
	"github",
	"zhipu",
	"dify",
]);

export function normalizeAnthropicBaseUrl(
	rawBase?: string,
	fallback = "https://api.anthropic.com",
): string {
	const base = stripTrailingSlash(rawBase || fallback);
	// Avoid common misconfiguration: users paste https://api.anthropic.com/v1
	if (base.endsWith("/v1")) return base.slice(0, -"/v1".length);
	return base;
}

export function normalizeOpenAICompatibleBaseUrl(
	provider: ProviderLike,
	fallback = "https://api.openai.com",
): string {
	const raw = stripTrailingSlash(provider.api_base || fallback);
	const templateId = getTemplateId(provider);

	// Gemini OpenAI-compat is hosted under /v1beta/openai
	if (templateId === "gemini") {
		if (raw.includes("/v1beta/openai")) return raw;
		return `${raw}/v1beta/openai`;
	}

	// If base already carries a version segment (v1/v4/...), don't append.
	try {
		const u = new URL(raw);
		if (hasVersionSegment(u.pathname)) return raw;
	} catch {
		// Not a valid URL (e.g. localhost without scheme); fall back to string heuristics.
		if (hasVersionSegment(raw)) return raw;
	}

	// Some providers are OpenAI-compatible but do not use /v1.
	if (templateId && NO_V1_SUFFIX_TEMPLATE_IDS.has(templateId)) return raw;

	// For known OpenAI-compatible providers, add /v1 when not present.
	if (!templateId || V1_SUFFIX_TEMPLATE_IDS.has(templateId)) {
		return `${raw}/v1`;
	}

	// Unknown provider: keep user-provided base as-is.
	return raw;
}

export function getOpenAICompatibleAuthHeaders(
	provider: ProviderLike,
	apiKey: string | undefined,
): Record<string, string> {
	const templateId = getTemplateId(provider);
	if (!apiKey) return {};
	if (templateId === "gemini") return { "x-goog-api-key": apiKey };
	return { Authorization: `Bearer ${apiKey}` };
}
