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

// 类型样式统一为中性 pill —— Claude/Codex 式克制：类型区分交给图标形状与名称，
// 不给每类功能各配一个色相（五色 chip 是视觉噪音，也和签名色抢注意力）
const NEUTRAL_CHIP_STYLE = {
	bg: "bg-warm-200/70",
	bgExpanded: "bg-warm-200/40",
	border: "border-border",
	text: "text-text-secondary",
	icon: "text-text-secondary",
	ring: "ring-border/60",
} as const;

const CHIP_STYLES: Record<SelectedChip["type"], typeof NEUTRAL_CHIP_STYLE> = {
	agent_skill: NEUTRAL_CHIP_STYLE,
	skill: NEUTRAL_CHIP_STYLE,
	prompt: NEUTRAL_CHIP_STYLE,
	data: NEUTRAL_CHIP_STYLE,
	context: NEUTRAL_CHIP_STYLE,
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
			className={`${chip.isExpanded ? "w-full" : "inline-flex max-w-full"} flex flex-col select-none transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150`}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* 紧凑卡片头 — pill-shaped */}
			<div
				className={`
					inline-flex items-center gap-1.5 px-2.5 py-1
					rounded-full border shadow-sm self-start
					transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 cursor-pointer
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
						p-0.5 rounded transition-[color,background-color,border-color,opacity,box-shadow,transform] flex-shrink-0 ml-0.5
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
						shadow-sm animate-in slide-in-from-top-1 fade-in duration-150
					`}
					onClick={(e) => e.stopPropagation()}
				>
					<textarea
						value={chip.content}
						onChange={(e) => onUpdate?.(chip.id, e.target.value)}
						className={`
                            w-full min-h-[150px] max-h-[500px] resize-y bg-transparent 
                            focus:outline-none placeholder-text-muted p-1
                            font-sans
                        `}
						placeholder="在此编辑提示词内容..."
						onClick={(e) => e.stopPropagation()}
					/>
					<div className="text-2xs opacity-50 mt-1 text-right">
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
		<div className="flex flex-wrap gap-1.5 px-2.5 pt-2.5 pb-0">
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
