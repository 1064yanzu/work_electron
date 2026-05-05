/**
 * 墨鱼君 IP 资产清单
 *
 * 静态收集 src/assets/mascots/ 下所有 PNG，按 id + slot 索引。
 * 设计意图：让组件层只通过 useMascot().getAsset(slot) 取资产，
 * 不需要知道当前选了哪个 IP。
 */

export type MascotId = "efficiency" | "cloud" | "leisure";

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
 *
 * 当前 leisure（摸鱼生活）有 loading 视频；spritesheet 动画走 MascotMotion。
 */
export type MascotAnimation = "loading";

/**
 * Spritesheet 动画语义（项目侧 UI 用）
 *
 * 不直接对应 atlas 的 row（atlas 来自 codex hatch-pet，9 行；
 * 其中 running-* 在桌面应用场景用不上）。运行时通过
 * MOTION_TO_ROW 映射到 atlas 行。
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
 * `~/.codex/skills/hatch-pet/references/animation-rows.md`
 *
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

/**
 * UI 语义 → atlas 行 映射
 *
 * 设计意图（见 plan codex-ip-snappy-porcupine.md 第二节）：
 * - idle    → row 0 (idle)        ：与 hatch-pet 同义
 * - thinking→ row 8 (review)      ：review 是"专注查看"，最贴近 thinking
 * - greet   → row 3 (waving)      ：打招呼
 * - done    → row 4 (jumping)     ：庆祝/任务完成
 * - sad     → row 5 (failed)      ：失败/委屈
 * - sleepy  → row 6 (waiting)     ：缓慢呼吸/耐心等候，最近似困倦
 * - run-left  → row 2 (running-left) ：拖动向左偏
 * - run-right → row 1 (running-right)：拖动向右偏
 */
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
}

export const MASCOT_IDS: MascotId[] = ["efficiency", "cloud", "leisure"];

export const MASCOT_META: Record<MascotId, MascotMeta> = {
	efficiency: {
		id: "efficiency",
		label: "效率引擎",
		tagline: "聪明高效，专注把事情做完",
		personality: "近黑色 Q 版小章鱼，蓝色斑点，气质冷静聪明。",
		accentColor: "#1B6FA8",
	},
	cloud: {
		id: "cloud",
		label: "云端助理",
		tagline: "轻盈温柔，云朵上的 AI 陪伴",
		personality: "云朵底座、金星发饰、紫触手，气质轻盈温柔。",
		accentColor: "#A78BFA",
	},
	leisure: {
		id: "leisure",
		label: "摸鱼生活",
		tagline: "治愈松弛，陪你认真摸鱼",
		personality: "深灰毛绒章鱼，头顶淡紫小鱼，松弛治愈。",
		accentColor: "#8B7DAB",
	},
};

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

function buildAssetTable(): Record<MascotId, Record<MascotSlot, string>> {
	const table: Record<MascotId, Partial<Record<MascotSlot, string>>> = {
		efficiency: {},
		cloud: {},
		leisure: {},
	};

	for (const [filePath, mod] of Object.entries(assetModules)) {
		const match = filePath.match(/\/mascots\/([^/]+)\/([^/]+)\.png$/);
		if (!match) continue;
		const [, id, slot] = match;
		if (!isMascotId(id) || !isMascotSlot(slot)) continue;
		table[id][slot] = mod.default;
	}

	const finalized: Record<MascotId, Record<MascotSlot, string>> = {} as Record<
		MascotId,
		Record<MascotSlot, string>
	>;

	for (const id of MASCOT_IDS) {
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

function isMascotId(value: string): value is MascotId {
	return value === "efficiency" || value === "cloud" || value === "leisure";
}

function isMascotSlot(value: string): value is MascotSlot {
	return (ALL_SLOTS as string[]).includes(value);
}

function isMascotAnimation(value: string): value is MascotAnimation {
	return (ALL_ANIMATIONS as string[]).includes(value);
}

function buildAnimationTable(): Record<
	MascotId,
	Partial<Record<MascotAnimation, string>>
> {
	const table: Record<MascotId, Partial<Record<MascotAnimation, string>>> = {
		efficiency: {},
		cloud: {},
		leisure: {},
	};
	for (const [filePath, mod] of Object.entries(animationModules)) {
		const match = filePath.match(/\/mascots\/([^/]+)\/([^/]+)\.mp4$/);
		if (!match) continue;
		const [, id, animation] = match;
		if (!isMascotId(id) || !isMascotAnimation(animation)) continue;
		table[id][animation] = mod.default;
	}
	return table;
}

export const MASCOT_ASSETS = buildAssetTable();
export const MASCOT_ANIMATIONS = buildAnimationTable();
export const MASCOT_ATLASES = buildAtlasTable();

export function getMascotAsset(id: MascotId, slot: MascotSlot): string {
	return MASCOT_ASSETS[id]?.[slot] ?? MASCOT_ASSETS[id]?.hero ?? "";
}

/**
 * 取指定 IP 的视频动画 URL；缺位时返回 null（组件层应 fallback 到 PNG）
 */
export function getMascotAnimation(
	id: MascotId,
	animation: MascotAnimation,
): string | null {
	return MASCOT_ANIMATIONS[id]?.[animation] ?? null;
}

/**
 * 取指定 IP 的 spritesheet atlas URL；缺位返回 null
 */
export function getMascotAtlas(id: MascotId): string | null {
	return MASCOT_ATLASES[id] ?? null;
}

/**
 * 取指定 UI 动画语义的行规格（rowIndex / frameCount / durations）
 */
export function getMotionSpec(motion: MascotMotion): SpriteRowSpec {
	return MOTION_TO_ROW[motion];
}

function buildAtlasTable(): Record<MascotId, string | null> {
	const table: Record<MascotId, string | null> = {
		efficiency: null,
		cloud: null,
		leisure: null,
	};
	for (const [filePath, mod] of Object.entries(atlasModules)) {
		const match = filePath.match(/\/mascots\/([^/]+)\/atlas\.webp$/);
		if (!match) continue;
		const [, id] = match;
		if (!isMascotId(id)) continue;
		table[id] = mod.default;
	}
	return table;
}
