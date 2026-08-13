/**
 * Agent SDK 事件循环。
 *
 * 从 `agent_sdk_start` 外提出来的 `for await (const msg of q)` 主循环，
 * 职责三件：
 *
 * 1. **原样转发** SDK 消息（`sdk_message`）—— 前端有需要原始结构的消费方；
 * 2. **转成 UI 事件**（`transformed`）—— 见 `eventTransformer.ts`；
 * 3. **累计 token 用量** —— SDK 的 usage 分散在 `message_start`（input / cache）
 *    和 `message_delta`（output）两类流事件里，`result` 消息自己带的 usage
 *    在多轮工具调用时并不完整，所以必须自己累加后覆盖上去。
 *
 * 循环还维护三张 tool_use 索引表（id ↔ name ↔ 分片拼接中的 input JSON）。
 * 它们是"流式分片"的必要状态：`input_json_delta` 只给 content block 的下标，
 * 要还原成完整入参必须靠 `content_block_start` 时记下的 index → id 映射。
 */
import type { AgentSdkEventPayload, GetMainWindow } from "./eventTransformer";
import { buildUiToolResultOutput, emit, toUIEvents } from "./eventTransformer";
import { safeJsonPreview } from "./safeJson";

export interface SdkUsageTotals {
	inputTokens: number;
	outputTokens: number;
	cacheReadInputTokens: number;
	cacheCreationInputTokens: number;
}

export interface ConsumeSdkStreamResult {
	/** 是否收到了 SDK 的 `result` 消息（没收到说明流被异常掐断）。 */
	sawResult: boolean;
	usage: SdkUsageTotals;
}

export interface ConsumeSdkStreamDeps {
	runId: string;
	/** `sdk.query()` 的返回值（AsyncIterable）。 */
	query: AsyncIterable<unknown>;
	getMainWindow: GetMainWindow;
	stderr: (data: string) => void;
	/** Task 工具落盘的图片路径，用于把 tool_result 里的占位替换成真实路径。 */
	taskImagePathsByToolUseId: Map<string, string[]>;
}

/** usage 全零时不覆盖 SDK 自带的字段，避免把"有值"改成"全 0"。 */
export function hasUsage(usage: SdkUsageTotals): boolean {
	return (
		usage.inputTokens > 0 ||
		usage.outputTokens > 0 ||
		usage.cacheReadInputTokens > 0 ||
		usage.cacheCreationInputTokens > 0
	);
}

/** 转成 Anthropic usage 字段名，供 `result` 事件下发给前端。 */
export function toAnthropicUsage(usage: SdkUsageTotals) {
	return {
		input_tokens: usage.inputTokens,
		output_tokens: usage.outputTokens,
		cache_read_input_tokens: usage.cacheReadInputTokens,
		cache_creation_input_tokens: usage.cacheCreationInputTokens,
	};
}

