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
	terminal: {
		enabled: false,
		presets: [
			{ id: "claude", name: "Claude Code", command: "claude" },
			{ id: "codex", name: "OpenAI Codex", command: "codex" },
			{ id: "opencode", name: "OpenCode", command: "opencode" },
		],
		defaultCwds: [],
		// IM 卡片显示宽度有限（手机端单行能容纳 48 半角字符左右），
		// 太宽会触发 TUI 横向布局，导致 Claude Code 等的提示被截断。
		// 这里给一个更窄的默认值，让 TUI 按窄屏重排。
		cols: 48,
		rows: 24,
		snapshotIntervalMs: 350,
		idleTimeoutMs: 30 * 60 * 1000,
		freeCommandMode: false,
		autoShowOnDesktop: true,
		colorMode: "auto",
		// 每渠道列宽：飞书 CardKit 卡片支持较宽（80），Telegram editMessage 文本块
		// 在手机上 50-60 较稳，Slack mrkdwn 80，Discord ansi codeblock 100。
		// QQbot / WeChat 受 UI 限制保守一些。
		perChannelCols: {
			feishu: 80,
			telegram: 56,
			slack: 80,
			discord: 100,
			qqbot: 56,
			wechat: 48,
		},
		scrollbackLines: 200,
		showStatusBar: true,
		highlightDiff: false,
		contextAwareButtons: true,
		dangerousCommandConfirm: true,
		// 默认危险关键字。匹配子串即认为危险，避免误伤需要精确（如 "rm -rf /" 而非 "rm -rf"）。
		dangerousPatterns: [
			"rm -rf /",
			"rm -rf ~",
			"rm -rf $HOME",
			"rm -rf *",
			"dd of=/dev/",
			"mkfs.",
			":(){:|:&};:",
			"shutdown",
			"reboot",
			"halt",
			"sudo rm",
			"chmod -R 777 /",
		],
		longOutputFoldThreshold: 3500,
		offlineBufferLines: 80,
		commandHistorySize: 20,
		fileTransferEnabled: true,
		maxUploadBytes: 1_048_576,
		maxDownloadBytes: 1_048_576,
	},
};

export const DEFAULT_PAIRING_EXPIRE_MS = 10 * 60 * 1000;
