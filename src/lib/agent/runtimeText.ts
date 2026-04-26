import type { AgentTask, ToolArtifact, ToolCall } from "./types";

export function stripToolUseErrorTags(value: string): string {
	return String(value || "")
		.replace(/<\/?tool_use_error>/gi, "")
		.trim();
}

export function extractToolErrorMessageFromUnknown(
	value: unknown,
	maxLength = 600,
): string | null {
	const raw =
		typeof value === "string"
			? value
			: value && typeof value === "object"
				? typeof (value as { error?: unknown }).error === "string"
					? String((value as { error?: string }).error)
					: JSON.stringify(value, null, 2)
				: value === null || value === undefined
					? ""
					: String(value);

	const cleaned = stripToolUseErrorTags(raw)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
	if (!cleaned) return null;
	if (cleaned.length <= maxLength) return cleaned;
	return `${cleaned.slice(0, maxLength)}...`;
}

export function toFriendlyAgentRuntimeError(errorMessage: string): string {
	const message = String(errorMessage || "").trim();
	if (!message) return "任务执行失败。";
	if (/stream closed/i.test(message)) {
		return "Agent 内部通信流已断开。这通常说明当前模型与 Agent SDK 的输出格式兼容性不足，建议切换到 Claude 系列模型后重试。";
	}
	if (/aborted/i.test(message)) {
		return "Agent 任务已取消。";
	}
	if (/timeout|timed out/i.test(message)) {
		return "Agent 请求超时，请检查网络或目标服务状态后重试。";
	}
	return message;
}

export function buildAgentInterruptionNote(errorMessage: string): string {
	return `本次执行在处理问题时中断：${toFriendlyAgentRuntimeError(errorMessage)}`;
}

function truncateInline(value: string, maxLength = 120): string {
	const normalized = String(value || "")
		.replace(/\s+/g, " ")
		.trim();
	if (!normalized) return "";
	return normalized.length > maxLength
		? `${normalized.slice(0, maxLength)}…`
		: normalized;
}

function formatArtifactList(artifacts: ToolArtifact[], maxItems = 3): string {
	const items = artifacts
		.map((artifact) => truncateInline(artifact.title || artifact.url || ""))
		.filter(Boolean)
		.slice(0, maxItems);
	if (items.length === 0) return "";
	return items.map((item) => `\`${item}\``).join("、");
}

function getBashCommand(toolCall: ToolCall): string {
	const command = (toolCall.input as { command?: unknown })?.command;
	return typeof command === "string" ? command.trim() : "";
}

function buildSideEffectSummaryFromTool(toolCall: ToolCall): string | null {
	const lowerName = String(toolCall.name || "").toLowerCase();
	const command = getBashCommand(toolCall);

	if (lowerName === "bash" && command) {
		if (/^\s*open\s+/i.test(command)) {
			return `已执行命令 \`${truncateInline(command)}\`，结果体现在系统打开动作中，没有额外文本输出。`;
		}
		return `已执行命令 \`${truncateInline(command)}\`，该步骤没有额外文本输出。`;
	}

	if (toolCall.type === "browser_open") {
		return "已完成打开页面操作，结果体现在浏览器界面中，没有额外文本输出。";
	}

	if (toolCall.type === "file_write") {
		const targetPath =
			typeof (toolCall.input as { file_path?: unknown })?.file_path === "string"
				? String((toolCall.input as { file_path?: string }).file_path).trim()
				: typeof (toolCall.input as { path?: unknown })?.path === "string"
					? String((toolCall.input as { path?: string }).path).trim()
					: "";
		if (targetPath) {
			return `已完成文件写入：\`${truncateInline(targetPath)}\`。该步骤没有额外文本输出。`;
		}
		return "已完成文件写入操作，没有额外文本输出。";
	}

	return null;
}

function buildArtifactSummary(artifacts: ToolArtifact[]): string | null {
	if (artifacts.length === 0) return null;

	const imageArtifacts = artifacts.filter(
		(artifact) => artifact.type === "image",
	);
	if (imageArtifacts.length > 0) {
		const label = formatArtifactList(imageArtifacts);
		return label
			? `已生成图片产物：${label}。`
			: `已生成 ${imageArtifacts.length} 张图片产物。`;
	}

	const fileArtifacts = artifacts.filter(
		(artifact) =>
			artifact.type === "file" ||
			artifact.type === "code" ||
			artifact.type === "url",
	);
	if (fileArtifacts.length > 0) {
		const label = formatArtifactList(fileArtifacts);
		return label
			? `已生成产物：${label}。`
			: `已生成 ${fileArtifacts.length} 个产物。`;
	}

	return null;
}

export function buildAgentNoTextCompletionSummary(
	task: AgentTask | null | undefined,
): string | null {
	if (!task || task.status !== "completed") return null;

	const completedToolCalls = (task.toolCalls || []).filter(
		(toolCall) => toolCall.status === "completed",
	);
	const artifacts = task.artifacts || [];

	if (completedToolCalls.length === 0 && artifacts.length === 0) {
		return null;
	}

	const lastCompletedTool = completedToolCalls[completedToolCalls.length - 1];
	const sideEffectSummary = lastCompletedTool
		? buildSideEffectSummaryFromTool(lastCompletedTool)
		: null;
	if (sideEffectSummary) {
		const artifactSummary = buildArtifactSummary(artifacts);
		return artifactSummary
			? `${sideEffectSummary}\n\n${artifactSummary}`
			: sideEffectSummary;
	}

	const artifactSummary = buildArtifactSummary(artifacts);
	if (artifactSummary) {
		return `${artifactSummary}\n\n本次任务已执行完成，但没有额外文本输出。`;
	}

	return `任务已执行完成，共完成 ${completedToolCalls.length} 个工具操作；结果主要体现在工具副作用中，没有额外文本输出。`;
}
