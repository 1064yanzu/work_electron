/**
 * 渠道成员/群组目录查询接口（可选能力）
 *
 * 参考 openclaw `plugin-sdk/directory-runtime`，但大幅精简。
 * 当前只提供「按 targetId 查会话基本信息」和「列出最近活跃会话」两个场景。
 */

export type ChannelDirectoryEntry = {
	/** 会话 id（chat_id / channel / peer_id） */
	id: string;
	/** 展示名 */
	name: string;
	/** 类型 */
	kind: "dm" | "group" | "channel" | "unknown";
	/** 成员数（群） */
	memberCount?: number;
	/** 图标 URL */
	iconUrl?: string;
};

export type ChannelDirectoryAdapter = {
	/** 查询单个会话 */
	describe?: (id: string) => Promise<ChannelDirectoryEntry | null>;
	/** 列出当前 bot 可访问的会话（可选） */
	list?: () => Promise<ChannelDirectoryEntry[]>;
};
