// 命令面板 Store — 全局打开/关闭 + 查询字符串状态 + 最近使用（MRU）
//
// 使用方式：
//   - 任何组件可调用 commandPaletteStore.open()/close()
//   - <CommandPalette /> 挂在 App 顶层订阅状态
//   - Cmd+K 全局快捷键调用 toggle()
//   - 执行命令后 markRecent(id)，空查询时「最近使用」置顶

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
}

const RECENT_STORAGE_KEY = "commandPalette.recent";
const RECENT_LIMIT = 8;

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

const store = createStore<CommandPaletteState>({
	isOpen: false,
	initialQuery: "",
	recentIds: typeof window === "undefined" ? [] : loadRecentIds(),
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
			return { ...s, recentIds: next };
		});
	},
	clearRecent() {
		store.setState((s) => {
			persistRecentIds([]);
			return { ...s, recentIds: [] };
		});
	},
};

export const useCommandPaletteStore = createUseStore(store);
export const useCommandPaletteStoreSelector = createUseStoreSelector(store);
