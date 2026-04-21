import type { RemoteChannelFeatureConfig, RemoteControlConfig } from "./types";

export const REMOTE_CONTROL_CONFIG_KEY = "remote.control.config";
export const REMOTE_CONTROL_PAIRINGS_KEY = "remote.control.pairings";

/** 默认渠道能力开关 —— 启用流式、typing、按钮、持久化去重、顺序投递。 */
export const DEFAULT_CHANNEL_FEATURES: RemoteChannelFeatureConfig = {
	streaming: { mode: "edit" },
	typing: { enabled: true },
	interactive: { enabled: true },
	dedupe: { persistent: true },
	sequential_delivery: true,
};

/** 飞书默认开启 streaming card。 */
export const DEFAULT_FEISHU_FEATURES: RemoteChannelFeatureConfig = {
	...DEFAULT_CHANNEL_FEATURES,
	streaming: { mode: "card" },
};

export const DEFAULT_REMOTE_CONTROL_CONFIG: RemoteControlConfig = {
	enabled: false,
	channels: {
		feishu: {
			enabled: false,
			appId: "",
			appSecret: "",
			domain: "feishu",
			connectionMode: "websocket",
			webhookPath: "/remote-control/feishu/events",
			webhookPort: 38081,
			dmPolicy: "pairing",
			allowFrom: [],
			groupPolicy: "disabled",
			groupAllowFrom: [],
			requireMention: true,
			enableAttachmentMerge: true,
			attachmentMergeWindowSec: 45,
			enableDocLinkPrefetch: true,
			enableDocxMcp: true,
			enableDocWriteOps: true,
			enableDocFileDelete: false,
			enableLegacyDocsRead: true,
			enableDocCommandFallback: true,
			textChunkLimit: 1800,
			rateLimitPerMinute: 20,
			features: DEFAULT_FEISHU_FEATURES,
		},
		telegram: {
			enabled: false,
			botToken: "",
			dmPolicy: "pairing",
			allowFrom: [],
			groupPolicy: "disabled",
			groupAllowFrom: [],
			requireMention: true,
			textChunkLimit: 4000,
			rateLimitPerMinute: 20,
			features: DEFAULT_CHANNEL_FEATURES,
		},
		slack: {
			enabled: false,
			botToken: "",
			appToken: "",
			signingSecret: "",
			dmPolicy: "pairing",
			allowFrom: [],
			groupPolicy: "disabled",
			groupAllowFrom: [],
			requireMention: true,
			textChunkLimit: 3000,
			rateLimitPerMinute: 20,
			features: DEFAULT_CHANNEL_FEATURES,
		},
		discord: {
			enabled: false,
			botToken: "",
			applicationId: "",
			dmPolicy: "pairing",
			allowFrom: [],
			groupPolicy: "disabled",
			groupAllowFrom: [],
			requireMention: true,
			textChunkLimit: 1800,
			rateLimitPerMinute: 20,
			features: DEFAULT_CHANNEL_FEATURES,
		},
		qqbot: {
			enabled: false,
			appId: "",
			clientSecret: "",
			environment: "prod",
			enableGuild: true,
			enableGroup: true,
			enableC2c: true,
			dmPolicy: "pairing",
			allowFrom: [],
			groupPolicy: "disabled",
			groupAllowFrom: [],
			requireMention: true,
			textChunkLimit: 1500,
			rateLimitPerMinute: 20,
			features: DEFAULT_CHANNEL_FEATURES,
		},
		wechat: {
			enabled: false,
			puppet: "xp",
			token: "",
			endpoint: "",
			enableDm: true,
			enableGroup: false,
			allowFrom: [],
			groupAllowFrom: [],
			requireMention: true,
			textChunkLimit: 1200,
			rateLimitPerMinute: 10,
			features: {
				streaming: { mode: "off" },
				typing: { enabled: false },
				interactive: { enabled: false },
				dedupe: { persistent: true },
				sequential_delivery: true,
			},
			acknowledgedRisk: false,
		},
		generic_webhook: {
			enabled: false,
			note: "模板通道，后续接入通用 Webhook",
		},
	},
	security: {
		interactionTimeoutSec: 55,
		defaultScopes: [
			"operator.read",
			"operator.write",
			"operator.approvals",
			"operator.pairing",
		],
	},
	mobileGateway: {
		enabled: false,
		host: "127.0.0.1",
		port: 28777,
		requirePairing: true,
	},
};

export const DEFAULT_PAIRING_EXPIRE_MS = 10 * 60 * 1000;
