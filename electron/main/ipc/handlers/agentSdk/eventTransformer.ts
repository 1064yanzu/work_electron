/**
 * eventTransformer.ts
 *
 * Event transformation utilities for the Agent SDK.
 * Handles SDK message -> UI event mapping, data image URL extraction/persistence,
 * thought extraction, and the `emit` helper.
 */
import { randomUUID } from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import type { BrowserWindow } from "electron";

import { isSdkSessionId } from "./sessionId";
import { uniqStrings } from "./configManager";
import { publishAgentSdkBusEvent } from "../../../remote-control/core/agentSdkEventBus";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentSdkInteractionRequestPayload = {
	requestId: string;
	toolName: string;
	toolInput: Record<string, unknown>;
	toolUseId: string;
	agentId?: string;
	description?: string;
	decisionReason?: string;
	blockedPath?: string;
	suggestions?: unknown[];
	expiresAt: number;
	/** Scope information for the tool operation (sandbox vs global) */
	scope?: {
		insideSandbox: boolean;
		targetPath?: string;
		destructiveLevel?: "safe" | "moderate" | "dangerous";
		reason?: string;
	};
};

export type AgentSdkEventPayload = {
	runId: string;
	type: string;
	message?: unknown;
	result?: unknown;
	error?: string;
	events?: unknown;
	request?: AgentSdkInteractionRequestPayload;
};

export type GetMainWindow = () => BrowserWindow | null;

// ---------------------------------------------------------------------------
// emit helper
// ---------------------------------------------------------------------------

export function emit(
	getMainWindow: GetMainWindow,
	payload: AgentSdkEventPayload,
) {
	const win = getMainWindow();
	if (!win) return;
	win.webContents.send("agent-sdk-event", payload);
	publishAgentSdkBusEvent(payload as any);
}

// ---------------------------------------------------------------------------
// Data image URL extraction & persistence
// ---------------------------------------------------------------------------

const DATA_IMAGE_URL_RE =
	/data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi;
const DATA_IMAGE_URL_LIMIT = 1;
const DATA_IMAGE_URL_MAX_CHARS = 8_000_000;

export { DATA_IMAGE_URL_LIMIT };

function extensionFromDataImageMime(raw: string): string {
	const mime = String(raw || "")
		.toLowerCase()
		.trim();
	if (!mime) return "png";
	if (mime === "jpeg") return "jpg";
	if (mime === "svg+xml") return "svg";
	if (mime === "x-icon") return "ico";
	return mime.replace(/[^a-z0-9]+/g, "") || "png";
}

function collectDataImageUrlsFromString(
	input: string,
	limit = DATA_IMAGE_URL_LIMIT,
): string[] {
	const text = String(input || "");
	if (!text || text.length > DATA_IMAGE_URL_MAX_CHARS) return [];
	const found: string[] = [];
	let match: RegExpExecArray | null = null;
	DATA_IMAGE_URL_RE.lastIndex = 0;
	while ((match = DATA_IMAGE_URL_RE.exec(text)) !== null) {
		const whole = match[0];
		if (!whole) continue;
		found.push(whole);
		if (found.length >= limit) break;
	}
	return found;
}

export function collectDataImageUrlsFromUnknown(
	value: unknown,
	limit = DATA_IMAGE_URL_LIMIT,
): string[] {
	const found = new Set<string>();
	const seen = new Set<unknown>();

	const visit = (v: unknown, depth: number) => {
		if (v === null || v === undefined) return;
		if (depth > 8 || found.size >= limit) return;

		if (typeof v === "string") {
			const items = collectDataImageUrlsFromString(v, limit - found.size);
			for (const item of items) {
				found.add(item);
				if (found.size >= limit) break;
			}
			return;
		}
		if (Array.isArray(v)) {
			for (const item of v) {
				visit(item, depth + 1);
				if (found.size >= limit) break;
			}
			return;
		}
		if (typeof v !== "object") return;
		if (seen.has(v)) return;
		seen.add(v);
		for (const item of Object.values(v as Record<string, unknown>)) {
			visit(item, depth + 1);
			if (found.size >= limit) break;
		}
	};

	visit(value, 0);
	return [...found];
}

