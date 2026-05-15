import { X } from "lucide-react";
import type * as React from "react";
import { useEffect, useCallback, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { FocusTrap } from "./FocusTrap";

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
	/**
	 * 模态框尺寸
	 */
	size?: "sm" | "md" | "lg" | "xl";
	/**
	 * 是否显示关闭按钮
	 */
	showCloseButton?: boolean;
	/**
	 * 点击遮罩是否关闭
	 */
	closeOnOverlayClick?: boolean;
	/**
	 * 底部操作区
	 */
	footer?: React.ReactNode;
	/**
	 * 初始焦点引用，不传则自动聚焦第一个可交互元素
	 */
	initialFocusRef?: React.RefObject<HTMLElement | null>;
}

const sizeStyles = {
	sm: "max-w-sm",
	md: "max-w-lg",
	lg: "max-w-2xl",
	xl: "max-w-4xl",
};

export function Modal({
	isOpen,
	onClose,
	title,
	children,
	size = "md",
	showCloseButton = true,
	closeOnOverlayClick = true,
	footer,
	initialFocusRef,
}: ModalProps) {
	const [isClosing, setIsClosing] = useState(false);
	const [shouldRender, setShouldRender] = useState(false);
	const closeButtonRef = useRef<HTMLButtonElement | null>(null);
	const reduceMotion =
		typeof document !== "undefined" &&
		document.documentElement.dataset.motionPreference === "reduced";
	const closeDuration = reduceMotion ? 0 : 200;

	// 处理关闭动画
	const handleClose = useCallback(() => {
		setIsClosing(true);
		setTimeout(() => {
			setIsClosing(false);
			onClose();
		}, closeDuration);
	}, [onClose, closeDuration]);

	// ESC 键关闭
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "Escape") {
				handleClose();
			}
		},
		[handleClose],
	);

	// 控制渲染和动画状态
	useEffect(() => {
		if (isOpen) {
			setShouldRender(true);
			document.addEventListener("keydown", handleKeyDown);
			document.body.style.overflow = "hidden";
		}
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			document.body.style.overflow = "";
		};
	}, [isOpen, handleKeyDown]);

	// 关闭后清理渲染状态
	useEffect(() => {
		if (!isOpen && !isClosing) {
			setShouldRender(false);
		}
	}, [isOpen, isClosing]);

	if (!shouldRender && !isOpen) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans"
			onClick={closeOnOverlayClick ? handleClose : undefined}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					if (closeOnOverlayClick) handleClose();
				}
			}}
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
		>
			{/* 遮罩层 */}
			<div
				className={cn(
					"absolute inset-0 bg-text-primary/20 backdrop-blur-sm",
					isClosing ? "animate-fade-out" : "animate-fade-in",
				)}
			/>

			{/* 模态框 */}
			<FocusTrap
				className={cn(
					"relative w-full rounded-2xl",
					"bg-cream-50 dark:bg-cream-900",
					"shadow-bai-pop",
					"border border-cream-300 dark:border-cream-500",
					"overflow-hidden",
					isClosing ? "animate-scale-out" : "animate-scale-in",
					sizeStyles[size],
				)}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				onEscape={handleClose}
				initialFocusRef={initialFocusRef}
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b border-cream-300 dark:border-cream-500/60 px-6 py-4">
					<h3
						id="modal-title"
						className="font-semibold text-base text-text-primary tracking-tight"
					>
						{title}
					</h3>
					{showCloseButton && (
						<button
							ref={closeButtonRef}
							type="button"
							onClick={handleClose}
							className={cn(
								"rounded-full p-1.5",
								"text-text-muted",
								"hover:text-text-primary",
								"hover:bg-warm-200",
								"transition-transform duration-150 ease-out-expo active:scale-[0.96]",
								"focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--t-primary-muted)]",
							)}
							aria-label="关闭"
						>
							<X className="h-4 w-4" strokeWidth={1.5} />
						</button>
					)}
				</div>

				{/* Content */}
				<div className="p-6 max-h-[60vh] overflow-y-auto">{children}</div>

				{/* Footer */}
				{footer && (
					<div className="flex items-center justify-end gap-3 border-t border-cream-300 dark:border-cream-500/60 px-6 py-4">
						{footer}
					</div>
				)}
			</FocusTrap>
		</div>
	);
}
