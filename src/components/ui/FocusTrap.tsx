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
