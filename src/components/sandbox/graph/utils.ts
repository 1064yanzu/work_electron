import type { AgentTask, ToolCall } from "../../../lib/agent/types";

export function formatDuration(ms?: number) {
	if (!ms || ms <= 0) return "";
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

export function safeJson(value: unknown): string {
	try {
		const result = JSON.stringify(value, null, 2);
		return typeof result === "string" ? result : String(value);
	} catch {
		return String(value);
	}
}

export function getSubagentType(toolCall: ToolCall): string | null {
	const input = toolCall.input as any;
	if (!input || typeof input !== "object") return null;
	const candidate =
		typeof input?.subagent_type === "string"
			? input.subagent_type
			: typeof input?.agent_type === "string"
				? input.agent_type
				: typeof input?.subagentType === "string"
					? input.subagentType
					: typeof input?.agentType === "string"
						? input.agentType
						: null;
	const subType = candidate ? String(candidate).trim() || null : null;
	if (!subType) return null;

	const hasPrompt =
		typeof input?.prompt === "string" && input.prompt.trim().length > 0;
	const hasDesc =
		typeof input?.description === "string" &&
		input.description.trim().length > 0;
	if (!hasPrompt && !hasDesc) return null;
	return subType;
}

export function statusPill(status: string): {
	label: string;
	cls: string;
} {
	switch (status) {
		case "running":
			return {
				label: "运行中",
				cls: "text-blue-600 dark:text-blue-400",
			};
		case "completed":
			return {
				label: "完成",
				cls: "text-emerald-600 dark:text-emerald-400",
			};
		case "error":
			return {
				label: "失败",
				cls: "text-rose-600 dark:text-rose-400",
			};
		default:
			return {
				label: "等待",
				cls: "text-zinc-500 dark:text-zinc-400",
			};
	}
}

export function taskStatusPill(status: AgentTask["status"]): {
	label: string;
	cls: string;
	spinning?: boolean;
} {
	switch (status) {
		case "planning":
			return {
				label: "规划中",
				cls: "text-blue-600 dark:text-blue-400",
				spinning: true,
			};
		case "executing":
			return {
				label: "执行中",
				cls: "text-blue-600 dark:text-blue-400",
				spinning: true,
			};
		case "waiting":
			return {
				label: "等待",
				cls: "text-zinc-500 dark:text-zinc-400",
			};
		case "completed":
			return {
				label: "完成",
				cls: "text-emerald-600 dark:text-emerald-400",
			};
		case "error":
			return {
				label: "失败",
				cls: "text-rose-600 dark:text-rose-400",
			};
		case "cancelled":
			return {
				label: "已取消",
				cls: "text-zinc-500 dark:text-zinc-400",
			};
		default:
			return {
				label: "就绪",
				cls: "text-zinc-500 dark:text-zinc-400",
			};
	}
}

export function getNodeSearchText(node: { type: string; data: any }): string {
	if (node.type === "task") {
		return `${node.data.title || ""} ${node.data.subtitle || ""}`.toLowerCase();
	}
	if (node.type === "tool") {
		return `${node.data.name || ""} ${node.data.description || ""} ${node.data.subagentType || ""}`.toLowerCase();
	}
	if (node.type === "artifact") {
		return `${node.data.title || ""} ${node.data.artifactType || ""}`.toLowerCase();
	}
	if (node.type === "lane") {
		return `${node.data.label || ""}`.toLowerCase();
	}
	if (node.type === "phase_divider") {
		return `${node.data.label || ""}`.toLowerCase();
	}
	return "";
}
