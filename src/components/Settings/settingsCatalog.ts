/**
 * settingsCatalog.ts — 设置体系的单一事实源（Phase 1 骨架版）
 *
 * 本文件承载「一级分类 × 二级 Tab × Panel Loader」三张表的组合关系，
 * 被 `SettingsSidebar` / `SettingsModal` / `panelLoaders` / `legacyTabMap` 共同消费。
 *
 * Phase 1 阶段 `load` 字段仍然指向旧面板文件；Phase 4–6 拆分完成后会切换到
 * `panels/<category>/<subtab>/index` 的新路径。本次只做结构骨架。
 */
import {
	Archive,
	BarChart3,
	BookOpen,
	Blocks,
	Boxes,
	Brain,
	Database,
	Flame,
	Gauge,
	HardDrive,
	Image as ImageIcon,
	Info,
	Keyboard,
	Layout,
	type LucideIcon,
	MessageSquare,
	Palette,
	Pen,
	Plug,
	Shield,
	Smartphone,
	Sparkles,
	SlidersHorizontal,
	Terminal,
	Volume2,
	Waypoints,
	Wrench,
} from "lucide-react";
import type { ComponentType } from "react";

// =====================================================================
// 基础类型
// =====================================================================

/** 一级分类 id — 字面量联合，新增分类在此扩展 */
export type SettingsNavCategoryId =
	| "general"
	| "ai"
	| "workshop"
	| "integrations"
	| "data";

/** 二级 Tab id — 新的 SettingsTabId，形如 "<category>.<subtab>" */
export type SettingsTabId =
	| "general.appearance"
	| "general.shortcuts"
	| "general.about"
	| "ai.models"
	| "ai.agent"
	| "ai.memory"
	| "ai.prompts"
	| "ai.defaults"
	| "workshop.imagegen"
	| "workshop.reader"
	| "workshop.tts"
	| "workshop.mascot"
	| "workshop.layout"
	| "workshop.terminal"
	| "workshop.styleprofile"
	| "integrations.mcp"
	| "integrations.remote"
	| "integrations.harnessHub"
	| "data.stats"
	| "data.storage"
	| "data.backup"
	| "data.artifacts"
	| "data.performance"
	| "data.danger";

/** Badge 语义色调（与 `SettingsBadge` 保持一致） */
export type SettingsBadgeTone =
	| "neutral"
	| "primary"
	| "success"
	| "warning"
	| "error"
	| "info"
	| "violet";

export interface SettingsNavCategory {
	id: SettingsNavCategoryId;
	label: string;
	icon: LucideIcon;
	description: string;
}

export interface SettingsSubtab {
	id: SettingsTabId;
	category: SettingsNavCategoryId;
	label: string;
	icon: LucideIcon;
	badge?: { tone: SettingsBadgeTone; text: string };
	/** 懒加载面板组件（Phase 1 指向旧面板，后续阶段切换到拆分后的新入口） */
	load: () => Promise<{ default: ComponentType }>;
}

// =====================================================================
// 内部工具 —— 把任意 `named export` 包装成 `{ default }`
// =====================================================================

function asDefault<T extends Record<string, unknown>, K extends keyof T>(
	importer: () => Promise<T>,
	exportName: K,
): () => Promise<{ default: ComponentType }> {
	return async () => {
		const mod = await importer();
		return { default: mod[exportName] as ComponentType };
	};
}

// =====================================================================
// 一级分类（5 条，顺序固定）
// =====================================================================

export const SETTINGS_CATEGORIES: readonly SettingsNavCategory[] = [
	{
		id: "general",
		label: "通用",
		icon: SlidersHorizontal,
		description: "外观、主题、快捷键、关于信息",
	},
	{
		id: "ai",
		label: "AI 与模型",
		icon: Brain,
		description: "服务商、Agent 运行、记忆、提示词、默认分工",
	},
	{
		id: "workshop",
		label: "创作与工具",
		icon: Wrench,
		description: "生图、阅读器、语音、桌宠、工作区布局",
	},
	{
		id: "integrations",
		label: "集成与扩展",
		icon: Plug,
		description: "MCP 服务器、远程控制",
	},
	{
		id: "data",
		label: "数据与存储",
		icon: Database,
		description: "使用统计、存储目录、备份、产物、性能、危险区",
	},
] as const;

