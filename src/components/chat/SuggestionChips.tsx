// 建议 Chips 横向滚动条 — 聚焦时展示
// 参考 Command Palette 设计：pill-shaped chips, 横向可滚动

import { BookOpen, Wand2 } from "lucide-react";
import { useRef, useEffect, type ComponentType } from "react";

export interface SuggestionChipItem {
	id: string;
	label: string;
	icon: ComponentType<{ className?: string }>;
	action: () => void;
	accent?: string; // accent color class
}

interface SuggestionChipsProps {
	chips: SuggestionChipItem[];
	visible: boolean;
}

// 默认建议 chips — 常用操作
export function getDefaultSuggestionChips(
	onSlash: () => void,
	onPromptLibrary?: () => void,
): SuggestionChipItem[] {
	return [
		{
			id: "slash",
			label: "命令",
			icon: Wand2,
			action: onSlash,
			accent: "text-violet-600 dark:text-violet-400",
		},
		...(onPromptLibrary
			? [
					{
						id: "prompt-lib",
						label: "提示词库",
						icon: BookOpen,
						action: onPromptLibrary,
						accent: "text-amber-600 dark:text-amber-400",
					},
				]
			: []),
	];
}

export function SuggestionChips({ chips, visible }: SuggestionChipsProps) {
	const scrollRef = useRef<HTMLDivElement>(null);

	// 重置滚动位置
	useEffect(() => {
		if (visible && scrollRef.current) {
			scrollRef.current.scrollLeft = 0;
		}
	}, [visible]);

	return (
		<div
			className={`
				overflow-hidden transition-all duration-300 ease-out
				${visible ? "max-h-12 opacity-100 mt-1" : "max-h-0 opacity-0 mt-0"}
			`}
		>
			<div
				ref={scrollRef}
				className="flex items-center gap-1.5 px-4 py-1.5 overflow-x-auto scrollbar-hide"
			>
				{chips.map((chip) => {
					const Icon = chip.icon;
					return (
						<button
							key={chip.id}
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								chip.action();
							}}
							className={`
								shrink-0 inline-flex items-center gap-1.5
								px-3 py-1.5 rounded-full
								bg-warm-200/60 dark:bg-zinc-700/60
								hover:bg-warm-300/60 dark:hover:bg-zinc-600/60
								border border-transparent hover:border-border/50
								text-xs font-medium text-text-secondary
								hover:text-text-primary dark:hover:text-zinc-100
								transition-all duration-150 cursor-pointer
								active:scale-[0.97]
								whitespace-nowrap select-none
							`}
						>
							<Icon
								className={`w-3 h-3 ${chip.accent || "text-text-muted"}`}
							/>
							{chip.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
