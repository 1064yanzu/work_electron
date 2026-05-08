import {
	Bolt,
	ClipboardList,
	Lightbulb,
	Link2,
	type LucideIcon,
	Pin,
	RotateCw,
} from "lucide-react";
import type { MemoryCategory } from "../../../../lib/agent/memoryStore";

/**
 * Memory 分类配色 — 每个类别一个独立 accent，建立强视觉区分。
 *
 * accent: 用作 ribbon / icon / 角标的彩色锚点
 * accentBg: hover/active 时的浅背景
 */
export interface MemoryCategoryStyle {
	label: string;
	icon: LucideIcon;
	accent: string;
	accentBg: string;
	accentBorder: string;
	accentText: string;
}

export const MEMORY_CATEGORY_STYLES: Record<
	MemoryCategory,
	MemoryCategoryStyle
> = {
	instruction: {
		label: "指令",
		icon: Bolt,
		accent: "var(--t-primary, #1A1A19)",
		accentBg: "bg-primary/10",
		accentBorder: "border-primary/30",
		accentText: "text-primary",
	},
	preference: {
		label: "偏好",
		icon: Lightbulb,
		accent: "#8B7FD9",
		accentBg: "bg-violetx-300/30",
		accentBorder: "border-violetx-300/60",
		accentText: "text-violetx-600",
	},
	fact: {
		label: "事实",
		icon: Pin,
		accent: "#5BA683",
		accentBg: "bg-mint-300/40",
		accentBorder: "border-mint-300/70",
		accentText: "text-mint-600",
	},
	context: {
		label: "上下文",
		icon: Link2,
		accent: "#E8A77A",
		accentBg: "bg-peach-100/70",
		accentBorder: "border-peach-200/80",
		accentText: "text-peach-500",
	},
	task_result: {
		label: "历史结果",
		icon: ClipboardList,
		accent: "#6B6B68",
		accentBg: "bg-cream-200",
		accentBorder: "border-cream-400",
		accentText: "text-cream-700",
	},
	user_habit: {
		label: "习惯",
		icon: RotateCw,
		accent: "#7268C5",
		accentBg: "bg-violetx-300/20",
		accentBorder: "border-violetx-300/50",
		accentText: "text-violetx-600",
	},
};

export const MEMORY_CATEGORY_OPTIONS: Array<{
	value: MemoryCategory;
	label: string;
}> = (
	Object.entries(MEMORY_CATEGORY_STYLES) as Array<
		[MemoryCategory, MemoryCategoryStyle]
	>
).map(([value, style]) => ({
	value,
	label: style.label,
}));
