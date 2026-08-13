// 命令面板 Store — 全局打开/关闭 + 查询字符串状态 + 最近使用（MRU）+ 使用频率
//
// 使用方式：
//   - 任何组件可调用 commandPaletteStore.open()/close()
//   - <CommandPalette /> 挂在 App 顶层订阅状态
//   - Cmd+K 全局快捷键调用 toggle()
//   - 执行命令后 markRecent(id)，空查询时「最近使用」置顶、「常用」推荐次之

import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";

export interface CommandPaletteState {
	isOpen: boolean;
	/** 打开时输入框初始 query，可由调用方预填 */
	initialQuery: string;
	/** 最近执行过的命令 id（新→旧，上限 8，localStorage 持久化） */
	recentIds: string[];
	/**
	 * 命令累计执行次数（localStorage 持久化）。
	 * 空查询时按次数取 Top N 作为「常用」推荐位；任一命令超过上限时
	 * 全表减半衰减，让近期习惯的权重高于远古历史。
	 */
	usageCounts: Record<string, number>;
}

const RECENT_STORAGE_KEY = "commandPalette.recent";
const USAGE_STORAGE_KEY = "commandPalette.usage";
const RECENT_LIMIT = 8;
/** 单命令计数上限；触顶时全表减半，实现简易的时间衰减。 */
const USAGE_COUNT_CAP = 128;

function loadRecentIds(): string[] {
	try {
		const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((x): x is string => typeof x === "string");
	} catch {
		return [];
	}
}

function persistRecentIds(ids: string[]) {
	try {
		window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(ids));
	} catch {
		// localStorage 不可用时静默降级为会话内 MRU
	}
}

function loadUsageCounts(): Record<string, number> {
	try {
		const raw = window.localStorage.getItem(USAGE_STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}
		const result: Record<string, number> = {};
		for (const [key, value] of Object.entries(parsed)) {
			if (typeof value === "number" && Number.isFinite(value) && value > 0) {
				result[key] = value;
			}
		}
		return result;
	} catch {
		return {};
	}
}

function persistUsageCounts(counts: Record<string, number>) {
	try {
		window.localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(counts));
	} catch {
		// localStorage 不可用时静默降级为会话内计数
	}
}

const store = createStore<CommandPaletteState>({
	isOpen: false,
	initialQuery: "",
	recentIds: typeof window === "undefined" ? [] : loadRecentIds(),
	usageCounts: typeof window === "undefined" ? {} : loadUsageCounts(),
});

export const commandPaletteStore = {
	getState: store.getState,
	subscribe: store.subscribe,
	open(initialQuery = "") {
		store.setState((s) => ({ ...s, isOpen: true, initialQuery }));
	},
	close() {
		store.setState((s) => (s.isOpen ? { ...s, isOpen: false } : s));
	},
	toggle() {
		store.setState((s) => ({
			...s,
			isOpen: !s.isOpen,
			initialQuery: s.isOpen ? s.initialQuery : "",
		}));
	},
	markRecent(id: string) {
		store.setState((s) => {
			const next = [id, ...s.recentIds.filter((x) => x !== id)].slice(
				0,
				RECENT_LIMIT,
			);
			persistRecentIds(next);

			let counts: Record<string, number> = {
				...s.usageCounts,
				[id]: (s.usageCounts[id] ?? 0) + 1,
			};
			if ((counts[id] ?? 0) > USAGE_COUNT_CAP) {
				// 全表减半衰减：保持相对排序，同时让新习惯能追上旧高频命令
				const decayed: Record<string, number> = {};
				for (const [key, value] of Object.entries(counts)) {
					const half = Math.floor(value / 2);
					if (half > 0) decayed[key] = half;
				}
				counts = decayed;
			}
			persistUsageCounts(counts);
			return { ...s, recentIds: next, usageCounts: counts };
		});
	},
	clearRecent() {
		store.setState((s) => {
			persistRecentIds([]);
			persistUsageCounts({});
			return { ...s, recentIds: [], usageCounts: {} };
		});
	},
};

export const useCommandPaletteStore = createUseStore(store);
export const useCommandPaletteStoreSelector = createUseStoreSelector(store);
