/**
 * 桌宠 IP 资产清单
 *
 * 双层 resolver 架构：
 *   getMascotAsset(id, slot) → 内置静态表查（Vite import.meta.glob）
 *                            → 未命中转给 customResolver（自定义桌宠走 mascot:// protocol）
 *
 * 内置 3 个（efficiency/cloud/leisure）继续走编译时静态收集；
 * 自定义桌宠由渲染进程的 mascotStore 注入 customResolver，
 * 最终通过 mascot://<id>/<slot>.<ext> 由主进程 protocol handler 提供文件。
 */

export type MascotId = string;

export const BUILTIN_MASCOT_IDS = ["efficiency", "cloud", "leisure"] as const;
export type BuiltinMascotId = (typeof BUILTIN_MASCOT_IDS)[number];

export type MascotSlot =
	| "hero"
	| "emotion-happy"
	| "emotion-thinking"
	| "emotion-focus"
	| "emotion-surprise"
	| "emotion-sad"
	| "emotion-sleepy"
	| "state-greet"
	| "state-organize"
	| "state-remind"
	| "state-done"
	| "empty-404"
	| "empty-no-data"
	| "empty-error"
	| "onboarding-1"
	| "onboarding-2"
	| "onboarding-3";

/**
 * 视频动画 slot
 *
 * 与 PNG 静态 slot 解耦：动画是渐进增强项，缺位时组件层 fallback
 * 到对应的 PNG slot（例如 loading → emotion-thinking）。
 */
export type MascotAnimation = "loading";

/**
 * Spritesheet 动画语义（项目侧 UI 用）
 */
export type MascotMotion =
	| "idle"
	| "thinking"
	| "greet"
	| "done"
	| "sad"
	| "sleepy"
	| "run-left"
	| "run-right";

/**
 * Atlas 行规格 — 来自 codex hatch-pet 标准
 * 8 列 × 9 行 × 192×208 像素（atlas: 1536×1872）
 */
export interface SpriteRowSpec {
	rowIndex: number;
	frameCount: number;
	durations: number[];
}

const HATCH_PET_ROWS = {
	idle: {
		rowIndex: 0,
		frameCount: 6,
		durations: [280, 110, 110, 140, 140, 320],
	},
	"running-right": {
		rowIndex: 1,
		frameCount: 8,
		durations: [120, 120, 120, 120, 120, 120, 120, 220],
	},
	"running-left": {
		rowIndex: 2,
		frameCount: 8,
		durations: [120, 120, 120, 120, 120, 120, 120, 220],
	},
	waving: { rowIndex: 3, frameCount: 4, durations: [140, 140, 140, 280] },
	jumping: { rowIndex: 4, frameCount: 5, durations: [140, 140, 140, 140, 280] },
	failed: {
		rowIndex: 5,
		frameCount: 8,
		durations: [140, 140, 140, 140, 140, 140, 140, 240],
	},
	waiting: {
		rowIndex: 6,
		frameCount: 6,
		durations: [150, 150, 150, 150, 150, 260],
	},
	running: {
		rowIndex: 7,
		frameCount: 6,
		durations: [120, 120, 120, 120, 120, 220],
	},
	review: {
		rowIndex: 8,
		frameCount: 6,
		durations: [150, 150, 150, 150, 150, 280],
	},
} as const satisfies Record<string, SpriteRowSpec>;

const MOTION_TO_ROW: Record<MascotMotion, SpriteRowSpec> = {
	idle: HATCH_PET_ROWS.idle,
	thinking: HATCH_PET_ROWS.review,
	greet: HATCH_PET_ROWS.waving,
	done: HATCH_PET_ROWS.jumping,
	sad: HATCH_PET_ROWS.failed,
	sleepy: HATCH_PET_ROWS.waiting,
	"run-left": HATCH_PET_ROWS["running-left"],
	"run-right": HATCH_PET_ROWS["running-right"],
};

/** Atlas 几何（hatch-pet 标准） */
export const SPRITE_ATLAS = {
	cellWidth: 192,
	cellHeight: 208,
	cols: 8,
	rows: 9,
	atlasWidth: 1536,
	atlasHeight: 1872,
} as const;

export interface MascotMeta {
	id: MascotId;
	label: string;
	tagline: string;
	personality: string;
	accentColor: string;
	/** 内置桌宠 = true；用户上传的 = false */
	isBuiltin: boolean;
	/** 自定义桌宠的 schemaVersion；内置不需要 */
	version?: number;
}

/** 内置 IP 列表（顺序即 UI 显示顺序） */
export const BUILTIN_MASCOT_LIST: BuiltinMascotId[] = [
	"efficiency",
	"cloud",
	"leisure",
];

