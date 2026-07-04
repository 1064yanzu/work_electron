// 命令注册 API — 供功能面板动态注册命令面板条目
//
// 用法：
//   const unregister = commandRegistry.register("wiki", [{ id: "wiki.rebuild", ... }]);
//   卸载时调用 unregister()。
// useCommands 会把 registry 内容与静态命令合并。

import type { CommandItem } from "../../components/CommandPalette/types";
import { createStore, createUseStoreSelector } from "../stores/createStore";

interface CommandRegistryState {
	/** source → 该来源注册的命令 */
	sources: ReadonlyMap<string, CommandItem[]>;
}

const store = createStore<CommandRegistryState>({
	sources: new Map(),
});

function register(source: string, items: CommandItem[]): () => void {
	store.setState((prev) => {
		const next = new Map(prev.sources);
		next.set(source, items);
		return { sources: next };
	});
	return () => {
		store.setState((prev) => {
			if (!prev.sources.has(source)) return prev;
			const next = new Map(prev.sources);
			next.delete(source);
			return { sources: next };
		});
	};
}

function getAll(): CommandItem[] {
	const all: CommandItem[] = [];
	for (const items of store.getState().sources.values()) {
		all.push(...items);
	}
	return all;
}

export const commandRegistry = {
	register,
	getAll,
	subscribe: store.subscribe,
	getState: store.getState,
};

export const useCommandRegistrySelector = createUseStoreSelector(store);
