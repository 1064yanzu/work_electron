import { Check } from "lucide-react";
import type { ElementType, ReactNode } from "react";
import { cn } from "../../../lib/utils";

export interface ScenarioSelectOptionItem {
	label: string;
	value: string;
	subLabel?: string;
	icon?: ElementType;
	badge?: string;
}

interface ScenarioSelectOptionProps {
	option: ScenarioSelectOptionItem;
	isSelected: boolean;
	isActive: boolean;
	onClick: () => void;
	onMouseEnter: () => void;
	renderOption?: (option: ScenarioSelectOptionItem) => ReactNode;
}

export function ScenarioSelectOption({
	option,
	isSelected,
	isActive,
	onClick,
	onMouseEnter,
	renderOption,
}: ScenarioSelectOptionProps) {
	return (
		<div
			role="option"
			aria-selected={isSelected}
			tabIndex={-1}
			onClick={onClick}
			onMouseEnter={onMouseEnter}
			className={cn(
				"px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors",
				"flex items-center justify-between group",
				isSelected
					? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
					: "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
				isActive && !isSelected
					? "bg-zinc-50 text-zinc-900 dark:bg-zinc-800/70 dark:text-zinc-100"
					: "",
			)}
		>
			{renderOption ? (
				renderOption(option)
			) : (
				<div className="flex items-center gap-2 overflow-hidden">
					{option.icon && <option.icon className="w-4 h-4 opacity-60 shrink-0" />}
					<div className="min-w-0">
						<div className="font-medium truncate">{option.label}</div>
						{option.subLabel && (
							<div className="text-xs text-zinc-400 truncate dark:text-zinc-500">
								{option.subLabel}
							</div>
						)}
					</div>
				</div>
			)}
			<div className="flex items-center gap-2 shrink-0">
				{option.badge && (
					<span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700">
						{option.badge}
					</span>
				)}
				{isSelected && <Check className="w-4 h-4 text-primary" />}
			</div>
		</div>
	);
}
