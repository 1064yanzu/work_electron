import { X } from "lucide-react";
import type * as React from "react";
import { useEffect, useCallback, useState } from "react";
import { cn } from "../../lib/utils";

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
}: ModalProps) {
	const [isClosing, setIsClosing] = useState(false);
	const [shouldRender, setShouldRender] = useState(false);

	// 处理关闭动画
	const handleClose = useCallback(() => {
		setIsClosing(true);
		setTimeout(() => {
			setIsClosing(false);
			onClose();
		}, 200); // 匹配退出动画时长
	}, [onClose]);

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
					"absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm",
					isClosing ? "animate-fade-out" : "animate-fade-in"
				)}
			/>

			{/* 模态框 */}
			<div
				className={cn(
					"relative w-full rounded-2xl",
					"bg-white dark:bg-zinc-900",
					"shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
					"border border-zinc-200/50 dark:border-zinc-700/50",
					"overflow-hidden",
					isClosing ? "animate-scale-out" : "animate-scale-in",
					sizeStyles[size],
				)}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-zinc-50/50 dark:bg-zinc-800/50">
					<h3
						id="modal-title"
						className="font-serif font-medium text-lg text-zinc-900 dark:text-zinc-100"
					>
						{title}
					</h3>
					{showCloseButton && (
						<button
							type="button"
							onClick={handleClose}
							className={cn(
								"rounded-full p-1.5",
								"text-zinc-400 dark:text-zinc-500",
								"hover:text-zinc-600 dark:hover:text-zinc-300",
								"hover:bg-zinc-100 dark:hover:bg-zinc-800",
								"btn-spring",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
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
					<div className="flex items-center justify-end gap-3 border-t border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-zinc-50/50 dark:bg-zinc-800/50">
						{footer}
					</div>
				)}
			</div>
		</div>
	);
}
