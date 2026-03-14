/**
 * 统一工具卡片外壳 - Zed 风格增强版
 *
 * 设计要点：
 * - 全宽浅灰圆角矩形背景 + 左侧状态色条（运行中/错误/完成）
 * - 图标 + 动作标签 + 文件路径/命令 + 摘要
 * - 折叠态单行，右侧有展开箭头；展开态内容区有左侧缩进线
 * - subtitle 支持二级信息（如完整路径）
 */
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode, type ComponentType } from "react";
import type { SessionToolCall } from "../../../../lib/stores/codingSessionTypes";

interface ToolCardShellProps {
	icon: ComponentType<{ className?: string }>;
	/** 主题文本，如 "Read src/main.ts" 或 "$ npm run build" */
	title: string;
	/** 二级信息，如完整文件路径 */
	subtitle?: string;
	/** 动作标签（可选，如 "读取"、"编辑"），不传则不显示 */
	label?: string;
	/** 摘要信息，如结果数、执行耗时 */
	summary?: string;
	/** 状态 */
	status: SessionToolCall["status"];
	/** 错误信息 */
	isError?: boolean;
	/** 执行耗时(ms) */
	durationMs?: number;
	/** 展开的内容 */
	children?: ReactNode;
	/** 默认是否展开 */
	defaultExpanded?: boolean;
	/** 标题区域右侧的额外元素 */
	headerRight?: ReactNode;
	/** 图标颜色 class */
	iconColor?: string;
}

export function ToolCardShell({
	icon: Icon,
	title,
	subtitle,
	label,
	summary,
	status,
	isError,
	durationMs,
	children,
	defaultExpanded = false,
	headerRight,
	iconColor,
}: ToolCardShellProps) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const hasContent = children != null;
	const isRunning = status === "running";

	const durationLabel =
		durationMs != null && durationMs > 0
			? durationMs >= 1000
				? `${(durationMs / 1000).toFixed(1)}s`
				: `${durationMs}ms`
			: null;

	// 左侧状态色条颜色
	const statusBarColor = isError
		? "bg-red-400 dark:bg-red-500"
		: isRunning
			? "bg-[#D96C46] animate-pulse"
			: "bg-transparent";

	// 容器背景
	const containerBg = isError
		? "bg-red-50/50 dark:bg-red-950/15"
		: "bg-zinc-50/80 dark:bg-zinc-800/40";

	// 图标颜色默认跟随状态
	const resolvedIconColor = iconColor
		? iconColor
		: isError
			? "text-red-500"
			: isRunning
				? "text-[#D96C46]"
				: "text-zinc-400 dark:text-zinc-500";

	return (
		<div
			className={`group/card relative flex overflow-hidden rounded-lg ${containerBg} transition-colors`}
		>
			{/* 左侧状态色条 */}
			<div
				className={`w-[3px] shrink-0 rounded-l-lg ${statusBarColor} transition-colors`}
			/>

			<div className="min-w-0 flex-1">
				{/* 单行头部 */}
				<button
					type="button"
					onClick={() => hasContent && setExpanded(!expanded)}
					className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
						hasContent
							? "hover:bg-zinc-100/60 dark:hover:bg-zinc-700/30 cursor-pointer"
							: "cursor-default"
					}`}
				>
					{/* 工具图标 */}
					<Icon className={`h-3.5 w-3.5 shrink-0 ${resolvedIconColor}`} />

					{/* 动作标签（可选） */}
					{label && (
						<span className="shrink-0 text-xs font-medium text-zinc-500 dark:text-zinc-400">
							{label}
						</span>
					)}

					{/* 标题 — 文件路径或命令，等宽字体 */}
					<span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">
						{title}
					</span>

					{/* 自定义右侧内容（如 +N -N） */}
					{headerRight}

					{/* 摘要 */}
					{summary && (
						<span className="shrink-0 rounded-md bg-zinc-200/50 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-500 dark:bg-zinc-700/50 dark:text-zinc-400">
							{summary}
						</span>
					)}

					{/* 耗时 */}
					{durationLabel && !isRunning && (
						<span className="shrink-0 text-[10px] tabular-nums text-zinc-400/70 dark:text-zinc-500/70">
							{durationLabel}
						</span>
					)}

					{/* 运行中指示 */}
					{isRunning && (
						<span className="flex items-center gap-1 shrink-0">
							<span className="h-1.5 w-1.5 rounded-full bg-[#D96C46] animate-pulse" />
							<span className="text-[10px] text-[#D96C46]/80">运行中</span>
						</span>
					)}

					{/* 错误标签 */}
					{isError && (
						<span className="shrink-0 rounded-md bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500 dark:text-red-400">
							错误
						</span>
					)}

					{/* 展开箭头 */}
					{hasContent && (
						<ChevronDown
							className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-150 ${
								expanded ? "" : "-rotate-90"
							}`}
						/>
					)}
				</button>

				{/* 展开内容 */}
				{expanded && hasContent && (
					<div className="relative ml-3 mr-3 mb-2.5">
						{/* 左侧缩进连接线 */}
						<div className="absolute left-0 top-0 bottom-0 w-px bg-zinc-200/60 dark:bg-zinc-700/40" />
						<div className="pl-4 pt-1.5">
							{/* subtitle: 二级信息 */}
							{subtitle && (
								<p className="mb-1.5 truncate font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
									{subtitle}
								</p>
							)}
							{children}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
