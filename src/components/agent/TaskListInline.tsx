/**
 * TaskListInline - 任务列表组件
 * 
 * 像素级复刻参考图样式:
 * - 头部: "Created Todo List X tasks" + 展开箭头
 * - 卡片: 白色背景, 圆角, 细边框
 * - 任务项: 红色圆圈 + 数字编号
 */

import {
	Check,
	ChevronDown,
	ChevronRight,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useAgentStore } from "../../lib/agent/store";
import type { AgentTask, AgentTaskStep } from "../../lib/agent/types";

function findTaskById(
	taskId: string,
	current: AgentTask | null,
	history: AgentTask[],
): AgentTask | null {
	if (current?.id === taskId) return current;
	const t = history.find((x) => x.id === taskId);
	return t || null;
}

function StatusIcon({
	status,
	index,
}: { status: AgentTaskStep["status"]; index: number }) {
	const num = index + 1;

	// 进行中/待办: 红色实心圆 + 白色数字 (参考图样式)
	if (status === "running" || status === "pending") {
		return (
			<span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-xs font-bold text-white flex-shrink-0">
				{num}
			</span>
		);
	}

	// 已完成: 绿色勾
	if (status === "completed") {
		return (
			<span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 flex-shrink-0">
				<Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
			</span>
		);
	}

	// 错误: 红色X
	if (status === "error") {
		return (
			<span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500 flex-shrink-0">
				<X className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
			</span>
		);
	}

	// 默认
	return (
		<span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-300 dark:bg-zinc-600 text-xs font-bold text-white flex-shrink-0">
			{num}
		</span>
	);
}

export function TaskListInline({ taskId }: { taskId: string }) {
	const [expanded, setExpanded] = useState(true);
	const { currentTask, taskHistory } = useAgentStore();

	const task = useMemo(
		() => findTaskById(taskId, currentTask, taskHistory),
		[taskId, currentTask, taskHistory],
	);
	const steps = task?.steps || [];

	if (!task) return null;
	if (!steps || steps.length === 0) return null;

	return (
		<div className="my-3 select-none">
			{/* 头部 */}
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="inline-flex items-center gap-1.5 mb-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
			>
				<span className="text-sm">Created Todo List</span>
				<span className="text-sm text-zinc-400 dark:text-zinc-500">
					{steps.length} tasks
				</span>
				{expanded ? (
					<ChevronDown className="w-4 h-4 ml-0.5" />
				) : (
					<ChevronRight className="w-4 h-4 ml-0.5" />
				)}
			</button>

			{/* 任务卡片 */}
			{expanded && (
				<div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
					<div className="flex flex-col gap-5">
						{steps.map((step, idx) => (
							<div key={step.id} className="flex items-start gap-3">
								<StatusIcon status={step.status} index={idx} />
								<div className="flex-1 min-w-0 pt-0.5">
									<div className="text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-100">
										{step.title}
									</div>
									{step.description && (
										<div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
											{step.description}
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