/** @deprecated 用 BUILTIN_MASCOT_LIST 替代；保留兼容旧调用方 */
export const MASCOT_IDS: BuiltinMascotId[] = BUILTIN_MASCOT_LIST;

export const BUILTIN_MASCOT_META: Record<BuiltinMascotId, MascotMeta> = {
	efficiency: {
		id: "efficiency",
		label: "效率引擎",
		tagline: "聪明高效，专注把事情做完",
		personality: "蓝黑色圆章鱼，亮蓝椭圆斑点，星形眼神高光，气质冷静聪明。",
		accentColor: "#1B6FA8",
		isBuiltin: true,
	},
	cloud: {
		id: "cloud",
		label: "云端助理",
		tagline: "轻盈温柔，云朵上的 AI 陪伴",
		personality:
			"深紫色 Q 版小章鱼，星星发饰、浅紫吸盘、AI 项圈，气质轻盈温柔。",
		accentColor: "#A78BFA",
		isBuiltin: true,
	},
	leisure: {
		id: "leisure",
		label: "摸鱼生活",
		tagline: "治愈松弛，陪你认真摸鱼",
		personality: "黑色毛绒团子章鱼，超大圆眼、粉腮红，头顶淡紫小鱼，松弛治愈。",
		accentColor: "#8B7DAB",
		isBuiltin: true,
	},
};

/** @deprecated 用 BUILTIN_MASCOT_META 替代；保留兼容旧调用方 */
export const MASCOT_META: Record<BuiltinMascotId, MascotMeta> =
	BUILTIN_MASCOT_META;

const ALL_SLOTS: MascotSlot[] = [
	"hero",
	"emotion-happy",
	"emotion-thinking",
	"emotion-focus",
	"emotion-surprise",
	"emotion-sad",
	"emotion-sleepy",
	"state-greet",
	"state-organize",
	"state-remind",
	"state-done",
	"empty-404",
	"empty-no-data",
	"empty-error",
	"onboarding-1",
	"onboarding-2",
	"onboarding-3",
];

const assetModules = import.meta.glob<{ default: string }>(
	"../../assets/mascots/**/*.png",
	{ eager: true },
);

const animationModules = import.meta.glob<{ default: string }>(
	"../../assets/mascots/**/*.mp4",
	{ eager: true },
);

const atlasModules = import.meta.glob<{ default: string }>(
	"../../assets/mascots/**/atlas.webp",
	{ eager: true },
);

const ALL_ANIMATIONS: MascotAnimation[] = ["loading"];

function buildAssetTable(): Record<
	BuiltinMascotId,
	Record<MascotSlot, string>
> {
	const table: Record<BuiltinMascotId, Partial<Record<MascotSlot, string>>> = {
		efficiency: {},
		cloud: {},
		leisure: {},
	};

	for (const [filePath, mod] of Object.entries(assetModules)) {
		const match = filePath.match(/\/mascots\/([^/]+)\/([^/]+)\.png$/);
		if (!match) continue;
		const [, id, slot] = match;
		if (!isBuiltinMascotId(id) || !isMascotSlot(slot)) continue;
		table[id][slot] = mod.default;
	}

	const finalized: Record<
		BuiltinMascotId,
		Record<MascotSlot, string>
	> = {} as Record<BuiltinMascotId, Record<MascotSlot, string>>;

	for (const id of BUILTIN_MASCOT_LIST) {
		const slotMap = table[id];
		const hero = slotMap.hero;
		const filled: Record<MascotSlot, string> = {} as Record<MascotSlot, string>;
		for (const slot of ALL_SLOTS) {
			filled[slot] = slotMap[slot] ?? hero ?? "";
		}
		finalized[id] = filled;
	}

	return finalized;
}

export function isBuiltinMascotId(value: string): value is BuiltinMascotId {
	return (BUILTIN_MASCOT_IDS as readonly string[]).includes(value);
}

function isMascotSlot(value: string): value is MascotSlot {
	return (ALL_SLOTS as string[]).includes(value);
}

function isMascotAnimation(value: string): value is MascotAnimation {
	return (ALL_ANIMATIONS as string[]).includes(value);
}

function buildAnimationTable(): Record<
	BuiltinMascotId,
	Partial<Record<MascotAnimation, string>>
> {
	const table: Record<
		BuiltinMascotId,
		Partial<Record<MascotAnimation, string>>
	> = {
		efficiency: {},
		cloud: {},
		leisure: {},
	};
	for (const [filePath, mod] of Object.entries(animationModules)) {
		const match = filePath.match(/\/mascots\/([^/]+)\/([^/]+)\.mp4$/);
		if (!match) continue;
		const [, id, animation] = match;
		if (!isBuiltinMascotId(id) || !isMascotAnimation(animation)) continue;
		table[id][animation] = mod.default;
	}
	return table;
}

