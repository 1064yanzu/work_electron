/**
 * Memory 上下文文件配色 —— 把"我们维护的三件套"和"SDK 自动加载的 markdown"
 * 用不同的视觉锚点区分开，让用户一眼分得清谁在我们控制下、谁是系统级文件。
 */
import {
	BookHeart,
	FileText,
	FolderOpen,
	Globe,
	type LucideIcon,
	UserCog,
	Wand2,
} from "lucide-react";
import type { MemoryFileToken } from "../../../../lib/agent/memoryStore";

export interface MemoryFileStyle {
	label: string;
	subtitle: string;
	icon: LucideIcon;
	accent: string;
	accentBg: string;
	accentBorder: string;
	accentText: string;
}

export const MEMORY_FILE_STYLES: Record<MemoryFileToken, MemoryFileStyle> = {
	soul: {
		label: "SOUL",
		subtitle: "Agent 人格、语调（用户独占）",
		icon: Wand2,
		accent: "#7268C5",
		accentBg: "bg-violetx-300/20",
		accentBorder: "border-violetx-300/50",
		accentText: "text-violetx-600",
	},
	user: {
		label: "USER",
		subtitle: "用户偏好、习惯、禁用项",
		icon: UserCog,
		accent: "#E8A77A",
		accentBg: "bg-peach-100/70",
		accentBorder: "border-peach-200/80",
		accentText: "text-peach-500",
	},
	memory: {
		label: "MEMORY",
		subtitle: "环境事实、约定、教训",
		icon: BookHeart,
		accent: "#5BA683",
		accentBg: "bg-mint-300/40",
		accentBorder: "border-mint-300/70",
		accentText: "text-mint-600",
	},
	global_claude_md: {
		label: "~/.claude/CLAUDE.md",
		subtitle: "全局用户级 · 影响所有 Claude Code 实例",
		icon: Globe,
		accent: "#B53333",
		accentBg: "bg-[rgba(181,51,51,0.08)]",
		accentBorder: "border-[rgba(181,51,51,0.28)]",
		accentText: "text-error",
	},
	project_claude_md: {
		label: "CLAUDE.md",
		subtitle: "项目级 · 当前对话的工作目录",
		icon: FolderOpen,
		accent: "#6B6B68",
		accentBg: "bg-cream-200",
		accentBorder: "border-cream-400",
		accentText: "text-cream-700",
	},
	project_agents_md: {
		label: "AGENTS.md",
		subtitle: "项目级 · 子 Agent 定义",
		icon: FileText,
		accent: "#8B7FD9",
		accentBg: "bg-violetx-300/30",
		accentBorder: "border-violetx-300/60",
		accentText: "text-violetx-600",
	},
};

export const MEMORY_FILE_ORDER: MemoryFileToken[] = [
	"soul",
	"user",
	"memory",
	"global_claude_md",
	"project_claude_md",
	"project_agents_md",
];
