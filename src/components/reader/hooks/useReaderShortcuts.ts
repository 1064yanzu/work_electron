import { useEffect } from "react";

export type ReaderShortcutHandlers = {
	onClose: () => void;
	onPrevChapter: () => void;
	onNextChapter: () => void;
	onToggleImmersive: () => void;
	onAddBookmark: () => void;
	onQuickHighlight: () => void;
	onOpenSearch: () => void;
	onToggleCopilot: () => void;
	onToggleTts: () => void;
	onOpenToc: () => void;
	onOpenHighlights: () => void;
	onCycleTheme: () => void;
};

const TYPING_TAG_RE = /^(INPUT|TEXTAREA|SELECT)$/;

function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (TYPING_TAG_RE.test(target.tagName)) return true;
	return target.isContentEditable;
}

export function useReaderShortcuts(
	handlers: ReaderShortcutHandlers,
	enabled: boolean,
) {
	useEffect(() => {
		if (!enabled) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return;

			const meta = e.metaKey || e.ctrlKey;

			if (e.key === "Escape") {
				handlers.onClose();
				return;
			}
			if (meta && e.key === "k") {
				e.preventDefault();
				handlers.onToggleCopilot();
				return;
			}
			if (meta && (e.key === "." || e.key === ",")) {
				if (e.key === ".") {
					e.preventDefault();
					handlers.onToggleImmersive();
				}
				return;
			}
			if (meta && e.key === "1") {
				e.preventDefault();
				handlers.onOpenToc();
				return;
			}
			if (meta && e.key === "2") {
				e.preventDefault();
				handlers.onOpenHighlights();
				return;
			}

			if (e.key === "F11") {
				e.preventDefault();
				handlers.onToggleImmersive();
				return;
			}

			switch (e.key) {
				case "ArrowLeft":
					handlers.onPrevChapter();
					return;
				case "ArrowRight":
				case " ":
					if (
						e.key === " " &&
						e.target instanceof HTMLElement &&
						e.target.closest("button")
					) {
						return;
					}
					e.preventDefault();
					handlers.onNextChapter();
					return;
				case "/":
					e.preventDefault();
					handlers.onOpenSearch();
					return;
				case "b":
				case "B":
					handlers.onAddBookmark();
					return;
				case "h":
				case "H":
					handlers.onQuickHighlight();
					return;
				case "t":
				case "T":
					handlers.onToggleTts();
					return;
				case "y":
				case "Y":
					handlers.onCycleTheme();
					return;
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [enabled, handlers]);
}
