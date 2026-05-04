/**
 * 主题定义 — 每个主题包含亮色和暗色两套色值
 * 通过 CSS 自定义属性注入到 :root
 */

export interface ThemeColors {
	// 背景层级
	"--t-bg": string;
	"--t-bg-surface": string;
	"--t-bg-muted": string;
	"--t-bg-panel": string;
	"--t-bg-panel-strong": string;

	// 边框
	"--t-border": string;
	"--t-border-subtle": string;

	// 品牌色
	"--t-primary": string;
	"--t-primary-hover": string;
	"--t-primary-muted": string;
	"--t-primary-fg": string;

	// 文字
	"--t-text-primary": string;
	"--t-text-secondary": string;
	"--t-text-muted": string;

	// 交互
	"--t-ring": string;
	"--t-scrollbar": string;
	"--t-scrollbar-hover": string;

	// 纹理叠加色
	"--t-texture-a": string;
	"--t-texture-b": string;
}

export interface ThemeDefinition {
	id: string;
	name: string;
	description: string;
	/** 预览色（用于主题选择卡片） */
	preview: { bg: string; accent: string; text: string };
	light: ThemeColors;
	dark: ThemeColors;
}

// ━━━ 0. B.AI 极简（新默认 — 奶油暖白 + 黑色单色 + 1% 彩色锚点） ━━━
const bai: ThemeDefinition = {
	id: "bai",
	name: "暖调极简",
	description: "奶油暖白底色，黑色单色界面 + 1% 彩色锚点",
	preview: { bg: "#FAF9F5", accent: "#1A1A19", text: "#1A1A19" },
	light: {
		"--t-bg": "#FAF9F5",
		"--t-bg-surface": "#FFFFFF",
		"--t-bg-muted": "#F4F2EC",
		"--t-bg-panel": "rgba(250,249,245,0.82)",
		"--t-bg-panel-strong": "rgba(255,255,255,0.92)",
		"--t-border": "#E8E5DD",
		"--t-border-subtle": "rgba(26,26,25,0.04)",
		"--t-primary": "#1A1A19",
		"--t-primary-hover": "#2A2A28",
		"--t-primary-muted": "rgba(26,26,25,0.06)",
		"--t-primary-fg": "#FFFFFF",
		"--t-text-primary": "#1A1A19",
		"--t-text-secondary": "#6B6B68",
		"--t-text-muted": "#9D9D98",
		"--t-ring": "rgba(26,26,25,0.18)",
		"--t-scrollbar": "#E8E5DD",
		"--t-scrollbar-hover": "#D8D4C9",
		"--t-texture-a": "rgba(248,220,203,0.05)",
		"--t-texture-b": "rgba(157,157,152,0.02)",
	},
	dark: {
		"--t-bg": "#1A1A19",
		"--t-bg-surface": "#222220",
		"--t-bg-muted": "#2A2A28",
		"--t-bg-panel": "rgba(26,26,25,0.78)",
		"--t-bg-panel-strong": "rgba(34,34,32,0.86)",
		"--t-border": "#2F2F2C",
		"--t-border-subtle": "rgba(255,255,255,0.05)",
		"--t-primary": "#FAF9F5",
		"--t-primary-hover": "#FFFFFF",
		"--t-primary-muted": "rgba(250,249,245,0.10)",
		"--t-primary-fg": "#1A1A19",
		"--t-text-primary": "#FAF9F5",
		"--t-text-secondary": "#B5B3AC",
		"--t-text-muted": "#7E7C76",
		"--t-ring": "rgba(250,249,245,0.20)",
		"--t-scrollbar": "#2F2F2C",
		"--t-scrollbar-hover": "#3D3D3A",
		"--t-texture-a": "rgba(248,220,203,0.04)",
		"--t-texture-b": "rgba(157,157,152,0.02)",
	},
};

