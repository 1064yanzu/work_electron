// 工具栏弹层原语。
//
// 模型 / 思考程度 / 风格包 / 运行模式四个 pill 都是「点击 → 向上弹出小菜单」，
// 改造前各自复制了一份 Portal 定位 + 点击外部关闭 + Escape 关闭 + 菜单外壳样式，
// 四份实现的圆角、内距、字号互不相同。这里收敛成一套。
//
// 为什么必须 Portal：ChatInput 容器有 overflow-hidden（裁剪圆角内的内容），
// 菜单直接放在 pill 里会被切掉。

import {
	type ReactNode,
	type RefObject,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../../lib/utils";

interface MenuPosition {
	left: number;
	bottom: number;
}

interface UseToolbarMenuResult {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	toggle: () => void;
	buttonRef: RefObject<HTMLButtonElement>;
	menuRef: RefObject<HTMLDivElement>;
	position: MenuPosition | null;
}

/**
 * 弹层开合 + 定位 + 外部点击/Escape 关闭。
 *
 * @param menuWidth 菜单宽度，用于右溢出时改为右对齐（窄栏必需）
 */
export function useToolbarMenu(menuWidth: number): UseToolbarMenuResult {
	const [isOpen, setIsOpen] = useState(false);
	const [position, setPosition] = useState<MenuPosition | null>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => setIsOpen(false), []);
	const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

	useLayoutEffect(() => {
		if (!isOpen || !buttonRef.current) {
			setPosition(null);
			return;
		}
		const rect = buttonRef.current.getBoundingClientRect();
		const MARGIN = 8;
		// 优先左对齐；顶到右边界就右对齐到按钮右侧，再兜一次左边界
		const left =
			rect.left + menuWidth + MARGIN > window.innerWidth
				? Math.max(MARGIN, rect.right - menuWidth)
				: rect.left;
		setPosition({ left, bottom: window.innerHeight - rect.top + 8 });
	}, [isOpen, menuWidth]);

	useEffect(() => {
		if (!isOpen) return;
		const handlePointerDown = (event: MouseEvent) => {
			const target = event.target as Node;
			if (
				buttonRef.current?.contains(target) ||
				menuRef.current?.contains(target)
			) {
				return;
			}
			setIsOpen(false);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setIsOpen(false);
		};
		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen]);

	return { isOpen, open, close, toggle, buttonRef, menuRef, position };
}

// ── 菜单外壳 ────────────────────────────────────────────────────────────────

interface ToolbarMenuProps {
	menuRef: RefObject<HTMLDivElement>;
	position: MenuPosition | null;
	width: number;
	/** 头部左侧标题 */
	title: string;
	/** 头部右侧的技术名（如 effort / style），点明这项对应什么 */
	hint?: string;
	/** 头部下方一行说明，随 hover 项变化 */
	description?: string;
	children: ReactNode;
}

export function ToolbarMenu({
	menuRef,
	position,
	width,
	title,
	hint,
	description,
	children,
}: ToolbarMenuProps) {
	if (!position) return null;

	return createPortal(
		<div
			ref={menuRef}
			className={cn(
				"fixed z-[100] rounded-2xl overflow-hidden",
				"bg-cream-50/95 dark:bg-cream-900/95 backdrop-blur-xl",
				"border border-cream-400/70 dark:border-cream-500/60 shadow-bai-pop",
				"animate-in fade-in slide-in-from-bottom-1 zoom-in-95 duration-150 origin-bottom-left",
			)}
			style={{
				left: `${position.left}px`,
				bottom: `${position.bottom}px`,
				width: `${width}px`,
			}}
		>
			<div className="px-3 pt-2 pb-2 border-b border-cream-300/70 dark:border-cream-500/40">
				<div className="flex items-center justify-between gap-2">
					<div className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted">
						{title}
					</div>
					{hint && (
						<div className="text-[9.5px] text-text-muted/60 font-mono shrink-0">
							{hint}
						</div>
					)}
				</div>
				{description !== undefined && (
					<div className="text-[10px] text-text-muted/80 mt-1 leading-snug min-h-[14px]">
						{description}
					</div>
				)}
			</div>
			<div className="p-1 space-y-[1px]">{children}</div>
		</div>,
		document.body,
	);
}

/** 菜单内分区标题 —— 一个菜单里并列多组内容时用（如 `+` 菜单的「添加」/「语言风格」）。 */
export function ToolbarMenuSection({ label }: { label: string }) {
	return (
		<div className="px-2.5 pt-2 pb-1 first:pt-1">
			<div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-text-muted/70">
				{label}
			</div>
		</div>
	);
}

/** 菜单内分隔线。 */
export function ToolbarMenuDivider() {
	return (
		<div className="mx-2 my-1 border-t border-cream-300/60 dark:border-cream-600/30" />
	);
}

// ── 菜单项 ──────────────────────────────────────────────────────────────────

interface ToolbarMenuOptionProps {
	/** 左侧图形（图标 / 信号条） */
	leading?: ReactNode;
	label: string;
	/** 第二行说明；不传则单行紧凑布局 */
	description?: string;
	active: boolean;
	onClick: () => void;
	onMouseEnter?: () => void;
	/** 选中勾的强调色类名 */
	accentClassName?: string;
}

export function ToolbarMenuOption({
	leading,
	label,
	description,
	active,
	onClick,
	onMouseEnter,
	accentClassName = "text-terracotta dark:text-terracotta-light",
}: ToolbarMenuOptionProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			onMouseEnter={onMouseEnter}
			className={cn(
				"w-full text-left flex items-center gap-2.5 pl-2 pr-1.5 py-1.5 rounded-lg",
				"transition-[background-color,color] duration-100",
				active
					? "bg-cream-200/80 dark:bg-cream-800 text-text-primary"
					: "text-text-secondary hover:bg-cream-100 dark:hover:bg-cream-800/60 hover:text-text-primary",
			)}
		>
			{leading && <span className="shrink-0 flex items-center">{leading}</span>}
			<span className="flex-1 min-w-0">
				<span
					className={cn(
						"block text-[12px] leading-none truncate",
						active ? "font-semibold" : "font-medium",
					)}
				>
					{label}
				</span>
				{description && (
					<span className="block text-[10px] text-text-muted mt-1 leading-snug truncate">
						{description}
					</span>
				)}
			</span>
			<CheckMark active={active} className={accentClassName} />
		</button>
	);
}

function CheckMark({
	active,
	className,
}: {
	active: boolean;
	className: string;
}) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={2.5}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
			className={cn(
				"w-3 h-3 shrink-0 transition-opacity duration-150",
				active ? cn("opacity-100", className) : "opacity-0",
			)}
		>
			<path d="M20 6 9 17l-5-5" />
		</svg>
	);
}
