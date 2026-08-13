/**
 * Memory 上下文文件视觉配置 —— 图标区分文件类型。
 * 配色收敛为中性（text-text-muted + bg-warm-200 容器），选中态由调用方用 primary 表达；
 * 唯一保留语义色的是全局 CLAUDE.md（影响面最大，用 error 提示谨慎编辑）。
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
	accentBg: string;
	accentBorder: string;
	accentText: string;
}

const NEUTRAL_STYLE = {
	accentBg: "bg-warm-200",
	accentBorder: "border-border",
	accentText: "text-text-muted",
};

export const MEMORY_FILE_STYLES: Record<MemoryFileToken, MemoryFileStyle> = {
	soul: {
		label: "SOUL",
		subtitle: "Agent 人格、语调（用户独占）",
		icon: Wand2,
		...NEUTRAL_STYLE,
	},
	user: {
		label: "USER",
		subtitle: "用户偏好、习惯、禁用项",
		icon: UserCog,
		...NEUTRAL_STYLE,
	},
	memory: {
		label: "MEMORY",
		subtitle: "环境事实、约定、教训",
		icon: BookHeart,
		...NEUTRAL_STYLE,
	},
	global_claude_md: {
		label: "~/.claude/CLAUDE.md",
		subtitle: "全局用户级 · 影响所有 Claude Code 实例",
		icon: Globe,
		accentBg: "bg-error/8",
		accentBorder: "border-error/30",
		accentText: "text-error",
	},
	project_claude_md: {
		label: "CLAUDE.md",
		subtitle: "项目级 · 当前对话的工作目录",
		icon: FolderOpen,
		...NEUTRAL_STYLE,
	},
	project_agents_md: {
		label: "AGENTS.md",
		subtitle: "项目级 · 子 Agent 定义",
		icon: FileText,
		...NEUTRAL_STYLE,
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
