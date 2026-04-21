/**
 * 消息动作接口（send / edit / delete / reply / pin / react）
 *
 * 各渠道按需实现；不支持的动作返回 `unsupported` 错误。
 */

import type {
	ChannelOutboundMessage,
	ChannelOutboundResult,
} from "./channel-outbound";

/**
 * 动作不支持时抛出的错误类。
 */
export class ChannelActionUnsupportedError extends Error {
	constructor(
		public readonly channel: string,
		public readonly action: string,
	) {
		super(`Channel "${channel}" does not support action "${action}"`);
		this.name = "ChannelActionUnsupportedError";
	}
}

/**
 * 渠道消息动作接口。
 *
 * 每个渠道插件都实现一份；不支持的动作可以直接 throw `ChannelActionUnsupportedError`。
 */
export type ChannelActions = {
	/**
	 * 发送一条新消息。
	 */
	send: (message: ChannelOutboundMessage) => Promise<ChannelOutboundResult>;

	/**
	 * 编辑一条已发送消息的文本。
	 */
	edit?: (params: {
		targetId: string;
		messageId: string;
		text?: string;
		cardJson?: string;
	}) => Promise<void>;

	/**
	 * 删除一条已发送消息。
	 */
	delete?: (params: { targetId: string; messageId: string }) => Promise<void>;

	/**
	 * 给一条消息打表情。
	 */
	react?: (params: {
		targetId: string;
		messageId: string;
		emoji: string;
	}) => Promise<{ reactionId?: string }>;

	/**
	 * 移除一个表情。
	 */
	unreact?: (params: {
		targetId: string;
		messageId: string;
		/** emoji 或之前 react 返回的 reactionId */
		emojiOrReactionId: string;
	}) => Promise<void>;

	/**
	 * 置顶一条消息。
	 */
	pin?: (params: {
		targetId: string;
		messageId: string;
	}) => Promise<{ pinId?: string }>;

	/**
	 * 取消置顶。
	 */
	unpin?: (params: {
		targetId: string;
		messageId: string;
		pinId?: string;
	}) => Promise<void>;
};
