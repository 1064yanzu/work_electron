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
}

// 类型对应的颜色配置 - 更鲜艳的渐变效果
const CHIP_STYLES: Record<
    SelectedChip["type"],
    {
        bg: string;
        bgExpanded: string;
        border: string;
        text: string;
        icon: string;
    }
> = {
    agent_skill: {
        bg: "bg-gradient-to-r from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/30",
        bgExpanded: "bg-violet-50/80 dark:bg-violet-950/50",
        border: "border-violet-300/50 dark:border-violet-700/50",
        text: "text-violet-700 dark:text-violet-300",
        icon: "text-violet-600 dark:text-violet-400",
    },
    skill: {
        bg: "bg-gradient-to-r from-violet-100 to-violet-50 dark:from-violet-900/40 dark:to-violet-950/30",
        bgExpanded: "bg-violet-50/80 dark:bg-violet-950/50",
        border: "border-violet-300/50 dark:border-violet-700/50",
        text: "text-violet-700 dark:text-violet-300",
        icon: "text-violet-600 dark:text-violet-400",
    },
    prompt: {
        bg: "bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-950/30",
        bgExpanded: "bg-amber-50/80 dark:bg-amber-950/50",
        border: "border-amber-300/50 dark:border-amber-700/50",
        text: "text-amber-700 dark:text-amber-300",
        icon: "text-amber-600 dark:text-amber-400",
    },
    data: {
        bg: "bg-gradient-to-r from-emerald-100 to-emerald-50 dark:from-emerald-900/40 dark:to-emerald-950/30",
        bgExpanded: "bg-emerald-50/80 dark:bg-emerald-950/50",
        border: "border-emerald-300/50 dark:border-emerald-700/50",
        text: "text-emerald-700 dark:text-emerald-300",
        icon: "text-emerald-600 dark:text-emerald-400",
    },
    context: {
        bg: "bg-gradient-to-r from-sky-100 to-sky-50 dark:from-sky-900/40 dark:to-sky-950/30",
        bgExpanded: "bg-sky-50/80 dark:bg-sky-950/50",
        border: "border-sky-300/50 dark:border-sky-700/50",
        text: "text-sky-700 dark:text-sky-300",
        icon: "text-sky-600 dark:text-sky-400",
    },
};

export function SlashCommandChip({
    chip,
    onRemove,
    onToggleExpand,
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
            className="inline-flex flex-col max-w-full"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* 紧凑卡片头 - 类似图2样式 */}
            <div
                className={`
					inline-flex items-center gap-1.5 px-2.5 py-1.5 
					rounded-lg border shadow-sm backdrop-blur-sm
					transition-all duration-200 cursor-pointer
					${styles.bg} ${styles.border}
					hover:shadow-md hover:scale-[1.02]
				`}
                onClick={() => canExpand && onToggleExpand?.(chip.id)}
            >
                {/* 图标 */}
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${styles.icon}`} />

                {/* 名称 */}
                <span className={`text-sm font-medium ${styles.text} truncate max-w-[180px]`}>
                    {chip.command.name}
                </span>

                {/* 展开/收起箭头（仅 prompt） */}
                {canExpand && (
                    <span className={`${styles.icon} opacity-70`}>
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
						p-0.5 rounded transition-all flex-shrink-0
						${isHovered ? "opacity-100" : "opacity-0"}
						text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300
						hover:bg-white/60 dark:hover:bg-zinc-700/60
					`}
                    title="移除"
                >
                    <X className="w-3 h-3" />
                </button>
            </div>

            {/* 展开内容区域（仅 prompt 且已展开） */}
            {canExpand && chip.isExpanded && (
                <div
                    className={`
						mt-2 px-3 py-2.5 rounded-lg border text-xs leading-relaxed
						${styles.bgExpanded} ${styles.border} ${styles.text}
						max-h-[150px] overflow-y-auto shadow-inner
						animate-in slide-in-from-top-1 fade-in duration-200
					`}
                >
                    <pre className="whitespace-pre-wrap font-sans m-0">
                        {chip.content}
                    </pre>
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
}

export function SlashCommandChipList({
    chips,
    onRemove,
    onToggleExpand,
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
                />
            ))}
        </div>
    );
}
