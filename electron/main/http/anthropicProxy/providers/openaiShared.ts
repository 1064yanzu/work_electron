import type { Logger } from "../../../logging/types";
import type { IpoThinkingLevelMarker } from "../ipoMarkers";
import type { OpenAIResponsesRequest } from "../openaiResponsesCompat";
import type {
	AnthropicRequest,
	OpenAIChatMessage,
	ProviderConfig,
} from "../types";
import type {
	OpenAIChatCompletionRequest,
	OpenAIReasoningEffort,
} from "./types";

const OPENAI_COMPAT_TOOL_NAME_MAX_LEN = 64;
const OPENAI_COMPAT_TOOL_DESC_MAX_LEN = 1024;
const OPENAI_COMPAT_SCHEMA_MAX_DEPTH = 10;
const OPENAI_COMPAT_SCHEMA_MAX_KEYS_PER_OBJECT = 200;
const OPENAI_COMPAT_SCHEMA_MAX_ARRAY_ITEMS = 200;
const OPENAI_COMPAT_SCHEMA_STR_MAX_LEN = 512;

function toOpenAIReasoningEffort(
	thinkingLevel?: IpoThinkingLevelMarker | null,
): OpenAIReasoningEffort | null {
	if (thinkingLevel === "off") return null;
	if (thinkingLevel === "xhigh") return "high";
	if (
		thinkingLevel === "low" ||
		thinkingLevel === "medium" ||
		thinkingLevel === "high"
	) {
		return thinkingLevel;
	}
	return null;
}

export function applyOpenAIChatReasoningControls(
	req: OpenAIChatCompletionRequest,
	thinkingLevel?: IpoThinkingLevelMarker | null,
) {
	const effort = toOpenAIReasoningEffort(thinkingLevel);
	if (thinkingLevel === "off") {
		req.thinking = { type: "disabled" };
		req.extra_body = {
			...(req.extra_body || {}),
			thinking: { type: "disabled" },
		};
		return;
	}

	if (effort) req.reasoning_effort = effort;
}

export function applyOpenAIResponsesReasoningControls(
	req: OpenAIResponsesRequest,
	thinkingLevel?: IpoThinkingLevelMarker | null,
) {
	const effort = toOpenAIReasoningEffort(thinkingLevel);
	if (!effort) return;
	req.reasoning = { effort };
}

export function isReasoningControlInvalidArgument(bodyText: string): boolean {
	return /\b(reasoning_effort|extra_body|thinking|reasoning)\b/i.test(
		String(bodyText || ""),
	);
}

function sanitizeOpenAICompatibleToolName(name: unknown): string {
	const raw = typeof name === "string" ? name : "";
	const trimmed = raw.trim();
	const safe = trimmed.replace(/[^A-Za-z0-9_-]/g, "_");
	const clipped = safe.slice(0, OPENAI_COMPAT_TOOL_NAME_MAX_LEN);
	return clipped || "unknown_tool";
}

function sanitizeOpenAICompatibleToolDescription(
	desc: unknown,
): string | undefined {
	if (typeof desc !== "string") return undefined;
	const trimmed = desc.trim();
	if (!trimmed) return undefined;
	return trimmed.length > OPENAI_COMPAT_TOOL_DESC_MAX_LEN
		? `${trimmed.slice(0, OPENAI_COMPAT_TOOL_DESC_MAX_LEN - 1)}…`
		: trimmed;
}