// ━━━ 1. 经典（陶土暖色调） ━━━
const classic: ThemeDefinition = {
	id: "classic",
	name: "经典陶土",
	description: "温暖的陶土色调，经典羊皮纸质感",
	preview: { bg: "#f5f4ed", accent: "#c96442", text: "#141413" },
	light: {
		"--t-bg": "#f5f4ed",
		"--t-bg-surface": "#faf9f5",
		"--t-bg-muted": "#f0eee6",
		"--t-bg-panel": "rgba(245,244,237,0.76)",
		"--t-bg-panel-strong": "rgba(250,249,245,0.84)",
		"--t-border": "#e8e6dc",
		"--t-border-subtle": "rgba(0,0,0,0.04)",
		"--t-primary": "#c96442",
		"--t-primary-hover": "#b5573a",
		"--t-primary-muted": "rgba(201,100,66,0.12)",
		"--t-primary-fg": "#faf9f5",
		"--t-text-primary": "#141413",
		"--t-text-secondary": "#5e5d59",
		"--t-text-muted": "#87867f",
		"--t-ring": "rgba(201,100,66,0.35)",
		"--t-scrollbar": "#e8e6dc",
		"--t-scrollbar-hover": "#c2c0b6",
		"--t-texture-a": "rgba(201,100,66,0.025)",
		"--t-texture-b": "rgba(93,93,89,0.015)",
	},
	dark: {
		"--t-bg": "#141413",
		"--t-bg-surface": "#1e1d1b",
		"--t-bg-muted": "#30302e",
		"--t-bg-panel": "rgba(20,20,19,0.72)",
		"--t-bg-panel-strong": "rgba(24,23,22,0.78)",
		"--t-border": "#30302e",
		"--t-border-subtle": "rgba(255,255,255,0.05)",
		"--t-primary": "#d97b5a",
		"--t-primary-hover": "#e08a6b",
		"--t-primary-muted": "rgba(201,100,66,0.18)",
		"--t-primary-fg": "#faf9f5",
		"--t-text-primary": "#faf9f5",
		"--t-text-secondary": "#b0aea5",
		"--t-text-muted": "#87867f",
		"--t-ring": "rgba(201,100,66,0.45)",
		"--t-scrollbar": "#3a3937",
		"--t-scrollbar-hover": "#4a4845",
		"--t-texture-a": "rgba(201,100,66,0.04)",
		"--t-texture-b": "rgba(93,93,89,0.03)",
	},
};

// ━━━ 2. Ocean（深蓝海洋） ━━━
const ocean: ThemeDefinition = {
	id: "ocean",
	name: "海洋",
	description: "宁静深邃的海蓝色调",
	preview: { bg: "#f0f4f8", accent: "#2563eb", text: "#1e293b" },
	light: {
		"--t-bg": "#e6f0f9",
		"--t-bg-surface": "#f0f6fc",
		"--t-bg-muted": "#e2e8f0",
		"--t-bg-panel": "rgba(230,240,249,0.78)",
		"--t-bg-panel-strong": "rgba(240,246,252,0.85)",
		"--t-border": "#cbd5e1",
		"--t-border-subtle": "rgba(0,0,0,0.04)",
		"--t-primary": "#2563eb",
		"--t-primary-hover": "#1d4ed8",
		"--t-primary-muted": "rgba(37,99,235,0.10)",
		"--t-primary-fg": "#ffffff",
		"--t-text-primary": "#1e293b",
		"--t-text-secondary": "#475569",
		"--t-text-muted": "#94a3b8",
		"--t-ring": "rgba(37,99,235,0.35)",
		"--t-scrollbar": "#cbd5e1",
		"--t-scrollbar-hover": "#94a3b8",
		"--t-texture-a": "rgba(37,99,235,0.02)",
		"--t-texture-b": "rgba(100,116,139,0.015)",
	},
	dark: {
		"--t-bg": "#0a1629",
		"--t-bg-surface": "#132238",
		"--t-bg-muted": "#334155",
		"--t-bg-panel": "rgba(10,22,41,0.75)",
		"--t-bg-panel-strong": "rgba(19,34,56,0.80)",
		"--t-border": "#334155",
		"--t-border-subtle": "rgba(255,255,255,0.06)",
		"--t-primary": "#3b82f6",
		"--t-primary-hover": "#60a5fa",
		"--t-primary-muted": "rgba(59,130,246,0.15)",
		"--t-primary-fg": "#ffffff",
		"--t-text-primary": "#f1f5f9",
		"--t-text-secondary": "#94a3b8",
		"--t-text-muted": "#64748b",
		"--t-ring": "rgba(59,130,246,0.45)",
		"--t-scrollbar": "#334155",
		"--t-scrollbar-hover": "#475569",
		"--t-texture-a": "rgba(59,130,246,0.04)",
		"--t-texture-b": "rgba(100,116,139,0.03)",
	},
};