export async function persistDataImageUrlToCwd(input: {
	dataUrl: string;
	cwd: string;
	prefix?: string;
}): Promise<string | null> {
	const match = String(input.dataUrl || "").match(
		/^data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i,
	);
	if (!match) return null;
	const ext = extensionFromDataImageMime(match[1] || "png");
	const rawBase64 = match[2] || "";
	if (!rawBase64) return null;
	let bytes: Buffer;
	try {
		bytes = Buffer.from(rawBase64, "base64");
	} catch {
		return null;
	}
	if (!bytes || bytes.length === 0) return null;

	const outDir = path.join(input.cwd, "images");
	await fsp.mkdir(outDir, { recursive: true });
	const fileName = `${input.prefix || "generated-image"}-${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
	const outPath = path.join(outDir, fileName);
	await fsp.writeFile(outPath, bytes);
	return outPath;
}

export function buildUiToolResultOutput(
	original: unknown,
	persistedPaths: string[],
): unknown {
	const imagePaths = uniqStrings(persistedPaths);
	if (imagePaths.length === 0) return original;

	if (original && typeof original === "object" && !Array.isArray(original)) {
		const record = original as Record<string, unknown>;
		const existing = Array.isArray(record.image_paths)
			? record.image_paths.filter((v): v is string => typeof v === "string")
			: [];
		return {
			...record,
			image_paths: uniqStrings([...existing, ...imagePaths]),
		};
	}

	return {
		image_paths: imagePaths,
	};
}

// ---------------------------------------------------------------------------
// Thought extraction
// ---------------------------------------------------------------------------

const THOUGHT_FIELD_KEYS = new Set([
	"thinking",
	"reasoning",
	"reasoning_content",
	"reasoning_text",
	"thought",
]);

export function extractThoughtTextFromUnknown(
	value: unknown,
	maxChars = 64 * 1024,
): string {
	const out: string[] = [];
	const seen = new Set<unknown>();

	const visit = (v: unknown, depth: number, inThoughtField: boolean) => {
		if (v === null || v === undefined) return;
		if (depth > 10) return;
		if (out.join("\n\n").length >= maxChars) return;

		if (typeof v === "string") {
			const text = v.trim();
			if (!text) return;
			if (inThoughtField) {
				out.push(text);
				return;
			}
			// 兼容模型把结构化结果包成 JSON 字符串返回
			if (
				/\"(thinking|reasoning|reasoning_content|reasoning_text|thought)\"/i.test(
					text,
				)
			) {
				try {
					const parsed = JSON.parse(text);
					visit(parsed, depth + 1, false);
				} catch {
					// ignore non-json strings
				}
			}
			return;
		}

		if (Array.isArray(v)) {
			for (const item of v) {
				visit(item, depth + 1, inThoughtField);
				if (out.join("\n\n").length >= maxChars) break;
			}
			return;
		}

		if (typeof v !== "object") return;
		if (seen.has(v)) return;
		seen.add(v);

		for (const [key, nested] of Object.entries(v as Record<string, unknown>)) {
			const k = key.toLowerCase().trim();
			const nextInThought = inThoughtField || THOUGHT_FIELD_KEYS.has(k);
			visit(nested, depth + 1, nextInThought);
			if (out.join("\n\n").length >= maxChars) break;
		}
	};

	visit(value, 0, false);
	if (out.length === 0) return "";
	const merged = out.join("\n\n").trim();
	return merged.length <= maxChars
		? merged
		: `${merged.slice(0, maxChars)}\n\n[Thought truncated]`;
}

// ---------------------------------------------------------------------------
// toUIEvents -- transform SDK messages into frontend-consumable events
// ---------------------------------------------------------------------------

export function toUIEvents(
	message: any,
	options?: {
		rewriteToolResultOutput?: (toolUseId: string, output: unknown) => unknown;
		contentBlockKindByIndex?: Map<number, string>;
	},
): any[] {
	const events: any[] = [];
	if (!message || typeof message !== "object") return events;

	// SDK system messages (session init, status, compaction boundary, etc.)
	if (message.type === "system") {
		if (message.subtype === "task_notification") {
			events.push({
				type: "task_notification",
				taskId:
					typeof message.task_id === "string" ? message.task_id : undefined,
				status: typeof message.status === "string" ? message.status : undefined,
				outputFile:
					typeof message.output_file === "string"
						? message.output_file
						: undefined,
				summary:
					typeof message.summary === "string" ? message.summary : undefined,
			});
		}

		if (message.subtype === "files_persisted") {
			events.push({
				type: "files_persisted",
				files: Array.isArray(message.files) ? message.files : [],
				failed: Array.isArray(message.failed) ? message.failed : [],
				processedAt:
					typeof message.processed_at === "string"
						? message.processed_at
						: undefined,
			});
		}

		if (
			message.subtype === "init" &&
			message.session_id &&
			isSdkSessionId(String(message.session_id))
		) {
			events.push({
				type: "session_init",
				sessionId: String(message.session_id),
				cwd: typeof message.cwd === "string" ? message.cwd : undefined,
			});
		}

		if (message.subtype === "status") {
			if (message.status === "compacting") {
				events.push({
					type: "system_notice",
					level: "info",
					content: "Claude Agent SDK 正在压缩上下文（compacting）…",
				});
			} else if (message.status === null) {
				events.push({
					type: "system_notice",
					level: "info",
					content: "Claude Agent SDK 上下文压缩完成。",
				});
			}
		}

		if (message.subtype === "compact_boundary") {
			const trigger = message.compact_metadata?.trigger;
			const preTokens = message.compact_metadata?.pre_tokens;
			events.push({
				type: "system_notice",
				level: "info",
				content: `Claude Agent SDK 已压缩上下文（trigger=${String(trigger ?? "unknown")}, pre_tokens=${String(preTokens ?? "unknown")}）`,
			});
		}
	}

	if (message.type === "auth_status") {
		events.push({
			type: "auth_status",
			isAuthenticating: Boolean(message.isAuthenticating),
			output: Array.isArray(message.output)
				? message.output.filter(
						(v: unknown): v is string => typeof v === "string",
					)
				: [],
			error: typeof message.error === "string" ? message.error : undefined,
		});
	}

	if (message.type === "tool_use_summary") {
		events.push({
			type: "tool_use_summary",
			summary: typeof message.summary === "string" ? message.summary : "",
			precedingToolUseIds: Array.isArray(message.preceding_tool_use_ids)
				? message.preceding_tool_use_ids
				: [],
		});
	}

	if (message.type === "assistant" || message.type === "user") {
		const beta = message.message;
		const blocks = Array.isArray(beta?.content) ? beta.content : [];
		for (const b of blocks) {
			if (b?.type === "tool_result" && b?.tool_use_id) {
				const toolUseId = String(b.tool_use_id);
				const output = options?.rewriteToolResultOutput
					? options.rewriteToolResultOutput(toolUseId, b.content)
					: b.content;
				events.push({
					type: "tool_call_end",
					id: toolUseId,
					output,
					isError:
						Boolean(b.is_error) ||
						String(b.content ?? "").includes("<tool_use_error>"),
				});
			}
		}
	}

	// Handle stream events (either wrapped in 'stream_event' or raw)
	let ev = message;
	if (message.type === "stream_event") {
		ev = message.event;
	}

	if (
		ev?.type === "content_block_start" &&
		ev?.content_block?.type === "tool_use"
	) {
		events.push({
			type: "tool_call_start",
			id: String(ev.content_block.id),
			name: String(ev.content_block.name),
			index: typeof ev.index === "number" ? ev.index : undefined,
			input:
				ev.content_block.input && typeof ev.content_block.input === "object"
					? ev.content_block.input
					: {},
		});
	}
	if (
		ev?.type === "content_block_start" &&
		typeof ev?.index === "number" &&
		typeof ev?.content_block?.type === "string" &&
		options?.contentBlockKindByIndex
	) {
		options.contentBlockKindByIndex.set(ev.index, ev.content_block.type);
	}
	if (ev?.type === "content_block_delta") {
		if (
			ev?.delta?.type === "thinking_delta" &&
			typeof ev?.delta?.thinking === "string"
		) {
			events.push({
				type: "thought_delta",
				content: ev.delta.thinking,
				source: "thinking",
				title: "Thinking",
				index: typeof ev.index === "number" ? ev.index : undefined,
			});
		}
		if (
			ev?.delta?.type === "text_delta" &&
			typeof ev?.delta?.text === "string"
		) {
			const idx = typeof ev.index === "number" ? ev.index : -1;
			const blockKind =
				idx >= 0 ? options?.contentBlockKindByIndex?.get(idx) : undefined;
			if (blockKind === "thinking" || blockKind === "reasoning") {
				events.push({
					type: "thought_delta",
					content: ev.delta.text,
					source: blockKind,
					title: blockKind === "reasoning" ? "Reasoning" : "Thinking",
					index: idx >= 0 ? idx : undefined,
				});
			} else {
				events.push({ type: "text_delta", content: ev.delta.text });
			}
		}
	}
	// 当 content_block_stop 事件触发时，工具输入流式传输已完成
	if (ev?.type === "content_block_stop" && typeof ev?.index === "number") {
		options?.contentBlockKindByIndex?.delete(ev.index);
		events.push({
			type: "tool_block_stop",
			index: ev.index,
		});
	}

	if (message.type === "result") {
		const isError =
			Boolean((message as any).is_error) || message.subtype !== "success";
		if (
			typeof (message as any).session_id === "string" &&
			isSdkSessionId((message as any).session_id)
		) {
			events.push({
				type: "session_init",
				sessionId: String((message as any).session_id),
			});
		}
		events.push({
			type: "result",
			subtype: message.subtype,
			isError,
			result:
				typeof (message as any).result === "string"
					? (message as any).result
					: "",
		});
	}
	return events;
}
