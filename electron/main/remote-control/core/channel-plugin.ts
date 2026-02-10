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

export interface RemoteChannelPlugin {
	readonly id: RemoteChannelId;
	start(ctx: RemoteChannelContext): Promise<void>;
	stop(): Promise<void>;
	send(message: RemoteOutboundMessage): Promise<void>;
	testConnection(): Promise<{ ok: boolean; message: string }>;
}