function sanitizeOpenAICompatibleJsonSchema(
	value: unknown,
	opts?: { depth?: number },
): unknown {
	const depth = opts?.depth ?? 0;
	if (depth > OPENAI_COMPAT_SCHEMA_MAX_DEPTH) return undefined;

	if (typeof value === "string") {
		return value.length > OPENAI_COMPAT_SCHEMA_STR_MAX_LEN
			? `${value.slice(0, OPENAI_COMPAT_SCHEMA_STR_MAX_LEN - 1)}…`
			: value;
	}
	if (typeof value === "number" || typeof value === "boolean" || value == null)
		return value;

	if (Array.isArray(value)) {
		return value
			.slice(0, OPENAI_COMPAT_SCHEMA_MAX_ARRAY_ITEMS)
			.map((v) => sanitizeOpenAICompatibleJsonSchema(v, { depth: depth + 1 }))
			.filter((v) => v !== undefined);
	}

	if (typeof value !== "object") return undefined;

	// Drop meta keys that frequently break OpenAI-compatible providers.
	const blockedKeys = new Set([
		"$schema",
		"$id",
		"id",
		"$ref",
		"$defs",
		"definitions",
	]);

	// Keep a conservative subset of JSON Schema keywords (still expressive enough for tools).
	const allowedKeys = new Set([
		"type",
		"properties",
		"required",
		"additionalProperties",
		"items",
		"enum",
		"const",
		"anyOf",
		"oneOf",
		"allOf",
		"minimum",
		"maximum",
		"minLength",
		"maxLength",
		"minItems",
		"maxItems",
		"pattern",
		"format",
		"default",
		"description",
		"title",
	]);

	const entries = Object.entries(value as Record<string, unknown>).slice(
		0,
		OPENAI_COMPAT_SCHEMA_MAX_KEYS_PER_OBJECT,
	);
	const out: Record<string, unknown> = {};

	for (const [k, v] of entries) {
		if (blockedKeys.has(k)) continue;
		if (!allowedKeys.has(k)) continue;

		if (k === "required") {
			if (Array.isArray(v)) {
				out.required = v
					.map((x) => (typeof x === "string" ? x : null))
					.filter(Boolean);
			}
			continue;
		}

		if (k === "properties" && v && typeof v === "object" && !Array.isArray(v)) {
			const props: Record<string, unknown> = {};
			for (const [pk, pv] of Object.entries(v as Record<string, unknown>).slice(
				0,
				OPENAI_COMPAT_SCHEMA_MAX_KEYS_PER_OBJECT,
			)) {
				props[pk] = sanitizeOpenAICompatibleJsonSchema(pv, {
					depth: depth + 1,
				});
			}
			out.properties = props;
			continue;
		}

		out[k] = sanitizeOpenAICompatibleJsonSchema(v, { depth: depth + 1 });
	}

	return out;
}

function normalizeToolNameKey(name: unknown): string {
	return String(name || "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
}

function cleanToolInput(input: unknown): unknown {
	if (!input || typeof input !== "object" || Array.isArray(input)) return input;
	const cleaned: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
		if (value === "") continue;
		cleaned[key] = value;
	}
	return cleaned;
}

function decodeJsonLikeString(value: string): string {
	try {
		return JSON.parse(`"${value.replace(/\r?\n/g, "\\n")}"`);
	} catch {
		return value
			.replace(/\\r\\n/g, "\n")
			.replace(/\\n/g, "\n")
			.replace(/\\t/g, "\t")
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\");
	}
}

function extractJsonLikeStringField(raw: string, field: string): string | null {
	const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = new RegExp(`"${escapedField}"\\s*:\\s*"([^"]*)"`).exec(raw);
	return match ? decodeJsonLikeString(match[1] || "") : null;
}

function extractTrailingJsonLikeStringField(
	raw: string,
	field: string,
): string | null {
	if (!/}\s*$/.test(raw)) return null;
	const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const keyMatch = new RegExp(`"${escapedField}"\\s*:\\s*"`).exec(raw);
	if (!keyMatch || keyMatch.index < 0) return null;
	const start = keyMatch.index + keyMatch[0].length;
	let end = raw.length - 1;
	while (end >= start && /\s/.test(raw[end] || "")) end--;
	if (raw[end] === "}") end--;
	while (end >= start && /\s/.test(raw[end] || "")) end--;
	if (raw[end] !== '"') return null;
	return decodeJsonLikeString(raw.slice(start, end));
}