// ━━━ 3. Forest（森林绿） ━━━
const forest: ThemeDefinition = {
	id: "forest",
	name: "森林",
	description: "清新自然的翠绿色调",
	preview: { bg: "#f0f5f1", accent: "#16a34a", text: "#1a2e1a" },
	light: {
		"--t-bg": "#eaf2ec",
		"--t-bg-surface": "#f2f7f4",
		"--t-bg-muted": "#e4eae0",
		"--t-bg-panel": "rgba(234,242,236,0.78)",
		"--t-bg-panel-strong": "rgba(242,247,244,0.85)",
		"--t-border": "#c8d5c2",
		"--t-border-subtle": "rgba(0,0,0,0.04)",
		"--t-primary": "#16a34a",
		"--t-primary-hover": "#15803d",
		"--t-primary-muted": "rgba(22,163,74,0.10)",
		"--t-primary-fg": "#ffffff",
		"--t-text-primary": "#1a2e1a",
		"--t-text-secondary": "#4a6349",
		"--t-text-muted": "#7d967c",
		"--t-ring": "rgba(22,163,74,0.35)",
		"--t-scrollbar": "#c8d5c2",
		"--t-scrollbar-hover": "#9cb096",
		"--t-texture-a": "rgba(22,163,74,0.02)",
		"--t-texture-b": "rgba(74,99,73,0.015)",
	},
	dark: {
		"--t-bg": "#0a1c10",
		"--t-bg-surface": "#122616",
		"--t-bg-muted": "#2a3e2a",
		"--t-bg-panel": "rgba(10,28,16,0.75)",
		"--t-bg-panel-strong": "rgba(18,38,22,0.80)",
		"--t-border": "#2a3e2a",
		"--t-border-subtle": "rgba(255,255,255,0.06)",
		"--t-primary": "#22c55e",
		"--t-primary-hover": "#4ade80",
		"--t-primary-muted": "rgba(34,197,94,0.15)",
		"--t-primary-fg": "#0f1a0f",
		"--t-text-primary": "#e8f5e9",
		"--t-text-secondary": "#a5c4a6",
		"--t-text-muted": "#6b8f6c",
		"--t-ring": "rgba(34,197,94,0.45)",
		"--t-scrollbar": "#2a3e2a",
		"--t-scrollbar-hover": "#3a5239",
		"--t-texture-a": "rgba(34,197,94,0.04)",
		"--t-texture-b": "rgba(74,99,73,0.03)",
	},
};

// ━━━ 4. Lavender（薰衣草紫） ━━━
const lavender: ThemeDefinition = {
	id: "lavender",
	name: "薰衣草",
	description: "柔和优雅的紫罗兰色调",
	preview: { bg: "#f5f3f8", accent: "#7c3aed", text: "#2e1f4d" },
	light: {
		"--t-bg": "#eee8f5",
		"--t-bg-surface": "#f4f0f9",
		"--t-bg-muted": "#ebe5f2",
		"--t-bg-panel": "rgba(238,232,245,0.78)",
		"--t-bg-panel-strong": "rgba(244,240,249,0.85)",
		"--t-border": "#d4c8e2",
		"--t-border-subtle": "rgba(0,0,0,0.04)",
		"--t-primary": "#7c3aed",
		"--t-primary-hover": "#6d28d9",
		"--t-primary-muted": "rgba(124,58,237,0.10)",
		"--t-primary-fg": "#ffffff",
		"--t-text-primary": "#2e1f4d",
		"--t-text-secondary": "#5b4a7a",
		"--t-text-muted": "#9585b0",
		"--t-ring": "rgba(124,58,237,0.35)",
		"--t-scrollbar": "#d4c8e2",
		"--t-scrollbar-hover": "#b09fcf",
		"--t-texture-a": "rgba(124,58,237,0.02)",
		"--t-texture-b": "rgba(91,74,122,0.015)",
	},
	dark: {
		"--t-bg": "#160a26",
		"--t-bg-surface": "#201236",
		"--t-bg-muted": "#332a47",
		"--t-bg-panel": "rgba(22,10,38,0.75)",
		"--t-bg-panel-strong": "rgba(32,18,54,0.80)",
		"--t-border": "#332a47",
		"--t-border-subtle": "rgba(255,255,255,0.06)",
		"--t-primary": "#8b5cf6",
		"--t-primary-hover": "#a78bfa",
		"--t-primary-muted": "rgba(139,92,246,0.15)",
		"--t-primary-fg": "#ffffff",
		"--t-text-primary": "#f0ecf5",
		"--t-text-secondary": "#b09fcf",
		"--t-text-muted": "#7a6a99",
		"--t-ring": "rgba(139,92,246,0.45)",
		"--t-scrollbar": "#332a47",
		"--t-scrollbar-hover": "#443a5c",
		"--t-texture-a": "rgba(139,92,246,0.04)",
		"--t-texture-b": "rgba(91,74,122,0.03)",
	},
};

