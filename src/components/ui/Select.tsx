import { Check, ChevronDown } from "lucide-react";
import {
	Children,
	forwardRef,
	isValidElement,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ForwardedRef,
	type KeyboardEvent,
	type ReactNode,
	type ReactElement,
} from "react";
import { createPortal } from "react-dom";

/**
 * 全自定义的高级质感下拉选择组件
 *
 * 设计特点：
 * - 完全自定义渲染（不使用原生 select），下拉菜单通过 Portal 渲染
 * - 统一圆角、边框、背景色，与应用整体以同
 * - 完整键盘导航（Arrow / Home / End / Enter / Space / Escape）
 * - ARIA listbox 无障碍支持
 * - 三种尺寸变体：default / compact / inline
 * - 自动翻转方向（当视口下方空间不够时弹出到上方）
 */

export interface SelectOption {
	value: string;
	label: string;
	disabled?: boolean;
}

export interface SelectProps {
	/** 选项列表 */
	options?: SelectOption[];
	/** 当前选中值 */
	value?: string | number | readonly string[];
	/** 值变化回调 - 兼容原生 onChange 签名 */
	onChange?: (event: { target: { value: string } }) => void;
	/** 尺寸变体 */
	variant?: "default" | "compact" | "inline";
	/** 自定义容器类名 */
	containerClassName?: string;
	/** 自定义触发按钮类名 */
	className?: string;
	/** 禁用状态 */
	disabled?: boolean;
	/** 占位文字 */
	placeholder?: string;
	/** 子元素（兼容旧写法，会被忽略如果 options 提供了） */
	children?: ReactNode;
	/** 名称（表单兼容） */
	name?: string;
	/** ID */
	id?: string;
	/** aria-label */
	"aria-label"?: string;
}

function getVariantStyles(variant: SelectProps["variant"]) {
	switch (variant) {
		case "compact":
			return {
				trigger: "px-3 py-1.5 text-xs",
				icon: "w-3 h-3",
				option: "px-3 py-1.5 text-xs",
			};
		case "inline":
			return {
				trigger: "px-3 py-2 text-sm",
				icon: "w-3.5 h-3.5",
				option: "px-3 py-2 text-sm",
			};
		default:
			return {
				trigger: "px-4 py-2.5 text-sm",
				icon: "w-4 h-4",
				option: "px-3.5 py-2.5 text-sm",
			};
	}
}

