/**
 * 统一工具卡片外壳 - 完全照搬 Zed 的样式
 * 
 * Zed 风格：全宽浅灰圆角矩形背景 + 左侧图标 + 动作文本 + 文件路径
 * 折叠态单行，右侧有展开箭头；展开态内容区在下方
 * 完成态无特殊标记，运行中轻微脉冲
 */
import { ChevronDown } from "lucide-react";
import { useState, type ReactNode, type ComponentType } from "react";
import type { SessionToolCall } from "../../../../lib/stores/codingSessionTypes";

interface ToolCardShellProps {
	icon: ComponentType<{ className?: string }>;
	/** 主题文本，如 "Read src/main.ts" 或 "$ npm run build" */
	title: string;
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

	// Zed 风格：浅灰底色，运行中微微脉冲
	const containerBg = isError
		? "bg-red-50/60 dark:bg-red-950/20"
		: isRunning
			? "bg-zinc-100/80 dark:bg-zinc-800/60 animate-[pulse_3s_ease-in-out_infinite]"
			: "bg-zinc-100/70 dark:bg-zinc-800/50";

	// 图标颜色默认跟随状态
	const resolvedIconColor = iconColor || "text-zinc-500 dark:text-zinc-400";

	return (
		<div className={`rounded-lg ${containerBg} overflow-hidden transition-colors`}>
			{/* 单行头部 */}
			<button
				type="button"
				onClick={() => hasContent && setExpanded(!expanded)}
				className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
					hasContent
						? "hover:bg-zinc-200/50 dark:hover:bg-zinc-700/40 cursor-pointer"
						: "cursor-default"
				}`}
			>
				{/* 工具图标 — Zed 用的是圆形图标 */}
				<Icon className={`h-3.5 w-3.5 shrink-0 ${resolvedIconColor}`} />

				{/* 动作标签（可选） */}
				{label && (
					<span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
						{label}
					</span>
				)}

				{/* 标题 — 文件路径或命令，等宽字体 */}
				<span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-600 dark:text-zinc-300">
					{title}
				</span>

				{/* 自定义右侧内容（如 +N -N） */}
				{headerRight}

				{/* 摘要 */}
				{summary && (
					<span className="shrink-0 text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
						{summary}
					</span>
				)}

				{/* 耗时 */}
				{durationLabel && !isRunning && (
					<span className="shrink-0 text-[10px] tabular-nums text-zinc-400/60">
						{durationLabel}
					</span>
				)}

				{/* 错误标签 */}
				{isError && (
					<span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
						错误
					</span>
				)}

				{/* 展开箭头 — Zed 风格：向下箭头 */}
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
				<div className="border-t border-zinc-200/40 dark:border-zinc-700/40 px-3 pb-2.5 pt-2">
					{children}
				</div>
			)}
		</div>
	);
}