// ━━━ 5. Rose（玫瑰粉） ━━━
const rose: ThemeDefinition = {
	id: "rose",
	name: "玫瑰",
	description: "温柔浪漫的玫瑰色调",
	preview: { bg: "#fdf2f4", accent: "#e11d48", text: "#4c0519" },
	light: {
		"--t-bg": "#fae8eb",
		"--t-bg-surface": "#fcf0f2",
		"--t-bg-muted": "#fce7ea",
		"--t-bg-panel": "rgba(250,232,235,0.78)",
		"--t-bg-panel-strong": "rgba(252,240,242,0.85)",
		"--t-border": "#f5ccd1",
		"--t-border-subtle": "rgba(0,0,0,0.04)",
		"--t-primary": "#e11d48",
		"--t-primary-hover": "#be123c",
		"--t-primary-muted": "rgba(225,29,72,0.10)",
		"--t-primary-fg": "#ffffff",
		"--t-text-primary": "#4c0519",
		"--t-text-secondary": "#881337",
		"--t-text-muted": "#c4899a",
		"--t-ring": "rgba(225,29,72,0.35)",
		"--t-scrollbar": "#f5ccd1",
		"--t-scrollbar-hover": "#e8a0ab",
		"--t-texture-a": "rgba(225,29,72,0.02)",
		"--t-texture-b": "rgba(136,19,55,0.015)",
	},
	dark: {
		"--t-bg": "#240a14",
		"--t-bg-surface": "#361220",
		"--t-bg-muted": "#3d1f2e",
		"--t-bg-panel": "rgba(36,10,20,0.75)",
		"--t-bg-panel-strong": "rgba(54,18,32,0.80)",
		"--t-border": "#3d1f2e",
		"--t-border-subtle": "rgba(255,255,255,0.06)",
		"--t-primary": "#fb7185",
		"--t-primary-hover": "#fda4af",
		"--t-primary-muted": "rgba(251,113,133,0.15)",
		"--t-primary-fg": "#1a0a10",
		"--t-text-primary": "#fdf2f4",
		"--t-text-secondary": "#d4a0ae",
		"--t-text-muted": "#8a5565",
		"--t-ring": "rgba(251,113,133,0.45)",
		"--t-scrollbar": "#3d1f2e",
		"--t-scrollbar-hover": "#522a3d",
		"--t-texture-a": "rgba(251,113,133,0.04)",
		"--t-texture-b": "rgba(136,19,55,0.03)",
	},
};

