import type { RemoteControlConfig } from "./types";

export const REMOTE_CONTROL_CONFIG_KEY = "remote.control.config";
export const REMOTE_CONTROL_PAIRINGS_KEY = "remote.control.pairings";

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
			textChunkLimit: 1800,
			rateLimitPerMinute: 20,
		},
		telegram: {
			enabled: false,
			note: "模板通道，后续接入 Telegram Bot API",
		},
		slack: {
			enabled: false,
			note: "模板通道，后续接入 Slack App/Bot",
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
