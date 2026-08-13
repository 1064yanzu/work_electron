import type { BrowserWindow } from "electron";
import { BatchedSender } from "../utils/batchedSender";
import { createSseParser } from "./protocol/sse";
import { combineAbortSignals } from "./streamRegistry";
import type { LlmCallResult, StreamChunk } from "./types";

export const DEFAULT_RESPONSES_INSTRUCTIONS = "You are a helpful assistant.";

/** LLM 调用超时（毫秒） */
export const LLM_CALL_TIMEOUT_MS = 120_000; // 非流式：2 分钟
export const LLM_STREAM_TIMEOUT_MS = 300_000; // 流式：5 分钟

/** 创建带超时的 AbortSignal */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
	return AbortSignal.timeout(timeoutMs);
}

/**
 * 合并超时 signal 与外部传入的取消 signal，任一触发即 abort。
 * 外部 signal 通常来自 streamRegistry，由用户主动 cancel 触发。
 */
export function createCallSignal(
	timeoutMs: number,
	external?: AbortSignal,
): AbortSignal {
	if (!external) return createTimeoutSignal(timeoutMs);
	return combineAbortSignals([createTimeoutSignal(timeoutMs), external]);
}

export function sendStreamChunk(
	mainWindow: BrowserWindow,
	chunk: StreamChunk,
): void {
	const sender = getStreamSender(mainWindow);
	sender.send(chunk);
	if (chunk.done) sender.flush();
}

let cachedSender: BatchedSender<StreamChunk> | null = null;
let cachedSenderWindow: BrowserWindow | null = null;

function getStreamSender(
	mainWindow: BrowserWindow,
): BatchedSender<StreamChunk> {
	if (cachedSender && cachedSenderWindow === mainWindow) return cachedSender;
	// 切换/重建窗口时先释放旧 sender，避免遗留 maxDelayTimer 占用句柄。
	if (cachedSender) cachedSender.dispose();
	const ownedWindow = mainWindow;
	cachedSender = new BatchedSender<StreamChunk>("llm-stream-chunk", () =>
		cachedSenderWindow && !cachedSenderWindow.isDestroyed()
			? cachedSenderWindow
			: null,
	);
	cachedSenderWindow = ownedWindow;
	// 窗口关闭时立即 dispose 并清空缓存，防止下次重建时拿到 destroyed 引用。
	ownedWindow.once("closed", () => {
		if (cachedSenderWindow === ownedWindow) {
			cachedSender?.dispose();
			cachedSender = null;
			cachedSenderWindow = null;
		}
	});
	return cachedSender;
}

export function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

/**
 * 给指数退避加抖动，避免多个并发请求遇到 429/503 时同步退避导致"惊群"。
 * 输出范围：[base * 0.85, base * 1.15] 区间内的随机值。
 */
export function withJitter(baseMs: number): number {
	return Math.round(baseMs * (0.85 + Math.random() * 0.3));
}

export function tryParseJson(raw: string): any | null {
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

function extractTextPartsFromContent(content: unknown): string[] {
	if (typeof content === "string") {
		return content.trim() ? [content] : [];
	}
	if (!Array.isArray(content)) return [];

	const result: string[] = [];
	for (const item of content) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const type = typeof record.type === "string" ? record.type : "";
		const text =
			typeof record.text === "string"
				? record.text
				: typeof record.output_text === "string"
					? record.output_text
					: "";
		if (
			text &&
			(type === "text" ||
				type === "output_text" ||
				type === "input_text" ||
				type === "")
		) {
			result.push(text);
		}
	}
	return result;
}

