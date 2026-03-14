/**
 * 统一工具卡片外壳 - Zed 风格圆角卡片
 *
 * 每个工具调用展示为一个独立的圆角边框卡片：
 * - 折叠态：icon | 工具名(加粗) | 文件/参数(等宽) | 右摘要 | 展开箭头
 * - 展开态：卡片内下方区域展示详细内容
 */
import { ChevronRight } from "lucide-react";
import { useState, type ReactNode, type ComponentType } from "react";
import type { SessionToolCall } from "../../../../lib/stores/codingSessionTypes";

interface ToolCardShellProps {
	icon: ComponentType<{ className?: string }>;
	/** 工具动作标签：Read / Edit / Bash / Grep 等 */
	label?: string;
	/** 主内容：文件名 / 命令摘要 */
	title: string;
	/** 二级说明（完整路径等） */
	subtitle?: string;
	/** 右侧摘要：行数 / 匹配数 */
	summary?: string;
	status: SessionToolCall["status"];
	isError?: boolean;
	children?: ReactNode;
	defaultExpanded?: boolean;
	/** 标题右侧自定义元素（diff 增删数字等）*/
	headerRight?: ReactNode;
	iconColor?: string;
	/** 保留兼容 */
	variant?: string;
}

export function ToolCardShell({
	icon: Icon,
	title,
	subtitle,
	label,
	summary,
	status,
	isError,
	children,
	defaultExpanded = false,
	headerRight,
	iconColor,
}: ToolCardShellProps) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const hasContent = children != null;
	const isRunning = status === "running";

	const resolvedIconColor = iconColor
		? iconColor
		: isError
			? "text-red-500"
			: isRunning
				? "text-[#D96C46]"
				: "text-zinc-400 dark:text-zinc-500";

	return (
		<div
			className={`my-[3px] overflow-hidden rounded-xl border transition-colors ${
				isError
					? "border-red-200/80 bg-red-50/30 dark:border-red-900/30 dark:bg-red-950/10"
					: isRunning
						? "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/60"
						: "border-zinc-200/70 bg-zinc-50/60 dark:border-zinc-700/50 dark:bg-zinc-800/30"
			}`}
		>
			{/* 卡片头部 */}
			<button
				type="button"
				onClick={() => hasContent && setExpanded((e) => !e)}
				className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
					hasContent
						? "cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
						: "cursor-default"
				}`}
			>
				{/* 工具图标 */}
				<Icon
					className={`h-[15px] w-[15px] shrink-0 ${resolvedIconColor}`}
				/>

				{/* 工具标签（加粗） */}
				{label && (
					<span className="shrink-0 text-[13px] font-semibold text-zinc-700 dark:text-zinc-200">
						{label}
					</span>
				)}

				{/* 主内容（等宽字体） */}
				<span className="min-w-0 flex-1 truncate font-mono text-[12px] text-zinc-500 dark:text-zinc-400">
					{title}
				</span>

				{/* 右侧摘要区域 */}
				<span className="ml-1 flex shrink-0 items-center gap-1.5">
					{headerRight}
					{summary && (
						<span className="tabular-nums text-[11px] text-zinc-400 dark:text-zinc-500">
							{summary}
						</span>
					)}
					{/* 运行中动画 */}
					{isRunning && (
						<span className="h-[5px] w-[5px] rounded-full bg-[#D96C46] animate-pulse" />
					)}
					{/* 展开箭头 */}
					{hasContent && (
						<ChevronRight
							className={`h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500 transition-transform duration-150 ${
								expanded ? "rotate-90" : ""
							}`}
						/>
					)}
				</span>
			</button>

			{/* 展开内容区域 */}
			{expanded && hasContent && (
				<div className="border-t border-zinc-200/60 px-3 py-2 dark:border-zinc-700/40">
					{subtitle && (
						<p className="mb-1.5 truncate font-mono text-[10px] text-zinc-400">
							{subtitle}
						</p>
					)}
					{children}
				</div>
			)}
		</div>
	);
}
