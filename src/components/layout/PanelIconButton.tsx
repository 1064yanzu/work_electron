import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface PanelIconButtonProps
	extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
	icon: ReactNode;
	label: string;
}

export function PanelIconButton({
	icon,
	label,
	className,
	type = "button",
	...rest
}: PanelIconButtonProps) {
	return (
		<button
			type={type}
			aria-label={label}
			title={label}
			className={cn("panel-icon-button focus-ring", className)}
			{...rest}
		>
			{icon}
		</button>
	);
}
