import type { Response } from "express";
import type { ThoughtSource } from "../thinkingCompat";
import type { AnthropicResponse } from "../types";

export function writeSseEvent(res: Response, event: string, data: unknown) {
	// 客户端断开后底层 socket 已关闭，写入会触发 ERR_STREAM_WRITE_AFTER_END 或失败。
	// 静默丢弃写入，避免 heartbeat / 收尾事件污染日志。
	if (res.writableEnded || res.destroyed) return;
	res.write(`event: ${event}\n`);
	res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function emitToolUseBlock(
	res: Response,
	opts: { index: number; id: string; name: string; input: unknown },
) {
	// Emit tool_use with input carried via input_json_delta (SDK expects this shape).
	writeSseEvent(res, "content_block_start", {
		type: "content_block_start",
		index: opts.index,
		content_block: {
			type: "tool_use",
			id: opts.id,
			name: opts.name,
			input: {},
		},
	});

	writeSseEvent(res, "content_block_delta", {
		type: "content_block_delta",
		index: opts.index,
		delta: {
			type: "input_json_delta",
			partial_json: JSON.stringify(opts.input ?? {}),
		},
	});

	writeSseEvent(res, "content_block_stop", {
		type: "content_block_stop",
		index: opts.index,
	});
}

function emitThoughtBlock(
	res: Response,
	opts: {
		index: number;
		source: ThoughtSource;
		text: string;
	},
) {
	const text = String(opts.text || "").trim();
	if (!text) return;

	writeSseEvent(res, "content_block_start", {
		type: "content_block_start",
		index: opts.index,
		content_block: {
			// Anthropic SSE 规范中仅保证 thinking block 的兼容性；
			// 将各类 reasoning/thinking 上游字段统一映射为 thinking 事件输出。
			type: "thinking",
			text: "",
		},
	});

	writeSseEvent(res, "content_block_delta", {
		type: "content_block_delta",
		index: opts.index,
		delta: {
			type: "thinking_delta",
			thinking: text,
		},
	});

	writeSseEvent(res, "content_block_stop", {
		type: "content_block_stop",
		index: opts.index,
	});
}

export function emitAnthropicMessageContentBlocks(
	res: Response,
	contentBlocks: AnthropicResponse["content"],
	startIndex = 0,
): number {
	let nextIndex = startIndex;

	for (const block of contentBlocks) {
		if (!block || typeof block !== "object") continue;

		if (block.type === "text") {
			const text = typeof block.text === "string" ? block.text : "";
			if (!text) continue;
			const index = nextIndex++;
			writeSseEvent(res, "content_block_start", {
				type: "content_block_start",
				index,
				content_block: { type: "text", text: "" },
			});
			writeSseEvent(res, "content_block_delta", {
				type: "content_block_delta",
				index,
				delta: { type: "text_delta", text },
			});
			writeSseEvent(res, "content_block_stop", {
				type: "content_block_stop",
				index,
			});
			continue;
		}

		if (block.type === "tool_use") {
			emitToolUseBlock(res, {
				index: nextIndex++,
				id: block.id,
				name: block.name,
				input: block.input,
			});
			continue;
		}

		if (block.type === "thinking" || block.type === "reasoning") {
			const thoughtText =
				typeof (block as any).text === "string" ? (block as any).text : "";
			if (!thoughtText) continue;
			emitThoughtBlock(res, {
				index: nextIndex++,
				source: block.type,
				text: thoughtText,
			});
		}
	}

	return nextIndex;
}
