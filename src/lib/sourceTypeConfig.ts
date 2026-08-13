/**
 * 统一的 SourceType 配置中心
 * 集中管理每种资料类型的图标、颜色、标签
 *
 * 色彩收敛：资料类型不再按类型随手配彩色（蓝/绿/紫/粉…），
 * 统一走中性 token（bg-warm-200 平色底 + text-text-secondary 图标），
 * 类型区分依靠图标与文字标签，不依赖色相。
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
	/** 用于背景渐变（已收敛为平色，字段名保留以兼容既有结构） */
	bgGradient: string;
	/** 图标文本色 */
	iconColor: string;
}

/** 全类型统一的中性配色（随主题 token 自动适配亮/暗） */
const NEUTRAL_DOT = "bg-warm-500";
const NEUTRAL_BG = "bg-warm-200 border-border";
const NEUTRAL_ICON = "text-text-secondary";

export const sourceTypeConfig: Record<string, SourceTypeConfigItem> = {
	[SourceType.Web]: {
		icon: Globe,
		label: "网页",
		dotColor: NEUTRAL_DOT,
		bgGradient: NEUTRAL_BG,
		iconColor: NEUTRAL_ICON,
	},
	[SourceType.Text]: {
		icon: FileText,
		label: "文本",
		dotColor: NEUTRAL_DOT,
		bgGradient: NEUTRAL_BG,
		iconColor: NEUTRAL_ICON,
	},
	[SourceType.Document]: {
		icon: FileText,
		label: "文档",
		dotColor: NEUTRAL_DOT,
		bgGradient: NEUTRAL_BG,
		iconColor: NEUTRAL_ICON,
	},
	[SourceType.Pdf]: {
		icon: BookOpen,
		label: "PDF",
		dotColor: NEUTRAL_DOT,
		bgGradient: NEUTRAL_BG,
		iconColor: NEUTRAL_ICON,
	},
	[SourceType.Image]: {
		icon: Image,
		label: "图片",
		dotColor: NEUTRAL_DOT,
		bgGradient: NEUTRAL_BG,
		iconColor: NEUTRAL_ICON,
	},
	[SourceType.Audio]: {
		icon: Music,
		label: "音频",
		dotColor: NEUTRAL_DOT,
		bgGradient: NEUTRAL_BG,
		iconColor: NEUTRAL_ICON,
	},
	[SourceType.Video]: {
		icon: Video,
		label: "视频",
		dotColor: NEUTRAL_DOT,
		bgGradient: NEUTRAL_BG,
		iconColor: NEUTRAL_ICON,
	},
	[SourceType.Code]: {
		icon: Code2,
		label: "代码",
		dotColor: NEUTRAL_DOT,
		bgGradient: NEUTRAL_BG,
		iconColor: NEUTRAL_ICON,
	},
	[SourceType.Spreadsheet]: {
		icon: FileSpreadsheet,
		label: "表格",
		dotColor: NEUTRAL_DOT,
		bgGradient: NEUTRAL_BG,
		iconColor: NEUTRAL_ICON,
	},
	[SourceType.Presentation]: {
		icon: Presentation,
		label: "演示",
		dotColor: NEUTRAL_DOT,
		bgGradient: NEUTRAL_BG,
		iconColor: NEUTRAL_ICON,
	},
	[SourceType.Archive]: {
		icon: Archive,
		label: "压缩包",
		dotColor: NEUTRAL_DOT,
		bgGradient: NEUTRAL_BG,
		iconColor: NEUTRAL_ICON,
	},
};

/** 获取指定类型的配置，未知类型返回默认值 */
export function getSourceTypeConfig(kind: string): SourceTypeConfigItem {
	return (
		sourceTypeConfig[kind] ?? {
			icon: FileText,
			label: "文件",
			dotColor: NEUTRAL_DOT,
			bgGradient: NEUTRAL_BG,
			iconColor: NEUTRAL_ICON,
		}
	);
}
