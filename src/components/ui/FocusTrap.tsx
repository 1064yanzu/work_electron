import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

const FOCUSABLE_SELECTOR = [
	"a[href]",
	"area[href]",
	"button:not([disabled])",
	"input:not([disabled]):not([type='hidden'])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"iframe",
	"object",
	"embed",
	"[contenteditable='true']",
	"[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
	).filter((el) => {
		if (el.hasAttribute("disabled")) return false;
		if (el.getAttribute("aria-hidden") === "true") return false;
		if (el.tabIndex < 0) return false;
		const style = window.getComputedStyle(el);
		return style.display !== "none" && style.visibility !== "hidden";
	});
}

export interface FocusTrapProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
	children: React.ReactNode;
	active?: boolean;
	className?: string;
	onEscape?: () => void;
	restoreFocus?: boolean;
	initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * useFocusTrap — 钩子版焦点陷阱。
 *
 * 适合已有自定义面板根节点的弹窗：不必把 JSX 重构为 <FocusTrap> 包裹，
 * 直接把返回的 ref 挂到面板根元素上即可获得 Tab 循环 / Esc / 焦点回归。
 *
 * const trapRef = useFocusTrap<HTMLDivElement>({ onEscape: onClose });
 * <div ref={trapRef} className="...面板根...">…</div>
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
	options: {
		active?: boolean;
		onEscape?: () => void;
		restoreFocus?: boolean;
		initialFocusRef?: React.RefObject<HTMLElement | null>;
	} = {},
): React.RefObject<T | null> {
	const {
		active = true,
		onEscape,
		restoreFocus = true,
		initialFocusRef,
	} = options;
	const containerRef = useRef<T | null>(null);
	const previousActiveElementRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!active) return;
		const container = containerRef.current;
		if (!container) return;

		previousActiveElementRef.current =
			document.activeElement as HTMLElement | null;

		// 初始焦点：优先指定元素 → 第一个可交互元素 → 容器自身
		const preferred = initialFocusRef?.current;
		if (preferred) {
			preferred.focus();
		} else {
			const focusables = getFocusableElements(container);
			if (focusables.length > 0) focusables[0].focus();
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onEscape?.();
				return;
			}
			if (event.key !== "Tab") return;
			const focusables = getFocusableElements(container);
			if (focusables.length === 0) {
				event.preventDefault();
				return;
			}
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			const current = document.activeElement as HTMLElement | null;
			if (event.shiftKey) {
				if (!current || current === first || !container.contains(current)) {
					event.preventDefault();
					last.focus();
				}
				return;
			}
			if (!current || current === last || !container.contains(current)) {
				event.preventDefault();
				first.focus();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			if (!restoreFocus) return;
			const previous = previousActiveElementRef.current;
			if (previous && document.contains(previous)) previous.focus();
		};
	}, [active, onEscape, restoreFocus, initialFocusRef]);

	return containerRef;
}

export function FocusTrap({
	children,
	active = true,
	className,
	onEscape,
	restoreFocus = true,
	initialFocusRef,
	...rest
}: FocusTrapProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const previousActiveElementRef = useRef<HTMLElement | null>(null);

	const focusFirst = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;

		const preferred = initialFocusRef?.current;
		if (preferred) {
			preferred.focus();
			return;
		}

		const focusables = getFocusableElements(container);
		if (focusables.length > 0) {
			focusables[0].focus();
			return;
		}
		container.focus();
	}, [initialFocusRef]);

	const handleKeyDown = useMemo(
		() => (event: KeyboardEvent) => {
			if (!active) return;
			if (!containerRef.current) return;

			if (event.key === "Escape") {
				onEscape?.();
				return;
			}

			if (event.key !== "Tab") return;

			const focusables = getFocusableElements(containerRef.current);
			if (focusables.length === 0) {
				event.preventDefault();
				containerRef.current.focus();
				return;
			}

			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			const current = document.activeElement as HTMLElement | null;

			if (event.shiftKey) {
				if (
					!current ||
					current === first ||
					!containerRef.current.contains(current)
				) {
					event.preventDefault();
					last.focus();
				}
				return;
			}

			if (
				!current ||
				current === last ||
				!containerRef.current.contains(current)
			) {
				event.preventDefault();
				first.focus();
			}
		},
		[active, onEscape],
	);

	useEffect(() => {
		if (!active) return;

		previousActiveElementRef.current =
			document.activeElement as HTMLElement | null;
		focusFirst();
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			if (!restoreFocus) return;
			const previous = previousActiveElementRef.current;
			if (previous && document.contains(previous)) {
				previous.focus();
			}
		};
	}, [active, focusFirst, handleKeyDown, restoreFocus]);

	return (
		<div
			ref={containerRef}
			className={className}
			tabIndex={rest.tabIndex ?? -1}
			{...rest}
		>
			{children}
		</div>
	);
}
