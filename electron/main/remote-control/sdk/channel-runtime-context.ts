/**
 * 运行时上下文 —— 插件 start() 时由 orchestrator 提供
 *
 * 参考 openclaw `plugin-sdk/channel-runtime-context`，但不包含它的 account/secret/setup 等企业特性，
 * 只保留 `work_electron` 需要的核心能力注入。
 */

import type { Logger } from "../../logging/types";
import type {
	RemoteChannelRuntimeStatus,
	RemoteControlConfig,
} from "../core/types";
import type { ChannelInboundMessage } from "./channel-inbound";

/**
 * 运行时上下文。
 */
export type ChannelRuntimeContext = {
	/** 当前完整配置（含其他渠道的配置；插件应只读自己那部分） */
	config: RemoteControlConfig;

	/** 日志器 */
	logger: Logger;

	/** 入站消息投递（从渠道 → orchestrator） */
	onInboundMessage: (message: ChannelInboundMessage) => Promise<void>;

	/** 状态上报（connected / running / last_error / last_inbound_at 等） */
	onStatusPatch: (
		patch: Partial<Omit<RemoteChannelRuntimeStatus, "channel_id">>,
	) => void;

	/** 数据目录（各渠道自己存文件用，由 SDK 统一分配） */
	dataDir: string;
};