function repairWriteToolInputFromArgs(
	rawArgs: string,
): Record<string, unknown> | null {
	const filePath =
		extractJsonLikeStringField(rawArgs, "file_path") ||
		extractJsonLikeStringField(rawArgs, "path") ||
		extractJsonLikeStringField(rawArgs, "file");
	const content = extractTrailingJsonLikeStringField(rawArgs, "content");
	if (typeof filePath !== "string" || !filePath.trim()) return null;
	if (typeof content !== "string") return null;
	return {
		file_path: filePath.trim(),
		content,
	};
}

export function parseToolCallInput(
	toolName: string,
	rawArgs: string,
): {
	input: unknown;
	repaired: boolean;
	error?: unknown;
} {
	try {
		return {
			input: cleanToolInput(JSON.parse(rawArgs || "{}")),
			repaired: false,
		};
	} catch (error) {
		if (normalizeToolNameKey(toolName) === "write") {
			const repaired = repairWriteToolInputFromArgs(rawArgs || "");
			if (repaired) {
				return { input: repaired, repaired: true, error };
			}
		}
		return { input: {}, repaired: false, error };
	}
}

export function toOpenAICompatibleTools(
	anthropicReq: AnthropicRequest,
): any[] | undefined {
	if (!anthropicReq.tools?.length) return undefined;

	return anthropicReq.tools.map((t) => {
		const inputSchema =
			t.input_schema ||
			({
				type: "object",
				properties: {},
				additionalProperties: true,
			} as const);

		const sanitized = sanitizeOpenAICompatibleJsonSchema(inputSchema) as any;
		const validatedSchema = {
			type: "object",
			...(sanitized && typeof sanitized === "object" ? sanitized : {}),
			properties:
				sanitized &&
				typeof sanitized === "object" &&
				(sanitized as any).properties &&
				typeof (sanitized as any).properties === "object" &&
				!Array.isArray((sanitized as any).properties)
					? (sanitized as any).properties
					: {},
		};

		return {
			type: "function" as const,
			function: {
				name: sanitizeOpenAICompatibleToolName(t.name),
				description: sanitizeOpenAICompatibleToolDescription(t.description),
				parameters: validatedSchema,
			},
		};
	});
}

export function toOpenAIResponsesTools(anthropicReq: AnthropicRequest):
	| Array<{
			type: "function";
			name: string;
			description?: string;
			parameters: unknown;
	  }>
	| undefined {
	const compatTools = toOpenAICompatibleTools(anthropicReq);
	if (!compatTools?.length) return undefined;
	return compatTools.map((tool) => ({
		type: "function" as const,
		name: tool.function.name,
		description: tool.function.description,
		parameters: tool.function.parameters,
	}));
}

export function isInvalidArgumentError(bodyText: string): boolean {
	const t = String(bodyText || "");
	return (
		/\bINVALID_ARGUMENT\b/i.test(t) ||
		/\binvalid argument\b/i.test(t) ||
		/"code"\s*:\s*400/i.test(t)
	);
}

function getProviderTemplateId(provider: ProviderConfig): string {
	const fromTemplateId =
		typeof provider.template_id === "string" ? provider.template_id.trim() : "";
	if (fromTemplateId) return fromTemplateId.toLowerCase();
	const fromMetadata =
		provider.metadata &&
		typeof provider.metadata === "object" &&
		typeof (provider.metadata as { templateId?: unknown }).templateId ===
			"string"
			? String(
					(provider.metadata as { templateId?: unknown }).templateId,
				).trim()
			: "";
	return fromMetadata.toLowerCase();
}

function isGeminiOpenAICompatibleProvider(provider: ProviderConfig): boolean {
	if (getProviderTemplateId(provider) === "gemini") return true;
	const base = String(provider.api_base || "").toLowerCase();
	return (
		base.includes("generativelanguage.googleapis.com") ||
		base.includes("/v1beta/openai")
	);
}