// ━━━ 6. Midnight（午夜） ━━━
const midnight: ThemeDefinition = {
	id: "midnight",
	name: "午夜",
	description: "深邃纯粹的暗色主题，适合夜间使用",
	preview: { bg: "#09090b", accent: "#a78bfa", text: "#fafafa" },
	light: {
		// midnight 亮色模式使用中性灰
		"--t-bg": "#f4f4f5",
		"--t-bg-surface": "#fafafa",
		"--t-bg-muted": "#e4e4e7",
		"--t-bg-panel": "rgba(244,244,245,0.78)",
		"--t-bg-panel-strong": "rgba(250,250,250,0.85)",
		"--t-border": "#d4d4d8",
		"--t-border-subtle": "rgba(0,0,0,0.04)",
		"--t-primary": "#7c3aed",
		"--t-primary-hover": "#6d28d9",
		"--t-primary-muted": "rgba(124,58,237,0.10)",
		"--t-primary-fg": "#ffffff",
		"--t-text-primary": "#18181b",
		"--t-text-secondary": "#52525b",
		"--t-text-muted": "#a1a1aa",
		"--t-ring": "rgba(124,58,237,0.35)",
		"--t-scrollbar": "#d4d4d8",
		"--t-scrollbar-hover": "#a1a1aa",
		"--t-texture-a": "rgba(124,58,237,0.015)",
		"--t-texture-b": "rgba(82,82,91,0.01)",
	},
	dark: {
		"--t-bg": "#09090b",
		"--t-bg-surface": "#18181b",
		"--t-bg-muted": "#27272a",
		"--t-bg-panel": "rgba(9,9,11,0.80)",
		"--t-bg-panel-strong": "rgba(24,24,27,0.85)",
		"--t-border": "#27272a",
		"--t-border-subtle": "rgba(255,255,255,0.06)",
		"--t-primary": "#a78bfa",
		"--t-primary-hover": "#c4b5fd",
		"--t-primary-muted": "rgba(167,139,250,0.15)",
		"--t-primary-fg": "#09090b",
		"--t-text-primary": "#fafafa",
		"--t-text-secondary": "#a1a1aa",
		"--t-text-muted": "#52525b",
		"--t-ring": "rgba(167,139,250,0.45)",
		"--t-scrollbar": "#27272a",
		"--t-scrollbar-hover": "#3f3f46",
		"--t-texture-a": "rgba(167,139,250,0.03)",
		"--t-texture-b": "rgba(82,82,91,0.02)",
	},
};

// ━━━ 7. Amber（琥珀金） ━━━
const amber: ThemeDefinition = {
	id: "amber",
	name: "琥珀",
	description: "温暖明亮的琥珀金色调",
	preview: { bg: "#fffbeb", accent: "#d97706", text: "#451a03" },
	light: {
		"--t-bg": "#fbf2d9",
		"--t-bg-surface": "#fdf7e8",
		"--t-bg-muted": "#fef3c7",
		"--t-bg-panel": "rgba(251,242,217,0.78)",
		"--t-bg-panel-strong": "rgba(253,247,232,0.85)",
		"--t-border": "#fde68a",
		"--t-border-subtle": "rgba(0,0,0,0.04)",
		"--t-primary": "#d97706",
		"--t-primary-hover": "#b45309",
		"--t-primary-muted": "rgba(217,119,6,0.10)",
		"--t-primary-fg": "#ffffff",
		"--t-text-primary": "#451a03",
		"--t-text-secondary": "#78350f",
		"--t-text-muted": "#b8860b",
		"--t-ring": "rgba(217,119,6,0.35)",
		"--t-scrollbar": "#fde68a",
		"--t-scrollbar-hover": "#fbbf24",
		"--t-texture-a": "rgba(217,119,6,0.02)",
		"--t-texture-b": "rgba(120,53,15,0.015)",
	},
	dark: {
		"--t-bg": "#261605",
		"--t-bg-surface": "#38220a",
		"--t-bg-muted": "#3d2c12",
		"--t-bg-panel": "rgba(38,22,5,0.75)",
		"--t-bg-panel-strong": "rgba(56,34,10,0.80)",
		"--t-border": "#3d2c12",
		"--t-border-subtle": "rgba(255,255,255,0.06)",
		"--t-primary": "#fbbf24",
		"--t-primary-hover": "#fcd34d",
		"--t-primary-muted": "rgba(251,191,36,0.15)",
		"--t-primary-fg": "#1a1207",
		"--t-text-primary": "#fefce8",
		"--t-text-secondary": "#d4a76a",
		"--t-text-muted": "#8a6a35",
		"--t-ring": "rgba(251,191,36,0.45)",
		"--t-scrollbar": "#3d2c12",
		"--t-scrollbar-hover": "#523b1a",
		"--t-texture-a": "rgba(251,191,36,0.04)",
		"--t-texture-b": "rgba(120,53,15,0.03)",
	},
};

// ━━━ 所有主题注册 ━━━
export const ALL_THEMES: ThemeDefinition[] = [
	bai,
	classic,
	ocean,
	forest,
	lavender,
	rose,
	midnight,
	amber,
];

export const THEME_MAP = new Map<string, ThemeDefinition>(
	ALL_THEMES.map((t) => [t.id, t]),
);

export const DEFAULT_THEME_ID = "bai";
