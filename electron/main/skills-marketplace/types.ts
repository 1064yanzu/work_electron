/**
 * Skills Marketplace —— 类型定义
 *
 * 把 Skill 从「本地仓库」升级为「多源市场」需要的核心类型：
 * - MarketplaceSource：用户配置的 registry 源（官方 / skills.sh / 腾讯 SkillHub / 自定义）
 * - MarketplaceEntry：聚合后呈现给前端的可装 skill 元数据
 * - InstalledRecord：本地索引（~/.claude/skills/.marketplace.json）记录的已装来源
 */

export type MarketplaceSourceType =
	| "anthropic_marketplace_json"
	| "skills_sh"
	| "tencent_skillhub"
	| "custom_json";

export type SourceTrust = "official" | "community" | "custom";

export interface MarketplaceSource {
	id: string;
	name: string;
	type: MarketplaceSourceType;
	url: string;
	enabled: boolean;
	/** 信任级别（影响来源徽章颜色：official/community/custom） */
	trust?: SourceTrust;
}

/** Skill 在 marketplace.json 标准里的下载来源 */
export type MarketplaceArtifactSource =
	| {
			kind: "github";
			owner: string;
			repo: string;
			ref: string;
			/** 仓库内子目录（可空：取整个仓库） */
			subdir?: string;
	  }
	| {
			kind: "url";
			/** 直接 archive 链接（zip / tar.gz） */
			url: string;
	  };

export interface MarketplaceEntry {
	/** 跨源唯一 id（建议为 sourceId/<entry name>） */
	id: string;
	/** 来源 id */
	sourceId: string;
	/** 来源徽章 */
	trust: SourceTrust;
	/** Skill 名称（建议与目标目录一致） */
	name: string;
	displayName?: string;
	description: string;
	version?: string;
	author?: string;
	homepage?: string;
	tags?: string[];
	icon?: string;
	license?: string;
	/** 下载来源 */
	artifact: MarketplaceArtifactSource;
	/** 可选：marketplace.json 显式给出的内容校验 */
	sha256?: string;
	/** 原始 entry，便于 UI 展示来源 URL */
	rawSourceUrl?: string;
}

export interface InstalledRecord {
	sourceId: string;
	entryId: string;
	name: string;
	version?: string;
	installedAt: number;
	sourceUrl?: string;
	sha256?: string;
	artifact?: MarketplaceArtifactSource;
}

export interface LocalMarketplaceIndex {
	version: 1;
	installed: Record<string, InstalledRecord>;
}

export type InstallPhase =
	| "queued"
	| "resolving"
	| "downloading"
	| "extracting"
	| "verifying"
	| "writing"
	| "done"
	| "error";

export interface InstallProgressEvent {
	entryId: string;
	phase: InstallPhase;
	percent: number;
	message?: string;
	error?: string;
}

export interface UpdateAvailableItem {
	name: string;
	currentVersion?: string;
	latestVersion?: string;
	entryId: string;
	sourceId: string;
}

export interface MirrorTestResult {
	url: string;
	ok: boolean;
	latencyMs?: number;
	error?: string;
}
