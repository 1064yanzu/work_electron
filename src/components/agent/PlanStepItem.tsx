/**
 * PlanStepItem - 执行计划中的单个步骤项
 * 展示步骤序号、标题、描述（可折叠）、预估文件列表和状态
 */

import {
	Check,
	ChevronDown,
	ChevronRight,
	Circle,
	Loader2,
	X,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";

export interface PlanStep {
	id: string;
	title: string;
	description: string;
	estimatedFiles?: string[];
	status: "pending" | "confirmed" | "rejected" | "executing" | "completed";
}

interface PlanStepItemProps {
	step: PlanStep;
	index: number;
}

/** 步骤状态图标 */
function StepStatusIcon({ status }: { status: PlanStep["status"] }) {
	switch (status) {
		case "completed":
			return (
				<div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
					<Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
				</div>
			);
		case "executing":
			return (
				<div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30">
					<Loader2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-spin" />
				</div>
			);
		case "confirmed":
			return (
				<div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30">
					<Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
				</div>
			);
		case "rejected":
			return (
				<div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30">
					<X className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
				</div>
			);
		default:
			return (
				<div className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-100 dark:bg-zinc-800">
					<Circle className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
				</div>
			);
	}
}

export function PlanStepItem({ step, index }: PlanStepItemProps) {
	const [expanded, setExpanded] = useState(false);
	const isExecuting = step.status === "executing";

	return (
		<div
			className={cn(
				"relative flex gap-3 px-3 py-2.5 rounded-lg transition-all duration-300",
				isExecuting &&
					"bg-blue-50/60 dark:bg-blue-900/10 ring-1 ring-blue-200/60 dark:ring-blue-800/40",
				step.status === "completed" && "opacity-75",
				step.status === "rejected" && "opacity-50",
			)}
		>
			{/* 序号 */}
			<div className="flex-shrink-0 pt-0.5">
				<div
					className={cn(
						"flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-colors",
						step.status === "completed"
							? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
							: step.status === "executing"
								? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
								: step.status === "confirmed"
									? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
									: step.status === "rejected"
										? "bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400"
										: "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400",
					)}
				>
					{index + 1}
				</div>
			</div>

			{/* 内容 */}
			<div className="flex-1 min-w-0">
				{/* 标题行 */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setExpanded(!expanded)}
						className="flex items-center gap-1 min-w-0 text-left group"
					>
						<span className="text-zinc-400 dark:text-zinc-500 transition-transform">
							{expanded ? (
								<ChevronDown className="w-3.5 h-3.5" />
							) : (
								<ChevronRight className="w-3.5 h-3.5" />
							)}
						</span>
						<span
							className={cn(
								"text-sm font-medium truncate",
								step.status === "rejected"
									? "line-through text-zinc-400 dark:text-zinc-500"
									: "text-zinc-800 dark:text-zinc-100",
							)}
						>
							{step.title}
						</span>
					</button>
				</div>

				{/* 描述（可折叠） */}
				{expanded && step.description && (
					<p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed pl-5">
						{step.description}
					</p>
				)}

				{/* 预估文件列表 */}
				{expanded &&
					step.estimatedFiles &&
					step.estimatedFiles.length > 0 && (
						<div className="mt-2 flex flex-wrap gap-1.5 pl-5">
							{step.estimatedFiles.map((file) => (
								<span
									key={file}
									className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 max-w-[200px] truncate"
								>
									{file}
								</span>
							))}
						</div>
					)}
			</div>

			{/* 状态图标 */}
			<div className="flex-shrink-0 pt-0.5">
				<StepStatusIcon status={step.status} />
			</div>
		</div>
	);
}
