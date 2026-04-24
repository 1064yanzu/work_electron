import type { ChatMessageBlock } from "./types";
import {
	ThoughtStreamParser,
	type ThoughtParserSegment,
} from "./thought/ThoughtStreamParser";
import {
	deriveThoughtTitle,
	normalizeThoughtContent,
	type ThoughtMeta,
} from "./thought/thoughtPatterns";

export interface StreamBlocksBuilderOptions {
	thoughtMaxChars?: number;
}

function cloneBlocks(blocks: ChatMessageBlock[]): ChatMessageBlock[] {
	return blocks.map((block) => ({ ...block }) as ChatMessageBlock);
}

export function filterThoughtBlocksForPersistence(
	blocks: ChatMessageBlock[],
	enabled: boolean,
): ChatMessageBlock[] {
	if (enabled) return blocks;
	return blocks.filter((block) => block.type !== "thought");
}

export class StreamBlocksBuilder {
	private readonly thoughtParser = new ThoughtStreamParser();
	private readonly thoughtMaxChars: number;
	private blocks: ChatMessageBlock[] = [{ type: "text", text: "" }];
	private currentTextBlockIndex = 0;
	private toolCallBlockIndex = new Map<string, number>();
	private currentThoughtBlockIndex: number | null = null;
	private currentThoughtStartedAt: number | null = null;

	constructor(options?: StreamBlocksBuilderOptions) {
		this.thoughtMaxChars = Math.max(
			1024,
			Math.floor(options?.thoughtMaxChars || 64 * 1024),
		);
	}

	appendTextChunk(chunk: string): void {
		if (!chunk) return;
		const segments = this.thoughtParser.append(chunk);
		this.consumeSegments(segments);
	}

	appendThoughtChunk(chunk: string, meta?: ThoughtMeta): void {
		if (!chunk) return;
		this.appendThoughtSegment(chunk, meta);
	}

	flushParser(): void {
		const tail = this.thoughtParser.flush();
		this.consumeSegments(tail);
		this.finishCurrentThoughtTiming();
	}

	startToolCall(block: Extract<ChatMessageBlock, { type: "tool_call" }>): void {
		this.finishCurrentThoughtTiming();
		const last = this.blocks[this.blocks.length - 1];
		if (!last || last.type !== "text") {
			this.blocks.push({ type: "text", text: "" });
			this.currentTextBlockIndex = this.blocks.length - 1;
		}
		this.blocks.push(block);
		this.toolCallBlockIndex.set(block.toolCallId, this.blocks.length - 1);
		this.blocks.push({ type: "text", text: "" });
		this.currentTextBlockIndex = this.blocks.length - 1;
	}

	updateToolCall(
		toolCallId: string,
		updater: (
			current: Extract<ChatMessageBlock, { type: "tool_call" }>,
		) => Extract<ChatMessageBlock, { type: "tool_call" }>,
	): void {
		const idx = this.toolCallBlockIndex.get(toolCallId);
		if (typeof idx !== "number") return;
		const current = this.blocks[idx];
		if (!current || current.type !== "tool_call") return;
		this.blocks[idx] = updater(current);
	}

	setBlocks(next: ChatMessageBlock[]): void {
		this.blocks = cloneBlocks(next);
		this.currentTextBlockIndex = -1;
		for (let i = this.blocks.length - 1; i >= 0; i--) {
			if (this.blocks[i]?.type === "text") {
				this.currentTextBlockIndex = i;
				break;
			}
		}
		if (this.currentTextBlockIndex < 0) {
			this.blocks.push({ type: "text", text: "" });
			this.currentTextBlockIndex = this.blocks.length - 1;
		}
	}

	getBlocks(): ChatMessageBlock[] {
		this.updateCurrentThoughtDuration();
		return cloneBlocks(this.blocks);
	}

	getText(): string {
		return this.blocks
			.filter(
				(block): block is Extract<ChatMessageBlock, { type: "text" }> =>
					block.type === "text",
			)
			.map((block) => block.text || "")
			.join("");
	}

	private consumeSegments(segments: ThoughtParserSegment[]): void {
		for (const segment of segments) {
			if (!segment.content) continue;
			if (segment.type === "text") {
				this.finishCurrentThoughtTiming();
				this.ensureTextBlock();
				const textBlock = this.blocks[this.currentTextBlockIndex];
				if (!textBlock || textBlock.type !== "text") continue;
				textBlock.text += segment.content;
				continue;
			}
			this.appendThoughtSegment(segment.content, segment.meta);
		}
	}

	private appendThoughtSegment(content: string, meta?: ThoughtMeta): void {
		const normalized = normalizeThoughtContent(content, this.thoughtMaxChars);
		const title = meta ? deriveThoughtTitle(meta) : undefined;
		if (this.currentThoughtBlockIndex !== null) {
			const existing = this.blocks[this.currentThoughtBlockIndex];
			if (existing && existing.type === "thought") {
				const merged = normalizeThoughtContent(
					`${existing.content}${normalized.content}`,
					this.thoughtMaxChars,
				);
				this.blocks[this.currentThoughtBlockIndex] = {
					...existing,
					title: title || existing.title,
					content: merged.content,
					phase: meta?.phase || existing.phase,
					durationMs:
						meta?.durationMs ||
						(this.currentThoughtStartedAt
							? Date.now() - this.currentThoughtStartedAt
							: existing.durationMs),
					source: meta?.source || existing.source,
					model: meta?.model || existing.model,
					truncated: Boolean(existing.truncated || normalized.truncated),
				};
				return;
			}
		}

		const thoughtBlock: Extract<ChatMessageBlock, { type: "thought" }> = {
			type: "thought",
			title: title || "Thought",
			content: normalized.content,
			phase: meta?.phase,
			durationMs: meta?.durationMs,
			source: meta?.source,
			model: meta?.model,
			truncated: normalized.truncated || meta?.truncated || false,
		};
		this.blocks.push(thoughtBlock);
		this.currentThoughtBlockIndex = this.blocks.length - 1;
		this.currentThoughtStartedAt = Date.now();
	}

	private updateCurrentThoughtDuration(): void {
		if (
			this.currentThoughtBlockIndex === null ||
			this.currentThoughtStartedAt === null
		) {
			return;
		}
		const current = this.blocks[this.currentThoughtBlockIndex];
		if (!current || current.type !== "thought") return;
		current.durationMs = Date.now() - this.currentThoughtStartedAt;
	}

	private finishCurrentThoughtTiming(): void {
		this.updateCurrentThoughtDuration();
		this.currentThoughtBlockIndex = null;
		this.currentThoughtStartedAt = null;
	}

	private ensureTextBlock(): void {
		const current = this.blocks[this.currentTextBlockIndex];
		if (current && current.type === "text") return;
		this.blocks.push({ type: "text", text: "" });
		this.currentTextBlockIndex = this.blocks.length - 1;
	}
}
