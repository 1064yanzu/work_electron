/**
 * PlanStepItem - 执行计划中的单个步骤项
 * 展示步骤序号、标题、描述（可折叠）、预估文件列表和状态
 */

import { Check, ChevronRight, Circle, Loader2, X } from "lucide-react";
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
				<div className="flex items-center justify-center w-6 h-6 rounded-full bg-success/16">
					<Check className="w-3.5 h-3.5 text-success" />
				</div>
			);
		case "executing":
			return (
				<div className="flex items-center justify-center w-6 h-6 rounded-full bg-focus/16">
					<Loader2 className="w-3.5 h-3.5 text-focus animate-spin" />
				</div>
			);
		case "confirmed":
			return (
				<div className="flex items-center justify-center w-6 h-6 rounded-full bg-warning/16">
					<Check className="w-3.5 h-3.5 text-warning" />
				</div>
			);
		case "rejected":
			return (
				<div className="flex items-center justify-center w-6 h-6 rounded-full bg-error/16">
					<X className="w-3.5 h-3.5 text-error" />
				</div>
			);
		default:
			return (
				<div className="flex items-center justify-center w-6 h-6 rounded-full bg-warm-200">
					<Circle className="w-3.5 h-3.5 text-text-light" />
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
				"relative flex gap-3 px-3 py-2.5 rounded-lg transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250",
				isExecuting && "bg-focus/8 ring-1 ring-focus/30",
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
							? "bg-success/16 text-success"
							: step.status === "executing"
								? "bg-focus/16 text-focus"
								: step.status === "confirmed"
									? "bg-warning/16 text-warning"
									: step.status === "rejected"
										? "bg-error/16 text-error"
										: "bg-warm-200 text-text-muted",
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
						<span className="text-text-light">
							<ChevronRight
								className={cn(
									"w-3.5 h-3.5 transition-transform duration-150 ease-out-expo",
									expanded && "rotate-90",
								)}
							/>
						</span>
						<span
							className={cn(
								"text-sm font-medium truncate",
								step.status === "rejected"
									? "line-through text-text-light"
									: "text-text-primary",
							)}
						>
							{step.title}
						</span>
					</button>
				</div>

				{/* 描述（可折叠） */}
				{expanded && step.description && (
					<p className="mt-1.5 text-xs text-text-muted leading-relaxed pl-5">
						{step.description}
					</p>
				)}

				{/* 预估文件列表 */}
				{expanded && step.estimatedFiles && step.estimatedFiles.length > 0 && (
					<div className="mt-2 flex flex-wrap gap-1.5 pl-5">
						{step.estimatedFiles.map((file) => (
							<span
								key={file}
								className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-mono bg-warm-200 text-text-secondary max-w-[200px] truncate"
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
