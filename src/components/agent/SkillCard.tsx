import {
	CheckCircle2,
	File,
	Loader2,
	Wand2,
	XCircle,
} from "lucide-react";
import type { SkillExecution } from "../../lib/agent/SkillExecutor";
import { cn } from "../../lib/utils";

interface SkillCardProps {
	skill: SkillExecution;
	/** 紧凑模式,适用于 AgentTraceInline */
	compact?: boolean;
	/** 是否隐藏头部(用于外部自定义头部时) */
	hideHeader?: boolean;
}

/**
 * 状态图标组件
 */
function StatusIcon({ status }: { status: SkillExecution["status"] }) {
	switch (status) {
		case "loading":
		case "parsing":
		case "loading_style":
		case "generating":
			return <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />;
		case "completed":
			return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
		case "error":
			return <XCircle className="w-3.5 h-3.5 text-red-500" />;
		default:
			return null;
	}
}

/**
 * 步骤状态图标
 */
function StepStatusIcon({
	status,
}: {
	status: "pending" | "running" | "completed" | "error";
}) {
	switch (status) {
		case "running":
			return <Loader2 className="w-3 h-3 text-blue-500 animate-spin flex-shrink-0" />;
		case "completed":
			return <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />;
		case "error":
			return <XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />;
		default:
			return (
				<div className="w-3 h-3 rounded-full border border-zinc-300 dark:border-zinc-600 flex-shrink-0" />
			);
	}
}

