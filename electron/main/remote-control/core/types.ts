import type { RemoteGatewayScope } from "../../../shared/remote-control-schema";

export type RemoteChannelId =
	| "feishu"
	| "telegram"
	| "slack"
	| "discord"
	| "qqbot"
	| "wechat"
	| "generic_webhook";

export type RemoteDmPolicy = "pairing" | "allowlist" | "open";
export type RemoteGroupPolicy = "disabled" | "allowlist" | "open";

export type FeishuConnectionMode = "websocket" | "webhook";

/**
 * 渠道通用能力开关（各渠道共用，在阶段 3 接入）。
 *
 * - streaming.mode:
 *   - "off"  —— 关闭流式，Agent 一次性整段发出
 *   - "edit" —— 通过 editMessage 反复编辑首条 reply 实现流式
 *   - "card" —— 使用富卡片流式（仅飞书 CardKit）
 * - typing.enabled —— 是否在 Agent 响应期间显示 typing 指示
 * - interactive.enabled —— 审批场景使用按钮（true）还是文本命令（false）
 * - dedupe.persistent —— 是否开启 24h 持久化去重（默认开启）
 * - sequential_delivery —— 是否按会话串行投递出站消息（默认开启）
 */
export type RemoteChannelFeatureConfig = {
	streaming: {
		mode: "off" | "edit" | "card";
	};
	typing: {
		enabled: boolean;
	};
	interactive: {
		enabled: boolean;
	};
	dedupe: {
		persistent: boolean;
	};
	sequential_delivery: boolean;
};

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
	features?: RemoteChannelFeatureConfig;
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
	features?: RemoteChannelFeatureConfig;
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
	features?: RemoteChannelFeatureConfig;
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
	features?: RemoteChannelFeatureConfig;
};

/**
 * QQ Bot 渠道（官方 QQ 机器人 API，沙箱/生产环境）。
 * 阶段 5 启用。
 */
export type RemoteQqbotConfig = {
	enabled: boolean;
	appId?: string;
	clientSecret?: string;
	/** prod: 正式环境；sandbox: 沙箱环境 */
	environment: "prod" | "sandbox";
	/** 是否监听频道（Guild）消息 */
	enableGuild: boolean;
	/** 是否监听群（Group）消息 */
	enableGroup: boolean;
	/** 是否监听 C2C 私聊 */
	enableC2c: boolean;
	dmPolicy: RemoteDmPolicy;
	allowFrom: string[];
	groupPolicy: RemoteGroupPolicy;
	groupAllowFrom: string[];
	requireMention: boolean;
	textChunkLimit: number;
	rateLimitPerMinute: number;
	features?: RemoteChannelFeatureConfig;
};

/**
 * 个人微信渠道（Wechaty 实验特性）。
 * ⚠️ 非官方 Bot，有被封号风险。阶段 6 启用，默认禁用。
 */
export type RemoteWechatConfig = {
	enabled: boolean;
	/** puppet 实现：xp(Windows 桌面版)/padlocal(付费)/service(自建) */
	puppet: "xp" | "padlocal" | "service";
	/** padlocal / service 需要的 token */
	token?: string;
	/** service 模式下的服务端 URL */
	endpoint?: string;
	/** 是否接受个人聊天 */
	enableDm: boolean;
	/** 是否接受群聊 */
	enableGroup: boolean;
	allowFrom: string[];
	groupAllowFrom: string[];
	requireMention: boolean;
	textChunkLimit: number;
	rateLimitPerMinute: number;
	features?: RemoteChannelFeatureConfig;
	/** 用户是否已确认风险提示 */
	acknowledgedRisk: boolean;
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
		qqbot: RemoteQqbotConfig;
		wechat: RemoteWechatConfig;
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
	/**
	 * 线程/子话题标识（slack thread_ts / discord thread / feishu topic）
	 */
	thread_id?: string;
	/**
	 * 编辑已有消息；填了 message id 后 text 作为新内容，不会再发新消息。
	 */
	edit_target_message_id?: string;
	/**
	 * 交互组件 JSON（按 ChannelInteractiveComponents 结构）。
	 * 阶段 3 启用；目前仅飞书审批卡片走 use_card=true。
	 */
	interactive_components?: unknown;
	/**
	 * 静默发送（不触发提醒）。
	 */
	silent?: boolean;
};

export type RemoteInteractionRef = {
	run_id: string;
	request_id: string;
	channel_id: RemoteChannelId;
	peer_id: string;
	created_at: number;
};
