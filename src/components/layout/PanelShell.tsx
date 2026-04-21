import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface PanelShellProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
	variant?: "side" | "center";
}

/**
 * PanelShell — Claude 风格面板容器
 * 使用 panel-shell CSS 类提供暖色调背景
 */
export function PanelShell({
	children,
	variant = "side",
	className,
	...rest
}: PanelShellProps) {
	return (
		<div
			className={cn(
				"panel-shell h-full w-full overflow-hidden",
				variant === "center" && "panel-shell--center",
				className,
			)}
			{...rest}
		>
			{children}
		</div>
	);
}
