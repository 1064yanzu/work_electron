// 快捷键注册中心 — createStore 驱动的单一事实源
//
// 分发规则：后注册者优先（scoped 快捷键随视图挂载注册，天然遮蔽同键位的全局项）；
// 冲突（同规范化键位、均可分发）在注册时 console.warn，便于开发期发现。

import { createStore, createUseStoreSelector } from "../stores/createStore";
import {
	eventMatchesKeys,
	normalizeKeys,
	parseKeys,
	formatKeys,
	type ParsedKeys,
} from "./keys";
import type { ShortcutDefinition } from "./types";

export interface RegisteredShortcut extends ShortcutDefinition {
	parsed: ParsedKeys | null;
	normalized: string | null;
	seq: number;
}

interface ShortcutRegistryState {
	entries: RegisteredShortcut[];
	cheatSheetOpen: boolean;
}

const store = createStore<ShortcutRegistryState>({
	entries: [],
	cheatSheetOpen: false,
});

let seqCounter = 0;

/** 焦点在可编辑元素上时，默认不分发快捷键（与既有 SandboxWorkspace 行为一致） */
export function isEditableTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el) return false;
	const tag = el.tagName?.toLowerCase();
	return (
		tag === "input" ||
		tag === "textarea" ||
		tag === "select" ||
		Boolean(el.isContentEditable)
	);
}

function register(defs: ShortcutDefinition[]): () => void {
	const registered: RegisteredShortcut[] = defs.map((def) => ({
		...def,
		parsed: def.displayOnly ? null : parseKeys(def.keys),
		normalized: def.displayOnly ? null : normalizeKeys(def.keys),
		seq: seqCounter++,
	}));

	// 开发期冲突警告：同键位且都参与分发
	if (import.meta.env.DEV) {
		const existing = store.getState().entries;
		for (const next of registered) {
			if (!next.normalized || next.displayOnly) continue;
			const clash = existing.find(
				(e) => !e.displayOnly && e.normalized === next.normalized && e.handler,
			);
			if (clash && next.handler) {
				console.warn(
					`[shortcuts] 快捷键冲突：'${next.id}' 与 '${clash.id}' 都注册了 ${next.normalized}，后注册者（${next.id}）生效`,
				);
			}
		}
	}

	store.setState((prev) => ({
		...prev,
		entries: [...prev.entries, ...registered],
	}));

	const ids = new Set(registered.map((r) => r.seq));
	return () => {
		store.setState((prev) => ({
			...prev,
			entries: prev.entries.filter((e) => !ids.has(e.seq)),
		}));
	};
}

/** 全局 keydown 分发：命中即 preventDefault，返回是否已处理 */
function dispatch(e: KeyboardEvent): boolean {
	const { entries } = store.getState();
	// 后注册者优先
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.displayOnly || !entry.handler || !entry.parsed) continue;
		if (!eventMatchesKeys(e, entry.parsed)) continue;
		if (!entry.allowInInput && isEditableTarget(e.target)) continue;
		if (entry.when && !entry.when()) continue;
		e.preventDefault();
		entry.handler(e);
		return true;
	}
	return false;
}

function getAll(): RegisteredShortcut[] {
	return store.getState().entries;
}

function getByCommand(commandId: string): RegisteredShortcut | undefined {
	const { entries } = store.getState();
	// 后注册者优先，与分发一致
	for (let i = entries.length - 1; i >= 0; i--) {
		if (entries[i].commandId === commandId) return entries[i];
	}
	return undefined;
}

function openCheatSheet() {
	store.setState((prev) =>
		prev.cheatSheetOpen ? prev : { ...prev, cheatSheetOpen: true },
	);
}

function closeCheatSheet() {
	store.setState((prev) =>
		prev.cheatSheetOpen ? { ...prev, cheatSheetOpen: false } : prev,
	);
}

function toggleCheatSheet() {
	store.setState((prev) => ({ ...prev, cheatSheetOpen: !prev.cheatSheetOpen }));
}

export const shortcutRegistry = {
	register,
	dispatch,
	getAll,
	getByCommand,
	formatKeys,
	openCheatSheet,
	closeCheatSheet,
	toggleCheatSheet,
	subscribe: store.subscribe,
	getState: store.getState,
};

export const useShortcutRegistrySelector = createUseStoreSelector(store);
