/**
 * 空状态组件
 * 用于显示列表为空时的优雅提示
 */
import type * as React from "react";
import { cn } from "../../lib/utils";
import type { MascotSlot } from "../../lib/mascot/manifest";
import { useMascot } from "../../lib/mascotStore";
import { MascotEmpty } from "../Mascot/MascotEmpty";

interface EmptyStateProps {
	/**
	 * 图标
	 */
	icon?: React.ReactNode;
	/**
	 * 标题
	 */
	title: string;
	/**
	 * 描述
	 */
	description?: string;
	/**
	 * 操作按钮
	 */
	action?: React.ReactNode;
	/**
	 * 额外的类名
	 */
	className?: string;
	/**
	 * 尺寸
	 */
	size?: "sm" | "md" | "lg";
}

const sizeStyles = {
	sm: {
		container: "py-8",
		iconWrapper: "w-10 h-10",
		icon: "w-5 h-5",
		title: "text-sm",
		description: "text-xs",
	},
	md: {
		container: "py-12",
		iconWrapper: "w-14 h-14",
		icon: "w-7 h-7",
		title: "text-base",
		description: "text-sm",
	},
	lg: {
		container: "py-20",
		iconWrapper: "w-20 h-20",
		icon: "w-10 h-10",
		title: "text-lg",
		description: "text-base",
	},
};

export function EmptyState({
	icon,
	title,
	description,
	action,
	className,
	size = "md",
}: EmptyStateProps) {
	const styles = sizeStyles[size];

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center text-center",
				"animate-fade-in",
				styles.container,
				className,
			)}
		>
			{/* 图标容器 */}
			{icon && (
				<div
					className={cn(
						"flex items-center justify-center rounded-2xl mb-4",
						"bg-warm-200",
						"text-text-light",
						styles.iconWrapper,
					)}
				>
					{icon}
				</div>
			)}

			{/* 标题 */}
			<h3
				className={cn(
					"font-semibold text-text-secondary mb-1 tracking-tight",
					styles.title,
				)}
			>
				{title}
			</h3>

			{/* 描述 */}
			{description && (
				<p className={cn("text-text-light max-w-xs", styles.description)}>
					{description}
				</p>
			)}

			{/* 操作按钮 */}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}

/**
 * 带插画的空状态（更高级）
 */
interface IllustratedEmptyStateProps extends EmptyStateProps {
	/**
	 * 插画类型
	 */
	illustration?: "folder" | "search" | "document" | "chat";
}

const ILLUSTRATION_TO_MASCOT: Record<
	NonNullable<IllustratedEmptyStateProps["illustration"]>,
	MascotSlot
> = {
	folder: "empty-no-data",
	search: "empty-no-data",
	document: "empty-no-data",
	chat: "state-greet",
};

export function IllustratedEmptyState({
	illustration = "folder",
	...props
}: IllustratedEmptyStateProps) {
	const { enabled } = useMascot();

	if (enabled) {
		return (
			<MascotEmpty
				slot={ILLUSTRATION_TO_MASCOT[illustration]}
				title={props.title}
				description={props.description}
				action={props.action}
				className={props.className}
				size="md"
			/>
		);
	}

	const getIllustration = () => {
		const baseClasses = "w-24 h-24 mb-6 text-cream-300 animate-pulse-subtle";

		switch (illustration) {
			case "folder":
				return (
					<svg className={baseClasses} viewBox="0 0 80 80" fill="none">
						<rect
							x="10"
							y="20"
							width="60"
							height="45"
							rx="4"
							fill="currentColor"
						/>
						<path
							d="M10 26C10 23.7909 11.7909 22 14 22H28L32 18H66C68.2091 18 70 19.7909 70 22V26H10Z"
							fill="currentColor"
							className="opacity-70"
						/>
					</svg>
				);
			case "search":
				return (
					<svg className={baseClasses} viewBox="0 0 80 80" fill="none">
						<circle
							cx="35"
							cy="35"
							r="20"
							stroke="currentColor"
							strokeWidth="4"
						/>
						<path
							d="M50 50L65 65"
							stroke="currentColor"
							strokeWidth="4"
							strokeLinecap="round"
						/>
					</svg>
				);
			case "document":
				return (
					<svg className={baseClasses} viewBox="0 0 80 80" fill="none">
						<rect
							x="15"
							y="10"
							width="50"
							height="60"
							rx="4"
							fill="currentColor"
						/>
						<rect
							x="25"
							y="25"
							width="30"
							height="3"
							rx="1.5"
							className="fill-cream-200 dark:fill-cream-800"
						/>
						<rect
							x="25"
							y="35"
							width="25"
							height="3"
							rx="1.5"
							className="fill-cream-200 dark:fill-cream-800"
						/>
						<rect
							x="25"
							y="45"
							width="20"
							height="3"
							rx="1.5"
							className="fill-cream-200 dark:fill-cream-800"
						/>
					</svg>
				);
			case "chat":
				return (
					<svg className={baseClasses} viewBox="0 0 80 80" fill="none">
						<path
							d="M15 50V25C15 21.134 18.134 18 22 18H58C61.866 18 65 21.134 65 25V45C65 48.866 61.866 52 58 52H30L20 62V52H22C18.134 52 15 48.866 15 45V50Z"
							fill="currentColor"
						/>
						<circle
							cx="30"
							cy="35"
							r="3"
							className="fill-cream-200 dark:fill-cream-800"
						/>
						<circle
							cx="40"
							cy="35"
							r="3"
							className="fill-cream-200 dark:fill-cream-800"
						/>
						<circle
							cx="50"
							cy="35"
							r="3"
							className="fill-cream-200 dark:fill-cream-800"
						/>
					</svg>
				);
			default:
				return null;
		}
	};

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center text-center py-16",
				"animate-fade-in",
				props.className,
			)}
		>
			{getIllustration()}
			<h3 className="font-semibold text-base text-text-secondary mb-2 tracking-tight">
				{props.title}
			</h3>
			{props.description && (
				<p className="text-sm text-text-light max-w-sm mb-4">
					{props.description}
				</p>
			)}
			{props.action}
		</div>
	);
}
