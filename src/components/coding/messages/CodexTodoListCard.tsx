/**
 * Codex 待办列表卡片 - update_plan / TodoList / todo_list 工具
 *
 * Codex 有两种情况：
 * 1. 原始 todo_list 事件：output.items = [{text, completed}]
 * 2. update_plan 工具调用：可能只有 {id, status} 无 text，
 *    此时尝试所有字符串值作为 fallback
 */
import { ListChecks, Check, Circle, Loader } from "lucide-react";
import type { SessionToolCall } from "../../../lib/stores/codingSessionTypes";
import { ToolCardShell } from "./shared/ToolCardShell";

interface CodexTodoListCardProps {
	toolCall: SessionToolCall;
}

interface NormalizedItem {
	id: string;
	text: string;
	status: "pending" | "running" | "completed";
}

/** 从一个 item 对象中提取文本，尽可能找到有意义的字符串 */
function extractItemText(obj: Record<string, unknown>, index: number): string {
	// 优先已知语义字段
	const knownFields = [
		"text",
		"description",
		"title",
		"task",
		"content",
		"message",
		"summary",
		"label",
		"name",
		"action",
		"step",
		"value",
		"details",
	];

	for (const field of knownFields) {
		const v = obj[field];
		if (typeof v === "string" && v.trim().length > 0) {
			return v.trim();
		}
	}

	// 兜底：找对象中第一个非 id/status 类的非空字符串值
	const skipKeys = new Set([
		"id",
		"key",
		"uuid",
		"status",
		"state",
		"done",
		"completed",
		"type",
		"kind",
	]);
	for (const [k, v] of Object.entries(obj)) {
		if (!skipKeys.has(k.toLowerCase()) && typeof v === "string" && v.trim().length > 2) {
			return v.trim();
		}
	}

	// 如果只有 id 字段，把 id 当做文本展示
	if (typeof obj.id === "string" && obj.id.trim()) {
		return `[${obj.id}]`;
	}

	return `任务 ${index + 1}`;
}

/** 提取状态 */
function extractItemStatus(
	obj: Record<string, unknown>,
): NormalizedItem["status"] {
	if (
		obj.completed === true ||
		obj.done === true ||
		obj.status === "completed" ||
		obj.status === "done" ||
		obj.status === "finished" ||
		obj.status === true
	)
		return "completed";

	if (
		obj.status === "running" ||
		obj.status === "in_progress" ||
		obj.status === "in-progress" ||
		obj.status === "active" ||
		obj.status === "started"
	)
		return "running";

	return "pending";
}

function parseItem(raw: unknown, index: number): NormalizedItem | null {
	if (!raw || typeof raw !== "object") return null;
	const obj = raw as Record<string, unknown>;

	return {
		id: String(obj.id ?? obj.key ?? index),
		text: extractItemText(obj, index),
		status: extractItemStatus(obj),
	};
}

function extractItems(toolCall: SessionToolCall): NormalizedItem[] {
	const tryParseArray = (arr: unknown): NormalizedItem[] | null => {
		if (!Array.isArray(arr) || arr.length === 0) return null;
		const parsed = arr
			.map((item, i) => parseItem(item, i))
			.filter(Boolean) as NormalizedItem[];
		return parsed.length > 0 ? parsed : null;
	};

	const input = toolCall.input as Record<string, unknown>;
	const output = toolCall.output;

	const candidates = [
		// output 字段（Codex todo_list 事件的主要路径）
		typeof output === "object" && output !== null
			? (output as Record<string, unknown>).items
			: undefined,
		typeof output === "object" && output !== null
			? (output as Record<string, unknown>).plan
			: undefined,
		typeof output === "object" && output !== null
			? (output as Record<string, unknown>).tasks
			: undefined,
		Array.isArray(output) ? output : undefined,
		// input 字段（update_plan 工具调用路径）
		input.updates,
		input.plan,
		input.items,
		input.todos,
		input.tasks,
	];

	for (const candidate of candidates) {
		const result = tryParseArray(candidate);
		if (result) return result;
	}

	return [];
}

export function CodexTodoListCard({ toolCall }: CodexTodoListCardProps) {
	const items = extractItems(toolCall);
	const completedCount = items.filter((t) => t.status === "completed").length;
	const runningCount = items.filter((t) => t.status === "running").length;
	const totalCount = items.length;

	const titleText =
		totalCount > 0
			? `${completedCount}/${totalCount} 已完成${runningCount > 0 ? `，${runningCount} 进行中` : ""}`
			: "整理计划";

	return (
		<ToolCardShell
			icon={ListChecks}
			label="Plan"
			title={titleText}
			status={toolCall.status}
			isError={toolCall.isError}
			defaultExpanded={totalCount > 0}
			iconColor="text-indigo-500 dark:text-indigo-400"
		>
			{items.length > 0 && (
				<div className="space-y-0.5">
					{items.map((item) => (
						<div key={item.id} className="flex items-start gap-2 py-0.5">
							{item.status === "completed" ? (
								<Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
							) : item.status === "running" ? (
								<Loader className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-[#D96C46]" />
							) : (
								<Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-600" />
							)}
							<span
								className={`text-[12px] leading-[1.5] ${
									item.status === "completed"
										? "text-zinc-400 line-through dark:text-zinc-500"
										: item.status === "running"
											? "font-medium text-zinc-700 dark:text-zinc-200"
											: "text-zinc-600 dark:text-zinc-300"
								}`}
							>
								{item.text}
							</span>
						</div>
					))}

					{totalCount > 1 && (
						<div className="mt-1.5 pb-0.5">
							<div className="h-[3px] rounded-full bg-zinc-200 dark:bg-zinc-700/60 overflow-hidden">
								<div
									className="h-full rounded-full bg-emerald-500 transition-all duration-500"
									style={{ width: `${(completedCount / totalCount) * 100}%` }}
								/>
							</div>
						</div>
					)}
				</div>
			)}
		</ToolCardShell>
	);
}
