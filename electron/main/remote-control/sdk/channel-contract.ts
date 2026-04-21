/**
 * Channel Plugin 合约（SDK 公开入口）
 *
 * 一个渠道插件只需实现 ChannelPlugin —— 组合了生命周期、动作、流式、typing、目录、能力声明。
 * 每个子能力都是可选的，插件按渠道实际支持的来实现。
 */

import type { RemoteChannelId } from "../core/types";
import type { ChannelActions } from "./channel-actions";
import type { ChannelDirectoryAdapter } from "./channel-directory";
import type { ChannelLifecycle } from "./channel-lifecycle";
import type { ChannelStreamingFactory } from "./channel-streaming";
import type { ChannelTypingFactory } from "./channel-typing";

/**
 * 渠道能力声明 —— 用于前端「能力矩阵」面板、Agent 调度时的可用性判断。
 */
export type ChannelCapabilities = {
	/** 是否支持发送文本 */
	text: boolean;
	/** 是否支持富卡片（飞书 interactive / slack Block Kit / discord embed） */
	card: boolean;
	/** 是否支持 streaming 输出 */
	streaming: boolean;
	/** 是否支持 typing indicator */
	typing: boolean;
	/** 是否支持按钮/菜单交互组件 */
	interactive: boolean;
	/** 是否支持消息编辑 */
	editMessage: boolean;
	/** 是否支持消息删除 */
	deleteMessage: boolean;
	/** 是否支持表情反应 */
	reactions: boolean;
	/** 是否支持置顶消息 */
	pin: boolean;
	/** 是否支持媒体附件 */
	media: boolean;
};

/**
 * 完整的渠道插件接口。
 */
export interface ChannelPlugin {
	/** 渠道 id（与 RemoteChannelId 对应） */
	readonly id: RemoteChannelId;

	/** 声明能力；UI / router / agentEventMirror 据此决定如何调用 */
	getCapabilities(): ChannelCapabilities;

	/** 生命周期 */
	lifecycle: ChannelLifecycle;

	/** 消息动作（send 必填；其它按需实现） */
	actions: ChannelActions;

	/** Streaming 能力；若不支持返回 null */
	streaming: ChannelStreamingFactory | null;

	/** Typing 能力；若不支持返回 null */
	typing: ChannelTypingFactory | null;

	/** 目录查询；可选 */
	directory?: ChannelDirectoryAdapter;
}

/**
 * 判断是否实现了新 SDK 接口（运行时用）。
 */
export function isChannelPlugin(value: unknown): value is ChannelPlugin {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.id === "string" &&
		typeof v.getCapabilities === "function" &&
		typeof v.lifecycle === "object" &&
		v.lifecycle !== null &&
		typeof v.actions === "object" &&
		v.actions !== null
	);
}
