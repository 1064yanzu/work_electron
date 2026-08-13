/**
 * ContextMenu - 高级右键菜单组件
 *
 * 设计特点:
 * - 毛玻璃效果(backdrop-blur)
 * - 优雅的阴影和边框
 * - 流畅的动画
 * - 智能定位
 */

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isTopOverlay, popOverlay, pushOverlay } from "../../lib/overlayStack";
import { cn } from "../../lib/utils";

export interface ContextMenuItem {
	label: string;
	icon?: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
	danger?: boolean;
	separator?: boolean;
	/** 分组小标题（不可点、不参与键盘遍历），用于把长菜单分段 */
	heading?: boolean;
	shortcut?: string; // 快捷键提示
}

interface ContextMenuProps {
	x: number;
	y: number;
	items: ContextMenuItem[];
	onClose: () => void;
}

import { createPortal } from "react-dom";

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const previousActiveElementRef = useRef<HTMLElement | null>(null);
	const [activeIndex, setActiveIndex] = useState<number>(-1);

	const actionableIndexes = useMemo(() => {
		return items
			.map((item, index) =>
				item.separator || item.heading || item.disabled ? null : index,
			)
			.filter((index): index is number => index !== null);
	}, [items]);

	useEffect(() => {
		setActiveIndex(actionableIndexes[0] ?? -1);
	}, [actionableIndexes]);

	// 智能定位:避免超出屏幕
	useEffect(() => {
		previousActiveElementRef.current =
			document.activeElement as HTMLElement | null;
		if (!menuRef.current) return;

		const menu = menuRef.current;
		const rect = menu.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let adjustedX = x;
		let adjustedY = y;

		// 右侧超出
		if (x + rect.width > viewportWidth) {
			adjustedX = viewportWidth - rect.width - 8;
		}

		// 底部超出
		if (y + rect.height > viewportHeight) {
			adjustedY = viewportHeight - rect.height - 8;
		}

		// 左侧超出
		if (adjustedX < 8) {
			adjustedX = 8;
		}

		// 顶部超出
		if (adjustedY < 8) {
			adjustedY = 8;
		}

		menu.style.left = `${adjustedX}px`;
		menu.style.top = `${adjustedY}px`;
		menu.focus();
		return () => {
			const previous = previousActiveElementRef.current;
			if (previous && document.contains(previous)) {
				previous.focus();
			}
		};
	}, [x, y]);

	// 点击外部关闭：下一帧再挂监听（跳过打开菜单的那次右键事件），
	// 替代原先 100ms 定时器 —— 定时器窗口内点击别处菜单关不掉
	useEffect(() => {
		const handlePointerDown = (e: PointerEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};

		const raf = requestAnimationFrame(() => {
			document.addEventListener("pointerdown", handlePointerDown);
		});

		return () => {
			cancelAnimationFrame(raf);
			document.removeEventListener("pointerdown", handlePointerDown);
		};
	}, [onClose]);

	// ESC 键关闭 —— 走全局 overlay 栈，只有位于栈顶时才消费
	useEffect(() => {
		const overlayId = pushOverlay();
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || e.defaultPrevented) return;
			if (!isTopOverlay(overlayId)) return;
			e.preventDefault();
			onClose();
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			popOverlay(overlayId);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	const handleItemClick = (item: ContextMenuItem) => {
		if (item.disabled) return;
		item.onClick();
		onClose();
	};

	const focusActiveItem = (index: number) => {
		if (!menuRef.current || index < 0) return;
		const node = menuRef.current.querySelector<HTMLButtonElement>(
			`button[data-menu-index="${index}"]`,
		);
		node?.focus();
	};

	useEffect(() => {
		focusActiveItem(activeIndex);
	}, [activeIndex]);

	const moveActive = (direction: 1 | -1) => {
		if (actionableIndexes.length === 0) return;
		if (activeIndex < 0) {
			setActiveIndex(actionableIndexes[0]);
			return;
		}
		const currentPosition = actionableIndexes.indexOf(activeIndex);
		const nextPosition =
			currentPosition < 0
				? 0
				: (currentPosition + direction + actionableIndexes.length) %
					actionableIndexes.length;
		setActiveIndex(actionableIndexes[nextPosition]);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		switch (event.key) {
			case "ArrowDown":
				event.preventDefault();
				moveActive(1);
				return;
			case "ArrowUp":
				event.preventDefault();
				moveActive(-1);
				return;
			case "Home":
				event.preventDefault();
				if (actionableIndexes.length > 0) {
					setActiveIndex(actionableIndexes[0]);
				}
				return;
			case "End":
				event.preventDefault();
				if (actionableIndexes.length > 0) {
					setActiveIndex(actionableIndexes[actionableIndexes.length - 1]);
				}
				return;
			case "Enter":
			case " ":
				if (activeIndex < 0) return;
				event.preventDefault();
				handleItemClick(items[activeIndex]);
				return;
			case "Tab":
				event.preventDefault();
				moveActive(event.shiftKey ? -1 : 1);
				return;
			case "Escape":
				event.preventDefault();
				onClose();
				return;
			default:
				return;
		}
	};

	return createPortal(
		<div
			ref={menuRef}
			role="menu"
			aria-label="上下文菜单"
			// 原生 WebContentsView（AI Hub 内嵌站点）永远浮在 DOM 之上，
			// 它靠这个标记知道"有浮层要显示，先把自己摘下来"。
			data-native-overlay="true"
			className={cn(
				"fixed z-[9999] min-w-[200px]",
				"bg-surface/95 backdrop-blur-md backdrop-saturate-150",
				"rounded-2xl border border-border",
				"shadow-bai-pop",
				"py-1.5",
				"animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150",
			)}
			style={{ left: x, top: y }}
			tabIndex={-1}
			onKeyDown={handleKeyDown}
		>
			{items.map((item, index) => {
				if (item.separator) {
					return (
						<div
							key={`separator-${index}`}
							className="h-px bg-border/60 my-1.5 mx-2"
						/>
					);
				}

				if (item.heading) {
					return (
						<div
							key={`heading-${index}`}
							className="px-3 pt-1.5 pb-1 text-xs font-medium uppercase tracking-wide text-text-light"
						>
							{item.label}
						</div>
					);
				}

				return (
					<button
						key={index}
						onClick={() => handleItemClick(item)}
						onMouseEnter={() => {
							if (!item.disabled) setActiveIndex(index);
						}}
						disabled={item.disabled}
						role="menuitem"
						aria-disabled={item.disabled}
						data-menu-index={index}
						tabIndex={index === activeIndex ? 0 : -1}
						className={cn(
							// 菜单项保持安静：hover 只换底色，不做缩放/图标放大/侧条指示器
							"w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors duration-100",
							"group/item relative",
							item.disabled
								? "text-text-light cursor-not-allowed opacity-50"
								: item.danger
									? "text-error hover:bg-error-muted"
									: "text-text-secondary hover:bg-warm-200/80 hover:text-text-primary",
						)}
					>
						{/* 图标 */}
						{item.icon && (
							<span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
								{item.icon}
							</span>
						)}

						{/* 标签 */}
						<span className="flex-1 text-left font-medium">{item.label}</span>

						{/* 快捷键提示 */}
						{item.shortcut && (
							<span className="text-xs text-text-light font-mono">
								{item.shortcut}
							</span>
						)}
					</button>
				);
			})}
		</div>,
		document.body,
	);
}
