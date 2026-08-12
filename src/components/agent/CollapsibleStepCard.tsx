/**
 * Collapsible Step Card Component
 *
 * 通用的可折叠步骤卡片组件,用于展示 Agent 执行过程中的步骤。
 * 设计灵感来自 Claude 风格的思维链展示。
 */

import { ChevronRight } from "lucide-react";
import type React from "react";
import { useState, useEffect, useRef } from "react";
import { attentionPulse, useGsapMotion } from "../../lib/motion";
import { cn } from "../../lib/utils";
import { Collapsible } from "../ui/Collapsible";
import { Skeleton } from "../ui/Skeleton";

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

	// 状态颜色映射（全 token 化，随主题联动）
	const statusColors = {
		pending: {
			bg: "bg-surface/40",
			ring: "ring-1 ring-border/40",
			text: "text-text-light",
			iconBg: "bg-warm-50/50",
			iconColor: "text-text-light",
		},
		running: {
			bg: "bg-surface/80",
			ring: "ring-2 ring-focus/20",
			text: "text-text-secondary",
			iconBg: "bg-focus/10",
			iconColor: "text-focus",
		},
		completed: {
			bg: "bg-surface/80",
			ring: "ring-1 ring-border/30",
			text: "text-text-muted",
			iconBg: "bg-success/10",
			iconColor: "text-success",
		},
		error: {
			bg: "bg-surface/80",
			ring: "ring-2 ring-error/20",
			text: "text-text-secondary",
			iconBg: "bg-error/10",
			iconColor: "text-error",
		},
	};

	const colors = statusColors[status];
	const durationText = formatDuration(duration);

	// 状态图标在状态落定时弹一下：颜色从蓝变绿是唯一信号，
	// 一屏十几张卡片时视线抓不到"刚刚是哪一张完成了"。
	// 首次挂载不放（打开历史会话时几十张卡一起跳像出故障）。
	const iconRef = useRef<HTMLDivElement>(null);
	const seenStatusRef = useRef<string | null>(null);
	useGsapMotion(
		() => {
			const previous = seenStatusRef.current;
			seenStatusRef.current = status;
			if (previous === null || previous === status) return;
			if (status !== "completed" && status !== "error") return;
			attentionPulse(iconRef.current, { scale: 1.22, duration: 0.44 });
		},
		{ dependencies: [status] },
	);

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
					canToggle && "cursor-pointer hover:bg-surface/90",
					!canToggle && "cursor-default",
				)}
				disabled={!canToggle}
			>
				{/* 图标 */}
				{Icon && (
					<div
						ref={iconRef}
						className={cn(
							"mt-0.5 p-1.5 rounded-lg transition-colors duration-200",
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
								status === "pending" ? "text-text-light" : colors.text,
							)}
						>
							{title}
						</div>

						{/* 状态图标 */}
						{statusIcon}

						{/* 持续时间 */}
						{durationText && (
							<div className="text-[11px] font-medium text-text-light">
								{durationText}
							</div>
						)}

						{/* 展开/折叠图标（单图标旋转过渡） */}
						{canToggle && (
							<div className="ml-auto">
								<ChevronRight
									className={cn(
										"w-3.5 h-3.5 text-text-light transition-transform duration-200 ease-out-expo",
										isExpanded && "rotate-90",
									)}
								/>
							</div>
						)}
					</div>

					{/* 描述 */}
					{description && (
						<div className="text-[11px] text-text-light line-clamp-1 mt-0.5">
							{description}
						</div>
					)}
				</div>
			</button>

			{/* 展开内容 — grid 高度动画；运行中无内容时用骨架占位 */}
			<Collapsible open={isExpanded && (hasContent || status === "running")}>
				{children ? (
					<div className="px-3 pb-3 border-t border-border/30">{children}</div>
				) : status === "running" ? (
					<div className="px-3 pb-3 pt-2 border-t border-border/30 space-y-1.5">
						<Skeleton className="h-3 w-2/3" />
						<Skeleton className="h-3 w-1/2" />
					</div>
				) : null}
			</Collapsible>
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