export async function consumeSdkStream(
	deps: ConsumeSdkStreamDeps,
): Promise<ConsumeSdkStreamResult> {
	const { runId, query, getMainWindow, stderr, taskImagePathsByToolUseId } =
		deps;

	const toolNameById = new Map<string, string>();
	const toolUseIdByIndex = new Map<number, string>();
	const toolInputJsonById = new Map<string, string>();
	const contentBlockKindByIndex = new Map<number, string>();

	const usage: SdkUsageTotals = {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadInputTokens: 0,
		cacheCreationInputTokens: 0,
	};
	let sawResult = false;

	/**
	 * 把 `<tool_use_error>` 从工具结果里挑出来单独打一条 stderr。
	 * SDK 会把这类错误塞进普通 user 消息，不显式提取的话排障时根本看不见
	 * 是哪个工具、用什么入参失败的。
	 */
	const logToolUseError = (payload: any) => {
		try {
			const blocks = Array.isArray(payload?.message?.content)
				? payload.message.content
				: [];
			for (const b of blocks) {
				if (b?.type !== "tool_result") continue;
				const toolUseId = String(b?.tool_use_id || "");
				const content = typeof b?.content === "string" ? b.content : "";
				if (!content.includes("<tool_use_error>")) continue;
				const toolName = toolUseId ? toolNameById.get(toolUseId) : undefined;
				const inputJson = toolUseId
					? toolInputJsonById.get(toolUseId)
					: undefined;
				const inputPreview = inputJson
					? inputJson.length > 800
						? `${inputJson.slice(0, 800)}…`
						: inputJson
					: "";
				stderr(
					`[agent_sdk] <tool_use_error> tool_use_id=${toolUseId || "unknown"} tool=${toolName || "unknown"}\n` +
						(inputPreview ? `input=${inputPreview}\n` : "") +
						content.slice(0, 2000),
				);
			}
		} catch {}
	};

	for await (const msg of query) {
		// Avoid logging every stream delta; it can freeze the app.
		const msgAny = msg as any;
		const debug = process.env.AGENT_SDK_DEBUG === "1";
		if (debug) {
			const t = String(msgAny?.type || "");
			const isTextDelta =
				t === "stream_event" &&
				msgAny?.event?.type === "content_block_delta" &&
				msgAny?.event?.delta?.type === "text_delta";
			if (!isTextDelta) {
				const subtype =
					t === "stream_event"
						? String(msgAny?.event?.type || "")
						: String(msgAny?.subtype || "");
				console.log("[agentSdk] msg:", t, subtype);
			}
		}

		if (
			msgAny?.type === "stream_event" &&
			msgAny?.event?.type === "content_block_start" &&
			msgAny?.event?.content_block?.type === "tool_use"
		) {
			const id = String(msgAny.event.content_block.id || "");
			const name = String(msgAny.event.content_block.name || "");
			if (id) toolNameById.set(id, name);
			const idx = Number(msgAny.event.index);
			if (id && Number.isFinite(idx)) toolUseIdByIndex.set(idx, id);
			// Some upstreams may include input inline; capture if present.
			if (id && msgAny.event.content_block.input) {
				try {
					toolInputJsonById.set(
						id,
						safeJsonPreview(
							msgAny.event.content_block.input ?? {},
							Number.MAX_SAFE_INTEGER,
						),
					);
				} catch {}
			}
		}

		if (
			msgAny?.type === "stream_event" &&
			msgAny?.event?.type === "content_block_delta" &&
			msgAny?.event?.delta?.type === "input_json_delta" &&
			typeof msgAny.event.delta.partial_json === "string"
		) {
			const idx = Number(msgAny.event.index);
			const id = Number.isFinite(idx) ? toolUseIdByIndex.get(idx) : undefined;
			if (id) {
				const prev = toolInputJsonById.get(id) || "";
				toolInputJsonById.set(id, prev + msgAny.event.delta.partial_json);
			}
		}

		// Extract token usage from stream events
		// (message_start 带 input/cache tokens，message_delta 带 output tokens)
		if (
			msgAny?.type === "stream_event" &&
			msgAny?.event?.type === "message_start" &&
			msgAny?.event?.message?.usage
		) {
			const u = msgAny.event.message.usage;
			if (typeof u.input_tokens === "number")
				usage.inputTokens += u.input_tokens;
			if (typeof u.cache_read_input_tokens === "number") {
				usage.cacheReadInputTokens += u.cache_read_input_tokens;
			}
			if (typeof u.cache_creation_input_tokens === "number") {
				usage.cacheCreationInputTokens += u.cache_creation_input_tokens;
			}
		}
		if (
			msgAny?.type === "stream_event" &&
			msgAny?.event?.type === "message_delta" &&
			msgAny?.event?.usage
		) {
			const u = msgAny.event.usage;
			if (typeof u.output_tokens === "number") {
				usage.outputTokens += u.output_tokens;
			}
			if (typeof u.cache_read_input_tokens === "number") {
				usage.cacheReadInputTokens += u.cache_read_input_tokens;
			}
			if (typeof u.cache_creation_input_tokens === "number") {
				usage.cacheCreationInputTokens += u.cache_creation_input_tokens;
			}
		}

		if (msgAny?.type === "assistant" && msgAny?.message) {
			const blocks = Array.isArray(msgAny.message.content)
				? msgAny.message.content
				: [];
			for (const b of blocks) {
				if (b?.type !== "tool_use") continue;
				const id = String(b?.id || "");
				const name = String(b?.name || "");
				if (id && name) toolNameById.set(id, name);
				if (id && b?.input) {
					try {
						toolInputJsonById.set(
							id,
							safeJsonPreview(b.input ?? {}, Number.MAX_SAFE_INTEGER),
						);
					} catch {}
				}
			}
		}
		if (msgAny?.type === "user" && msgAny?.message) {
			logToolUseError(msgAny);
		}

		emit(getMainWindow, { runId, type: "sdk_message", message: msg });

		const uiEvents = toUIEvents(msg as any, {
			rewriteToolResultOutput: (toolUseId, output) => {
				const persistedPaths = taskImagePathsByToolUseId.get(toolUseId);
				if (!persistedPaths || persistedPaths.length === 0) return output;
				return buildUiToolResultOutput(output, persistedPaths);
			},
			contentBlockKindByIndex,
		});
		if (uiEvents.length > 0) {
			emit(getMainWindow, { runId, type: "transformed", events: uiEvents });
			// tool_block_stop 时把分片拼完的完整入参补发一次，
			// 前端的工具卡片靠它显示最终参数而不是半截 JSON。
			for (const ev of uiEvents) {
				if (ev.type !== "tool_block_stop" || typeof ev.index !== "number") {
					continue;
				}
				const toolId = toolUseIdByIndex.get(ev.index);
				if (!toolId) continue;
				const inputJsonStr = toolInputJsonById.get(toolId);
				if (!inputJsonStr) continue;
				let parsedInput: Record<string, unknown> = {};
				try {
					parsedInput = JSON.parse(inputJsonStr);
				} catch {}
				emit(getMainWindow, {
					runId,
					type: "transformed",
					events: [
						{ type: "tool_input_complete", id: toolId, input: parsedInput },
					],
				} as AgentSdkEventPayload);
			}
		}

		if (msgAny?.type === "result") {
			sawResult = true;
			emit(getMainWindow, {
				runId,
				type: "done",
				result: {
					...msgAny,
					usage: hasUsage(usage) ? toAnthropicUsage(usage) : msgAny?.usage,
					run_alive: false,
				},
			});
		}
	}

	return { sawResult, usage };
}
