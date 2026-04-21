import type {
	AnthropicRequest,
	AnthropicResponse,
	OpenAIChatMessage,
	OpenAIResponse,
	OpenAIToolCall,
} from "./types";
import {
	extractThoughtFragmentsFromOpenAIChunk,
	mergeThoughtFragmentsBySource,
	ThoughtDeltaNormalizer,
} from "./thinkingCompat";

/**
 * 清洗工具输入参数：移除空字符串的可选参数（如 pages: ""），
 * 避免下游校验失败。
 */
function sanitizeToolCallInput(parsed: unknown): unknown {
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
		return parsed;
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(
		parsed as Record<string, unknown>,
	)) {
		if (value === "") continue;
		result[key] = value;
	}
	return result;
}

function computeStringOverlap(prev: string, incoming: string): number {
	const max = Math.min(prev.length, incoming.length);
	for (let k = max; k > 0; k--) {
		if (prev.slice(-k) === incoming.slice(0, k)) return k;
	}
	return 0;
}

function mergeStreamingFragment(prev: string, incoming: string): string {
	if (!incoming) return prev;
	if (!prev) return incoming;
	if (incoming.startsWith(prev)) return incoming;
	if (prev.endsWith(incoming)) return prev;
	const overlap = computeStringOverlap(prev, incoming);
	if (overlap > 0) return prev + incoming.slice(overlap);
	return prev + incoming;
}

async function readSseStream(
	body: ReadableStream<Uint8Array>,
	onData: (data: string) => void | Promise<void>,
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
				.filter((l) => l.startsWith("data:"))
				.map((l) => l.slice("data:".length).trimStart());
			const data = dataLines.join("\n").trim();
			if (data) await onData(data);
		}
	}
	const tail = buffer.trim();
	if (tail) {
		const lines = tail.split(/\r?\n/);
		const dataLines = lines
			.filter((l) => l.startsWith("data:"))
			.map((l) => l.slice("data:".length).trimStart());
		const data = dataLines.join("\n").trim();
		if (data) await onData(data);
	}
}

