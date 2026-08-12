import { X } from "lucide-react";
import type * as React from "react";
import { useEffect, useCallback, useRef, useState } from "react";
import {
	EASE,
	gsap,
	isReducedMotion,
	mDur,
	useGsapMotion,
} from "../../lib/motion";
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
	// 动画作用域：遮罩与面板都用 data-* 选择器定位，免去给 FocusTrap 加 ref 转发
	const scopeRef = useRef<HTMLDivElement>(null);
	const closingRef = useRef(false);

	// 关闭动画：用 GSAP 的 onComplete 收尾。
	// 改造前这里是写死的 setTimeout(200)，一旦 CSS 里的 animate-scale-out 时长
	// 被改动，卸载时机就和动画对不上（要么早卸载看到闪断，要么晚卸载多等空白）。
	const handleClose = useCallback(() => {
		if (closingRef.current) return;
		closingRef.current = true;

		const finish = () => {
			closingRef.current = false;
			setIsClosing(false);
			onClose();
		};

		const scope = scopeRef.current;
		if (!scope || isReducedMotion()) {
			finish();
			return;
		}

		setIsClosing(true);
		const panel = scope.querySelector("[data-modal-panel]");
		const overlay = scope.querySelector("[data-modal-overlay]");
		const tl = gsap.timeline({ onComplete: finish });
		if (panel) {
			tl.to(
				panel,
				{
					scale: 0.96,
					y: 10,
					opacity: 0,
					duration: mDur(0.2),
					ease: EASE.inExpo,
				},
				0,
			);
		}
		if (overlay) {
			tl.to(overlay, { opacity: 0, duration: mDur(0.2), ease: "none" }, 0);
		}
		// 兜底：万一两个节点都没查到，timeline 是空的，onComplete 仍会立刻触发
		if (!panel && !overlay) finish();
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

	// 入场：遮罩淡入 + 面板弹性升起 + 头尾内容轻微跟随
	useGsapMotion(
		({ gsap: g, dur, amp, expressive }) => {
			const tl = g.timeline();
			tl.from(
				"[data-modal-overlay]",
				{ opacity: 0, duration: dur(0.24), ease: "none" },
				0,
			);
			tl.from(
				"[data-modal-panel]",
				{
					opacity: 0,
					scale: 0.94,
					y: amp(16),
					duration: dur(0.46),
					ease: EASE.spring,
					clearProps: "transform,opacity",
				},
				0,
			);
			if (expressive) {
				tl.from(
					"[data-modal-section]",
					{
						opacity: 0,
						y: amp(10),
						duration: dur(0.36),
						ease: EASE.outExpo,
						stagger: 0.05,
						clearProps: "transform,opacity",
					},
					dur(0.1),
				);
			}
		},
		{ scope: scopeRef, skip: !shouldRender || isClosing },
	);

	if (!shouldRender && !isOpen) return null;

	return (
		<div
			ref={scopeRef}
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
				data-modal-overlay
				className="absolute inset-0 bg-text-primary/20 backdrop-blur-sm"
			/>

			{/* 模态框 */}
			<FocusTrap
				data-modal-panel
				className={cn(
					"relative w-full rounded-2xl",
					"bg-cream-50 dark:bg-cream-900",
					"shadow-bai-pop",
					"border border-cream-300 dark:border-cream-500",
					"overflow-hidden",
					sizeStyles[size],
				)}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
				onEscape={handleClose}
				initialFocusRef={initialFocusRef}
			>
				{/* Header */}
				<div
					data-modal-section
					className="flex items-center justify-between border-b border-cream-300 dark:border-cream-500/60 px-6 py-4"
				>
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
				<div data-modal-section className="p-6 max-h-[60vh] overflow-y-auto">
					{children}
				</div>

				{/* Footer */}
				{footer && (
					<div
						data-modal-section
						className="flex items-center justify-end gap-3 border-t border-cream-300 dark:border-cream-500/60 px-6 py-4"
					>
						{footer}
					</div>
				)}
			</FocusTrap>
		</div>
	);
}
