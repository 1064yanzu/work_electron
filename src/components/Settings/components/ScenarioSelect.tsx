import { ChevronDown } from "lucide-react";
import {
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../../lib/utils";
import {
	ScenarioSelectOption,
	type ScenarioSelectOptionItem,
} from "./ScenarioSelectOption";
export type { ScenarioSelectOptionItem } from "./ScenarioSelectOption";

export interface ScenarioSelectGroup {
	label: string;
	items: ScenarioSelectOptionItem[];
}

interface ScenarioSelectProps {
	options?: ScenarioSelectOptionItem[];
	groups?: ScenarioSelectGroup[];
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	label?: string;
	renderOption?: (option: ScenarioSelectOptionItem) => ReactNode;
}

export function ScenarioSelect({
	options,
	groups,
	value,
	onChange,
	placeholder = "请选择...",
	label,
	renderOption,
}: ScenarioSelectProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
	const [activeIndex, setActiveIndex] = useState(-1);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const listboxId = useId();

	const flatOptions = useMemo(() => {
		if (options) return options;
		if (groups) return groups.flatMap((group) => group.items);
		return [];
	}, [options, groups]);

	const selectedOption = useMemo(
		() => flatOptions.find((option) => option.value === value) || null,
		[flatOptions, value],
	);

	const openDropdown = () => {
		const selectedIndex = flatOptions.findIndex(
			(option) => option.value === value,
		);
		setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
		setIsOpen(true);
	};

	const closeDropdown = () => {
		setIsOpen(false);
		setActiveIndex(-1);
	};

	const commitByIndex = (index: number) => {
		const option = flatOptions[index];
		if (!option) return;
		onChange(option.value);
		closeDropdown();
	};

	const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (!flatOptions.length) return;
		switch (event.key) {
			case "ArrowDown": {
				event.preventDefault();
				if (!isOpen) {
					openDropdown();
					return;
				}
				setActiveIndex((prev) => {
					const next = prev < 0 ? 0 : prev + 1;
					return next >= flatOptions.length ? 0 : next;
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
					const next = prev < 0 ? flatOptions.length - 1 : prev - 1;
					return next < 0 ? flatOptions.length - 1 : next;
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
				setActiveIndex(flatOptions.length - 1);
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
		}
	};

	useEffect(() => {
		if (!isOpen || !triggerRef.current) return;
		const updatePosition = () => {
			const rect = triggerRef.current?.getBoundingClientRect();
			if (!rect) return;
			setPosition({
				top: rect.bottom + window.scrollY + 8,
				left: rect.left + window.scrollX,
				width: rect.width,
			});
		};
		updatePosition();
		window.addEventListener("scroll", updatePosition, { passive: true });
		window.addEventListener("resize", updatePosition);
		return () => {
			window.removeEventListener("scroll", updatePosition);
			window.removeEventListener("resize", updatePosition);
		};
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			if (triggerRef.current?.contains(target)) return;
			if (target.closest("[data-scenario-select-dropdown]")) return;
			closeDropdown();
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [isOpen]);

	return (
		<>
			<button
				type="button"
				ref={triggerRef}
				onClick={() => (isOpen ? closeDropdown() : openDropdown())}
				onKeyDown={handleTriggerKeyDown}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				aria-controls={listboxId}
				className={cn(
					"group relative w-full bg-zinc-50 hover:bg-white dark:bg-zinc-900 dark:hover:bg-zinc-800",
					"border border-zinc-200 dark:border-zinc-700 transition-colors duration-200 rounded-xl px-3 py-2.5",
					"cursor-pointer flex items-center justify-between focus-ring",
					isOpen
						? "ring-2 ring-zinc-900/5 border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800"
						: "",
				)}
			>
				<div className="flex items-center gap-2 min-w-0">
					{selectedOption?.icon && (
						<selectedOption.icon className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
					)}
					<div className="flex flex-col items-start truncate">
						{label && (
							<span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wider mb-0.5">
								{label}
							</span>
						)}
						<span
							className={cn(
								"text-sm truncate font-medium",
								value
									? "text-zinc-900 dark:text-zinc-100"
									: "text-zinc-400 dark:text-zinc-500",
							)}
						>
							{selectedOption ? selectedOption.label : placeholder}
						</span>
					</div>
				</div>
				<ChevronDown
					className={cn(
						"w-4 h-4 text-zinc-300 group-hover:text-zinc-500 dark:text-zinc-500 dark:group-hover:text-zinc-300 transition-transform duration-200",
						isOpen ? "rotate-180" : "",
					)}
				/>
			</button>

			{isOpen &&
				createPortal(
					<div
						data-scenario-select-dropdown
						id={listboxId}
						role="listbox"
						tabIndex={-1}
						style={{
							position: "absolute",
							top: position.top,
							left: position.left,
							width: position.width,
							zIndex: 9999,
						}}
						className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-xl max-h-[300px] overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col"
					>
						<div className="flex-1 overflow-y-auto p-1 custom-scrollbar">
							{groups ? (
								groups.map((group) => (
									<div key={group.label} className="mb-1 last:mb-0">
										<div className="px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/60 rounded-lg mb-1">
											{group.label} ({group.items.length})
										</div>
										<div className="space-y-0.5 pl-1">
											{group.items.map((option) => {
												const optionIndex = flatOptions.findIndex(
													(item) => item.value === option.value,
												);
												return (
													<ScenarioSelectOption
														key={option.value}
														option={option}
														isSelected={value === option.value}
														isActive={activeIndex === optionIndex}
														onMouseEnter={() => setActiveIndex(optionIndex)}
														onClick={() => commitByIndex(optionIndex)}
														renderOption={renderOption}
													/>
												);
											})}
										</div>
									</div>
								))
							) : flatOptions.length === 0 ? (
								<div className="px-3 py-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
									暂无选项
								</div>
							) : (
								flatOptions.map((option, optionIndex) => (
									<ScenarioSelectOption
										key={option.value}
										option={option}
										isSelected={value === option.value}
										isActive={activeIndex === optionIndex}
										onMouseEnter={() => setActiveIndex(optionIndex)}
										onClick={() => commitByIndex(optionIndex)}
										renderOption={renderOption}
									/>
								))
							)}
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}
