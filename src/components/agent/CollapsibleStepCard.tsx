/**
 * Collapsible Step Card Component
 *
 * 通用的可折叠步骤卡片组件,用于展示 Agent 执行过程中的步骤。
 * 设计灵感来自 Claude 风格的思维链展示。
 */

import { ChevronDown, ChevronRight } from "lucide-react";
import type React from "react";
import { useState, useEffect } from "react";
import { cn } from "../../lib/utils";

export interface CollapsibleStepCardProps {
	/** 步骤名称 */
	title: string;
	/** 步骤描述(可选) */
	description?: string;
	/** 图标组件 */
	icon?: React.ElementType;
	/** 状态: pending | running | completed | error */
	status: "pending" | "running" | "completed" | "error";
	/** 耗时(可选) */
	duration?: number;
	/** 是否默认展开 */
	defaultExpanded?: boolean;
	/** 子内容 */
	children?: React.ReactNode;
	/** 是否禁用折叠 */
	disableCollapse?: boolean;
	/** 额外的类名 */
	className?: string;
	/** 自定义状态图标 */
	statusIcon?: React.ReactNode;
}

/**
 * 格式化持续时间
 */
function formatDuration(ms?: number): string {
	if (!ms || ms <= 0) return "";
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 可折叠步骤卡片
 */
export function CollapsibleStepCard({
	title,
	description,
	icon: Icon,
	status,
	duration,
	defaultExpanded = false,
	children,
	disableCollapse = false,
	className,
	statusIcon,
}: CollapsibleStepCardProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);

	// 根据状态自动调整折叠状态
	useEffect(() => {
		if (status === "running" || status === "error") {
			setIsExpanded(true);
		} else if (status === "completed" && !disableCollapse) {
			// 完成后自动折叠(延迟一点,让用户看到完成状态)
			const timer = setTimeout(() => setIsExpanded(false), 300);
			return () => clearTimeout(timer);
		}
	}, [status, disableCollapse]);

	const hasContent = !!children;
	const canToggle = hasContent && !disableCollapse;

	// 状态颜色映射
	const statusColors = {
		pending: {
			bg: "bg-white/40 dark:bg-zinc-900/20",
			ring: "ring-1 ring-zinc-200/40 dark:ring-zinc-700/40",
			text: "text-zinc-400 dark:text-zinc-500",
			iconBg: "bg-zinc-50 dark:bg-zinc-800/50",
			iconColor: "text-zinc-400",
		},
		running: {
			bg: "bg-white/80 dark:bg-zinc-900/60",
			ring: "ring-2 ring-blue-200/50 dark:ring-blue-800/30",
			text: "text-zinc-700 dark:text-zinc-300",
			iconBg: "bg-blue-50 dark:bg-blue-900/20",
			iconColor: "text-blue-600 dark:text-blue-400",
		},
		completed: {
			bg: "bg-white/60 dark:bg-zinc-900/40",
			ring: "ring-1 ring-zinc-200/30 dark:ring-zinc-700/30",
			text: "text-zinc-500 dark:text-zinc-400",
			iconBg: "bg-emerald-50/50 dark:bg-emerald-900/10",
			iconColor: "text-emerald-600 dark:text-emerald-400",
		},
		error: {
			bg: "bg-white/80 dark:bg-zinc-900/60",
			ring: "ring-2 ring-red-200/50 dark:ring-red-800/30",
			text: "text-zinc-700 dark:text-zinc-300",
			iconBg: "bg-red-50 dark:bg-red-900/20",
			iconColor: "text-red-600 dark:text-red-400",
		},
	};

	const colors = statusColors[status];
	const durationText = formatDuration(duration);

	return (
		<div
			className={cn(
				"rounded-xl overflow-hidden transition-all duration-300",
				colors.bg,
				colors.ring,
				"shadow-sm",
				className,
			)}
		>
			{/* 头部 */}
			<button
				onClick={() => canToggle && setIsExpanded((v) => !v)}
				className={cn(
					"w-full px-3 py-2.5 flex items-start gap-2.5 text-left transition-colors",
					canToggle &&
						"cursor-pointer hover:bg-white/90 dark:hover:bg-zinc-900/70",
					!canToggle && "cursor-default",
				)}
				disabled={!canToggle}
			>
				{/* 图标 */}
				{Icon && (
					<div
						className={cn(
							"mt-0.5 p-1.5 rounded-lg transition-all duration-200",
							colors.iconBg,
						)}
					>
						<Icon
							className={cn("w-4 h-4 transition-colors", colors.iconColor)}
						/>
					</div>
				)}

				{/* 内容 */}
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						{/* 标题 */}
						<div
							className={cn(
								"text-sm font-medium transition-colors",
								status === "pending"
									? "text-zinc-400 dark:text-zinc-500"
									: colors.text,
							)}
						>
							{title}
						</div>

						{/* 状态图标 */}
						{statusIcon}

						{/* 持续时间 */}
						{durationText && (
							<div className="text-[11px] font-medium text-zinc-400">
								{durationText}
							</div>
						)}

						{/* 展开/折叠图标 */}
						{canToggle && (
							<div className="ml-auto">
								{isExpanded ? (
									<ChevronDown className="w-3.5 h-3.5 text-zinc-400 transition-transform duration-200" />
								) : (
									<ChevronRight className="w-3.5 h-3.5 text-zinc-400 transition-transform duration-200" />
								)}
							</div>
						)}
					</div>

					{/* 描述 */}
					{description && (
						<div className="text-[11px] text-zinc-400 dark:text-zinc-500 line-clamp-1 mt-0.5">
							{description}
						</div>
					)}
				</div>
			</button>

			{/* 展开内容 */}
			{isExpanded && children && (
				<div className="px-3 pb-3 border-t border-zinc-200/30 dark:border-zinc-700/30">
					{children}
				</div>
			)}
		</div>
	);
}

/**
 * 步骤列表容器
 */
export function StepList({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return <div className={cn("space-y-2", className)}>{children}</div>;
}
