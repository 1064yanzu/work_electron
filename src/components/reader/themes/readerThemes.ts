/**
 * 阅读器主题 — CSS 变量令牌。
 *
 * 通过把所有色彩/字体相关变量挂在 .reader-shell 上，下钻组件无需知道当前主题。
 * 主题切换 = 重新设置一组 CSS variables，0 ms 切换、不重排 DOM。
 */

export type ReaderThemeId =
	| "paperwhite"
	| "parchment"
	| "night"
	| "moss"
	| "slate"
	| "espresso";

export type ReaderTheme = {
	id: ReaderThemeId;
	label: string;
	tone: "light" | "dark" | "warm";
	swatch: string; // 主题色板代表色（渲染选项时用）
	tokens: Record<string, string>;
};

const PAPERWHITE: ReaderTheme = {
	id: "paperwhite",
	label: "米白",
	tone: "light",
	swatch: "#FBF8F1",
	tokens: {
		"--reader-bg": "#FBF8F1",
		"--reader-bg-soft": "#F5EFE3",
		"--reader-fg": "#1F1B16",
		"--reader-fg-muted": "#5A4F40",
		"--reader-fg-light": "#8A7E6E",
		"--reader-accent": "#D96C46",
		"--reader-accent-soft": "#FBE7DC",
		"--reader-border": "rgba(31,27,22,0.10)",
		"--reader-selection": "rgba(217,108,70,0.18)",
		"--reader-shadow": "0 8px 32px rgba(31,27,22,0.05)",
	},
};

const PARCHMENT: ReaderTheme = {
	id: "parchment",
	label: "羊皮",
	tone: "warm",
	swatch: "#F2E8D5",
	tokens: {
		"--reader-bg": "#F2E8D5",
		"--reader-bg-soft": "#E9DCC0",
		"--reader-fg": "#2A1F12",
		"--reader-fg-muted": "#5C4B30",
		"--reader-fg-light": "#8C7A57",
		"--reader-accent": "#A65A2D",
		"--reader-accent-soft": "#EFD8BB",
		"--reader-border": "rgba(42,31,18,0.14)",
		"--reader-selection": "rgba(166,90,45,0.22)",
		"--reader-shadow": "0 8px 32px rgba(42,31,18,0.06)",
	},
};

const NIGHT: ReaderTheme = {
	id: "night",
	label: "夜间",
	tone: "dark",
	swatch: "#101317",
	tokens: {
		"--reader-bg": "#101317",
		"--reader-bg-soft": "#181C22",
		"--reader-fg": "#E8E4DC",
		"--reader-fg-muted": "#9DA1A8",
		"--reader-fg-light": "#6B7079",
		"--reader-accent": "#E89A75",
		"--reader-accent-soft": "rgba(232,154,117,0.14)",
		"--reader-border": "rgba(255,255,255,0.10)",
		"--reader-selection": "rgba(232,154,117,0.22)",
		"--reader-shadow": "0 8px 32px rgba(0,0,0,0.40)",
	},
};

const MOSS: ReaderTheme = {
	id: "moss",
	label: "墨绿",
	tone: "dark",
	swatch: "#1A2620",
	tokens: {
		"--reader-bg": "#1A2620",
		"--reader-bg-soft": "#22332B",
		"--reader-fg": "#E2EAE0",
		"--reader-fg-muted": "#A3B1A6",
		"--reader-fg-light": "#6B7B70",
		"--reader-accent": "#9EC8A6",
		"--reader-accent-soft": "rgba(158,200,166,0.14)",
		"--reader-border": "rgba(226,234,224,0.10)",
		"--reader-selection": "rgba(158,200,166,0.22)",
		"--reader-shadow": "0 8px 32px rgba(0,0,0,0.30)",
	},
};

const SLATE: ReaderTheme = {
	id: "slate",
	label: "灰蓝",
	tone: "dark",
	swatch: "#1B232C",
	tokens: {
		"--reader-bg": "#1B232C",
		"--reader-bg-soft": "#243140",
		"--reader-fg": "#E5EAF0",
		"--reader-fg-muted": "#9EAAB7",
		"--reader-fg-light": "#6A7785",
		"--reader-accent": "#7CB7E8",
		"--reader-accent-soft": "rgba(124,183,232,0.14)",
		"--reader-border": "rgba(229,234,240,0.10)",
		"--reader-selection": "rgba(124,183,232,0.22)",
		"--reader-shadow": "0 8px 32px rgba(0,0,0,0.30)",
	},
};

const ESPRESSO: ReaderTheme = {
	id: "espresso",
	label: "深咖",
	tone: "dark",
	swatch: "#241A12",
	tokens: {
		"--reader-bg": "#241A12",
		"--reader-bg-soft": "#2F2418",
		"--reader-fg": "#EDDFCA",
		"--reader-fg-muted": "#B8A287",
		"--reader-fg-light": "#7E6A52",
		"--reader-accent": "#E8B27A",
		"--reader-accent-soft": "rgba(232,178,122,0.14)",
		"--reader-border": "rgba(237,223,202,0.10)",
		"--reader-selection": "rgba(232,178,122,0.22)",
		"--reader-shadow": "0 8px 32px rgba(0,0,0,0.30)",
	},
};

export const READER_THEMES: ReaderTheme[] = [
	PAPERWHITE,
	PARCHMENT,
	NIGHT,
	MOSS,
	SLATE,
	ESPRESSO,
];

export function getReaderTheme(id: string): ReaderTheme {
	return READER_THEMES.find((t) => t.id === id) ?? PAPERWHITE;
}

export type ReaderFontFamilyId =
	| "serif-cn"
	| "serif-en"
	| "sans-cn"
	| "sans-en"
	| "mono";

export const READER_FONT_FAMILIES: Array<{
	id: ReaderFontFamilyId;
	label: string;
	stack: string;
}> = [
	{
		id: "serif-cn",
		label: "衬线 · 中文",
		stack: '"Source Han Serif", "Noto Serif SC", "Songti SC", Georgia, serif',
	},
	{
		id: "serif-en",
		label: "衬线 · 英文",
		stack: 'Merriweather, Georgia, "Source Han Serif", serif',
	},
	{
		id: "sans-cn",
		label: "无衬线 · 中文",
		stack: '"PingFang SC", "Source Han Sans SC", Inter, system-ui, sans-serif',
	},
	{
		id: "sans-en",
		label: "无衬线 · 英文",
		stack: 'Inter, "PingFang SC", system-ui, -apple-system, sans-serif',
	},
	{
		id: "mono",
		label: "等宽",
		stack: '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace',
	},
];

export function getReaderFontStack(id: string): string {
	return (
		READER_FONT_FAMILIES.find((f) => f.id === id)?.stack ??
		READER_FONT_FAMILIES[0].stack
	);
}
