import type * as React from "react";
import { cn } from "../../lib/utils";
import type { MascotSlot } from "../../lib/mascot/manifest";
import { useMascot } from "../../lib/mascotStore";
import { Mascot } from "./Mascot";

export interface MascotEmptyProps {
	slot?: MascotSlot;
	title: string;
	description?: string;
	action?: React.ReactNode;
	className?: string;
	size?: "sm" | "md" | "lg";
	/** off 状态时的 fallback（通常传原 IllustratedEmptyState） */
	fallback?: React.ReactNode;
}

const ILLUSTRATION_SIZE: Record<NonNullable<MascotEmptyProps["size"]>, "md" | "lg" | "xl"> = {
	sm: "md",
	md: "lg",
	lg: "xl",
};

const CONTAINER_PADDING = {
	sm: "py-8",
	md: "py-14",
	lg: "py-20",
};

/**
 * MascotEmpty — IP 风格的空状态
 *
 * 用法和 IllustratedEmptyState 接近：传 title / description / action / size
 * off 状态走 fallback，保持与原 SVG 视觉等价。
 */
export function MascotEmpty({
	slot = "empty-no-data",
	title,
	description,
	action,
	className,
	size = "md",
	fallback = null,
}: MascotEmptyProps) {
	const { enabled } = useMascot();
	if (!enabled) return <>{fallback}</>;

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center text-center animate-fade-in",
				CONTAINER_PADDING[size],
				className,
			)}
		>
			<Mascot slot={slot} size={ILLUSTRATION_SIZE[size]} float />
			<h3 className="font-semibold text-base text-text-secondary mt-4 mb-1.5 tracking-tight">
				{title}
			</h3>
			{description && (
				<p className="text-sm text-text-light max-w-sm leading-relaxed">
					{description}
				</p>
			)}
			{action && <div className="mt-5">{action}</div>}
		</div>
	);
}
