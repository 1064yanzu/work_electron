// 命令面板 Store — 全局打开/关闭 + 查询字符串状态
//
// 使用方式：
//   - 任何组件可调用 commandPaletteStore.open()/close()
//   - <CommandPalette /> 挂在 App 顶层订阅状态
//   - Cmd+K 全局快捷键调用 toggle()

import {
	createStore,
	createUseStore,
	createUseStoreSelector,
} from "./createStore";

export interface CommandPaletteState {
	isOpen: boolean;
	/** 打开时输入框初始 query，可由调用方预填 */
	initialQuery: string;
}

const store = createStore<CommandPaletteState>({
	isOpen: false,
	initialQuery: "",
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
};

export const useCommandPaletteStore = createUseStore(store);
export const useCommandPaletteStoreSelector = createUseStoreSelector(store);
