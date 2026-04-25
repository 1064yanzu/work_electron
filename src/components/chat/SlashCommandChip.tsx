// 斜杠命令卡片组件 - 输入框内紧凑卡片样式
// 参考设计：图2中的 "📝 一图流 ˅" 样式

import { ChevronDown, ChevronUp, X, Zap } from "lucide-react";
import { useState, type ComponentType } from "react";
import type { SlashCommand } from "./SlashCommand";

// 已选择的命令卡片类型
export interface SelectedChip {
	id: string;
	type: "skill" | "prompt" | "data" | "context" | "agent_skill";
	command: SlashCommand;
	isExpanded?: boolean;
	content?: string; // 完整内容（提示词内容或 skill 描述）
	skillName?: string; // Agent Skill 名称（用于强制执行）
}

interface SlashCommandChipProps {
	chip: SelectedChip;
	onRemove: (id: string) => void;
	onToggleExpand?: (id: string) => void;
	onUpdate?: (id: string, content: string) => void;
}

// ... styles definition remains same ...

// 类型对应的颜色配置 - 高级质感配色（仿 Notion/Claude 标签）
const CHIP_STYLES: Record<
	SelectedChip["type"],
	{
		bg: string;
		bgExpanded: string;
		border: string;
		text: string;
		icon: string;
		ring: string;
	}
> = {
	agent_skill: {
		bg: "bg-violet-50 dark:bg-violet-500/10",
		bgExpanded: "bg-violet-50/50 dark:bg-violet-500/10",
		border: "border-violet-200 dark:border-violet-500/20",
		text: "text-violet-700 dark:text-violet-300",
		icon: "text-violet-600 dark:text-violet-400",
		ring: "ring-violet-200/50 dark:ring-violet-500/20",
	},
	skill: {
		bg: "bg-indigo-50 dark:bg-indigo-500/10",
		bgExpanded: "bg-indigo-50/50 dark:bg-indigo-500/10",
		border: "border-indigo-200 dark:border-indigo-500/20",
		text: "text-indigo-700 dark:text-indigo-300",
		icon: "text-indigo-600 dark:text-indigo-400",
		ring: "ring-indigo-200/50 dark:ring-indigo-500/20",
	},
	prompt: {
		// 使用更柔和的黄色/橙色
		bg: "bg-orange-50 dark:bg-orange-500/10",
		bgExpanded: "bg-orange-50/50 dark:bg-orange-500/10",
		border: "border-orange-200 dark:border-orange-500/20",
		text: "text-orange-700 dark:text-orange-300",
		icon: "text-orange-600 dark:text-orange-400",
		ring: "ring-orange-200/50 dark:ring-orange-500/20",
	},
	data: {
		bg: "bg-emerald-50 dark:bg-emerald-500/10",
		bgExpanded: "bg-emerald-50/50 dark:bg-emerald-500/10",
		border: "border-emerald-200 dark:border-emerald-500/20",
		text: "text-emerald-700 dark:text-emerald-300",
		icon: "text-emerald-600 dark:text-emerald-400",
		ring: "ring-emerald-200/50 dark:ring-emerald-500/20",
	},
	context: {
		bg: "bg-sky-50 dark:bg-sky-500/10",
		bgExpanded: "bg-sky-50/50 dark:bg-sky-500/10",
		border: "border-sky-200 dark:border-sky-500/20",
		text: "text-sky-700 dark:text-sky-300",
		icon: "text-sky-600 dark:text-sky-400",
		ring: "ring-sky-200/50 dark:ring-sky-500/20",
	},
};

