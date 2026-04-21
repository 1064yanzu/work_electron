/**
 * 会话标识与线程绑定 —— 借鉴 openclaw `plugin-sdk/conversation-runtime`
 * 抽象层：ConversationRef 是跨渠道的统一会话寻址格式
 */

import type { RemoteChannelId } from "../core/types";

/**
 * 跨渠道的会话引用。
 * - channel: 渠道 id
 * - targetId: 渠道内的会话寻址（chat_id / channel / peer_id ...）
 * - threadId: 可选子线程（slack thread_ts / discord thread / feishu topic）
 */
export type ConversationRef = {
	channel: RemoteChannelId;
	targetId: string;
	threadId?: string;
};

/**
 * 会话 <-> Agent run 的绑定记录。
 * 用于保证同一个会话的多条入站消息都路由到同一个 agent session。
 */
export type ConversationBinding = {
	conversationKey: string;
	runId?: string;
	sessionKey?: string;
	boundAt: number;
	lastActivityAt: number;
	metadata?: Record<string, unknown>;
};

/**
 * 生成规范化的会话 key（去重、绑定用）。
 */
export function buildConversationKey(ref: ConversationRef): string {
	const parts = [ref.channel, ref.targetId];
	if (ref.threadId) parts.push(ref.threadId);
	return parts.join("::");
}

/**
 * 根据入站消息推导 ConversationRef。
 * 由各渠道插件在 inbound 时调用。
 */
export function makeConversationRef(params: {
	channel: RemoteChannelId;
	targetId: string;
	threadId?: string;
}): ConversationRef {
	return {
		channel: params.channel,
		targetId: String(params.targetId || "").trim(),
		threadId: params.threadId ? String(params.threadId).trim() : undefined,
	};
}
