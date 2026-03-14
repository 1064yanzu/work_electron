/**
 * Portal 下拉菜单基础组件
 * 使用 createPortal 渲染到 document.body，解决 overflow-hidden 裁剪问题
 */
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

export type DropdownPlacement =
	| "bottom-start"
	| "bottom-end"
	| "top-start"
	| "top-end";

export interface DropdownPortalProps {
	/** 触发元素的 ref */
	anchorRef: RefObject<HTMLElement | null>;
	/** 是否打开 */
	open: boolean;
	/** 关闭回调 */
	onClose: () => void;
	/** 弹出位置 */
	placement?: DropdownPlacement;
	/** 额外 className */
	className?: string;
	/** 最小宽度（默认跟随 anchor 宽度） */
	minWidth?: number;
	/** 固定宽度 */
	width?: number;
	children: ReactNode;
}

interface Position {
	top: number;
	left: number;
}

export function DropdownPortal({
	anchorRef,
	open,
	onClose,
	placement = "bottom-start",
	className = "",
	minWidth,
	width,
	children,
}: DropdownPortalProps) {
	const dropdownRef = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState<Position>({ top: 0, left: 0 });
	const [visible, setVisible] = useState(false);

	// 计算位置
	const updatePosition = useCallback(() => {
		const anchor = anchorRef.current;
		if (!anchor || !open) return;

		const rect = anchor.getBoundingClientRect();
		const dropdownEl = dropdownRef.current;
		const dropdownHeight = dropdownEl?.offsetHeight || 0;
		const dropdownWidth = dropdownEl?.offsetWidth || 0;

		let top: number;
		let left: number;

		// 垂直位置
		if (placement.startsWith("top")) {
			top = rect.top - dropdownHeight - 4;
			// 如果上方空间不够，自动翻转到下方
			if (top < 8) {
				top = rect.bottom + 4;
			}
		} else {
			top = rect.bottom + 4;
			// 如果下方空间不够，自动翻转到上方
			if (top + dropdownHeight > window.innerHeight - 8) {
				top = rect.top - dropdownHeight - 4;
			}
		}

		// 水平位置
		if (placement.endsWith("end")) {
			left = rect.right - dropdownWidth;
			// 防止溢出左边
			if (left < 8) {
				left = 8;
			}
		} else {
			left = rect.left;
			// 防止溢出右边
			if (left + dropdownWidth > window.innerWidth - 8) {
				left = window.innerWidth - dropdownWidth - 8;
			}
		}

		// 确保不超出视口
		top = Math.max(8, Math.min(top, window.innerHeight - dropdownHeight - 8));
		left = Math.max(8, Math.min(left, window.innerWidth - dropdownWidth - 8));

		setPosition({ top, left });
	}, [anchorRef, open, placement]);

	// 打开时计算位置
	useLayoutEffect(() => {
		if (!open) {
			setVisible(false);
			return;
		}
		// 延迟一帧让 DOM 渲染后再计算位置
		requestAnimationFrame(() => {
			updatePosition();
			setVisible(true);
		});
	}, [open, updatePosition]);

	// 监听滚动和 resize 更新位置
	useEffect(() => {
		if (!open) return;
		const handleUpdate = () => updatePosition();
		window.addEventListener("scroll", handleUpdate, true);
		window.addEventListener("resize", handleUpdate);
		return () => {
			window.removeEventListener("scroll", handleUpdate, true);
			window.removeEventListener("resize", handleUpdate);
		};
	}, [open, updatePosition]);

	// 点击外部关闭
	useEffect(() => {
		if (!open) return;
		const handleMouseDown = (e: MouseEvent) => {
			const target = e.target as Node;
			// 如果点击在下拉菜单内，不关闭
			if (dropdownRef.current?.contains(target)) return;
			// 如果点击在 anchor 内，不关闭（由 anchor 自己处理 toggle）
			if (anchorRef.current?.contains(target)) return;
			onClose();
		};
		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, [open, onClose, anchorRef]);

	// Esc 关闭
	useEffect(() => {
		if (!open) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				e.stopPropagation();
				onClose();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	if (!open) return null;

	const anchorWidth = anchorRef.current?.getBoundingClientRect().width || 0;
	const computedWidth = width ?? undefined;
	const computedMinWidth = minWidth ?? anchorWidth;

	return createPortal(
		<div
			ref={dropdownRef}
			className={`fixed z-[9999] ${visible ? "animate-in fade-in zoom-in-95 duration-150" : "opacity-0"} ${className}`}
			style={{
				top: position.top,
				left: position.left,
				minWidth: computedMinWidth,
				width: computedWidth,
			}}
		>
			{children}
		</div>,
		document.body,
	);
}

/**
 * 右键菜单 Portal
 * 直接在鼠标位置弹出，不需要 anchorRef
 */
export interface ContextMenuPortalProps {
	/** 鼠标位置 */
	position: { x: number; y: number } | null;
	/** 关闭回调 */
	onClose: () => void;
	/** 额外 className */
	className?: string;
	children: ReactNode;
}

export function ContextMenuPortal({
	position: mousePos,
	onClose,
	className = "",
	children,
}: ContextMenuPortalProps) {
	const menuRef = useRef<HTMLDivElement>(null);
	const [adjustedPos, setAdjustedPos] = useState<{ top: number; left: number }>(
		{ top: 0, left: 0 },
	);
	const [visible, setVisible] = useState(false);

	const updatePosition = useCallback(() => {
		if (!mousePos) return;
		const menuEl = menuRef.current;
		const menuHeight = menuEl?.offsetHeight || 200;
		const menuWidth = menuEl?.offsetWidth || 160;

		let top = mousePos.y;
		let left = mousePos.x;

		if (top + menuHeight > window.innerHeight - 8) {
			top = window.innerHeight - menuHeight - 8;
		}
		if (left + menuWidth > window.innerWidth - 8) {
			left = window.innerWidth - menuWidth - 8;
		}

		setAdjustedPos({
			top: Math.max(8, top),
			left: Math.max(8, left),
		});
		setVisible(true);
	}, [mousePos]);

	// 计算位置
	useLayoutEffect(() => {
		if (!mousePos) {
			setVisible(false);
			return;
		}
		requestAnimationFrame(updatePosition);
	}, [mousePos, updatePosition]);

	useEffect(() => {
		if (!mousePos) return;
		const handleUpdate = () => updatePosition();
		window.addEventListener("resize", handleUpdate);
		window.addEventListener("scroll", handleUpdate, true);
		return () => {
			window.removeEventListener("resize", handleUpdate);
			window.removeEventListener("scroll", handleUpdate, true);
		};
	}, [mousePos, updatePosition]);

	// 点击外部关闭
	useEffect(() => {
		if (!mousePos) return;
		const handleMouseDown = (e: MouseEvent) => {
			if (menuRef.current?.contains(e.target as Node)) return;
			onClose();
		};
		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, [mousePos, onClose]);

	// Esc 关闭
	useEffect(() => {
		if (!mousePos) return;
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [mousePos, onClose]);

	if (!mousePos) return null;

	return createPortal(
		<div
			ref={menuRef}
			className={`fixed z-[9999] ${visible ? "animate-in fade-in zoom-in-95 duration-150" : "opacity-0"} ${className}`}
			style={{
				top: adjustedPos.top,
				left: adjustedPos.left,
			}}
		>
			{children}
		</div>,
		document.body,
	);
}