// =====================================================================
// 二级 Tab（21 条）
// Phase 1：load 字段一律指向旧面板文件；占位面板在 Phase 6 会切换
// =====================================================================

export const SETTINGS_SUBTABS: readonly SettingsSubtab[] = [
	// ---------- general ----------
	{
		id: "general.appearance",
		category: "general",
		label: "外观与主题",
		icon: Palette,
		load: asDefault(
			() => import("./panels/general/AppearancePanel"),
			"AppearancePanel",
		),
	},
	{
		id: "general.shortcuts",
		category: "general",
		label: "快捷键",
		icon: Keyboard,
		load: asDefault(
			() => import("./panels/ShortcutsSettings"),
			"ShortcutsSettings",
		),
	},
	{
		id: "general.about",
		category: "general",
		label: "关于与更新",
		icon: Info,
		load: asDefault(() => import("./panels/general/AboutPanel"), "AboutPanel"),
	},

	// ---------- ai ----------
	{
		id: "ai.models",
		category: "ai",
		label: "服务商与模型",
		icon: Boxes,
		load: asDefault(() => import("./panels/ai/models"), "ModelSettings"),
	},
	{
		id: "ai.agent",
		category: "ai",
		label: "Agent 运行",
		icon: Shield,
		load: asDefault(() => import("./panels/AgentSettings"), "AgentSettings"),
	},
	{
		id: "ai.memory",
		category: "ai",
		label: "Agent 记忆",
		icon: Brain,
		badge: { tone: "neutral", text: "数据" },
		load: asDefault(() => import("./panels/MemorySettings"), "MemorySettings"),
	},
	{
		id: "ai.prompts",
		category: "ai",
		label: "提示词模板",
		icon: MessageSquare,
		load: asDefault(() => import("./panels/ai/PromptsPanel"), "PromptsPanel"),
	},
	{
		id: "ai.defaults",
		category: "ai",
		label: "默认模型分工",
		icon: Sparkles,
		load: asDefault(() => import("./panels/ai/DefaultsPanel"), "DefaultsPanel"),
	},

	// ---------- workshop ----------
	{
		id: "workshop.imagegen",
		category: "workshop",
		label: "AI 生图",
		icon: ImageIcon,
		load: asDefault(
			() => import("./panels/ImageGenSettings"),
			"ImageGenSettings",
		),
	},
	{
		id: "workshop.reader",
		category: "workshop",
		label: "阅读器",
		icon: BookOpen,
		load: asDefault(() => import("./panels/ReaderSettings"), "ReaderSettings"),
	},
	{
		id: "workshop.tts",
		category: "workshop",
		label: "语音朗读",
		icon: Volume2,
		load: asDefault(() => import("./panels/TTSSettings"), "TTSSettings"),
	},
	{
		id: "workshop.mascot",
		category: "workshop",
		label: "桌面宠物",
		icon: Sparkles,
		load: asDefault(() => import("./panels/MascotSettings"), "MascotSettings"),
	},
	{
		id: "workshop.layout",
		category: "workshop",
		label: "工作区布局",
		icon: Layout,
		load: asDefault(
			() => import("./panels/workshop/LayoutPanel"),
			"LayoutPanel",
		),
	},
	{
		id: "workshop.terminal",
		category: "workshop",
		label: "终端",
		icon: Terminal,
		load: asDefault(
			() => import("./panels/workshop/TerminalPanel"),
			"TerminalPanel",
		),
	},
	{
		id: "workshop.styleprofile",
		category: "workshop",
		label: "语言风格包",
		icon: Pen,
		load: asDefault(
			() => import("./panels/styleProfile/StyleProfilePanel"),
			"StyleProfilePanel",
		),
	},

	// ---------- integrations ----------
	{
		id: "integrations.mcp",
		category: "integrations",
		label: "MCP 服务器",
		icon: Plug,
		load: asDefault(() => import("./panels/MCPSettings"), "MCPSettings"),
	},
	{
		id: "integrations.remote",
		category: "integrations",
		label: "远程控制",
		icon: Smartphone,
		load: asDefault(
			() => import("./panels/RemoteControlSettings"),
			"RemoteControlSettings",
		),
	},
	{
		id: "integrations.harnessHub",
		category: "integrations",
		label: "AI 入口互通",
		icon: Waypoints,
		load: asDefault(
			() => import("./panels/integrations/HarnessHubSettings"),
			"HarnessHubSettings",
		),
	},

	// ---------- data ----------
	{
		id: "data.stats",
		category: "data",
		label: "使用统计",
		icon: BarChart3,
		badge: { tone: "neutral", text: "数据" },
		load: () => import("./panels/data/stats"),
	},
	{
		id: "data.storage",
		category: "data",
		label: "存储目录",
		icon: HardDrive,
		load: () => import("./panels/data/storage"),
	},
	{
		id: "data.backup",
		category: "data",
		label: "备份与同步",
		icon: Blocks,
		load: () => import("./panels/data/backup"),
	},
	{
		id: "data.artifacts",
		category: "data",
		label: "产物管理",
		icon: Archive,
		load: () => import("./panels/data/artifacts"),
	},
	{
		id: "data.performance",
		category: "data",
		label: "性能",
		icon: Gauge,
		load: () => import("./panels/data/performance"),
	},
	{
		id: "data.danger",
		category: "data",
		label: "危险区",
		icon: Flame,
		load: () => import("./panels/data/danger"),
	},
] as const;

