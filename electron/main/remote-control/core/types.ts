import type { RemoteGatewayScope } from "../../../shared/remote-control-schema";

export type RemoteChannelId =
	| "feishu"
	| "telegram"
	| "slack"
	| "discord"
	| "generic_webhook";

export type RemoteDmPolicy = "pairing" | "allowlist" | "open";
export type RemoteGroupPolicy = "disabled" | "allowlist" | "open";

export type FeishuConnectionMode = "websocket" | "webhook";

export type RemoteFeishuConfig = {
	enabled: boolean;
	appId?: string;
	appSecret?: string;
	domain: "feishu" | "lark";
	connectionMode: FeishuConnectionMode;
	webhookPath: string;
	webhookPort?: number;
	dmPolicy: RemoteDmPolicy;
	allowFrom: string[];
	groupPolicy: RemoteGroupPolicy;
	groupAllowFrom: string[];
	requireMention: boolean;
	enableAttachmentMerge: boolean;
	attachmentMergeWindowSec: number;
	enableDocLinkPrefetch: boolean;
	enableDocxMcp: boolean;
	enableDocWriteOps: boolean;
	enableDocFileDelete: boolean;
	enableLegacyDocsRead: boolean;
	enableDocCommandFallback: boolean;
	textChunkLimit: number;
	rateLimitPerMinute: number;
};

export type RemoteTelegramConfig = {
	enabled: boolean;
	botToken?: string;
	dmPolicy: RemoteDmPolicy;
	allowFrom: string[];
	groupPolicy: RemoteGroupPolicy;
	groupAllowFrom: string[];
	requireMention: boolean;
	textChunkLimit: number;
	rateLimitPerMinute: number;
};

export type RemoteSlackConfig = {
	enabled: boolean;
	botToken?: string;
	appToken?: string;
	signingSecret?: string;
	dmPolicy: RemoteDmPolicy;
	allowFrom: string[];
	groupPolicy: RemoteGroupPolicy;
	groupAllowFrom: string[];
	requireMention: boolean;
	textChunkLimit: number;
	rateLimitPerMinute: number;
};

export type RemoteDiscordConfig = {
	enabled: boolean;
	botToken?: string;
	applicationId?: string;
	dmPolicy: RemoteDmPolicy;
	allowFrom: string[];
	groupPolicy: RemoteGroupPolicy;
	groupAllowFrom: string[];
	requireMention: boolean;
	textChunkLimit: number;
	rateLimitPerMinute: number;
};

export type PlaceholderChannelConfig = {
	enabled: boolean;
	note?: string;
};

export type RemoteSecurityConfig = {
	interactionTimeoutSec: number;
	defaultScopes: RemoteGatewayScope[];
};

export type RemoteMobileGatewayConfig = {
	enabled: boolean;
	port: number;
	host: string;
	requirePairing: boolean;
};

export type RemoteControlConfig = {
	enabled: boolean;
	channels: {
		feishu: RemoteFeishuConfig;
		telegram: RemoteTelegramConfig;
		slack: RemoteSlackConfig;
		discord: RemoteDiscordConfig;
		generic_webhook: PlaceholderChannelConfig;
	};
	security: RemoteSecurityConfig;
	mobileGateway: RemoteMobileGatewayConfig;
};

export type RemotePairingStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "revoked";

export type RemotePairingRequest = {
	request_id: string;
	channel_id: RemoteChannelId;
	peer_id: string;
	peer_name?: string;
	code: string;
	requested_at: number;
	expires_at: number;
	status: RemotePairingStatus;
	reason?: string;
};

export type RemotePairingRecord = {
	pairing_id: string;
	channel_id: RemoteChannelId;
	peer_id: string;
	peer_name?: string;
	approved_at: number;
	approved_by: string;
	status: "approved" | "revoked";
	revoked_at?: number;
	revoked_reason?: string;
};

export type RemoteSessionState =
	| "running"
	| "waiting_interaction"
	| "completed"
	| "aborted"
	| "error";

export type RemoteSession = {
	session_id: string;
	channel_id: RemoteChannelId;
	peer_id: string;
	peer_name?: string;
	target_id: string;
	run_id?: string;
	agent_session_id?: string;
	task_id?: string;
	sandbox_dir?: string;
	prompt_preview: string;
	state: RemoteSessionState;
	last_message_at: number;
	created_at: number;
	updated_at: number;
	last_error?: string;
};

export type RemoteChannelRuntimeStatus = {
	channel_id: RemoteChannelId;
	enabled: boolean;
	running: boolean;
	connected: boolean;
	mode?: string;
	last_inbound_at?: number;
	last_outbound_at?: number;
	last_error?: string;
};

export type RemoteRuntimeStatus = {
	enabled: boolean;
	started_at?: number;
	channels: RemoteChannelRuntimeStatus[];
	active_runs: number;
	pending_pairings: number;
};

export type RemoteInboundContextFile = {
	source: string;
	title: string;
	suggested_name: string;
	content: string;
	metadata?: Record<string, string>;
};

export type RemoteInboundMessage = {
	channel_id: RemoteChannelId;
	peer_id: string;
	peer_name?: string;
	sender_id?: string;
	sender_name?: string;
	is_group: boolean;
	text: string;
	message_id?: string;
	reply_to_message_id?: string;
	target_id: string;
	raw?: unknown;
	context_files?: RemoteInboundContextFile[];
};

export type RemoteOutboundMessage = {
	channel_id: RemoteChannelId;
	target_id: string;
	text: string;
	reply_to_message_id?: string;
	use_card?: boolean; // 是否使用卡片格式(飞书等平台)
};

export type RemoteInteractionRef = {
	run_id: string;
	request_id: string;
	channel_id: RemoteChannelId;
	peer_id: string;
	created_at: number;
};
