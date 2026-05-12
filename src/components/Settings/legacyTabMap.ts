/**
 * legacyTabMap.ts — 旧 Tab id 到新 SettingsTabId 的单向映射
 *
 * 外部调用方（App.tsx / CommandPalette / ReaderShell / SidebarRail 等）传入的
 * tab id 可能是：
 *   a) 新的 `SettingsTabId`，直接放行；
 *   b) 旧的扁平 id（`models` / `agent` / `memory` 等），查 `LEGACY_MAP` 归一；
 *   c) 未知 id，降级到 `ai.models` 并 `console.warn` 一次。
 */
import { SUBTAB_ID_SET, type SettingsTabId } from "./settingsCatalog";

/**
 * 旧 → 新 映射表。覆盖所有 Phase 1 之前的 legacy id 以及 `CommandPalette` 里
 * 仍然引用的非面板 id（`theme` / `skills`）。
 */
export const LEGACY_MAP: Record<string, SettingsTabId> = {
	// --- 旧一级 Tab（1:1 直转） ---
	models: "ai.models",
	agent: "ai.agent",
	memory: "ai.memory",
	prompts: "ai.prompts",
	imagegen: "workshop.imagegen",
	reader: "workshop.reader",
	tts: "workshop.tts",
	mascot: "workshop.mascot",
	sandboxPreview: "workshop.layout",
	terminal: "workshop.terminal",
	mcp: "integrations.mcp",
	remoteControl: "integrations.remote",
	dashboard: "data.stats",
	data: "data.storage",
	artifacts: "data.artifacts",
	performance: "data.performance",
	shortcuts: "general.shortcuts",
	general: "general.appearance",

	// --- CommandPalette 里使用的非面板别名 ---
	theme: "general.appearance",
	skills: "ai.defaults",
};

/**
 * 把外部传入的 raw tab id 归一化为新的 `SettingsTabId`。
 *
 * - 已经是新 id：原样返回；
 * - 命中 `LEGACY_MAP`：返回映射结果；
 * - 未命中：降级到 `"ai.models"` 并 `console.warn` 一次。
 */
export function resolveSettingsTabId(
	raw: string | undefined | null,
): SettingsTabId {
	if (!raw) return "ai.models";

	// 已经是新的 SettingsTabId
	if (SUBTAB_ID_SET.has(raw as SettingsTabId)) {
		return raw as SettingsTabId;
	}

	// legacy 映射
	const mapped = LEGACY_MAP[raw];
	if (mapped) return mapped;

	console.warn("[settings] unknown tab id, fallback to ai.models:", raw);
	return "ai.models";
}
