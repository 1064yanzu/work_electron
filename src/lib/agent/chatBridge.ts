import type { ChatMessage, ChatMessageBlock, FileUpdate } from "../chat/types";

import * as api from "./api";

type ChatMessageTrace = NonNullable<ChatMessage["metadata"]>["trace"];

export type AgentMessageContentJsonV1 = {
	version: 1;
	chat_message: {
		id: string;
		role: ChatMessage["role"];
		content: string;
		timestamp: number;
		metadata?: ChatMessage["metadata"];
	};
	blocks: ChatMessageBlock[];
};

function deriveTraceFromBlocks(
	blocks: ChatMessageBlock[] | undefined,
): ChatMessageTrace | undefined {
	if (!blocks || blocks.length === 0) return undefined;

	for (const b of blocks) {
		if (b.type === "agent_task") {
			return { type: "agent_task", taskId: b.taskId };
		}
	}

	for (const b of blocks) {
		if (b.type === "tool_call") {
			return { type: "tool_call", taskId: b.taskId, toolCallId: b.toolCallId };
		}
	}

	return undefined;
}

function deriveTextFromBlocks(blocks: ChatMessageBlock[] | undefined): string {
	if (!blocks || blocks.length === 0) return "";
	const texts = blocks
		.filter((b) => b.type === "text")
		.map((b) => b.text)
		.filter((t) => typeof t === "string" && t.trim().length > 0);
	return texts.join("\n\n");
}

function deriveReadablePlaceholder(
	role: ChatMessage["role"],
	trace: ChatMessageTrace | undefined,
): string {
	if (role !== "trace") return "";
	if (!trace) return "[过程]";
	if (trace.type === "agent_task") return "[任务]";
	if (trace.type === "tool_call") return "[工具调用]";
	return "[过程]";
}

function deriveBlocks(message: ChatMessage): ChatMessageBlock[] {
	const leadingText =
		message.content.trim().length > 0
			? [{ type: "text", text: message.content } as const]
			: [];
	const fileUpdateBlocks = Array.isArray(message.metadata?.fileUpdates)
		? message.metadata!.fileUpdates!.map(
				(update) => ({ type: "file_update", update }) as const,
			)
		: [];

	if (
		message.role === "trace" &&
		message.metadata?.trace?.type === "agent_task"
	) {
		return [{ type: "agent_task", taskId: message.metadata.trace.taskId }];
	}

	if (
		message.role === "trace" &&
		message.metadata?.trace?.type === "tool_call"
	) {
		return [
			{
				type: "tool_call",
				taskId: message.metadata.trace.taskId,
				toolCallId: message.metadata.trace.toolCallId,
			},
		];
	}

	if (message.metadata?.trace?.type === "agent_task") {
		return [
			...leadingText,
			...fileUpdateBlocks,
			{ type: "agent_task", taskId: message.metadata.trace.taskId },
		];
	}

	if (message.metadata?.trace?.type === "tool_call") {
		return [
			...leadingText,
			...fileUpdateBlocks,
			{
				type: "tool_call",
				taskId: message.metadata.trace.taskId,
				toolCallId: message.metadata.trace.toolCallId,
			},
		];
	}

	if (fileUpdateBlocks.length > 0) {
		return [...leadingText, ...fileUpdateBlocks];
	}

	return [{ type: "text", text: message.content }];
}

function toBackendRole(
	role: ChatMessage["role"],
): api.AgentMessageRecord["role"] {
	if (role === "trace") return "tool";
	return role;
}

function fromBackendRole(
	role: api.AgentMessageRecord["role"],
): ChatMessage["role"] {
	if (role === "tool") return "trace";
	return role as ChatMessage["role"];
}

function sameFileUpdate(a: FileUpdate, b: FileUpdate): boolean {
	return (
		a.fileName === b.fileName &&
		a.type === b.type &&
		a.additions === b.additions &&
		a.deletions === b.deletions
	);
}

function mergeFileUpdateBlocks(
	blocks: ChatMessageBlock[],
	fileUpdates: FileUpdate[] | undefined,
): ChatMessageBlock[] {
	if (!fileUpdates || fileUpdates.length === 0) return blocks;

	const existingUpdates = blocks
		.filter((b) => b.type === "file_update")
		.map((b) => b.update);

	const missing = fileUpdates.filter(
		(u) => !existingUpdates.some((ex) => sameFileUpdate(ex, u)),
	);
	if (missing.length === 0) return blocks;

	return [
		...blocks,
		...missing.map((update) => ({ type: "file_update", update }) as const),
	];
}