export async function readOpenAIChatCompletionsStreamAsJson(
	body: ReadableStream<Uint8Array>,
): Promise<OpenAIResponse> {
	let role: "assistant" | "user" | "system" | "tool" = "assistant";
	let content = "";
	let finishReason = "stop";
	let usage:
		| {
				prompt_tokens: number;
				completion_tokens: number;
				total_tokens: number;
		  }
		| undefined;

	const toolCalls = new Map<
		number,
		{ id?: string; name?: string; args: string }
	>();
	const legacyFunctionCall: {
		value: { name?: string; args: string } | null;
	} = { value: null };
	const thoughtDeltaNormalizer = new ThoughtDeltaNormalizer();
	const thoughtBySource: Partial<Record<"thinking" | "reasoning", string>> = {};

	await readSseStream(body, async (data) => {
		if (data === "[DONE]") return;
		let parsed: any = null;
		try {
			parsed = JSON.parse(data);
		} catch {
			return;
		}

		// Usage may appear at top-level or in a delta.
		if (parsed?.usage) usage = parsed.usage;

		const choice = parsed?.choices?.[0];
		const delta = choice?.delta || {};
		if (typeof delta?.role === "string") role = delta.role;
		if (typeof delta?.content === "string") content += delta.content;
		if (choice?.finish_reason) finishReason = choice.finish_reason;
		const thoughtDeltas = thoughtDeltaNormalizer.consume(
			extractThoughtFragmentsFromOpenAIChunk(parsed),
		);
		for (const fragment of thoughtDeltas) {
			const prev = thoughtBySource[fragment.source] || "";
			thoughtBySource[fragment.source] = `${prev}${fragment.text}`;
		}

		if (Array.isArray(delta?.tool_calls)) {
			for (const tc of delta.tool_calls) {
				const idx = typeof tc?.index === "number" ? tc.index : 0;
				const existing = toolCalls.get(idx) || { args: "" };
				if (typeof tc?.id === "string" && tc.id) existing.id = tc.id;
				if (typeof tc?.function?.name === "string" && tc.function.name)
					existing.name = tc.function.name;
				if (
					typeof tc?.function?.arguments === "string" &&
					tc.function.arguments
				) {
					existing.args = mergeStreamingFragment(
						existing.args,
						tc.function.arguments,
					);
				}
				toolCalls.set(idx, existing);
			}
		}

		// Legacy streaming function_call format.
		if (delta?.function_call) {
			const fc = delta.function_call;
			if (!legacyFunctionCall.value) legacyFunctionCall.value = { args: "" };
			if (typeof fc?.name === "string" && fc.name)
				legacyFunctionCall.value.name = fc.name;
			if (typeof fc?.arguments === "string" && fc.arguments)
				legacyFunctionCall.value.args += fc.arguments;
		}
	});

	const tool_calls: OpenAIToolCall[] = Array.from(toolCalls.entries())
		.sort((a, b) => a[0] - b[0])
		.filter(([_i, tc]) => {
			// 跳过无名工具调用（避免产生 unknown_tool 错误）
			const name = typeof tc.name === "string" ? tc.name.trim() : "";
			return name.length > 0;
		})
		.map(([_i, tc]) => ({
			id: tc.id || `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
			type: "function",
			function: {
				name: tc.name!.trim(),
				arguments: tc.args || "{}",
			},
		}));

	let function_call:
		| OpenAIResponse["choices"][0]["message"]["function_call"]
		| undefined;
	if (legacyFunctionCall.value) {
		const fcName =
			typeof legacyFunctionCall.value.name === "string"
				? legacyFunctionCall.value.name.trim()
				: "";
		// 只在有有效名称时才发出 function_call
		if (fcName) {
			function_call = {
				name: fcName,
				arguments: legacyFunctionCall.value.args || "{}",
			};
		}
	}

	return {
		choices: [
			{
				message: {
					role,
					content: content || null,
					...(thoughtBySource.thinking
						? { thinking: thoughtBySource.thinking }
						: null),
					...(thoughtBySource.reasoning
						? { reasoning: thoughtBySource.reasoning }
						: null),
					...(tool_calls.length > 0 ? { tool_calls } : null),
					...(function_call ? { function_call } : null),
				} as any,
				finish_reason: finishReason,
			},
		],
		usage,
	};
}

/**
 * 翻译 Anthropic 请求为 OpenAI 格式
 */
export function translateToOpenAI(
	anthropicReq: AnthropicRequest,
): OpenAIChatMessage[] {
	const messages: OpenAIChatMessage[] = [];

	// System message
	if (anthropicReq.system) {
		let systemContent = "";
		if (typeof anthropicReq.system === "string") {
			systemContent = anthropicReq.system;
		} else {
			systemContent = anthropicReq.system
				.filter((b) => b.type === "text")
				.map((b) => b.text)
				.join("\n");
		}
		if (systemContent) {
			messages.push({ role: "system", content: systemContent });
		}
	}

	// Messages
	for (const msg of anthropicReq.messages) {
		if (typeof msg.content === "string") {
			if (msg.role === "user" || msg.role === "assistant") {
				messages.push({ role: msg.role as any, content: msg.content });
			}
		} else {
			// 处理 content blocks
			const textParts: string[] = [];
			const toolCalls: OpenAIToolCall[] = [];
			for (const block of msg.content) {
				const blockType =
					typeof (block as any)?.type === "string" ? (block as any).type : "";
				if (
					blockType === "text" &&
					typeof (block as any)?.text === "string" &&
					(block as any).text
				) {
					textParts.push((block as any).text);
				} else if (blockType === "tool_use" && msg.role === "assistant") {
					const id =
						typeof (block as any)?.id === "string" ? (block as any).id : "";
					const name =
						typeof (block as any)?.name === "string" ? (block as any).name : "";
					const args = JSON.stringify((block as any)?.input ?? {});
					if (id && name) {
						toolCalls.push({
							id,
							type: "function",
							function: { name, arguments: args },
						});
					}
				} else if (
					blockType === "tool_result" &&
					typeof (block as any)?.tool_use_id === "string" &&
					(block as any).tool_use_id
				) {
					// tool_result 转为 tool role
					const raw = (block as any).content;
					const resultContent =
						typeof raw === "string"
							? raw
							: Array.isArray(raw)
								? raw
										.map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
										.join("\n")
								: raw
									? JSON.stringify(raw)
									: "";
					messages.push({
						role: "tool",
						content: resultContent,
						tool_call_id: String((block as any).tool_use_id),
					});
				}
			}

			const text = textParts.join("\n").trim();
			if (msg.role === "assistant") {
				if (toolCalls.length > 0) {
					messages.push({
						role: "assistant",
						content: text.length > 0 ? text : null,
						tool_calls: toolCalls,
					});
				} else if (text.length > 0) {
					messages.push({ role: "assistant", content: text });
				}
			} else if (msg.role === "user") {
				// User may include tool_result blocks + additional text.
				if (text.length > 0) messages.push({ role: "user", content: text });
			}
		}
	}

	return messages;
}

/**
 * 翻译 OpenAI 响应为 Anthropic 格式
 */
export function translateToAnthropic(
	messageId: string,
	model: string,
	openaiResp: OpenAIResponse,
): AnthropicResponse {
	const choice = openaiResp.choices[0];
	const content: AnthropicResponse["content"] = [];
	const thoughtFragments = extractThoughtFragmentsFromOpenAIChunk(openaiResp);
	const mergedThoughtBySource = mergeThoughtFragmentsBySource(thoughtFragments);

	// Anthropic 兼容面优先使用标准 thinking block，避免客户端对非标准 reasoning block 兼容不一致。
	const mergedThinkingText = [
		mergedThoughtBySource.thinking,
		mergedThoughtBySource.reasoning,
	]
		.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
		.join("\n\n")
		.trim();

	if (mergedThinkingText) {
		content.push({
			type: "thinking",
			text: mergedThinkingText,
		});
	}

	// 文本内容
	if (choice.message.content) {
		content.push({ type: "text", text: choice.message.content });
	}

	// 工具调用
	if (choice.message.tool_calls) {
		for (const tc of choice.message.tool_calls) {
			const toolName =
				typeof tc.function.name === "string" ? tc.function.name.trim() : "";
			if (!toolName) continue; // 跳过无名工具调用
			let input: unknown = {};
			try {
				const parsed = JSON.parse(tc.function.arguments);
				input = sanitizeToolCallInput(parsed);
			} catch {
				input = { _raw: tc.function.arguments };
			}
			content.push({
				type: "tool_use",
				id: tc.id,
				name: toolName,
				input,
			});
		}
	}
	// Legacy function_call
	else if ((choice.message as any).function_call) {
		const fc = (choice.message as any).function_call as {
			name?: string;
			arguments?: string;
		};
		const name = typeof fc?.name === "string" ? fc.name.trim() : "";
		if (name) {
			const rawArgs = typeof fc?.arguments === "string" ? fc.arguments : "{}";
			let input: unknown = {};
			try {
				const parsed = JSON.parse(rawArgs);
				input = sanitizeToolCallInput(parsed);
			} catch {
				input = { _raw: rawArgs };
			}
			content.push({
				type: "tool_use",
				id: `call_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
				name,
				input,
			});
		}
	}

	// 停止原因
	let stopReason: AnthropicResponse["stop_reason"] = "end_turn";
	if (
		choice.finish_reason === "tool_calls" ||
		choice.message.tool_calls?.length
	) {
		stopReason = "tool_use";
	} else if (choice.finish_reason === "length") {
		stopReason = "max_tokens";
	}

	return {
		id: messageId,
		type: "message",
		role: "assistant",
		content,
		model,
		stop_reason: stopReason,
		usage: openaiResp.usage
			? {
					input_tokens: openaiResp.usage.prompt_tokens,
					output_tokens: openaiResp.usage.completion_tokens,
				}
			: { input_tokens: 0, output_tokens: 0 },
	};
}