export function SkillCard({
	skill,
	compact = false,
	hideHeader = false,
}: SkillCardProps) {
	// 紧凑模式样式(适配 AgentTraceInline 风格)
	if (compact) {
		// 判断是否正在运行或出错
		const isActive = ["loading", "parsing", "loading_style", "generating"].includes(
			skill.status,
		);
		const hasError = skill.status === "error";

		return (
			<div
				className={cn(
					"rounded-xl overflow-hidden transition-all duration-300",
					hideHeader ? "border-none ring-0 bg-transparent" : "",
					isActive && !hideHeader
						? "bg-white/80 dark:bg-zinc-900/60 ring-2 ring-blue-200/50 dark:ring-blue-800/30 shadow-sm"
						: hasError && !hideHeader
							? "bg-white/80 dark:bg-zinc-900/60 ring-2 ring-red-200/50 dark:ring-red-800/30 shadow-sm"
							: !hideHeader
								? "bg-white/60 dark:bg-zinc-900/40 ring-1 ring-zinc-200/30 dark:ring-zinc-700/30"
								: "",
				)}
			>
				{/* 头部 */}
				{!hideHeader && (
					<div className="flex items-center gap-2.5 px-3 py-2.5">
						<div
							className={cn(
								"p-1.5 rounded-lg transition-all duration-200",
								isActive
									? "bg-blue-50 dark:bg-blue-900/20"
									: hasError
										? "bg-red-50 dark:bg-red-900/20"
										: "bg-zinc-50 dark:bg-zinc-800/50",
							)}
						>
							<Wand2
								className={cn(
									"w-4 h-4 transition-colors",
									isActive
										? "text-blue-600 dark:text-blue-400"
										: hasError
											? "text-red-600 dark:text-red-400"
											: "text-zinc-500",
								)}
							/>
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span
									className={cn(
										"text-sm font-medium",
										isActive
											? "text-zinc-700 dark:text-zinc-300"
											: hasError
												? "text-zinc-700 dark:text-zinc-300"
												: "text-zinc-500 dark:text-zinc-400",
									)}
								>
									{skill.skillName}
								</span>
								<StatusIcon status={skill.status} />
							</div>
							{skill.detectedScene && (
								<div className="text-[11px] text-zinc-400 dark:text-zinc-500">
									场景: {skill.detectedScene}
								</div>
							)}
						</div>
					</div>
				)}

				{/* 步骤进度 */}
				{skill.steps.length > 0 && (
					<div className={cn("px-3 space-y-1.5", hideHeader ? "pt-0" : "pb-2")}>
						{skill.steps.map((step) => (
							<div key={step.id} className="flex items-center gap-2 text-[11px]">
								<StepStatusIcon status={step.status} />
								<span
									className={
										step.status === "pending"
											? "text-zinc-400 dark:text-zinc-500"
											: "text-zinc-600 dark:text-zinc-400"
									}
								>
									{step.label}
								</span>
								{step.detail && (
									<span className="text-zinc-400 dark:text-zinc-500 truncate">
										· {step.detail}
									</span>
								)}
							</div>
						))}
					</div>
				)}

				{/* 已加载文件(紧凑显示) */}
				{skill.loadedFiles.length > 0 && (
					<div className="px-3 py-1.5 border-t border-zinc-200/30 dark:border-zinc-700/30">
						<div className="flex flex-wrap gap-1">
							{skill.loadedFiles.map((file, i) => (
								<span
									key={i}
									className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-zinc-50/60 dark:bg-zinc-800/60 rounded text-[10px] text-zinc-500 dark:text-zinc-400"
								>
									<File className="w-2.5 h-2.5" />
									{file.path.split("/").pop()}
								</span>
							))}
						</div>
					</div>
				)}

				{/* 错误显示 */}
				{skill.error && (
					<div className="px-3 py-1.5 bg-red-50/50 dark:bg-red-900/20 text-[11px] text-red-600 dark:text-red-400 border-t border-red-200/30 dark:border-red-800/30">
						错误: {skill.error}
					</div>
				)}
			</div>
		);
	}

	// 标准模式(原有样式,保持兼容)
	return (
		<div className="w-full bg-white/60 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-700/50 rounded-lg overflow-hidden mb-4 shadow-sm">
			{/* 头部 */}
			<div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-50/50 dark:bg-zinc-800/50 border-b border-zinc-200/50 dark:border-zinc-700/50">
				<div className="p-1.5 rounded-lg bg-white dark:bg-zinc-900">
					<Wand2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
				</div>
				<span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 flex-1">
					{skill.skillName} 执行中
				</span>
				<StatusIcon status={skill.status} />
			</div>

			{/* 步骤进度 */}
			<div className="p-3 space-y-3">
				{skill.steps.map((step) => (
					<div key={step.id} className="flex items-start gap-3 text-sm">
						{/* 状态图标 */}
						<div className="mt-0.5">
							<StepStatusIcon status={step.status} />
						</div>

						{/* 步骤内容 */}
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span
									className={
										step.status === "pending"
											? "text-zinc-400 dark:text-zinc-500"
											: "text-zinc-700 dark:text-zinc-200 font-medium"
									}
								>
									{step.label}
								</span>
								{step.detail && (
									<span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
										- {step.detail}
									</span>
								)}
							</div>
						</div>
					</div>
				))}
			</div>

			{/* 加载的文件 */}
			{skill.loadedFiles.length > 0 && (
				<div className="px-3 py-2 bg-zinc-50/30 dark:bg-zinc-800/30 border-t border-zinc-100/50 dark:border-zinc-700/50">
					<div className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
						已读取文件:
					</div>
					<div className="flex flex-wrap gap-2">
						{skill.loadedFiles.map((file, i) => (
							<div
								key={i}
								className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-600 rounded text-xs text-zinc-600 dark:text-zinc-300"
							>
								<File className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
								<span className="truncate max-w-[200px]" title={file.path}>
									{file.path.split("/").pop()}
								</span>
								<span className="text-zinc-400 dark:text-zinc-500 text-[10px]">
									{(file.size / 1024).toFixed(1)}KB
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{/* 错误显示 */}
			{skill.error && (
				<div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs border-t border-red-100 dark:border-red-800/30">
					错误: {skill.error}
				</div>
			)}
		</div>
	);
}
