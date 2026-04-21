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
					"absolute inset-0 bg-[#141413]/25 dark:bg-[#141413]/60 backdrop-blur-sm",
					isClosing ? "animate-fade-out" : "animate-fade-in",
				)}
			/>

			{/* 模态框 */}
			<FocusTrap
				className={cn(
					"relative w-full rounded-2xl",
					"bg-[#faf9f5] dark:bg-[#1e1d1b]",
					"shadow-[rgba(0,0,0,0.08)_0px_16px_48px_-8px]",
					"border border-[#e8e6dc] dark:border-[#30302e]",
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
				<div className="flex items-center justify-between border-b border-[#f0eee6] dark:border-[#30302e] px-6 py-4 bg-[#f5f4ed]/60 dark:bg-[#30302e]/40">
					<h3
						id="modal-title"
						className="font-serif font-medium text-lg text-[#141413] dark:text-[#faf9f5]"
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
								"text-[#87867f] dark:text-[#5e5d59]",
								"hover:text-[#141413] dark:hover:text-[#faf9f5]",
								"hover:bg-[#f0eee6] dark:hover:bg-[#30302e]",
								"btn-spring",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3898ec]/50",
							)}
							aria-label="关闭"
						>
							<X className="h-4 w-4" />
						</button>
					)}
				</div>

				{/* Content */}
				<div className="p-6 max-h-[60vh] overflow-y-auto">{children}</div>

				{/* Footer */}
				{footer && (
					<div className="flex items-center justify-end gap-3 border-t border-[#f0eee6] dark:border-[#30302e] px-6 py-4 bg-[#f5f4ed]/60 dark:bg-[#30302e]/40">
						{footer}
					</div>
				)}
			</FocusTrap>
		</div>
	);
}
