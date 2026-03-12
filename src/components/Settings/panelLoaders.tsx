import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import type { SettingsTabId } from "./types";

export type { SettingsTabId } from "./types";

type PanelModule = { default: ComponentType };
type PanelImporter = () => Promise<PanelModule>;

function toDefault<T extends Record<string, unknown>, K extends keyof T>(
	importer: () => Promise<T>,
	exportName: K,
): PanelImporter {
	return async () => {
		const mod = await importer();
		return { default: mod[exportName] as ComponentType };
	};
}

const panelImporters: Record<SettingsTabId, PanelImporter> = {
	dashboard: toDefault(
		() => import("./panels/DashboardSettings"),
		"DashboardSettings",
	),
	aiCoding: toDefault(
		() => import("./panels/AICodingSettings"),
		"AICodingSettings",
	),
	models: toDefault(() => import("./panels/ModelSettings"), "ModelSettings"),
	prompts: toDefault(() => import("./panels/PromptSettings"), "PromptSettings"),
	imagegen: toDefault(
		() => import("./panels/ImageGenSettings"),
		"ImageGenSettings",
	),
	agent: toDefault(() => import("./panels/AgentSettings"), "AgentSettings"),
	skills: toDefault(() => import("./panels/SkillsSettings"), "SkillsSettings"),
	mcp: toDefault(() => import("./panels/MCPSettings"), "MCPSettings"),
	remoteControl: toDefault(
		() => import("./panels/RemoteControlSettings"),
		"RemoteControlSettings",
	),
	general: toDefault(
		() => import("./panels/GeneralSettings"),
		"GeneralSettings",
	),
	performance: toDefault(
		() => import("./panels/PerformanceSettings"),
		"PerformanceSettings",
	),
	data: toDefault(() => import("./panels/DataSettings"), "DataSettings"),
	artifacts: toDefault(
		() => import("./panels/ArtifactSettings"),
		"ArtifactSettings",
	),
};

const panelComponents = Object.fromEntries(
	Object.entries(panelImporters).map(([tabId, importer]) => [
		tabId,
		lazy(importer),
	]),
) as Record<SettingsTabId, LazyExoticComponent<ComponentType>>;

export function getSettingsPanelComponent(tabId: SettingsTabId) {
	return panelComponents[tabId];
}

export function preloadSettingsPanel(tabId: SettingsTabId) {
	void panelImporters[tabId]?.();
}
