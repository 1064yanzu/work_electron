/**
 * 统一工具卡片外壳 - 所有工具调用共享的折叠容器
 * 提供一致的图标 + 标题 + 摘要 + 状态 + 折叠交互
 */
import { ChevronRight } from "lucide-react";
import { useState, type ReactNode, type ComponentType } from "react";
import { StatusDot } from "./StatusDot";
import type { SessionToolCall } from "../../../../lib/stores/codingSessionTypes";

interface ToolCardShellProps {
	icon: ComponentType<{ className?: string }>;
	/** 动作标签，如 "读取"、"编辑" */
	label?: string;
	/** 主题文本，如命令或文件名 */
	title: string;
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
	label,
	title,
	summary,
	status,
	isError,
	durationMs,
	children,
	defaultExpanded = false,
	headerRight,
	iconColor = "text-zinc-400 dark:text-zinc-500",
}: ToolCardShellProps) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const hasContent = children != null;

	const durationLabel =
		durationMs != null && durationMs > 0
			? durationMs >= 1000
				? `${(durationMs / 1000).toFixed(1)}s`
				: `${durationMs}ms`
			: null;

	return (
		<div className="group rounded-lg border border-transparent transition-colors hover:border-zinc-200/60 hover:bg-zinc-50/50 dark:hover:border-zinc-700/30 dark:hover:bg-zinc-800/30">
			{/* 头部 */}
			<button
				type="button"
				onClick={() => hasContent && setExpanded(!expanded)}
				className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
			>
				{/* 展开箭头（仅有内容时显示） */}
				{hasContent ? (
					<ChevronRight
						className={`h-3 w-3 shrink-0 text-zinc-300 transition-transform duration-150 dark:text-zinc-600 ${
							expanded ? "rotate-90" : ""
						}`}
					/>
				) : (
					<span className="w-3 shrink-0" />
				)}
				<Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
				{label && (
					<span className="shrink-0 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
						{label}
					</span>
				)}
				<span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">
					{title}
				</span>
				{headerRight}
				{summary && (
					<span className="shrink-0 text-[10px] tabular-nums text-zinc-400">
						{summary}
					</span>
				)}
				{durationLabel && status !== "running" && (
					<span className="shrink-0 text-[10px] tabular-nums text-zinc-400/60">
						{durationLabel}
					</span>
				)}
				{isError && status === "completed" && (
					<span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
						错误
					</span>
				)}
				<StatusDot status={status} />
				{status === "running" && (
					<span className="shrink-0 text-[10px] text-zinc-400 animate-pulse">
						执行中
					</span>
				)}
			</button>

			{/* 展开内容 — 带过渡 */}
			{expanded && hasContent && (
				<div className="border-t border-zinc-100 px-2.5 pb-2.5 pt-2 dark:border-zinc-800/60">
					{children}
				</div>
			)}
		</div>
	);
}