function hasPriorToolHistory(messages: OpenAIChatMessage[]): boolean {
	return messages.some((message) => {
		if (!message || typeof message !== "object") return false;
		if (message.role === "tool") return true;
		if (message.role !== "assistant") return false;
		const toolCalls = (message as { tool_calls?: unknown[] }).tool_calls;
		if (!Array.isArray(toolCalls)) return false;
		return toolCalls.length > 0;
	});
}

export function normalizeMessagesForProvider(
	provider: ProviderConfig,
	messages: OpenAIChatMessage[],
	logger?: Logger,
): OpenAIChatMessage[] {
	if (!isGeminiOpenAICompatibleProvider(provider)) return messages;
	if (!hasPriorToolHistory(messages)) return messages;
	const flattened = flattenToolHistoryForOpenAICompatible(messages);
	logger?.info({
		msg: "anthropic proxy: pre-flattening tool history for gemini-compatible provider",
		originalMessages: messages.length,
		flattenedMessages: flattened.length,
	});
	return flattened;
}

function computeStringOverlap(prev: string, incoming: string): number {
	const max = Math.min(prev.length, incoming.length);
	for (let k = max; k > 0; k--) {
		if (prev.slice(-k) === incoming.slice(0, k)) return k;
	}
	return 0;
}

/**
 * 兼容增量与累计两种上游分片模式，返回新的累计值。
 */
export function mergeStreamingFragment(prev: string, incoming: string): string {
	if (!incoming) return prev;
	if (!prev) return incoming;
	if (incoming.startsWith(prev)) return incoming;
	if (prev.endsWith(incoming)) return prev;
	const overlap = computeStringOverlap(prev, incoming);
	if (overlap > 0) return prev + incoming.slice(overlap);
	return prev + incoming;
}

export function mergeStreamingFragmentWithDelta(
	prev: string,
	incoming: string,
) {
	const next = mergeStreamingFragment(prev, incoming);
	return {
		next,
		delta: next.slice(prev.length),
	};
}

/**
 * Some OpenAI-compatible providers (notably Gemini-style gateways) reject chat histories that
 * include prior tool_calls + role=tool messages. As a compatibility fallback, we flatten tool
 * execution back into plain user text while keeping tools enabled for future calls.
 */
export function flattenToolHistoryForOpenAICompatible(
	messages: OpenAIChatMessage[],
): OpenAIChatMessage[] {
	const out: OpenAIChatMessage[] = [];
	const toolCallIdToName = new Map<string, string>();

	for (const m of messages) {
		if (!m || typeof m !== "object") continue;

		// Track tool call ids -> names from assistant messages.
		if (m.role === "assistant" && Array.isArray((m as any).tool_calls)) {
			for (const tc of (m as any).tool_calls) {
				const id = typeof tc?.id === "string" ? tc.id : "";
				const name =
					typeof tc?.function?.name === "string" ? tc.function.name : "";
				if (id && name) toolCallIdToName.set(id, name);
			}
			// Drop assistant tool_calls message from history to avoid invalid argument.
			// We'll rely on the subsequent tool result (flattened) to convey information.
			continue;
		}

		if (m.role === "tool") {
			const toolCallId = (m as any).tool_call_id
				? String((m as any).tool_call_id)
				: "";
			const toolName = toolCallIdToName.get(toolCallId) || "unknown_tool";
			const content =
				typeof (m as any).content === "string" ? (m as any).content : "";
			out.push({
				role: "user",
				content: `Tool result (${toolName}):\n${content}`.trim(),
			});
			continue;
		}

		// Keep system/user/assistant text messages as-is.
		out.push(m);
	}

	return out;
}

export function isResponsesEndpointUnsupported(
	status: number,
	errorText: string,
) {
	if (status === 404 || status === 405 || status === 501) return true;
	const normalized = errorText.toLowerCase();
	return (
		normalized.includes("unsupported endpoint") ||
		normalized.includes("method not allowed")
	);
}
