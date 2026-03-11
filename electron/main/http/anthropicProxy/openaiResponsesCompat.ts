import type {
	AnthropicRequest,
	AnthropicResponse,
	OpenAIChatMessage,
	ProviderConfig,
} from "./types";

export type OpenAIEndpointType = "chat_completions" | "responses";

export type OpenAIResponsesTool = {
	type: "function";
	name: string;
	description?: string;
	parameters: unknown;
};

export type OpenAIResponsesRequest = {
	model: string;
	input: Array<Record<string, unknown>>;
	instructions?: string;
	tools?: OpenAIResponsesTool[];
	tool_choice?: "auto";
	temperature?: number;
	max_output_tokens?: number;
	stream?: boolean;
};

export type OpenAIResponsesOutputItem = {
	type?: string;
	id?: string;
	call_id?: string;
	name?: string;
	arguments?: string;
	content?: unknown;
	text?: string;
	role?: string;
	status?: string;
};

export type OpenAIResponsesUsage = {
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
};

export type OpenAIResponsesResponse = {
	id?: string;
	status?: string;
	output?: OpenAIResponsesOutputItem[];
	output_text?: string;
	usage?: OpenAIResponsesUsage;
	incomplete_details?: {
		reason?: string;
	};
	error?: {
		message?: string;
	};
};

export type OpenAIResponsesStreamEvent = {
	type?: string;
	response?: OpenAIResponsesResponse;
	item?: OpenAIResponsesOutputItem;
	part?: Record<string, unknown>;
	output_index?: number;
	content_index?: number;
	item_id?: string;
	delta?: string;
	text?: string;
	error?: { message?: string } | string;
};

function getProviderMetadata(provider: ProviderConfig) {
	return provider.metadata && typeof provider.metadata === "object"
		? provider.metadata
		: null;
}

export function getOpenAIEndpointType(
	provider: ProviderConfig,
): OpenAIEndpointType {
	const metadata = getProviderMetadata(provider);
	const value = metadata?.openai_endpoint_type;
	return value === "responses" ? "responses" : "chat_completions";
}

export function isOpenAIResponsesProvider(provider: ProviderConfig) {
	return getOpenAIEndpointType(provider) === "responses";
}

function extractInstructions(anthropicReq: AnthropicRequest): string | undefined {
	if (!anthropicReq.system) return undefined;
	if (typeof anthropicReq.system === "string") {
		const trimmed = anthropicReq.system.trim();
		return trimmed || undefined;
	}
	const text = anthropicReq.system
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("\n")
		.trim();
	return text || undefined;
}

function parseToolArguments(raw: string | undefined) {
	if (!raw) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return { raw };
	}
}

function stringifyMessageContent(content: string | null | undefined) {
	return typeof content === "string" ? content : "";
}

export function toOpenAIResponsesRequest(params: {
	model: string;
	anthropicReq: AnthropicRequest;
	openaiMessages: OpenAIChatMessage[];
	tools?: OpenAIResponsesTool[];
	stream?: boolean;
}): OpenAIResponsesRequest {
	const { model, anthropicReq, openaiMessages, tools, stream = false } = params;
	const input: Array<Record<string, unknown>> = [];

	for (const message of openaiMessages) {
		if (message.role === "system") continue;
		if (message.role === "user") {
			input.push({ role: "user", content: stringifyMessageContent(message.content) });
			continue;
		}
		if (message.role === "assistant") {
			if (typeof message.content === "string" && message.content.trim()) {
				input.push({ role: "assistant", content: message.content });
			}
			if (Array.isArray(message.tool_calls)) {
				for (const toolCall of message.tool_calls) {
					input.push({
						type: "function_call",
						call_id: toolCall.id,
						name: toolCall.function.name,
						arguments: toolCall.function.arguments,
					});
				}
			}
			continue;
		}
		if (message.role === "tool") {
			input.push({
				type: "function_call_output",
				call_id: message.tool_call_id,
				output: message.content,
			});
		}
	}

	return {
		model,
		input,
		instructions: extractInstructions(anthropicReq),
		tools,
		tool_choice: tools?.length ? "auto" : undefined,
		temperature: anthropicReq.temperature ?? 0.7,
		max_output_tokens: anthropicReq.max_tokens ?? 4096,
		stream,
	};
}

function collectTextFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((item) => {
			if (!item || typeof item !== "object") return "";
			const record = item as Record<string, unknown>;
			if (typeof record.text === "string") return record.text;
			if (typeof record.output_text === "string") return record.output_text;
			if (typeof record.content === "string") return record.content;
			return "";
		})
		.filter(Boolean)
		.join("");
}

export function getOpenAIResponsesItemText(item: OpenAIResponsesOutputItem): string {
	return (
		(typeof item.text === "string" && item.text) ||
		collectTextFromContent(item.content)
	);
}

export function getOpenAIResponsesToolCallId(item: OpenAIResponsesOutputItem): string {
	return item.call_id || item.id || `call_${crypto.randomUUID()}`;
}

export function getOpenAIResponsesStopReason(
	response: OpenAIResponsesResponse | null | undefined,
	hasToolUse: boolean,
): AnthropicResponse["stop_reason"] {
	const reason = response?.incomplete_details?.reason || response?.status || "";
	if (
		reason === "max_output_tokens" ||
		reason === "max_tokens" ||
		reason === "length" ||
		reason === "incomplete"
	) {
		return "max_tokens";
	}
	return hasToolUse ? "tool_use" : "end_turn";
}

export function getOpenAIResponsesErrorMessage(
	event: OpenAIResponsesStreamEvent | null | undefined,
): string {
	if (!event) return "Responses stream error";
	if (typeof event.error === "string") return event.error;
	if (typeof event.error?.message === "string" && event.error.message) {
		return event.error.message;
	}
	if (typeof event.response?.error?.message === "string" && event.response.error.message) {
		return event.response.error.message;
	}
	return "Responses stream error";
}

export async function readOpenAIResponsesStream(
	body: ReadableStream<Uint8Array>,
	onEvent: (event: OpenAIResponsesStreamEvent) => void | Promise<void>,
) {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		while (true) {
			const idx = buffer.indexOf("\n\n");
			if (idx === -1) break;
			const raw = buffer.slice(0, idx);
			buffer = buffer.slice(idx + 2);
			const lines = raw.split(/\r?\n/);
			const dataLines = lines
				.filter((line) => line.startsWith("data:"))
				.map((line) => line.slice("data:".length).trimStart());
			const data = dataLines.join("\n").trim();
			if (!data || data === "[DONE]") continue;
			try {
				await onEvent(JSON.parse(data) as OpenAIResponsesStreamEvent);
			} catch {
				continue;
			}
		}
	}
	const tail = buffer.trim();
	if (!tail || tail === "[DONE]") return;
	const lines = tail.split(/\r?\n/);
	const dataLines = lines
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice("data:".length).trimStart());
	const data = dataLines.join("\n").trim();
	if (!data || data === "[DONE]") return;
	try {
		await onEvent(JSON.parse(data) as OpenAIResponsesStreamEvent);
	} catch {
		// ignore invalid tail
	}
}

export function translateResponsesToAnthropic(
	messageId: string,
	model: string,
	response: unknown,
): AnthropicResponse {
	const parsed = (response ?? {}) as OpenAIResponsesResponse;
	const output = Array.isArray(parsed.output) ? parsed.output : [];
	const content: AnthropicResponse["content"] = [];
	let hasToolUse = false;

	for (const item of output) {
		const itemType = typeof item?.type === "string" ? item.type : "";
		if (itemType === "function_call") {
			hasToolUse = true;
			content.push({
				type: "tool_use",
				id: getOpenAIResponsesToolCallId(item),
				name: item.name || "Tool",
				input: parseToolArguments(item.arguments),
			});
			continue;
		}
		if (itemType === "message" || itemType === "output_text" || itemType === "text") {
			const text = getOpenAIResponsesItemText(item);
			if (text) {
				content.push({ type: "text", text });
			}
		}
	}

	if (content.length === 0 && typeof parsed.output_text === "string" && parsed.output_text) {
		content.push({ type: "text", text: parsed.output_text });
	}

	const usage = parsed.usage ?? {};

	return {
		id: parsed.id || messageId,
		type: "message",
		role: "assistant",
		content,
		model,
		stop_reason: getOpenAIResponsesStopReason(parsed, hasToolUse),
		usage: {
			input_tokens: usage.input_tokens ?? 0,
			output_tokens: usage.output_tokens ?? 0,
		},
	};
}
