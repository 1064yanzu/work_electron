/**
 * SidebarViewHeader — 左栏四个一级视图（文件 / 对话 / 知识 / 技能）的统一头部。
 *
 * 规格与 ResourceSidebarHeader 基线一致：`h-header`（40px）等高、底部 1px 分隔线、
 * `px-3` 左右内边距。⌘1..4 切换视图时头部高度、分隔线与文字起点不再跳变。
 *
 * 用法：
 * - 常规视图：传 `title`（可选 `meta` 计数）+ `actions`（右侧图标按钮组）。
 * - 「搜索即头部」视图（对话）：不传 title，直接把搜索框作为 children 塞进 h-header 行。
 */
import type React from "react";
import { cn } from "../../../lib/utils";

interface SidebarViewHeaderProps {
	/** 视图标题（中文，如「技能库」）。不传时由 children 占满整行 */
	title?: string;
	/** 标题右侧的次要信息（计数等），text-xs muted */
	meta?: React.ReactNode;
	/** 右侧操作区（图标按钮组） */
	actions?: React.ReactNode;
	/** 自定义中部内容（如搜索框），自动占满剩余宽度 */
	children?: React.ReactNode;
	className?: string;
}

export function SidebarViewHeader({
	title,
	meta,
	actions,
	children,
	className,
}: SidebarViewHeaderProps) {
	return (
		<div
			className={cn(
				"flex h-header shrink-0 items-center gap-1 border-b border-border px-3",
				className,
			)}
		>
			{title ? (
				<div className="flex min-w-0 flex-1 items-baseline gap-2">
					<h2 className="shrink-0 truncate text-sm font-medium text-text-primary">
						{title}
					</h2>
					{meta ? (
						<span className="min-w-0 truncate text-xs text-text-muted">
							{meta}
						</span>
					) : null}
				</div>
			) : null}
			{children}
			{actions ? (
				<div className="flex shrink-0 items-center gap-0.5">{actions}</div>
			) : null}
		</div>
	);
}
