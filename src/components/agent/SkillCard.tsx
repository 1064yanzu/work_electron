import {
	CheckCircle2,
	File,
	FileText,
	Loader2,
	PenTool,
	Search,
	Wand2,
	XCircle,
} from "lucide-react";
import type React from "react";
import type { SkillExecution } from "../../lib/agent/SkillExecutor";

interface SkillCardProps {
	skill: SkillExecution;
	/** 紧凑模式，适用于 AgentTraceInline */
	compact?: boolean;
	/** 是否隐藏头部（用于外部自定义头部时） */
	hideHeader?: boolean;
}

const STEP_ICONS: Record<string, React.ElementType> = {
	"load-skill": FileText,
	"detect-scene": Search,
	"load-style": FileText,
	generate: PenTool,
};

export function SkillCard({
	skill,
	compact = false,
	hideHeader = false,
}: SkillCardProps) {
	// 紧凑模式样式（适配 AgentTraceInline 风格）
	if (compact) {
		return (
			<div
				className={`rounded-xl bg-purple-50/50 dark:bg-purple-900/10 ring-1 ring-purple-200/50 dark:ring-purple-800/30 overflow-hidden ${hideHeader ? "border-none ring-0 bg-transparent" : ""}`}
			>
				{/* 头部 */}
				{!hideHeader && (
					<div className="flex items-center gap-2 px-3 py-2">
						<div className="p-1.5 rounded-lg bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
							<Wand2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-xs font-medium text-purple-800 dark:text-purple-200">
									技能: {skill.skillName}
								</span>
								<StatusBadge status={skill.status} compact />
							</div>
							{skill.detectedScene && (
								<div className="text-[11px] text-purple-600/70 dark:text-purple-400/70">
									场景: {skill.detectedScene}
								</div>
							)}
						</div>
					</div>
				)}

				{/* 步骤进度 */}
				<div className="px-3 pb-2 space-y-1.5">
					{skill.steps.map((step) => (
						<div key={step.id} className="flex items-center gap-2 text-[11px]">
							{step.status === "running" ? (
								<Loader2 className="w-3 h-3 text-blue-500 animate-spin flex-shrink-0" />
							) : step.status === "completed" ? (
								<CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
							) : step.status === "error" ? (
								<XCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
							) : (
								<div className="w-3 h-3 rounded-full border border-zinc-300 dark:border-zinc-600 flex-shrink-0" />
							)}
							<span
								className={
									step.status === "pending"
										? "text-zinc-400 dark:text-zinc-500"
										: "text-zinc-700 dark:text-zinc-300"
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

				{/* 已加载文件（紧凑显示） */}
				{skill.loadedFiles.length > 0 && (
					<div className="px-3 py-1.5 border-t border-purple-200/30 dark:border-purple-800/30">
						<div className="flex flex-wrap gap-1">
							{skill.loadedFiles.map((file, i) => (
								<span
									key={i}
									className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/60 dark:bg-zinc-800/60 rounded text-[10px] text-zinc-600 dark:text-zinc-400"
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
					<div className="px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-[11px] text-red-600 dark:text-red-400 border-t border-red-200/50 dark:border-red-800/30">
						错误: {skill.error}
					</div>
				)}
			</div>
		);
	}

	// 标准模式（原有样式）
	return (
		<div className="w-full bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 rounded-lg overflow-hidden mb-4">
			{/* 头部 */}
			<div className="flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-zinc-800 border-b border-slate-200 dark:border-zinc-700">
				<Wand2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
				<span className="text-sm font-medium text-slate-700 dark:text-zinc-200 flex-1">
					{skill.skillName} 执行中
				</span>
				<StatusBadge status={skill.status} />
			</div>

			{/* 步骤进度 */}
			<div className="p-3 space-y-3">
				{skill.steps.map((step) => {
					// 获取步骤图标
					const StepIcon = STEP_ICONS[step.id] || FileText;

					return (
						<div key={step.id} className="flex items-start gap-3 text-sm">
							{/* 状态图标 */}
							<div className="mt-0.5 relative">
								<div className="absolute -left-8 top-0">
									<StepIcon className="w-4 h-4 text-slate-400 dark:text-zinc-500" />
								</div>

								{step.status === "running" ? (
									<Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
								) : step.status === "completed" ? (
									<CheckCircle2 className="w-4 h-4 text-green-500" />
								) : step.status === "error" ? (
									<XCircle className="w-4 h-4 text-red-500" />
								) : (
									<div className="w-4 h-4 rounded-full border-2 border-slate-200 dark:border-zinc-600" />
								)}
							</div>

							{/* 步骤内容 */}
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span
										className={
											step.status === "pending"
												? "text-slate-400 dark:text-zinc-500"
												: "text-slate-700 dark:text-zinc-200 font-medium"
										}
									>
										{step.label}
									</span>
									{step.detail && (
										<span className="text-xs text-slate-500 dark:text-zinc-400 truncate">
											- {step.detail}
										</span>
									)}
								</div>
							</div>
						</div>
					);
				})}
			</div>

			{/* 加载的文件 */}
			{skill.loadedFiles.length > 0 && (
				<div className="px-3 py-2 bg-slate-50 dark:bg-zinc-800/30 border-t border-slate-100 dark:border-zinc-700/50">
					<div className="text-xs text-slate-500 dark:text-zinc-400 mb-1">
						已读取文件:
					</div>
					<div className="flex flex-wrap gap-2">
						{skill.loadedFiles.map((file, i) => (
							<div
								key={i}
								className="flex items-center gap-1.5 px-2 py-1 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-600 rounded text-xs text-slate-600 dark:text-zinc-300"
							>
								<File className="w-3 h-3 text-slate-400 dark:text-zinc-500" />
								<span className="truncate max-w-[200px]" title={file.path}>
									{file.path.split("/").pop()}
								</span>
								<span className="text-slate-400 dark:text-zinc-500 text-[10px]">
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

function StatusBadge({
	status,
	compact = false,
}: {
	status: SkillExecution["status"];
	compact?: boolean;
}) {
	const styles = {
		matching:
			"bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400",
		loading: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
		parsing: "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
		loading_style:
			"bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
		generating:
			"bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
		completed:
			"bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400",
		error: "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400",
	};

	const labels = {
		matching: "匹配中",
		loading: "加载中",
		parsing: "解析中",
		loading_style: "加载风格",
		generating: "生成中",
		completed: "完成",
		error: "错误",
	};

	const sizeClass = compact
		? "px-1.5 py-0.5 text-[9px]"
		: "px-2 py-0.5 text-[10px]";

	return (
		<span className={`${sizeClass} rounded font-medium ${styles[status]}`}>
			{labels[status]}
		</span>
	);
}
