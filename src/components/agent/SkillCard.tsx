import { Blocks, CheckCircle2, File, Loader2, XCircle } from "lucide-react";
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
			return <Loader2 className="w-3.5 h-3.5 animate-spin text-focus" />;
		case "completed":
			return <CheckCircle2 className="w-3.5 h-3.5 text-success" />;
		case "error":
			return <XCircle className="w-3.5 h-3.5 text-error" />;
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
			return (
				<Loader2 className="w-3 h-3 text-focus animate-spin flex-shrink-0" />
			);
		case "completed":
			return <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />;
		case "error":
			return <XCircle className="w-3 h-3 text-error flex-shrink-0" />;
		default:
			return (
				<div className="w-3 h-3 rounded-full border border-border flex-shrink-0" />
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
		const isActive = [
			"loading",
			"parsing",
			"loading_style",
			"generating",
		].includes(skill.status);
		const hasError = skill.status === "error";

		return (
			<div
				className={cn(
					"rounded-xl overflow-hidden transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250",
					hideHeader ? "border-none ring-0 bg-transparent" : "",
					isActive && !hideHeader
						? "bg-surface/80 ring-2 ring-focus/30 shadow-sm"
						: hasError && !hideHeader
							? "bg-surface/80 ring-2 ring-error/30 shadow-sm"
							: !hideHeader
								? "bg-surface/60 ring-1 ring-border/30"
								: "",
				)}
			>
				{/* 头部 */}
				{!hideHeader && (
					<div className="flex items-center gap-2.5 px-3 py-2.5">
						<div
							className={cn(
								"p-1.5 rounded-lg transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150",
								isActive
									? "bg-focus/8"
									: hasError
										? "bg-error/8"
										: "bg-warm-50/50",
							)}
						>
							<Blocks
								className={cn(
									"w-4 h-4 transition-colors",
									isActive
										? "text-text-secondary"
										: hasError
											? "text-error"
											: "text-text-muted",
								)}
								strokeWidth={1.5}
							/>
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span
									className={cn(
										"text-sm font-medium",
										isActive
											? "text-text-secondary"
											: hasError
												? "text-text-secondary"
												: "text-text-muted",
									)}
								>
									{skill.skillName}
								</span>
								<StatusIcon status={skill.status} />
							</div>
							{skill.detectedScene && (
								<div className="text-xs text-text-light">
									场景：{skill.detectedScene}
								</div>
							)}
						</div>
					</div>
				)}

				{/* 步骤进度 */}
				{skill.steps.length > 0 && (
					<div className={cn("px-3 space-y-1.5", hideHeader ? "pt-0" : "pb-2")}>
						{skill.steps.map((step) => (
							<div key={step.id} className="flex items-center gap-2 text-xs">
								<StepStatusIcon status={step.status} />
								<span
									className={
										step.status === "pending"
											? "text-text-light"
											: "text-text-secondary"
									}
								>
									{step.label}
								</span>
								{step.detail && (
									<span className="text-text-light truncate">
										· {step.detail}
									</span>
								)}
							</div>
						))}
					</div>
				)}

				{/* 已加载文件(紧凑显示) */}
				{skill.loadedFiles.length > 0 && (
					<div className="px-3 py-1.5 border-t border-border/30">
						<div className="flex flex-wrap gap-1">
							{skill.loadedFiles.map((file, i) => (
								<span
									key={i}
									className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-warm-50/60 rounded text-2xs text-text-muted"
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
					<div className="px-3 py-1.5 bg-error/[0.04] text-xs text-error border-t border-error/10">
						错误：{skill.error}
					</div>
				)}
			</div>
		);
	}

	// 标准模式(原有样式,保持兼容)
	return (
		<div className="w-full bg-surface/60 border border-border/50 rounded-lg overflow-hidden mb-4 shadow-sm">
			{/* 头部 */}
			<div className="flex items-center gap-2 px-3 py-2.5 bg-warm-200/60 border-b border-border">
				<div className="p-1.5 rounded-lg bg-surface border border-border">
					<Blocks className="w-4 h-4 text-text-secondary" strokeWidth={1.5} />
				</div>
				<span className="text-sm font-medium text-text-secondary flex-1">
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
											? "text-text-light"
											: "text-text-secondary font-medium"
									}
								>
									{step.label}
								</span>
								{step.detail && (
									<span className="text-xs text-text-muted truncate">
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
				<div className="px-3 py-2 bg-warm-50/30 border-t border-border/50">
					<div className="text-xs text-text-muted mb-1">已读取文件：</div>
					<div className="flex flex-wrap gap-2">
						{skill.loadedFiles.map((file, i) => (
							<div
								key={i}
								className="flex items-center gap-1.5 px-2 py-1 bg-surface border border-border rounded text-xs text-text-secondary"
							>
								<File className="w-3 h-3 text-text-light" />
								<span className="truncate max-w-[200px]" title={file.path}>
									{file.path.split("/").pop()}
								</span>
								<span className="text-text-light text-2xs">
									{(file.size / 1024).toFixed(1)}KB
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{/* 错误显示 */}
			{skill.error && (
				<div className="px-3 py-2 bg-error/8 text-error text-xs border-t border-error/16">
					错误：{skill.error}
				</div>
			)}
		</div>
	);
}
