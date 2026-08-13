/**
 * TaskListInline - 任务列表组件
 *
 * UI 参考用户给的截图（0/3 已完成 + 列表项勾选样式）
 */

import {
	CheckCircle2,
	ChevronRight,
	Circle,
	ListTodo,
	XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useAgentStoreSelector } from "../../lib/agent/store";
import type { AgentTask } from "../../lib/agent/types";
import { cn } from "../../lib/utils";

function findTaskById(
	taskId: string,
	current: AgentTask | null,
	history: AgentTask[],
): AgentTask | null {
	if (current?.id === taskId) return current;
	const t = history.find((x) => x.id === taskId);
	return t || null;
}

type TodoItem = {
	content: string;
	status: "pending" | "in_progress" | "completed";
	activeForm?: string;
};

function isTodoItemArray(value: unknown): value is TodoItem[] {
	return (
		Array.isArray(value) &&
		value.every(
			(x) =>
				typeof x === "object" &&
				x !== null &&
				typeof (x as any).content === "string" &&
				typeof (x as any).status === "string",
		)
	);
}

function statusToUi(status: TodoItem["status"] | "error" | "cancelled") {
	if (status === "completed") return "completed";
	if (status === "in_progress") return "running";
	if (status === "pending") return "pending";
	if (status === "cancelled") return "cancelled";
	return "error";
}

export function TaskListInline({ taskId }: { taskId: string }) {
	const [expanded, setExpanded] = useState(true);
	// 逐字段订阅：整个 agentStore 全量订阅会让本组件跟着流式事件每帧重渲染
	const currentTask = useAgentStoreSelector((s) => s.currentTask);
	const taskHistory = useAgentStoreSelector((s) => s.taskHistory);

	const task = useMemo(
		() => findTaskById(taskId, currentTask, taskHistory),
		[taskId, currentTask, taskHistory],
	);
	const todos = useMemo(() => {
		const raw = task?.metadata ? (task.metadata as any).todos : undefined;
		if (isTodoItemArray(raw)) return raw;
		return null;
	}, [task]);
	const items = todos
		? todos
		: (task?.steps || [])
				.filter((s) => s.kind !== "analysis")
				.map((s) => ({
					content: s.title,
					status:
						s.status === "completed"
							? ("completed" as const)
							: s.status === "running"
								? ("in_progress" as const)
								: ("pending" as const),
				}));

	if (!task) return null;
	if (!items || items.length === 0) return null;

	const completedCount = items.filter((t) => t.status === "completed").length;
	const totalCount = items.length;
	const allDone = totalCount > 0 && completedCount === totalCount;

	return (
		<div className="my-3">
			<div className="rounded-xl bg-warm-50 ring-1 ring-border/80 shadow-sm overflow-hidden">
				<button
					type="button"
					onClick={() => setExpanded((v) => !v)}
					className="w-full flex items-center justify-between px-4 py-2.5 text-left"
				>
					<div className="flex items-center gap-2 min-w-0">
						<ListTodo className="w-4 h-4 text-text-secondary flex-shrink-0" />
						<div className="text-sm font-medium text-text-secondary truncate">
							<span className="tabular-nums">
								{completedCount}/{totalCount}
							</span>{" "}
							已完成
						</div>
					</div>
					<div className="flex items-center gap-1.5 text-text-light">
						<ChevronRight
							className={cn(
								"w-4 h-4 transition-transform duration-150 ease-out-expo",
								expanded && "rotate-90",
							)}
						/>
					</div>
				</button>

				{expanded ? (
					<div className="px-4 pb-3 pt-1 border-t border-border/70">
						<div className="flex flex-col gap-2">
							{items.map((t, idx) => {
								const uiStatus = statusToUi(t.status);
								const done = uiStatus === "completed";
								const error = uiStatus === "error";
								return (
									<div
										key={`${idx}-${t.content}`}
										className="flex items-start gap-2.5 py-1"
									>
										<div className="pt-0.5 flex-shrink-0">
											{error ? (
												<XCircle className="w-5 h-5 text-error" />
											) : done ? (
												<CheckCircle2 className="w-5 h-5 text-success" />
											) : (
												<Circle className="w-5 h-5 text-text-light" />
											)}
										</div>
										<div
											className={[
												"flex-1 min-w-0 text-sm leading-6",
												done
													? "text-text-light line-through"
													: "text-text-primary",
											].join(" ")}
										>
											{t.content}
										</div>
									</div>
								);
							})}
						</div>

						{allDone ? (
							<div className="mt-2 text-xs text-text-light">任务已全部完成</div>
						) : null}
					</div>
				) : null}
			</div>
		</div>
	);
}
