import { type ReactNode, useState, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/utils";

interface TooltipProps {
	children: ReactNode;
	content: string;
	/** 延迟显示毫秒数 */
	delay?: number;
	/** 位置偏好 */
	placement?: "top" | "bottom" | "left" | "right";
}

/**
 * 简易 Tooltip 组件，鼠标悬浮显示文字说明
 * 支持 top / bottom / left / right 四个方向
 */
export function Tooltip({
	children,
	content,
	delay = 400,
	placement = "bottom",
}: TooltipProps) {
	const [visible, setVisible] = useState(false);
	const [position, setPosition] = useState({ x: 0, y: 0 });
	const triggerRef = useRef<HTMLDivElement>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
	const tooltipId = useId();

	const showTooltip = () => {
		timeoutRef.current = setTimeout(() => {
			if (triggerRef.current) {
				const rect = triggerRef.current.getBoundingClientRect();
				let x: number;
				let y: number;

				switch (placement) {
					case "top":
						x = rect.left + rect.width / 2;
						y = rect.top - 6;
						break;
					case "bottom":
						x = rect.left + rect.width / 2;
						y = rect.bottom + 6;
						break;
					case "left":
						x = rect.left - 6;
						y = rect.top + rect.height / 2;
						break;
					case "right":
						x = rect.right + 6;
						y = rect.top + rect.height / 2;
						break;
				}

				setPosition({ x, y });
				setVisible(true);
			}
		}, delay);
	};

	const hideTooltip = () => {
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setVisible(false);
	};

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	const getTransform = () => {
		switch (placement) {
			case "top":
				return "translateX(-50%) translateY(-100%)";
			case "bottom":
				return "translateX(-50%)";
			case "left":
				return "translateX(-100%) translateY(-50%)";
			case "right":
				return "translateY(-50%)";
		}
	};

	return (
		<>
			<div
				ref={triggerRef}
				onMouseEnter={showTooltip}
				onMouseLeave={hideTooltip}
				onFocus={showTooltip}
				onBlur={hideTooltip}
				className="inline-flex"
				aria-describedby={visible ? tooltipId : undefined}
			>
				{children}
			</div>
			{visible &&
				createPortal(
					<div
						id={tooltipId}
						role="tooltip"
						className={cn(
							"fixed z-[9999] px-2.5 py-1.5 text-xs font-medium rounded-full",
							"bg-cream-900 text-cream-50 dark:bg-cream-100 dark:text-cream-900",
							"shadow-bai-pop pointer-events-none whitespace-nowrap",
							"animate-in fade-in-0 zoom-in-95 duration-150",
						)}
						style={{
							left: position.x,
							top: position.y,
							transform: getTransform(),
						}}
					>
						{content}
					</div>,
					document.body,
				)}
		</>
	);
}
