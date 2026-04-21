/**
 * 出站消息模型（SDK 扩展版）
 *
 * 与 `core/types.ts` 里的 `RemoteOutboundMessage` 的关系：
 * - `RemoteOutboundMessage` 是 IPC / orchestrator 层的简单模型（只有 text 和 use_card）
 * - 本文件定义的是 SDK 层的扩展模型，支持 streaming、components、reactions、edit 等高级能力
 * - 两者通过 `toSdkOutbound()` 适配（在 orchestrator 层完成转换）
 */

import type { RemoteChannelId } from "../core/types";
import type { ChannelInteractiveComponents } from "./channel-interactive";

/**
 * 出站消息种类。
 */
export type ChannelOutboundKind =
	| "text" // 纯文本
	| "card" // 富卡片（JSON 字符串，feishu/slack Block Kit/discord embed 等）
	| "media" // 图片/文件/语音（由 attachments 字段提供）
	| "interactive" // 带交互组件（按钮/菜单）
	| "streaming-init" // streaming 会话启动的初始消息
	| "edit"; // 编辑已发消息

/**
 * 出站附件。
 */
export type ChannelOutboundAttachment = {
	kind: "image" | "file" | "audio" | "video";
	/** 本地绝对路径；或者远程 URL */
	source: string;
	mimeType?: string;
	fileName?: string;
	caption?: string;
};

/**
 * 渠道出站消息（SDK 层）。
 *
 * 各渠道插件实现 send(message: ChannelOutboundMessage) 时，按自身协议分发到对应 API。
 */
export type ChannelOutboundMessage = {
	channel: RemoteChannelId;
	/** 目标会话标识（chat_id / channel / peer_id） */
	targetId: string;
	/** 子线程标识（slack thread_ts / discord thread / feishu topic root） */
	threadId?: string;
	/** 回复特定消息的 message_id（可与 threadId 并存或互斥，视渠道而定） */
	replyToMessageId?: string;
	/** 编辑目标消息的 message_id（kind = "edit" 时必填） */
	editTargetMessageId?: string;

	/** 消息种类 */
	kind: ChannelOutboundKind;
	/** 文本内容（text / streaming-init / edit 时使用；interactive 时作为按钮上方的正文） */
	text?: string;
	/** 卡片 JSON 字符串（kind = "card" 时使用） */
	cardJson?: string;
	/** 附件（kind = "media" 时使用） */
	attachments?: ChannelOutboundAttachment[];
	/** 交互组件（kind = "interactive" 时使用） */
	components?: ChannelInteractiveComponents;

	/** 是否静默（不触发提醒） */
	silent?: boolean;
	/** 扩展字段，各渠道自定义用 */
	extras?: Record<string, unknown>;
};

/**
 * 出站发送结果。
 */
export type ChannelOutboundResult = {
	/** 发送后返回的 message_id（后续 edit / react / pin 需要） */
	messageId?: string;
	/** 发送后返回的 card_id（飞书 streaming card 需要） */
	cardId?: string;
	/** 原始响应（调试用） */
	raw?: unknown;
};
