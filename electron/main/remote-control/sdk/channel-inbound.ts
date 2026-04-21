/**
 * 入站消息模型（SDK 扩展版）
 *
 * 与 `core/types.ts` 里的 `RemoteInboundMessage` 关系同 outbound：
 * core 是 orchestrator / router 用的简化模型；sdk 是 plugin 层的扩展模型。
 */

import type { RemoteChannelId, RemoteInboundContextFile } from "../core/types";

/**
 * 入站事件类型 —— 覆盖消息、交互回调、编辑等。
 */
export type ChannelInboundKind =
	| "message" // 普通文本/富文本/媒体消息
	| "interactive" // 按钮点击 / 菜单选择 / modal 提交
	| "edit" // 对方编辑了消息
	| "delete"; // 对方删除了消息

/**
 * 入站附件（例如图片、文件、语音）。
 */
export type ChannelInboundAttachment = {
	kind: "image" | "file" | "audio" | "video" | "other";
	/** 原始文件 ID / URL */
	sourceRef: string;
	mimeType?: string;
	fileName?: string;
	sizeBytes?: number;
	/** 渠道提供的下载 URL（可能有有效期） */
	downloadUrl?: string;
};

/**
 * 入站交互回调 payload（按钮点击、菜单选择等）。
 */
export type ChannelInboundInteractive = {
	/** action_id / callback_data / custom_id */
	actionId: string;
	/** 解析出的业务值，通常是 JSON（如 { action: "approve", requestId: "xxx" }） */
	value?: unknown;
	/** 原始 interaction id，用于 ack */
	interactionId?: string;
};

/**
 * 渠道入站消息（SDK 层）。
 */
export type ChannelInboundMessage = {
	kind: ChannelInboundKind;
	channel: RemoteChannelId;

	/** 对话标识 */
	peerId: string;
	peerName?: string;
	senderId?: string;
	senderName?: string;
	isGroup: boolean;
	targetId: string;
	threadId?: string;

	/** 消息 id（对方发的那条的 id） */
	messageId?: string;
	/** 回复目标 message_id */
	replyToMessageId?: string;

	/** 纯文本内容（已去掉 @bot、去掉 markdown 引用等） */
	text: string;
	/** 附件（图片/文件/语音） */
	attachments?: ChannelInboundAttachment[];
	/** 交互回调（kind = "interactive" 时存在） */
	interactive?: ChannelInboundInteractive;
	/** 关联上下文文件（如 feishu doc prefetch） */
	contextFiles?: RemoteInboundContextFile[];

	/** 原始 payload（调试、审计用） */
	raw?: unknown;
};
