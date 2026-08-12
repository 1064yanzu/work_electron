/**
 * 统一的 SourceType 配置中心
 * 集中管理每种资料类型的图标、颜色、标签
 */

import {
	Archive,
	BookOpen,
	Code2,
	FileSpreadsheet,
	FileText,
	Globe,
	Image,
	Music,
	Presentation,
	Video,
} from "lucide-react";
import type { ComponentType } from "react";
import { SourceType } from "../types";

export interface SourceTypeConfigItem {
	icon: ComponentType<{ className?: string }>;
	label: string;
	/** 用于列表/卡片的小色点 */
	dotColor: string;
	/** 用于背景渐变 */
	bgGradient: string;
	/** 图标文本色 */
	iconColor: string;
}

export const sourceTypeConfig: Record<string, SourceTypeConfigItem> = {
	[SourceType.Web]: {
		icon: Globe,
		label: "网页",
		dotColor: "bg-blue-500",
		bgGradient:
			"from-blue-500/10 to-sky-500/10 border-blue-200/50 dark:border-blue-800/30",
		iconColor: "text-blue-600 dark:text-blue-400",
	},
	[SourceType.Text]: {
		icon: FileText,
		label: "文本",
		dotColor: "bg-emerald-500",
		bgGradient:
			"from-emerald-500/10 to-green-500/10 border-emerald-200/50 dark:border-emerald-800/30",
		iconColor: "text-emerald-600 dark:text-emerald-400",
	},
	[SourceType.Document]: {
		icon: FileText,
		label: "文档",
		dotColor: "bg-orange-500",
		bgGradient:
			"from-orange-500/10 to-amber-500/10 border-orange-200/50 dark:border-orange-800/30",
		iconColor: "text-orange-600 dark:text-orange-400",
	},
	[SourceType.Pdf]: {
		icon: BookOpen,
		label: "PDF",
		dotColor: "bg-red-500",
		bgGradient:
			"from-red-500/10 to-rose-500/10 border-red-200/50 dark:border-red-800/30",
		iconColor: "text-red-600 dark:text-red-400",
	},
	[SourceType.Image]: {
		icon: Image,
		label: "图片",
		dotColor: "bg-pink-500",
		bgGradient:
			"from-pink-500/10 to-fuchsia-500/10 border-pink-200/50 dark:border-pink-800/30",
		iconColor: "text-pink-600 dark:text-pink-400",
	},
	[SourceType.Audio]: {
		icon: Music,
		label: "音频",
		dotColor: "bg-purple-500",
		bgGradient:
			"from-purple-500/10 to-violet-500/10 border-purple-200/50 dark:border-purple-800/30",
		iconColor: "text-purple-600 dark:text-purple-400",
	},
	[SourceType.Video]: {
		icon: Video,
		label: "视频",
		dotColor: "bg-indigo-500",
		bgGradient:
			"from-indigo-500/10 to-blue-500/10 border-indigo-200/50 dark:border-indigo-800/30",
		iconColor: "text-indigo-600 dark:text-indigo-400",
	},
	[SourceType.Code]: {
		icon: Code2,
		label: "代码",
		dotColor: "bg-teal-500",
		bgGradient:
			"from-teal-500/10 to-cyan-500/10 border-teal-200/50 dark:border-teal-800/30",
		iconColor: "text-teal-600 dark:text-teal-400",
	},
	[SourceType.Spreadsheet]: {
		icon: FileSpreadsheet,
		label: "表格",
		dotColor: "bg-cyan-500",
		bgGradient:
			"from-cyan-500/10 to-teal-500/10 border-cyan-200/50 dark:border-cyan-800/30",
		iconColor: "text-cyan-600 dark:text-cyan-400",
	},
	[SourceType.Presentation]: {
		icon: Presentation,
		label: "演示",
		dotColor: "bg-amber-500",
		bgGradient:
			"from-amber-500/10 to-yellow-500/10 border-amber-200/50 dark:border-amber-800/30",
		iconColor: "text-amber-600 dark:text-amber-400",
	},
	[SourceType.Archive]: {
		icon: Archive,
		label: "压缩包",
		dotColor: "bg-cream-500",
		bgGradient:
			"from-cream-500/10 to-cream-500/10 border-cream-200/50 dark:border-cream-800/30",
		iconColor: "text-cream-600 dark:text-cream-400",
	},
};

/** 获取指定类型的配置，未知类型返回默认值 */
export function getSourceTypeConfig(kind: string): SourceTypeConfigItem {
	return (
		sourceTypeConfig[kind] ?? {
			icon: FileText,
			label: "文件",
			dotColor: "bg-cream-400",
			bgGradient:
				"from-cream-500/10 to-cream-400/10 border-cream-200/50 dark:border-cream-800/30",
			iconColor: "text-cream-500 dark:text-cream-400",
		}
	);
}
