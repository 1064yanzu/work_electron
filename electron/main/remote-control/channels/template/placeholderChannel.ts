import type { Logger } from "../../../logging/types";
import type {
	RemoteChannelPlugin,
	RemoteChannelContext,
} from "../../core/channel-plugin";
import type { RemoteChannelId, RemoteOutboundMessage } from "../../core/types";

/**
 * 占位渠道插件 —— 用于尚未完整实现的渠道（qqbot、wechat、generic_webhook）
 * 启动时直接报「待接入实现」，但保持类型完整、orchestrator 能正常管理生命周期。
 */
export class PlaceholderChannelPlugin implements RemoteChannelPlugin {
	constructor(
		public readonly id: RemoteChannelId,
		private readonly logger: Logger,
		private readonly note?: string,
	) {}

	async start(ctx: RemoteChannelContext): Promise<void> {
		ctx.onStatusPatch({
			running: true,
			connected: false,
			last_error: this.note ?? "该渠道尚未实现，仅保留配置占位",
		});
	}

	async stop(): Promise<void> {}

	async send(message: RemoteOutboundMessage): Promise<void> {
		this.logger.warn({
			msg: "placeholder channel send ignored",
			channel: this.id,
			target: message.target_id,
		});
	}

	async testConnection(): Promise<{ ok: boolean; message: string }> {
		return {
			ok: false,
			message: this.note ?? "该渠道尚未实现",
		};
	}
}
