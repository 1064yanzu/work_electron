/**
 * Streaming session 接口 —— Agent 边生成边更新 IM 消息
 *
 * 实现策略因渠道而异：
 * - feishu: CardKit Streaming（`streaming_mode: true`，真实流式显示）—— 移植自 openclaw
 * - telegram: editMessageText（需 throttle 到 ~200ms/次，避免 100/min 限制）
 * - slack: chat.update（thread 内编辑）
 * - discord: message.edit（2000 字符上限）
 * - qqbot: edit（C2C/Group 支持有限）
 * - wechat (个人微信): 降级为分段发送
 */

import { mergeStreamingText } from "./streaming-merge";

export type ChannelStreamingStartOptions = {
	/** 可选标题（feishu 卡片的标题，其他渠道可忽略） */
	title?: string;
	/** 颜色/模板（feishu: blue/green/...；其他渠道可忽略） */
	template?: string;
	/** 末尾的 note 信息（例如「模型 gpt-4o · 耗时 12s」） */
	note?: string;
	/** 回复特定 message id */
	replyToMessageId?: string;
	/** 子线程 id */
	threadId?: string;
};

/**
 * Streaming 会话接口。每个 Agent run 对应一个 session。
 */
export interface ChannelStreamingSession {
	/** 启动 session，发送初始消息（例如「⏳ Thinking...」） */
	start(options?: ChannelStreamingStartOptions): Promise<void>;
	/** 增量更新内容（传入**完整**累计文本，内部会 merge 处理断点） */
	update(text: string): Promise<void>;
	/** 结束 session，把最终文本 flush，追加 note */
	close(finalText?: string, options?: { note?: string }): Promise<void>;
	/** 当前是否仍在运行 */
	isActive(): boolean;
	/** 流式输出的 message_id（供外层做 react/edit/pin 等） */
	getMessageId(): string | undefined;
}

/**
 * Streaming 工厂接口 —— channel plugin 提供给 SDK 的对象。
 */
export type ChannelStreamingFactory = {
	/** 当前渠道是否启用 streaming（由配置决定） */
	isEnabled(): boolean;
	/** 开启一个 streaming session，绑定到特定会话 */
	openSession(params: {
		targetId: string;
		threadId?: string;
		replyToMessageId?: string;
	}): ChannelStreamingSession;
};

export { mergeStreamingText };