// =====================================================================
// 工具函数
// =====================================================================

/** 只读的 SettingsTabId 集合，供 `legacyTabMap` 判定 raw 是否已经是新 id */
export const SUBTAB_ID_SET: ReadonlySet<SettingsTabId> = new Set(
	SETTINGS_SUBTABS.map((s) => s.id),
);

const SUBTAB_MAP: ReadonlyMap<SettingsTabId, SettingsSubtab> = new Map(
	SETTINGS_SUBTABS.map((s) => [s.id, s]),
);

/** 取出某个一级分类下的所有子 Tab（按 `SETTINGS_SUBTABS` 声明顺序） */
export function getSubtabsByCategory(
	category: SettingsNavCategoryId,
): SettingsSubtab[] {
	return SETTINGS_SUBTABS.filter((s) => s.category === category);
}

/** 通过 id 找子 Tab；未找到返回 null */
export function getSubtab(id: SettingsTabId): SettingsSubtab | null {
	return SUBTAB_MAP.get(id) ?? null;
}

/** 取出某个一级分类的第一个子 Tab id；用于"切换分类时自动激活首个 subtab" */
export function getFirstSubtabOf(
	category: SettingsNavCategoryId,
): SettingsTabId {
	const first = SETTINGS_SUBTABS.find((s) => s.category === category);
	if (!first) {
		// 理论上不会发生（5 个分类都至少挂 1 个子 Tab），但给一个安全兜底
		return "ai.models";
	}
	return first.id;
}

/** 已知的分类 id 集合，便于外部判定 */
export const CATEGORY_ID_SET: ReadonlySet<SettingsNavCategoryId> = new Set(
	SETTINGS_CATEGORIES.map((c) => c.id),
);

/** 根据子 Tab id 反查所属的一级分类 id */
export function getCategoryOf(id: SettingsTabId): SettingsNavCategoryId | null {
	return getSubtab(id)?.category ?? null;
}
