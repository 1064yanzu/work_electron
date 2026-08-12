/**
 * StepBlock — 快速配置向导里的步骤块
 *
 * 展示一个"步骤编号 + 图标 + 标题 + 描述 + 动作（链接/按钮）"，
 * 多个 StepBlock 竖向排列时，通过左侧的虚线连接线串起来形成清晰的流程。
 */

import type { LucideIcon } from "lucide-react";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../../../lib/utils";

export function StepBlock({
	index,
	icon: Icon,
	title,
	description,
	children,
	action,
	isLast = false,
	tone = "primary",
}: {
	index: number;
	icon?: LucideIcon;
	title: string;
	description?: string;
	children?: ReactNode;
	action?: ReactNode;
	isLast?: boolean;
	tone?: "primary" | "zinc";
}) {
	const numClass =
		tone === "primary"
			? "bg-primary/10 text-primary ring-primary/20"
			: "bg-warm-500/10 text-text-secondary ring-cream-400/20";
	return (
		<div className="relative flex gap-4">
			{/* 左侧步骤序号 + 连接线 */}
			<div className="flex flex-col items-center">
				<div
					className={cn(
						"flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1",
						numClass,
					)}
				>
					{Icon ? (
						<Icon className="h-4 w-4" strokeWidth={1.9} />
					) : (
						<span>{index}</span>
					)}
				</div>
				{!isLast ? (
					<div className="mt-1 h-full w-[1.5px] flex-1 bg-gradient-to-b from-cream-200 to-transparent dark:from-cream-800" />
				) : null}
			</div>

			{/* 右侧内容 */}
			<div className="min-w-0 flex-1 pb-6">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="text-sm font-medium text-text-primary">{title}</div>
						{description ? (
							<p className="mt-0.5 text-xs leading-relaxed text-text-secondary">
								{description}
							</p>
						) : null}
					</div>
					{action}
				</div>
				{children ? <div className="mt-3">{children}</div> : null}
			</div>
		</div>
	);
}

/** 外链小徽章，StepBlock 的 action 插槽里常用。 */
export function ExternalLinkChip({
	href,
	label,
}: {
	href: string;
	label: string;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
		>
			{label}
			<ExternalLink className="h-3 w-3" />
		</a>
	);
}
