// 快捷键注册中心 — 统一导出

export type { ShortcutDefinition, ShortcutGroup, ShortcutScope } from "./types";
export {
	shortcutRegistry,
	useShortcutRegistrySelector,
	isEditableTarget,
	type RegisteredShortcut,
} from "./registry";
export { formatKeys, normalizeKeys, parseKeys } from "./keys";
export {
	installGlobalShortcutListener,
	useRegisterShortcuts,
} from "./useShortcuts";
export { registerDefaultShortcuts } from "./defaultShortcuts";