export function parseOpenAIStyleResult(raw: string): LlmCallResult {
	const json = tryParseJson(raw);
	if (json) {
		const responseUsage = json?.usage;
		if (Array.isArray(json?.output)) {
			const text = json.output
				.flatMap((item: any) => extractTextPartsFromContent(item?.content))
				.join("");
			const usage = responseUsage
				? {
						prompt_tokens: Number(responseUsage.input_tokens ?? 0),
						completion_tokens: Number(responseUsage.output_tokens ?? 0),
						total_tokens: Number(
							responseUsage.total_tokens ??
								Number(responseUsage.input_tokens ?? 0) +
									Number(responseUsage.output_tokens ?? 0),
						),
					}
				: undefined;
			return { content: text, usage };
		}

		if (Array.isArray(json?.choices)) {
			const text = json.choices
				.flatMap((choice: any) => {
					const messageContent = choice?.message?.content;
					if (typeof messageContent === "string") return [messageContent];
					return extractTextPartsFromContent(messageContent);
				})
				.join("");
			const usage = responseUsage
				? {
						prompt_tokens: Number(responseUsage.prompt_tokens ?? 0),
						completion_tokens: Number(responseUsage.completion_tokens ?? 0),
						total_tokens: Number(
							responseUsage.total_tokens ??
								Number(responseUsage.prompt_tokens ?? 0) +
									Number(responseUsage.completion_tokens ?? 0),
						),
					}
				: undefined;
			return { content: text, usage };
		}
	}

	if (!raw.includes("data:")) {
		throw new SyntaxError(`Unsupported LLM response: ${raw.slice(0, 200)}`);
	}

	let content = "";
	let usage: LlmCallResult["usage"];
	const parse = createSseParser(
		(data) => {
			if (data === "[DONE]") return;
			const chunk = tryParseJson(data);
			if (!chunk) return;

			if (chunk?.type === "response.output_text.delta") {
				if (typeof chunk.delta === "string") content += chunk.delta;
			}

			if (chunk?.type === "response.done") {
				const responseUsage = chunk?.response?.usage;
				if (responseUsage && typeof responseUsage === "object") {
					const inputTokens = Number(responseUsage.input_tokens ?? 0);
					const outputTokens = Number(responseUsage.output_tokens ?? 0);
					usage = {
						prompt_tokens: inputTokens,
						completion_tokens: outputTokens,
						total_tokens: Number(
							responseUsage.total_tokens ?? inputTokens + outputTokens,
						),
					};
				}
			}

			if (Array.isArray(chunk?.choices)) {
				for (const choice of chunk.choices) {
					const deltaContent = choice?.delta?.content;
					if (typeof deltaContent === "string") {
						content += deltaContent;
					}
					const messageContent = choice?.message?.content;
					if (typeof messageContent === "string") {
						content += messageContent;
					} else {
						content += extractTextPartsFromContent(messageContent).join("");
					}
				}
			}

			if (chunk?.usage && typeof chunk.usage === "object") {
				const promptTokens = Number(
					chunk.usage.prompt_tokens ?? chunk.usage.input_tokens ?? 0,
				);
				const completionTokens = Number(
					chunk.usage.completion_tokens ?? chunk.usage.output_tokens ?? 0,
				);
				usage = {
					prompt_tokens: promptTokens,
					completion_tokens: completionTokens,
					total_tokens: Number(
						chunk.usage.total_tokens ?? promptTokens + completionTokens,
					),
				};
			}
		},
		{ joinMultilineData: false },
	);

	parse(raw.endsWith("\n\n") ? raw : `${raw}\n\n`);
	return { content, usage };
}

function collectThoughtTextInto(value: unknown, out: string[]): void {
	if (!value) return;
	if (typeof value === "string") {
		if (value.trim()) out.push(value);
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectThoughtTextInto(item, out);
		return;
	}
	if (typeof value === "object") {
		const obj = value as Record<string, unknown>;
		for (const [key, nested] of Object.entries(obj)) {
			if (
				key === "text" ||
				key === "content" ||
				key === "reasoning" ||
				key === "thinking"
			) {
				collectThoughtTextInto(nested, out);
			}
		}
	}
}

export function extractThoughtDeltaFromOpenAIChunk(chunk: any): string {
	const delta = chunk?.choices?.[0]?.delta;
	if (!delta || typeof delta !== "object") return "";

	// 复用同一个 buffer，避免每个 SSE chunk 都生成多层数组 + spread
	const parts: string[] = [];
	collectThoughtTextInto(delta.reasoning_content, parts);
	collectThoughtTextInto(delta.reasoning_text, parts);
	collectThoughtTextInto(delta.reasoning, parts);
	collectThoughtTextInto(delta.thinking, parts);
	return parts.length === 0 ? "" : parts.join("");
}

/**
 * 构建系统上下文消息
 */
export function buildContextMessage(context?: string[]): string | null {
	if (!context || context.length === 0) return null;
	return `以下是相关上下文信息：\n\n${context.join("\n\n---\n\n")}`;
}
