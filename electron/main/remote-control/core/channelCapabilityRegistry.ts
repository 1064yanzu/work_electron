/**
 * 渠道能力注册表 —— 让 UI 与编排器能统一查询每个渠道当前支持的能力。
 *
 * 与 sdk/channel-contract.ts 的 ChannelCapabilities 互通：
 * - 新 SDK 接口的插件自己声明 getCapabilities()
 * - 尚未迁移的旧渠道使用这里的静态表
 *
 * 随着阶段 2-6 推进，表里的能力项会逐渐变成 true。
 */

import type { ChannelCapabilities } from "../sdk/channel-contract";
import type { RemoteChannelId } from "./types";

type CapabilityEntry = {
	channel: RemoteChannelId;
	label: string;
	capabilities: ChannelCapabilities;
	/** UI 上展示用的状态（阶段进度） */
	status: "legacy" | "sdk" | "placeholder";
};

/**
 * 默认能力表（阶段 1 快照）。
 * 阶段 2+ 各渠道迁移后更新对应项。
 */
const DEFAULT_CAPABILITY_TABLE: Record<RemoteChannelId, CapabilityEntry> = {
	feishu: {
		channel: "feishu",
		label: "飞书 / Lark",
		status: "legacy",
		capabilities: {
			text: true,
			card: true,
			streaming: false, // 阶段 2 启用
			typing: false, // 阶段 2 启用
			interactive: true, // 现有审批卡片按钮
			editMessage: false, // 阶段 2 启用
			deleteMessage: false,
			reactions: false, // 阶段 2 启用
			pin: false, // 阶段 2 启用
			media: true, // 已支持图片上传
		},
	},
	telegram: {
		channel: "telegram",
		label: "Telegram",
		status: "legacy",
		capabilities: {
			text: true,
			card: false,
			streaming: false,
			typing: false,
			interactive: false,
			editMessage: false,
			deleteMessage: false,
			reactions: false,
			pin: false,
			media: false,
		},
	},
	slack: {
		channel: "slack",
		label: "Slack",
		status: "legacy",
		capabilities: {
			text: true,
			card: false,
			streaming: false,
			typing: false,
			interactive: false,
			editMessage: false,
			deleteMessage: false,
			reactions: false,
			pin: false,
			media: false,
		},
	},
	discord: {
		channel: "discord",
		label: "Discord",
		status: "legacy",
		capabilities: {
			text: true,
			card: false,
			streaming: false,
			typing: false,
			interactive: false,
			editMessage: false,
			deleteMessage: false,
			reactions: false,
			pin: false,
			media: false,
		},
	},
	qqbot: {
		channel: "qqbot",
		label: "QQ Bot（官方 API）",
		status: "sdk",
		capabilities: {
			text: true,
			card: false,
			streaming: true, // edit-based
			typing: true, // C2C input_notify
			interactive: true, // 文本降级
			editMessage: true,
			deleteMessage: false,
			reactions: false,
			pin: false,
			media: false,
		},
	},
	wechat: {
		channel: "wechat",
		label: "个人微信（Wechaty · 实验）",
		status: "placeholder",
		capabilities: {
			text: true,
			card: false,
			streaming: false, // 降级分段发送
			typing: false,
			interactive: false,
			editMessage: false,
			deleteMessage: false,
			reactions: false,
			pin: false,
			media: true,
		},
	},
	generic_webhook: {
		channel: "generic_webhook",
		label: "Webhook（占位）",
		status: "placeholder",
		capabilities: {
			text: false,
			card: false,
			streaming: false,
			typing: false,
			interactive: false,
			editMessage: false,
			deleteMessage: false,
			reactions: false,
			pin: false,
			media: false,
		},
	},
};

// 可变表 —— 允许插件迁移后运行时覆盖
const registry = new Map<RemoteChannelId, CapabilityEntry>(
	Object.entries(DEFAULT_CAPABILITY_TABLE).map(([k, v]) => [
		k as RemoteChannelId,
		{ ...v, capabilities: { ...v.capabilities } },
	]),
);

export function getChannelCapabilityEntry(
	channelId: RemoteChannelId,
): CapabilityEntry {
	return registry.get(channelId) ?? DEFAULT_CAPABILITY_TABLE[channelId];
}

export function listChannelCapabilityEntries(): CapabilityEntry[] {
	return Array.from(registry.values());
}

/**
 * 当某渠道迁移到新 SDK 后，由渠道插件在 start() 时调用上报自身能力。
 */
export function updateChannelCapabilityEntry(params: {
	channelId: RemoteChannelId;
	label?: string;
	status: "sdk" | "legacy" | "placeholder";
	capabilities: Partial<ChannelCapabilities>;
}): void {
	const current = registry.get(params.channelId);
	if (!current) return;
	registry.set(params.channelId, {
		channel: params.channelId,
		label: params.label ?? current.label,
		status: params.status,
		capabilities: { ...current.capabilities, ...params.capabilities },
	});
}

export type ChannelCapabilityEntry = CapabilityEntry;
