import { invoke } from "../tauriCompat";

// ==================== Agent Skills API ====================

export interface SkillMetadata {
	name: string;
	description: string;
	location: string;
	enabled: boolean;
	/** 来自 SKILL.md `od.mode` 或描述启发的分类标签 */
	modeClass: "design" | "general";
	/** 原始 od.mode 值（若存在），用于在 UI 上展示分类 chip */
	modeTag?: string;
	/** 来自 Claude 插件市场等只读源，本面板不允许删除 */
	readonly?: boolean;
}

/** 列出所有已安装的技能 */
export async function listSkills(): Promise<SkillMetadata[]> {
	return invoke("list_skills");
}

/** 导入技能文件夹 */
export async function importSkill(sourcePath: string): Promise<SkillMetadata> {
	return invoke("import_skill", { sourcePath });
}

/** 删除技能 */
export async function deleteSkill(skillName: string): Promise<void> {
	return invoke("delete_skill", { skillName });
}

/** 设置技能启用状态（手动 override） */
export async function setSkillEnabled(
	skillName: string,
	enabled: boolean,
): Promise<void> {
	return invoke("set_skill_enabled", { skillName, enabled });
}

// ==================== Skills Marketplace API ====================

export type MarketplaceSourceType =
	| "anthropic_marketplace_json"
	| "skills_sh"
	| "tencent_skillhub"
	| "custom_json";

export type MarketplaceSourceTrust = "official" | "community" | "custom";

export interface MarketplaceSourceConfig {
	id: string;
	name: string;
	type: MarketplaceSourceType;
	url: string;
	enabled: boolean;
	trust?: MarketplaceSourceTrust;
}

export interface MarketplaceMirror {
	id: string;
	name: string;
	pattern: string;
	enabled: boolean;
}

export interface MarketplaceListSourcesResult {
	sources: MarketplaceSourceConfig[];
	mirrors: MarketplaceMirror[];
	autoCheck: boolean;
}

export interface MarketplaceEntry {
	id: string;
	sourceId: string;
	trust: MarketplaceSourceTrust;
	name: string;
	displayName?: string;
	description: string;
	version?: string;
	author?: string;
	homepage?: string;
	tags?: string[];
	icon?: string;
	license?: string;
	sha256?: string;
	artifact: unknown;
	rawSourceUrl?: string;
	installed?: boolean;
	installedVersion?: string;
}

export interface MarketplaceSearchResult {
	entries: MarketplaceEntry[];
	errors: Array<{ sourceId: string; error: string }>;
}

export interface MarketplaceInstallResult {
	success: boolean;
	name?: string;
	location?: string;
	error?: string;
}

export interface MarketplaceUpdateItem {
	name: string;
	currentVersion?: string;
	latestVersion?: string;
	entryId: string;
	sourceId: string;
}

export interface MarketplaceMirrorTestResult {
	url: string;
	ok: boolean;
	latencyMs?: number;
	error?: string;
}

export async function marketplaceListSources(): Promise<MarketplaceListSourcesResult> {
	return invoke("skills_marketplace_list_sources");
}

export async function marketplaceSetSources(payload: {
	sources?: MarketplaceSourceConfig[];
	mirrors?: MarketplaceMirror[];
	autoCheck?: boolean;
}): Promise<{ success: boolean }> {
	return invoke("skills_marketplace_set_sources", payload);
}

export async function marketplaceSearch(
	query?: string,
	sourceId?: string,
): Promise<MarketplaceSearchResult> {
	return invoke("skills_marketplace_search", { query, sourceId });
}

export async function marketplaceInstall(
	entryId: string,
): Promise<MarketplaceInstallResult> {
	return invoke("skills_marketplace_install", { entryId });
}

export async function marketplaceUninstall(
	skillName: string,
): Promise<{ success: boolean }> {
	return invoke("skills_marketplace_uninstall", { skillName });
}

export async function marketplaceCheckUpdates(): Promise<{
	updates: MarketplaceUpdateItem[];
}> {
	return invoke("skills_marketplace_check_updates");
}

export async function marketplaceTestMirror(): Promise<{
	results: MarketplaceMirrorTestResult[];
}> {
	return invoke("skills_marketplace_test_mirror");
}

export async function marketplacePreview(entryId: string): Promise<{
	skillMd?: string;
	usedUrl?: string;
	error?: string;
}> {
	return invoke("skills_marketplace_preview", { entryId });
}
