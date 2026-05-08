import type { ChatMessage, ChatMessageBlock } from "./types";
import { isTextCoveredByFinalText } from "./blockTextMerge";

function getTaskIdFromBlock(block: ChatMessageBlock): string | undefined {
	if (block.type === "agent_task" || block.type === "task_list") {
		return block.taskId;
	}
	if (block.type === "tool_call") {
		return block.taskId;
	}
	return undefined;
}

function getMessageTaskId(message: ChatMessage): string | undefined {
	const metadata = message.metadata;
	if (typeof metadata?.taskId === "string" && metadata.taskId.trim()) {
		return metadata.taskId.trim();
	}
	if (
		metadata?.trace &&
		typeof metadata.trace.taskId === "string" &&
		metadata.trace.taskId.trim()
	) {
		return metadata.trace.taskId.trim();
	}
	if (Array.isArray(metadata?.blocks)) {
		for (const block of metadata.blocks) {
			const taskId = getTaskIdFromBlock(block);
			if (typeof taskId === "string" && taskId.trim()) {
				return taskId.trim();
			}
		}
	}
	return undefined;
}

function getBlocks(message: ChatMessage): ChatMessageBlock[] {
	return Array.isArray(message.metadata?.blocks) ? message.metadata.blocks : [];
}

function getNonTextBlockCount(message: ChatMessage): number {
	return getBlocks(message).filter((block) => block.type !== "text").length;
}

function hasInlineTraceCoverage(message: ChatMessage): boolean {
	return getBlocks(message).some((block) =>
		[
			"thought",
			"task_list",
			"tool_call",
			"file_update",
			"image",
			"skill_execution",
		].includes(block.type),
	);
}

function normalizeComparableText(content: string): string {
	return String(content || "")
		.replace(/\s+/g, " ")
		.replace(/[>❌⚠️]/g, "")
		.trim()
		.toLowerCase();
}

function computeAssistantSignalScore(message: ChatMessage): number {
	const nonTextBlockCount = getNonTextBlockCount(message);
	const contentLength = String(message.content || "").trim().length;
	return nonTextBlockCount * 100000 + contentLength;
}

type TaskBucket = {
	canonicalAssistantIndex: number;
	canonicalAssistant: ChatMessage;
};

function buildTaskBuckets(messages: ChatMessage[]): Map<string, TaskBucket> {
	const buckets = new Map<string, TaskBucket>();

	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index];
		if (message.role !== "assistant") continue;
		const taskId = getMessageTaskId(message);
		if (!taskId) continue;

		const existing = buckets.get(taskId);
		if (!existing) {
			buckets.set(taskId, {
				canonicalAssistantIndex: index,
				canonicalAssistant: message,
			});
			continue;
		}

		const existingScore = computeAssistantSignalScore(
			existing.canonicalAssistant,
		);
		const nextScore = computeAssistantSignalScore(message);
		if (
			nextScore > existingScore ||
			(nextScore === existingScore &&
				message.timestamp >= existing.canonicalAssistant.timestamp)
		) {
			buckets.set(taskId, {
				canonicalAssistantIndex: index,
				canonicalAssistant: message,
			});
		}
	}

	return buckets;
}

function shouldDropAssistantFragment(
	message: ChatMessage,
	canonicalAssistant: ChatMessage,
): boolean {
	if (message.id === canonicalAssistant.id) return false;

	const currentText = normalizeComparableText(message.content);
	const canonicalText = normalizeComparableText(canonicalAssistant.content);
	const canonicalHasInlineTrace = hasInlineTraceCoverage(canonicalAssistant);

	if (!currentText) {
		return canonicalHasInlineTrace;
	}

	if (
		isTextCoveredByFinalText(currentText, canonicalText) ||
		(canonicalText.length >= currentText.length &&
			canonicalText.includes(currentText))
	) {
		return true;
	}

	if (
		canonicalHasInlineTrace &&
		computeAssistantSignalScore(canonicalAssistant) >
			computeAssistantSignalScore(message)
	) {
		return true;
	}

	return false;
}

export function normalizeAgentReplayMessages(
	messages: ChatMessage[],
): ChatMessage[] {
	if (!Array.isArray(messages) || messages.length <= 1) return messages;

	const taskBuckets = buildTaskBuckets(messages);
	const seenAssistantKeys = new Set<string>();

	return messages.filter((message) => {
		const taskId = getMessageTaskId(message);
		if (!taskId) return true;

		const bucket = taskBuckets.get(taskId);
		if (!bucket) return true;

		if (message.role === "trace") {
			return !hasInlineTraceCoverage(bucket.canonicalAssistant);
		}

		if (message.role === "assistant") {
			if (shouldDropAssistantFragment(message, bucket.canonicalAssistant)) {
				return false;
			}

			const dedupeKey = [
				taskId,
				normalizeComparableText(message.content),
				getNonTextBlockCount(message),
			].join("::");
			if (seenAssistantKeys.has(dedupeKey)) {
				return false;
			}
			seenAssistantKeys.add(dedupeKey);
		}

		return true;
	});
}
