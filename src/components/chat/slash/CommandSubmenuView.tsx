/**
 * Claude Code 风格斜杠命令 —— 三级子菜单视图（T7.3）。
 *
 * 职责：
 * - 渲染 `kind === "submenu"` 命令的子选项列表（如 /mode 的 plan/code、/model 的模型列表）；
 * - 键盘导航：↑↓ 循环、Enter 选中、Backspace（过滤为空）回退；
 * - 子选项可独立禁用（`option.availability.state === "disabled"`）。
 *
 * 约束：
 * - 不调用 executor；选中后通过 `onPick` 抛事件；
 * - 空列表时渲染空态文案并吃掉 Enter。
 */

import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	SlashCommandDefinition,
	SlashCommandSubOption,
} from "../../../lib/slashCommands";
import { SLASH_MESSAGES } from "../../../lib/slashCommands";

interface CommandSubmenuViewProps {
	definition: SlashCommandDefinition;
	options: SlashCommandSubOption[];
	filter: string;
	onPick: (option: SlashCommandSubOption) => void;
	onBack: () => void;
}

function isOptionAvailable(option: SlashCommandSubOption): boolean {
	if (!option.availability) return true;
	return option.availability.state === "available";
}

export function CommandSubmenuView({
	definition,
	options,
	filter,
	onPick,
	onBack,
}: CommandSubmenuViewProps) {
	const [activeIndex, setActiveIndex] = useState(0);
	const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

	// 按 filter 过滤子选项（模糊匹配 id / label / description）
	const qLower = filter.trim().toLowerCase();
	const filteredOptions = qLower
		? options.filter((o) => {
				return (
					o.id.toLowerCase().includes(qLower) ||
					o.label.toLowerCase().includes(qLower) ||
					(o.description ?? "").toLowerCase().includes(qLower)
				);
			})
		: options;

	// filter 变化时重置 activeIndex
	useEffect(() => {
		setActiveIndex(0);
	}, [filter]);

	// 滚动到 active
	useEffect(() => {
		const active = filteredOptions[activeIndex];
		if (!active) return;
		const el = itemRefs.current[active.id];
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "nearest" });
		}
	}, [activeIndex, filteredOptions]);

	const commit = useCallback(
		(option: SlashCommandSubOption) => {
			if (!isOptionAvailable(option)) return;
			onPick(option);
		},
		[onPick],
	);

	// 键盘导航
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (filteredOptions.length === 0) {
				// 空列表：Backspace 过滤为空时回退
				if (e.key === "Backspace" && !filter) {
					e.preventDefault();
					onBack();
				}
				return;
			}
			switch (e.key) {
				case "ArrowUp":
					e.preventDefault();
					setActiveIndex((prev) =>
						prev > 0 ? prev - 1 : filteredOptions.length - 1,
					);
					break;
				case "ArrowDown":
					e.preventDefault();
					setActiveIndex((prev) =>
						prev < filteredOptions.length - 1 ? prev + 1 : 0,
					);
					break;
				case "Enter": {
					e.preventDefault();
					const option = filteredOptions[activeIndex];
					if (option) commit(option);
					break;
				}
				case "Backspace":
					if (!filter) {
						e.preventDefault();
						onBack();
					}
					break;
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [filteredOptions, activeIndex, filter, onBack, commit]);

	return (
		<div>
			<div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
				<div
					role="button"
					tabIndex={-1}
					onClick={onBack}
					className="w-7 h-7 flex items-center justify-center text-text-muted hover:text-text-secondary hover:bg-warm-200 rounded-lg transition-colors duration-150 active:scale-95 cursor-pointer select-none"
					title="返回上一级"
				>
					<ArrowLeft className="w-4 h-4" />
				</div>
				<div className="flex items-center gap-2 min-w-0">
					<span className="font-mono text-xs text-text-light">
						/{definition.id}
					</span>
					<span className="text-sm font-medium text-text-primary truncate">
						{definition.name}
					</span>
				</div>
			</div>

			<div className="max-h-[300px] overflow-y-auto">
				{filteredOptions.length === 0 ? (
					<div className="px-4 py-8 text-center">
						<p className="text-sm text-text-muted">
							{SLASH_MESSAGES.empty.noMatch}
						</p>
					</div>
				) : (
					<div className="px-1.5 py-1" role="listbox">
						{filteredOptions.map((option, index) => {
							const isSelected = index === activeIndex;
							const disabled = !isOptionAvailable(option);
							return (
								<div
									key={option.id}
									ref={(el) => {
										itemRefs.current[option.id] = el;
									}}
									role="option"
									aria-selected={isSelected}
									aria-disabled={disabled}
									tabIndex={-1}
									onClick={() => commit(option)}
									onMouseEnter={() => setActiveIndex(index)}
									className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-left select-none transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-120 ease-out
                    ${isSelected ? "bg-warm-200" : ""}
                    ${disabled ? "opacity-45 cursor-not-allowed" : "cursor-pointer"}`}
								>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium truncate text-text-primary">
											{option.label}
										</div>
										{option.description && (
											<div className="text-xs truncate text-text-light mt-0.5">
												{option.description}
											</div>
										)}
									</div>
									{isSelected && !disabled && (
										<span className="text-2xs font-mono text-text-light flex-shrink-0">
											↵
										</span>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>

			<div className="px-4 py-1.5 border-t border-border">
				<div className="flex items-center justify-center gap-4 text-2xs text-text-light">
					<span className="flex items-center gap-1">
						<span className="font-mono text-2xs">⌫</span>
						<span>返回</span>
					</span>
					<span className="flex items-center gap-1">
						<span className="font-mono text-2xs">↵</span>
						<span>选择</span>
					</span>
					<span className="flex items-center gap-1">
						<span className="font-mono text-2xs">esc</span>
						<span>关闭</span>
					</span>
				</div>
			</div>
		</div>
	);
}
