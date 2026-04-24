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
	model?: string,
): OpenAIEndpointType {
	const metadata = getProviderMetadata(provider);
	const modelEndpointTypes =
		metadata?.model_endpoint_types &&
		typeof metadata.model_endpoint_types === "object" &&
		!Array.isArray(metadata.model_endpoint_types)
			? (metadata.model_endpoint_types as Record<string, unknown>)
			: null;
	const modelEndpointType =
		typeof model === "string" && model.trim()
			? modelEndpointTypes?.[model.trim()]
			: undefined;
	if (modelEndpointType === "responses") return "responses";
	if (modelEndpointType === "chat_completions") return "chat_completions";

	const value = metadata?.openai_endpoint_type;
	return value === "responses" ? "responses" : "chat_completions";
}

export function getOpenAIEndpointResolution(
	provider: ProviderConfig,
	model?: string,
): {
	type: OpenAIEndpointType;
	source: "model" | "provider";
} {
	const metadata = getProviderMetadata(provider);
	const modelEndpointTypes =
		metadata?.model_endpoint_types &&
		typeof metadata.model_endpoint_types === "object" &&
		!Array.isArray(metadata.model_endpoint_types)
			? (metadata.model_endpoint_types as Record<string, unknown>)
			: null;
	const modelEndpointType =
		typeof model === "string" && model.trim()
			? modelEndpointTypes?.[model.trim()]
			: undefined;

	if (
		modelEndpointType === "responses" ||
		modelEndpointType === "chat_completions"
	) {
		return { type: modelEndpointType, source: "model" };
	}

	return { type: getOpenAIEndpointType(provider), source: "provider" };
}

export function isOpenAIResponsesProvider(
	provider: ProviderConfig,
	model?: string,
) {
	return getOpenAIEndpointType(provider, model) === "responses";
}

function extractInstructions(
	anthropicReq: AnthropicRequest,
): string | undefined {
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

function parseToolArguments(raw: string | undefined): Record<string, unknown> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return sanitizeToolInput(parsed as Record<string, unknown>);
		}
		return parsed ?? {};
	} catch {
		// 尝试修复常见 JSON 截断问题（如流中断导致的不完整 JSON）
		const trimmed = raw.trim();
		if (trimmed.startsWith("{") && !trimmed.endsWith("}")) {
			try {
				const repaired = JSON.parse(`${trimmed}}`);
				if (repaired && typeof repaired === "object") {
					return sanitizeToolInput(repaired as Record<string, unknown>);
				}
			} catch {
				// 修复失败，回退
			}
		}
		return { _raw: raw };
	}
}

/**
 * 清洗工具输入参数：移除空字符串的可选参数（如 pages: ""），
 * 避免下游校验失败。
 */
function sanitizeToolInput(
	input: Record<string, unknown>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input)) {
		// 移除空字符串的可选参数（常见于 OpenAI 模型生成的 pages/pattern 等）
		if (value === "") continue;
		result[key] = value;
	}
	return result;
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
			input.push({
				role: "user",
				content: stringifyMessageContent(message.content),
			});
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

export function getOpenAIResponsesItemText(
	item: OpenAIResponsesOutputItem,
): string {
	return (
		(typeof item.text === "string" && item.text) ||
		collectTextFromContent(item.content)
	);
}

export function getOpenAIResponsesToolCallId(
	item: OpenAIResponsesOutputItem,
): string {
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
	if (
		typeof event.response?.error?.message === "string" &&
		event.response.error.message
	) {
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
	try {
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
				let parsed: OpenAIResponsesStreamEvent;
				try {
					parsed = JSON.parse(data) as OpenAIResponsesStreamEvent;
				} catch {
					continue; // 仅跳过 JSON 解析失败的事件
				}
				await onEvent(parsed); // 回调异常向上传播（如 doneErr 终止信号）
			}
		}
		// 处理缓冲区尾部
		const tail = buffer.trim();
		if (!tail || tail === "[DONE]") return;
		const lines = tail.split(/\r?\n/);
		const dataLines = lines
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice("data:".length).trimStart());
		const data = dataLines.join("\n").trim();
		if (!data || data === "[DONE]") return;
		let parsed: OpenAIResponsesStreamEvent;
		try {
			parsed = JSON.parse(data) as OpenAIResponsesStreamEvent;
		} catch {
			return; // 无效的尾部 JSON
		}
		await onEvent(parsed);
	} finally {
		// 确保 reader 被释放
		try {
			reader.cancel();
		} catch {
			/* ignore */
		}
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
			const toolName = typeof item.name === "string" ? item.name.trim() : "";
			if (!toolName) {
				// 跳过无效的工具调用（name 为空说明上游模型返回了损坏的 function_call）
				continue;
			}
			hasToolUse = true;
			content.push({
				type: "tool_use",
				id: getOpenAIResponsesToolCallId(item),
				name: toolName,
				input: parseToolArguments(item.arguments),
			});
			continue;
		}
		if (
			itemType === "message" ||
			itemType === "output_text" ||
			itemType === "text"
		) {
			const text = getOpenAIResponsesItemText(item);
			if (text) {
				content.push({ type: "text", text });
			}
		}
	}

	if (
		content.length === 0 &&
		typeof parsed.output_text === "string" &&
		parsed.output_text
	) {
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