function buildAtlasTable(): Record<BuiltinMascotId, string | null> {
	const table: Record<BuiltinMascotId, string | null> = {
		efficiency: null,
		cloud: null,
		leisure: null,
	};
	for (const [filePath, mod] of Object.entries(atlasModules)) {
		const match = filePath.match(/\/mascots\/([^/]+)\/atlas\.webp$/);
		if (!match) continue;
		const [, id] = match;
		if (!isBuiltinMascotId(id)) continue;
		table[id] = mod.default;
	}
	return table;
}

export const MASCOT_ASSETS = buildAssetTable();
export const MASCOT_ANIMATIONS = buildAnimationTable();
export const MASCOT_ATLASES = buildAtlasTable();

// ── 自定义桌宠 resolver 注入点 ──
//
// 渲染进程的 mascotStore 在初始化时调用 setCustomResolver 注入实现，
// 这里 lib 不反向依赖 store，只通过函数引用拿值。
//
// resolver 的语义：传入 (id, slot) 返回该自定义桌宠的资源 URL；缺位返回 null。

/** 自定义桌宠的 atlas 网格信息（来自主进程 codex 兼容层） */
export interface CustomAtlasInfo {
	columns: number;
	rows: number;
	cellWidth: number;
	cellHeight: number;
	width: number;
	height: number;
	rowMap?: Array<{ state: string; row: number; frames: number }>;
}

export interface CustomMascotResolver {
	asset: (id: string, slot: MascotSlot) => string | null;
	atlas: (id: string) => string | null;
	/** 自定义桌宠的 codex 风格 spritesheet（webp/png）URL；缺位返回 null */
	spritesheet: (id: string) => string | null;
	/** 自定义桌宠的 atlas 网格信息；缺位返回 null */
	atlasInfo: (id: string) => CustomAtlasInfo | null;
	animation: (id: string, animation: MascotAnimation) => string | null;
	meta: (id: string) => MascotMeta | null;
}

let customResolver: CustomMascotResolver | null = null;

export function setCustomResolver(resolver: CustomMascotResolver | null): void {
	customResolver = resolver;
}

export function getMascotAsset(id: MascotId, slot: MascotSlot): string {
	if (isBuiltinMascotId(id)) {
		return MASCOT_ASSETS[id]?.[slot] ?? MASCOT_ASSETS[id]?.hero ?? "";
	}
	if (customResolver) {
		const url = customResolver.asset(id, slot);
		if (url) return url;
		const hero = customResolver.asset(id, "hero");
		if (hero) return hero;
	}
	return "";
}

/**
 * 取指定 IP 的视频动画 URL；缺位时返回 null（组件层应 fallback 到 PNG）
 */
export function getMascotAnimation(
	id: MascotId,
	animation: MascotAnimation,
): string | null {
	if (isBuiltinMascotId(id)) {
		return MASCOT_ANIMATIONS[id]?.[animation] ?? null;
	}
	return customResolver?.animation(id, animation) ?? null;
}

/**
 * 取指定 IP 的 spritesheet atlas URL；缺位返回 null
 *
 * - 内置：使用打包时的 atlas.webp
 * - 自定义：先尝试自家 atlas，再退到 codex 风格 spritesheet
 */
export function getMascotAtlas(id: MascotId): string | null {
	if (isBuiltinMascotId(id)) {
		return MASCOT_ATLASES[id] ?? null;
	}
	if (!customResolver) return null;
	return customResolver.atlas(id) ?? customResolver.spritesheet(id) ?? null;
}

/**
 * 取自定义桌宠的 atlas 网格信息（cells / rows / rowMap）；
 * 内置桌宠使用 SPRITE_ATLAS 标准（hatch-pet 8x9 / 192x208）
 */
export function getMascotAtlasInfo(id: MascotId): CustomAtlasInfo | null {
	if (isBuiltinMascotId(id)) {
		return {
			columns: SPRITE_ATLAS.cols,
			rows: SPRITE_ATLAS.rows,
			cellWidth: SPRITE_ATLAS.cellWidth,
			cellHeight: SPRITE_ATLAS.cellHeight,
			width: SPRITE_ATLAS.atlasWidth,
			height: SPRITE_ATLAS.atlasHeight,
		};
	}
	return customResolver?.atlasInfo(id) ?? null;
}

/**
 * 取指定 UI 动画语义的行规格（rowIndex / frameCount / durations）
 */
export function getMotionSpec(motion: MascotMotion): SpriteRowSpec {
	return MOTION_TO_ROW[motion];
}

/**
 * 合并查询 meta：内置或自定义皆可命中。未命中返回 null。
 */
export function getMascotMeta(id: MascotId): MascotMeta | null {
	if (isBuiltinMascotId(id)) {
		return BUILTIN_MASCOT_META[id];
	}
	return customResolver?.meta(id) ?? null;
}
