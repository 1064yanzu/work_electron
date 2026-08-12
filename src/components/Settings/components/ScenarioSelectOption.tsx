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
					? "bg-warm-200 text-text-primary"
					: "text-text-secondary hover:bg-warm-50 hover:text-text-primary",
				isActive && !isSelected ? "bg-warm-50 text-text-primary/70" : "",
			)}
		>
			{renderOption ? (
				renderOption(option)
			) : (
				<div className="flex items-center gap-2 overflow-hidden">
					{option.icon && (
						<option.icon className="w-4 h-4 opacity-60 shrink-0" />
					)}
					<div className="min-w-0">
						<div className="font-medium truncate">{option.label}</div>
						{option.subLabel && (
							<div className="text-xs text-text-light truncate">
								{option.subLabel}
							</div>
						)}
					</div>
				</div>
			)}
			<div className="flex items-center gap-2 shrink-0">
				{option.badge && (
					<span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border bg-warm-200 text-text-muted border-border">
						{option.badge}
					</span>
				)}
				{isSelected && <Check className="w-4 h-4 text-primary" />}
			</div>
		</div>
	);
}
