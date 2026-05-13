import type {
	ChannelActions,
	ChannelFileTransfer,
	ChannelStreamingFactory,
	ChannelTypingFactory,
} from "../sdk";
import type {
	RemoteChannelId,
	RemoteChannelRuntimeStatus,
	RemoteControlConfig,
	RemoteInboundMessage,
	RemoteOutboundMessage,
} from "./types";

export type RemoteChannelContext = {
	config: RemoteControlConfig;
	onInboundMessage: (message: RemoteInboundMessage) => Promise<void>;
	onStatusPatch: (
		patch: Partial<Omit<RemoteChannelRuntimeStatus, "channel_id">>,
	) => void;
};

/**
 * 渠道插件接口 —— 保留 5 个核心方法作为向后兼容基线，
 * 增加 3 个可选字段让渠道逐步暴露 SDK 高级能力。
 *
 * 迁移阶段：
 * - 阶段 1-2：现有 4 个渠道仍实现 start/stop/send/testConnection
 * - 阶段 2+：feishu / 其他渠道逐步填充 streaming/typing/actions
 * - 未来：当所有渠道都迁完时，old API 退役，合并到 sdk 的 ChannelPlugin
 */
export interface RemoteChannelPlugin {
	readonly id: RemoteChannelId;
	start(ctx: RemoteChannelContext): Promise<void>;
	stop(): Promise<void>;
	send(message: RemoteOutboundMessage): Promise<void>;
	testConnection(): Promise<{ ok: boolean; message: string }>;

	/**
	 * 可选：SDK 级别的 streaming 工厂。
	 * start() 完成后（且 config.features.streaming.mode !== "off"）才应该返回 isEnabled()=true。
	 */
	streaming?: ChannelStreamingFactory | null;

	/**
	 * 可选：SDK 级别的 typing 工厂。
	 */
	typing?: ChannelTypingFactory | null;

	/**
	 * 可选：SDK 级别的消息动作（edit/delete/react/pin）。
	 */
	actions?: ChannelActions | null;

	/**
	 * 可选：文件上下行能力（IM 远程终端使用）。
	 *
	 * - sendFile: 把桌面端 cwd 内文件经 IM 回传给用户（/cli get 命令）
	 * - 入站附件直接在 onInboundMessage 的 RemoteInboundMessage.inbound_files
	 *   字段里以 RemoteInboundFileRef 形式提供（每个 ref 自带 download() 闭包）
	 *
	 * 渠道未实现时 PtyBridgeService 对 /cli get 提示「该渠道暂不支持文件回传」。
	 */
	fileTransfer?: ChannelFileTransfer | null;
}