function SelectComponent(
	{
		options = [],
		value,
		onChange,
		variant = "default",
		containerClassName = "",
		className = "",
		disabled = false,
		placeholder,
		children,
		name,
		id,
		"aria-label": ariaLabel,
	}: SelectProps,
	ref: ForwardedRef<HTMLButtonElement>,
) {
	const [isOpen, setIsOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
	const [flipUp, setFlipUp] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const listboxId = useId();

	// 合并外部 ref 和内部 ref
	const setRefs = useCallback(
		(el: HTMLButtonElement | null) => {
			(triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current =
				el;
			if (typeof ref === "function") ref(el);
			else if (ref)
				(ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
		},
		[ref],
	);

	const variantStyles = getVariantStyles(variant);
	const currentValue = String(value ?? "");

	// 从 children 中解析 <option> 元素（兼容旧写法）
	const resolvedOptions = useMemo(() => {
		if (options && options.length > 0) return options;
		const parsed: SelectOption[] = [];
		Children.forEach(children, (child) => {
			if (
				isValidElement(child) &&
				(child.type === "option" || child.type === "optgroup")
			) {
				if (child.type === "optgroup") {
					// 解析 optgroup 中的 option
					Children.forEach(
						(child as ReactElement<{ children?: ReactNode }>).props.children,
						(groupChild) => {
							if (isValidElement(groupChild) && groupChild.type === "option") {
								const props = groupChild.props as {
									value?: string;
									children?: ReactNode;
									disabled?: boolean;
								};
								parsed.push({
									value: String(props.value ?? ""),
									label: String(props.children ?? ""),
									disabled: props.disabled,
								});
							}
						},
					);
				} else {
					const props = child.props as {
						value?: string;
						children?: ReactNode;
						disabled?: boolean;
					};
					parsed.push({
						value: String(props.value ?? ""),
						label: String(props.children ?? ""),
						disabled: props.disabled,
					});
				}
			}
		});
		return parsed;
	}, [options, children]);

	const selectedOption = useMemo(
		() => resolvedOptions.find((opt) => opt.value === currentValue),
		[resolvedOptions, currentValue],
	);

	const displayLabel = selectedOption?.label || placeholder || "";

	const openDropdown = useCallback(() => {
		if (disabled) return;
		const idx = resolvedOptions.findIndex((opt) => opt.value === currentValue);
		setActiveIndex(idx >= 0 ? idx : 0);
		setIsOpen(true);
	}, [disabled, resolvedOptions, currentValue]);

	const closeDropdown = useCallback(() => {
		setIsOpen(false);
		setActiveIndex(-1);
	}, []);

	const commitByIndex = useCallback(
		(index: number) => {
			const opt = resolvedOptions[index];
			if (!opt || opt.disabled) return;
			onChange?.({ target: { value: opt.value } });
			closeDropdown();
			triggerRef.current?.focus();
		},
		[resolvedOptions, onChange, closeDropdown],
	);

	// 更新定位
	const updatePosition = useCallback(() => {
		const el = triggerRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const dropdownHeight = Math.min(resolvedOptions.length * 40 + 12, 280);
		const spaceBelow = window.innerHeight - rect.bottom - 8;
		const shouldFlipUp = spaceBelow < dropdownHeight && rect.top > spaceBelow;
		setFlipUp(shouldFlipUp);
		setPosition({
			top: shouldFlipUp
				? rect.top + window.scrollY - 8
				: rect.bottom + window.scrollY + 6,
			left: rect.left + window.scrollX,
			width: Math.max(rect.width, 160),
		});
	}, [resolvedOptions.length]);

	useLayoutEffect(() => {
		if (!isOpen) return;
		updatePosition();
	}, [isOpen, updatePosition]);

	useEffect(() => {
		if (!isOpen) return;
		const handleScroll = () => updatePosition();
		const handleResize = () => updatePosition();
		window.addEventListener("scroll", handleScroll, { passive: true });
		window.addEventListener("resize", handleResize);
		return () => {
			window.removeEventListener("scroll", handleScroll);
			window.removeEventListener("resize", handleResize);
		};
	}, [isOpen, updatePosition]);

	// 点击外部关闭
	useEffect(() => {
		if (!isOpen) return;
		const handleMouseDown = (e: MouseEvent) => {
			const target = e.target as Node;
			if (triggerRef.current?.contains(target)) return;
			if (dropdownRef.current?.contains(target)) return;
			closeDropdown();
		};
		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, [isOpen, closeDropdown]);

	// 滚动 active 选项到可视区域
	useEffect(() => {
		if (!isOpen || activeIndex < 0) return;
		const listEl = dropdownRef.current?.querySelector(
			"[data-select-dropdown-scroll]",
		);
		const activeEl = listEl?.children[activeIndex] as HTMLElement | undefined;
		activeEl?.scrollIntoView({ block: "nearest" });
	}, [isOpen, activeIndex]);

	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (!resolvedOptions.length) return;
		switch (event.key) {
			case "ArrowDown": {
				event.preventDefault();
				if (!isOpen) {
					openDropdown();
					return;
				}
				setActiveIndex((prev) => {
					let next = prev + 1;
					while (
						next < resolvedOptions.length &&
						resolvedOptions[next]?.disabled
					)
						next++;
					return next >= resolvedOptions.length ? prev : next;
				});
				return;
			}
			case "ArrowUp": {
				event.preventDefault();
				if (!isOpen) {
					openDropdown();
					return;
				}
				setActiveIndex((prev) => {
					let next = prev - 1;
					while (next >= 0 && resolvedOptions[next]?.disabled) next--;
					return next < 0 ? prev : next;
				});
				return;
			}
			case "Home": {
				if (!isOpen) return;
				event.preventDefault();
				setActiveIndex(0);
				return;
			}
			case "End": {
				if (!isOpen) return;
				event.preventDefault();
				setActiveIndex(resolvedOptions.length - 1);
				return;
			}
			case "Enter":
			case " ": {
				event.preventDefault();
				if (!isOpen) {
					openDropdown();
					return;
				}
				if (activeIndex >= 0) {
					commitByIndex(activeIndex);
				}
				return;
			}
			case "Escape": {
				if (!isOpen) return;
				event.preventDefault();
				closeDropdown();
				triggerRef.current?.focus();
				return;
			}
			case "Tab": {
				if (isOpen) {
					closeDropdown();
				}
				return;
			}
		}
	};

	return (
		<div className={`relative ${containerClassName}`}>
			{/* 隐藏的 input 用于表单兼容 */}
			{name && <input type="hidden" name={name} value={currentValue} />}

			<button
				ref={setRefs}
				type="button"
				id={id}
				role="combobox"
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				aria-controls={listboxId}
				aria-label={ariaLabel}
				disabled={disabled}
				onClick={() => (isOpen ? closeDropdown() : openDropdown())}
				onKeyDown={handleKeyDown}
				className={`
					group relative w-full flex items-center justify-between gap-2
					${variantStyles.trigger}
					bg-cream-50 dark:bg-cream-900
					border border-cream-300 dark:border-cream-500
					rounded-xl
					text-text-primary font-medium
					cursor-pointer
					shadow-[0_1px_2px_rgba(0,0,0,0.03)]
					text-left

					hover:bg-cream-100 dark:hover:bg-cream-800
					hover:border-cream-400 dark:hover:border-cream-500
					hover:shadow-[0_2px_4px_rgba(0,0,0,0.04)]

					focus:outline-none
					focus:ring-2
					focus:ring-primary/10
					focus:border-primary/50

					disabled:opacity-50
					disabled:cursor-not-allowed
					disabled:bg-warm-200 dark:disabled:bg-dark-surface
					disabled:hover:bg-warm-200 dark:disabled:hover:bg-dark-surface
					disabled:hover:border-cream-300 dark:disabled:hover:border-dark-border
					disabled:shadow-none

					transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 ease-out

					${isOpen ? "ring-2 ring-primary/10 border-primary/50" : ""}
					${className}
				`}
			>
				<span
					className={`truncate ${!selectedOption ? "text-text-light" : ""}`}
				>
					{displayLabel}
				</span>
				<ChevronDown
					className={`
						shrink-0 ${variantStyles.icon}
						text-text-light
						transition-transform duration-150
						${isOpen ? "rotate-180" : ""}
					`}
				/>
			</button>

			{isOpen &&
				createPortal(
					<div
						ref={dropdownRef}
						id={listboxId}
						role="listbox"
						tabIndex={-1}
						style={{
							position: "absolute",
							top: flipUp ? undefined : position.top,
							bottom: flipUp
								? window.innerHeight - position.top + 6
								: undefined,
							left: position.left,
							width: position.width,
							zIndex: 9999,
						}}
						className="bg-cream-50 dark:bg-cream-900 rounded-2xl border border-cream-400 dark:border-cream-500 shadow-bai-pop overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col"
					>
						<div
							data-select-dropdown-scroll=""
							className="overflow-y-auto p-1 custom-scrollbar"
							style={{ maxHeight: 280 }}
						>
							{resolvedOptions.map((opt, index) => {
								const isSelected = opt.value === currentValue;
								const isActive = index === activeIndex;
								return (
									<div
										key={opt.value}
										role="option"
										aria-selected={isSelected}
										tabIndex={-1}
										onClick={() => {
											if (!opt.disabled) commitByIndex(index);
										}}
										onMouseEnter={() => setActiveIndex(index)}
										className={`
											${variantStyles.option}
											rounded-lg cursor-pointer transition-colors duration-150
											flex items-center justify-between gap-2
											${opt.disabled ? "opacity-40 cursor-not-allowed" : ""}
											${
												isSelected
													? "bg-cream-200 dark:bg-cream-800 text-text-primary font-medium"
													: isActive
														? "bg-cream-100 dark:bg-cream-800/60 text-text-primary"
														: "text-text-secondary hover:bg-cream-100 dark:hover:bg-cream-800/40"
											}
										`}
									>
										<span className="truncate">{opt.label}</span>
										{isSelected && (
											<Check className="w-3.5 h-3.5 text-primary shrink-0" />
										)}
									</div>
								);
							})}
							{resolvedOptions.length === 0 && (
								<div className="px-3 py-6 text-center text-xs text-text-light">
									暂无选项
								</div>
							)}
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
	SelectComponent,
);

Select.displayName = "Select";

export default Select;
