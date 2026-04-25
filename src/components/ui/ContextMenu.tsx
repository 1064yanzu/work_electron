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
import { cn } from "../../lib/utils";

export interface ContextMenuItem {
	label: string;
	icon?: React.ReactNode;
	onClick: () => void;
	disabled?: boolean;
	danger?: boolean;
	separator?: boolean;
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
			.map((item, index) => (item.separator || item.disabled ? null : index))
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

	// 点击外部关闭
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};

		// 延迟添加监听,避免右键事件传播导致立即触发
		const timer = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
		}, 100);

		return () => {
			clearTimeout(timer);
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [onClose]);

	// ESC 键关闭
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
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
			className={cn(
				"fixed z-[9999] min-w-[200px]",
				// 高级毛玻璃效果
				"bg-surface/90/90",
				"backdrop-blur-xl backdrop-saturate-150",
				// 优雅的边框和阴影
				"rounded-xl border border-border/50/50",
				"shadow-2xl shadow-black/10 dark:shadow-black/40",
				// 内边距
				"py-1.5",
				// 动画
				"animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-200",
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
							className="h-px bg-warm-300/60 dark:bg-zinc-700/60 my-1.5 mx-2"
						/>
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
							"w-full flex items-center gap-3 px-3 py-2 text-sm transition-all duration-150",
							"group/item relative",
							item.disabled
								? "text-text-light cursor-not-allowed opacity-50"
								: item.danger
									? "text-red-600 dark:text-red-400 hover:bg-red-50/80 dark:hover:bg-red-900/20"
									: "text-text-secondary dark:text-zinc-200 hover:bg-warm-200/80/60",
							// 高级 hover 效果
							!item.disabled && "hover:scale-[1.02] active:scale-[0.98]",
						)}
					>
						{/* 图标 */}
						{item.icon && (
							<span
								className={cn(
									"w-4 h-4 flex items-center justify-center flex-shrink-0 transition-transform duration-150",
									!item.disabled && "group-hover/item:scale-110",
								)}
							>
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

						{/* Hover 指示器 */}
						{!item.disabled && !item.danger && (
							<div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-0 bg-blue-500 rounded-r-full transition-all duration-200 group-hover/item:h-4" />
						)}
					</button>
				);
			})}
		</div>,
		document.body,
	);
}
