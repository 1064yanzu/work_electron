/**
 * 5 个内置设计方向（Direction）的元数据 + 规格 Markdown 读取
 *
 * - 元数据用于前端 DirectionPicker 渲染 5 张卡片（color swatches + font + mood）
 * - 规格 Markdown 由主进程在拼装 system prompt 时读取并注入
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getDesignLibraryRoot } from "./resourcePaths";

export interface DesignDirection {
	id: string;
	label: string;
	mood: string;
	palette: { bg: string; fg: string; accent: string; muted: string };
	display_font: string;
	body_font: string;
	references: string[];
	posture: string[];
}

export const BUILTIN_DESIGN_DIRECTIONS: DesignDirection[] = [
	{
		id: "editorial",
		label: "杂志编辑 (Editorial)",
		mood: "叙事、慷慨留白、衬线主导",
		palette: {
			bg: "oklch(0.97 0.005 90)",
			fg: "oklch(0.20 0.02 80)",
			accent: "oklch(0.55 0.18 25)",
			muted: "oklch(0.55 0.01 90)",
		},
		display_font: "Tiempos Headline / Georgia",
		body_font: "Tiempos Text / Source Serif Pro",
		references: [
			"The New Yorker",
			"Bloomberg Businessweek",
			"Aesop",
			"Slowdown",
		],
		posture: ["大首字下沉", "栏内引文", "罗马数字", "黑白 + 1 强调色"],
	},
	{
		id: "modern-minimal",
		label: "现代极简 (Modern Minimal)",
		mood: "工程师 SaaS、克制、严格网格",
		palette: {
			bg: "oklch(0.98 0.003 250)",
			fg: "oklch(0.20 0.01 250)",
			accent: "oklch(0.58 0.18 268)",
			muted: "oklch(0.65 0.005 250)",
		},
		display_font: "Inter",
		body_font: "Inter",
		references: ["Linear", "Vercel", "Stripe", "Resend", "Cursor"],
		posture: ["8px 网格", "圆角 8–12", "单一强调色", "stroke 1.5 icon"],
	},
	{
		id: "tech-utility",
		label: "机器界面 (Tech Utility)",
		mood: "终端、数据密集、深色主导",
		palette: {
			bg: "oklch(0.13 0.01 250)",
			fg: "oklch(0.92 0.003 250)",
			accent: "oklch(0.72 0.18 145)",
			muted: "oklch(0.50 0.01 250)",
		},
		display_font: "JetBrains Mono",
		body_font: "JetBrains Mono",
		references: ["Bloomberg Terminal", "htop", "Sentry", "GitHub Actions"],
		posture: ["等宽字主导", "表格 + ASCII 框", "状态徽章", "单位严格"],
	},
	{
		id: "brutalist",
		label: "野性反精致 (Brutalist)",
		mood: "实验、错位、强对比",
		palette: {
			bg: "oklch(1.00 0 0)",
			fg: "oklch(0.05 0 0)",
			accent: "oklch(0.70 0.30 25)",
			muted: "oklch(0.60 0.30 290)",
		},
		display_font: "Space Grotesk / Archivo Black",
		body_font: "Inter / Helvetica Neue",
		references: ["David Carson", "Sagmeister", "90s zine"],
		posture: ["巨字 hero", "错位 / 撞色", "粗描边", "字体作为图像"],
	},
	{
		id: "soft-warm",
		label: "暖调极简 (Soft Warm)",
		mood: "奶油 + 赤陶橙、圆润、慢节奏",
		palette: {
			bg: "oklch(0.97 0.015 75)",
			fg: "oklch(0.25 0.02 60)",
			accent: "oklch(0.62 0.13 45)",
			muted: "oklch(0.65 0.01 60)",
		},
		display_font: "Inter",
		body_font: "Inter / Source Serif Pro",
		references: ["Claude.ai", "Anthropic", "Notion", "Things 3"],
		posture: ["pill 圆角", "柔和阴影", "大留白", "单一暖色调"],
	},
];

const DEFAULT_DIRECTION_ID = "modern-minimal";

export function getDirection(id: string | undefined): DesignDirection {
	if (!id) return BUILTIN_DESIGN_DIRECTIONS[0];
	const hit = BUILTIN_DESIGN_DIRECTIONS.find((d) => d.id === id);
	return hit ?? BUILTIN_DESIGN_DIRECTIONS.find((d) => d.id === DEFAULT_DIRECTION_ID)!;
}

/**
 * 读取方向规格 markdown 文件；找不到时回退到内存中的简要描述。
 */
export async function renderDirectionSpec(id: string | undefined): Promise<string> {
	const direction = getDirection(id);
	const libRoot = getDesignLibraryRoot();
	const filePath = path.join(libRoot, "directions", `${direction.id}.md`);
	try {
		const content = await fs.readFile(filePath, "utf-8");
		return content;
	} catch {
		// 回退：从内存元数据合成一个最小规格
		const lines: string[] = [
			`# Direction: ${direction.id}`,
			"",
			`## Mood`,
			direction.mood,
			"",
			`## Palette (OKLch)`,
			`- bg: ${direction.palette.bg}`,
			`- fg: ${direction.palette.fg}`,
			`- accent: ${direction.palette.accent}`,
			`- muted: ${direction.palette.muted}`,
			"",
			`## Typography`,
			`- Display: ${direction.display_font}`,
			`- Body: ${direction.body_font}`,
			"",
			`## References`,
			...direction.references.map((r) => `- ${r}`),
		];
		return lines.join("\n");
	}
}
