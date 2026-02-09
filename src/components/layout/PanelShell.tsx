import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface PanelShellProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
	variant?: "side" | "center";
}

export function PanelShell({
	children,
	variant = "side",
	className,
	...rest
}: PanelShellProps) {
	return (
		<div
			className={cn(
				"panel-shell h-full w-full overflow-hidden ring-1 ring-black/[0.02] dark:ring-white/[0.05]",
				variant === "center" && "panel-shell--center",
				className,
			)}
			{...rest}
		>
			{children}
		</div>
	);
}