export function SlashCommandChip({
	chip,
	onRemove,
	onToggleExpand,
	onUpdate,
}: SlashCommandChipProps) {
	const [isHovered, setIsHovered] = useState(false);
	const styles = CHIP_STYLES[chip.type];

	// 使用命令的图标或默认 Zap 图标（Agent Skill 用 Zap）
	const Icon: ComponentType<{ className?: string }> =
		chip.type === "agent_skill" ? Zap : chip.command.icon;

	// 只有提示词类型可以展开
	const canExpand = chip.type === "prompt" && chip.content;

	return (
		<div
			className={`${chip.isExpanded ? "w-full" : "inline-flex max-w-full"} flex flex-col select-none transition-all duration-200`}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* 紧凑卡片头 */}
			<div
				className={`
					inline-flex items-center gap-1.5 px-2 py-1 
					rounded-md border shadow-sm self-start
					transition-all duration-200 cursor-pointer
					${styles.bg} ${styles.border} ${styles.ring}
					hover:shadow hover:ring-2 hover:scale-[1.01]
				`}
				onClick={() => canExpand && onToggleExpand?.(chip.id)}
			>
				{/* 图标与名称容器 */}
				<div className="flex items-center gap-1.5 min-w-0">
					<Icon className={`w-3.5 h-3.5 flex-shrink-0 ${styles.icon}`} />

					<span
						className={`text-xs font-medium ${styles.text} truncate max-w-[150px]`}
					>
						{chip.command.name}
					</span>
				</div>

				{/* 展开/收起箭头（仅 prompt） */}
				{canExpand && (
					<span className={`${styles.icon} opacity-60 flex-shrink-0`}>
						{chip.isExpanded ? (
							<ChevronUp className="w-3 h-3" />
						) : (
							<ChevronDown className="w-3 h-3" />
						)}
					</span>
				)}

				{/* 删除按钮 */}
				<button
					onClick={(e) => {
						e.stopPropagation();
						onRemove(chip.id);
					}}
					className={`
						p-0.5 rounded transition-all flex-shrink-0 ml-0.5
						${isHovered ? "opacity-100 w-4 scale-100" : "opacity-0 w-0 scale-50 overflow-hidden"}
						text-text-light hover:text-text-secondary dark:hover:text-text-light
						hover:bg-black/5 dark:hover:bg-surface/10
					`}
					title="移除"
				>
					<X className="w-3 h-3" />
				</button>
			</div>

			{/* 展开内容区域（仅 prompt 且已展开）- 支持编辑 */}
			{canExpand && chip.isExpanded && (
				<div
					className={`
						mt-2 px-3 py-2 rounded-lg border text-sm leading-relaxed w-full
						${styles.bgExpanded} ${styles.border} ${styles.text}
						shadow-sm animate-in slide-in-from-top-1 fade-in duration-200
					`}
					onClick={(e) => e.stopPropagation()}
				>
					<textarea
						value={chip.content}
						onChange={(e) => onUpdate?.(chip.id, e.target.value)}
						className={`
                            w-full min-h-[150px] max-h-[500px] resize-y bg-transparent 
                            focus:outline-none placeholder-zinc-400 p-1
                            scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-600
                            font-sans
                        `}
						placeholder="在此编辑提示词内容..."
						onClick={(e) => e.stopPropagation()}
					/>
					<div className="text-[10px] opacity-50 mt-1 text-right">
						支持编辑 • 发送时将包含修改后的内容
					</div>
				</div>
			)}
		</div>
	);
}

// 输入框内卡片列表 - 放在 textarea 上方
interface SlashCommandChipListProps {
	chips: SelectedChip[];
	onRemove: (id: string) => void;
	onToggleExpand: (id: string) => void;
	onUpdate?: (id: string, content: string) => void;
}

export function SlashCommandChipList({
	chips,
	onRemove,
	onToggleExpand,
	onUpdate,
}: SlashCommandChipListProps) {
	if (chips.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-2 px-4 py-3">
			{chips.map((chip) => (
				<SlashCommandChip
					key={chip.id}
					chip={chip}
					onRemove={onRemove}
					onToggleExpand={onToggleExpand}
					onUpdate={onUpdate}
				/>
			))}
		</div>
	);
}
