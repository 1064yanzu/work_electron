/**
 * Skeleton 骨架屏组件
 * 用于在内容加载时显示占位效果，提供更好的用户体验
 */
import type * as React from "react";
import { cn } from "../../lib/utils";

interface SkeletonProps {
	className?: string;
	/**
	 * 是否显示圆形
	 */
	circle?: boolean;
	/**
	 * 宽度（用于圆形时作为直径）
	 */
	width?: number | string;
	/**
	 * 高度（圆形时忽略）
	 */
	height?: number | string;
}

/**
 * 基础骨架屏组件
 */
export function Skeleton({ className, circle, width, height }: SkeletonProps) {
	const style: React.CSSProperties = {};

	if (width) {
		style.width = typeof width === "number" ? `${width}px` : width;
	}
	if (height && !circle) {
		style.height = typeof height === "number" ? `${height}px` : height;
	}
	if (circle && width) {
		const size = typeof width === "number" ? `${width}px` : width;
		style.width = size;
		style.height = size;
	}

	return (
		<div
			className={cn(
				"skeleton",
				circle ? "rounded-full" : "rounded-lg",
				!height && !circle && "h-4",
				className,
			)}
			style={style}
		/>
	);
}

/**
 * 文本行骨架屏
 */
interface SkeletonTextProps {
	lines?: number;
	className?: string;
	lastLineWidth?: string;
}

export function SkeletonText({
	lines = 3,
	className,
	lastLineWidth = "60%",
}: SkeletonTextProps) {
	return (
		<div className={cn("space-y-2", className)}>
			{Array.from({ length: lines }).map((_, i) => (
				<Skeleton
					key={i}
					className={cn(
						"h-4",
						i === lines - 1 && lastLineWidth && `w-[${lastLineWidth}]`,
					)}
					width={i === lines - 1 ? lastLineWidth : "100%"}
				/>
			))}
		</div>
	);
}

/**
 * 头像骨架屏
 */
interface SkeletonAvatarProps {
	size?: number;
	className?: string;
}

export function SkeletonAvatar({ size = 40, className }: SkeletonAvatarProps) {
	return <Skeleton circle width={size} className={className} />;
}

/**
 * 卡片骨架屏
 */
interface SkeletonCardProps {
	className?: string;
	hasImage?: boolean;
}

export function SkeletonCard({
	className,
	hasImage = true,
}: SkeletonCardProps) {
	return (
		<div
			className={cn(
				"rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-4",
				className,
			)}
		>
			{hasImage && <Skeleton className="h-32 w-full rounded-lg" />}
			<div className="space-y-2">
				<Skeleton className="h-5 w-3/4" />
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-2/3" />
			</div>
		</div>
	);
}

/**
 * 聊天消息骨架屏
 */
interface SkeletonChatMessageProps {
	isUser?: boolean;
	className?: string;
}

export function SkeletonChatMessage({
	isUser = false,
	className,
}: SkeletonChatMessageProps) {
	return (
		<div
			className={cn(
				"flex gap-3",
				isUser ? "flex-row-reverse" : "flex-row",
				className,
			)}
		>
			{/* 头像 */}
			<SkeletonAvatar size={32} />

			{/* 消息内容 */}
			<div
				className={cn(
					"flex-1 space-y-2",
					isUser ? "items-end" : "items-start",
					isUser ? "max-w-[70%] ml-auto" : "max-w-[70%]",
				)}
			>
				<Skeleton className="h-4 w-24" />
				<div
					className={cn(
						"rounded-2xl p-4 space-y-2",
						isUser
							? "bg-primary/10 dark:bg-primary/20"
							: "bg-zinc-100 dark:bg-zinc-800",
					)}
				>
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
					<Skeleton className="h-4 w-2/3" />
				</div>
			</div>
		</div>
	);
}

/**
 * 列表项骨架屏
 */
interface SkeletonListItemProps {
	hasAvatar?: boolean;
	className?: string;
}

export function SkeletonListItem({
	hasAvatar = true,
	className,
}: SkeletonListItemProps) {
	return (
		<div className={cn("flex items-center gap-3 p-3", className)}>
			{hasAvatar && <SkeletonAvatar size={36} />}
			<div className="flex-1 space-y-2">
				<Skeleton className="h-4 w-1/3" />
				<Skeleton className="h-3 w-2/3" />
			</div>
		</div>
	);
}

/**
 * 项目卡片骨架屏
 */
export function SkeletonProjectCard({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"rounded-2xl border border-zinc-200 dark:border-zinc-700 p-5 space-y-4",
				className,
			)}
		>
			{/* 图标和标题 */}
			<div className="flex items-center gap-3">
				<Skeleton circle width={40} />
				<div className="flex-1 space-y-1.5">
					<Skeleton className="h-5 w-1/2" />
					<Skeleton className="h-3 w-1/3" />
				</div>
			</div>

			{/* 描述 */}
			<div className="space-y-2">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-4/5" />
			</div>

			{/* 底部 */}
			<div className="flex items-center justify-between pt-2">
				<Skeleton className="h-3 w-20" />
				<Skeleton className="h-3 w-16" />
			</div>
		</div>
	);
}
