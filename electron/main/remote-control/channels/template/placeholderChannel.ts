import type { Logger } from "../../../logging/types";
import type {
	RemoteChannelPlugin,
	RemoteChannelContext,
} from "../../core/channel-plugin";
import type { RemoteChannelId, RemoteOutboundMessage } from "../../core/types";

export class PlaceholderChannelPlugin implements RemoteChannelPlugin {
	constructor(
		public readonly id: Exclude<RemoteChannelId, "feishu">,
		private readonly logger: Logger,
	) {}

	async start(ctx: RemoteChannelContext): Promise<void> {
		ctx.onStatusPatch({
			running: true,
			connected: false,
			last_error: "模板通道，尚未接入具体平台实现",
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
			message: "模板通道，暂未实现",
		};
	}
}
