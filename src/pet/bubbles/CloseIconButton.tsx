/**
 * CloseIconButton — 气泡右上角统一的关闭按钮
 *
 * 之前 PetReminderBubble 手写 SVG、其它气泡用 lucide X，这里统一。
 */

import { X } from "lucide-react";

export interface CloseIconButtonProps {
	onClick: () => void;
	ariaLabel?: string;
	className?: string;
}

export function CloseIconButton({
	onClick,
	ariaLabel = "关闭",
	className,
}: CloseIconButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={ariaLabel}
			className={[
				"-mt-[1px] -mr-[2px] flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--t-text-light,#9d9d98)] transition-colors hover:bg-[color:var(--t-bg-muted,#f4f2ec)] hover:text-[color:var(--t-text-secondary,#6b6b68)]",
				className ?? "",
			].join(" ")}
		>
			<X className="h-3 w-3" strokeWidth={2.2} />
		</button>
	);
}