export function encodeChatMessageToAgentContentJson(
	message: ChatMessage,
): AgentMessageContentJsonV1 {
	const existingBlocks =
		Array.isArray(message.metadata?.blocks) &&
		message.metadata.blocks.length > 0
			? message.metadata.blocks
			: undefined;

	const fileUpdates = Array.isArray(message.metadata?.fileUpdates)
		? message.metadata.fileUpdates
		: undefined;

	const baseBlocks = existingBlocks || deriveBlocks(message);
	const mergedBlocks = mergeFileUpdateBlocks(baseBlocks, fileUpdates);

	const metadataForPersist =
		message.metadata && typeof message.metadata === "object"
			? (({ agentMessageId: _agentMessageId, ...rest }: any) => rest)(
					message.metadata as any,
				)
			: undefined;

	return {
		version: 1,
		chat_message: {
			id: message.id,
			role: message.role,
			content: message.content,
			timestamp: message.timestamp,
			metadata: metadataForPersist,
		},
		blocks: mergedBlocks,
	};
}

export function decodeAgentMessageToChatMessage(
	record: api.AgentMessageRecord,
): ChatMessage {
	const content = record.content_json as any;
	const cm = content?.chat_message;
	const blocks = Array.isArray(content?.blocks)
		? (content.blocks as ChatMessageBlock[])
		: undefined;

	if (cm && typeof cm === "object") {
		const role =
			(cm.role as ChatMessage["role"]) || fromBackendRole(record.role);

		const derivedTrace =
			role === "trace" &&
			!(
				cm.metadata &&
				typeof cm.metadata === "object" &&
				"trace" in cm.metadata
			)
				? deriveTraceFromBlocks(blocks)
				: undefined;

		const cmContentRaw = typeof cm.content === "string" ? cm.content : "";
		const cmContentIsEmpty = cmContentRaw.trim().length === 0;
		const derivedText = cmContentIsEmpty ? deriveTextFromBlocks(blocks) : "";
		const derivedPlaceholder =
			cmContentIsEmpty && derivedText.trim().length === 0
				? deriveReadablePlaceholder(role, derivedTrace)
				: "";

		return {
			id: typeof cm.id === "string" ? cm.id : record.id,
			role,
			content: cmContentIsEmpty
				? derivedText || derivedPlaceholder
				: cmContentRaw,
			timestamp: typeof cm.timestamp === "number" ? cm.timestamp : Date.now(),
			metadata: {
				...(cm.metadata || {}),
				agentMessageId: record.id,
				...(() => {
					const existing = Array.isArray(cm.metadata?.fileUpdates)
						? cm.metadata.fileUpdates
						: undefined;
					const derived = Array.isArray(blocks)
						? blocks
								.filter((b) => b.type === "file_update")
								.map((b) => b.update)
						: [];

					if (Array.isArray(existing) && existing.length > 0)
						return { fileUpdates: existing };
					if (derived.length > 0) return { fileUpdates: derived };
					if (Array.isArray(existing)) return { fileUpdates: existing };
					return {};
				})(),
				...(derivedTrace ? { trace: derivedTrace } : {}),
				...(blocks ? { blocks } : {}),
			},
		};
	}

	return {
		id: record.id,
		role: record.role === "tool" ? "trace" : (record.role as any),
		content: "",
		timestamp: Date.now(),
		metadata: { agentMessageId: record.id },
	};
}

export async function persistChatMessageToAgentSession(
	agentSessionId: string,
	message: ChatMessage,
): Promise<api.AgentMessageRecord | null> {
	try {
		const agentMessageId =
			typeof message.metadata?.agentMessageId === "string"
				? message.metadata.agentMessageId
				: "";
		const contentJson = encodeChatMessageToAgentContentJson(message);
		if (agentMessageId) {
			await api.updateAgentMessage({
				id: agentMessageId,
				content_json: contentJson,
			});
			return null;
		}

		return await api.createAgentMessage({
			session_id: agentSessionId,
			role: toBackendRole(message.role),
			content_json: contentJson,
		});
	} catch {
		return null;
	}
}

export async function loadAgentSessionMessagesAsChatMessages(
	agentSessionId: string,
	options?: { limit?: number },
): Promise<ChatMessage[]> {
	const limit = options?.limit;
	// limit > 0：把截断下推到 IPC/SQL，只传输最近 N 条；
	// 未传或 <= 0：显式传 0 拉全量，保持本函数原有"不传 = 全部"的语义。
	const records = await api.listAgentMessages(agentSessionId, {
		limit: typeof limit === "number" && limit > 0 ? limit : 0,
	});
	const decoded = records.map(decodeAgentMessageToChatMessage);
	decoded.sort((a, b) => a.timestamp - b.timestamp);

	if (typeof limit === "number" && limit > 0 && decoded.length > limit) {
		return decoded.slice(decoded.length - limit);
	}

	return decoded;
}
