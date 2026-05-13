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

/**
 * 远程终端 (IM 远控 pty 桥) 配置。
 *
 * 用户通过 IM /cli 指令在桌面端 spawn 交互式 CLI（claude / codex / opencode
 * 等 TUI），输出经 @xterm/headless 渲染为屏幕快照后通过同一渠道的 streaming
 * 卡片回推。详见 docs/施工文档-IM远程终端.md。
 */
export type RemoteTerminalPreset = {
	id: string;
	name: string;
	command: string;
	cwd?: string;
};

export type RemoteTerminalColorMode = "auto" | "ansi" | "plain";

export type RemoteTerminalConfig = {
	enabled: boolean;
	presets: RemoteTerminalPreset[];
	defaultCwds: string[];
	cols: number;
	rows: number;
	snapshotIntervalMs: number;
	idleTimeoutMs: number;
	freeCommandMode: boolean;
	/**
	 * 远控 pty 启动时，是否自动在桌面端中下屏 TerminalPanel 里展开同一个会话。
	 * 默认 true。桌面端展示是只读 + 可输入接管，关闭按钮仅前端 detach，不杀进程。
	 */
	autoShowOnDesktop: boolean;

	// ─── 体验升级（2026-05-13） ───────────────────────────

	/**
	 * 颜色渲染模式：
	 * - "auto" —— 各渠道自行降级（Discord 用 ANSI codeblock；其他用 markdown 关键色映射）
	 * - "ansi" —— 强制输出 ANSI 转义序列（仅 Discord 直读，其他渠道会显示乱码）
	 * - "plain" —— 强制纯文本（最稳，弱网降级）
	 */
	colorMode: RemoteTerminalColorMode;
	/**
	 * 每渠道默认列宽。未设置时回落到顶层 cols。
	 * 来源依据：飞书 CardKit 卡片宽（80 列）、Telegram editMessage（60 列）、
	 * Slack mrkdwn（80 列）、Discord codeblock（100 列）。
	 */
	perChannelCols: Partial<Record<RemoteChannelId, number>>;
	/** scrollback 行数，启用翻屏命令查看历史。默认 200。 */
	scrollbackLines: number;
	/** 是否在屏幕首行注入状态条 `[claude·12s·pid 1234·80×24·行 45/200]`。 */
	showStatusBar: boolean;
	/** 是否给新增/变化的行加 ▸ 前缀高亮。默认关（实验性）。 */
	highlightDiff: boolean;
	/** 上下文感知按钮：识别 y/n 提示、数字菜单等时动态替换按钮组。默认开。 */
	contextAwareButtons: boolean;
	/** 危险命令二次确认（rm -rf 等）。默认开。 */
	dangerousCommandConfirm: boolean;
	/** 危险命令正则/子串模式列表。 */
	dangerousPatterns: string[];
	/** 单帧 snapshot 折叠阈值（字符数）。超出后头尾保留、中间用 [...] 折叠。 */
	longOutputFoldThreshold: number;
	/** 离线期间累积的输出行数上限。 */
	offlineBufferLines: number;
	/** 命令历史 ring buffer 大小。 */
	commandHistorySize: number;
	/** 文件上下行总开关。 */
	fileTransferEnabled: boolean;
	/** 单次上传字节上限（IM 入站文件落到 cwd/.uploads）。 */
	maxUploadBytes: number;
	/** 单次下载字节上限（/cli get <path>）。 */
	maxDownloadBytes: number;
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
	terminal: RemoteTerminalConfig;
};

export type RemoteTerminalSessionStatus = {
	session_id: string;
	channel_id: RemoteChannelId;
	peer_id: string;
	peer_name?: string;
	target_id: string;
	command: string;
	cwd: string;
	preset_id?: string;
	pid?: number;
	started_at: number;
	last_activity_at: number;
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

/**
 * 入站附件引用（图片/文件）。channel 在 inbound 阶段把附件元信息封进来，
 * 由 PtyBridgeService 在 IM 远程终端开启时把内容下载到 cwd/.uploads 并向
 * pty 注入提示行。download() 由 channel 实现：典型路径是去 channel 的对应
 * API 抓 binary stream。
 */
export type RemoteInboundFileRef = {
	filename: string;
	mimeType?: string;
	bytes?: number;
	/** 拉取附件二进制；返回 Buffer。失败时 throw。 */
	download: () => Promise<Buffer>;
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
	/**
	 * 入站附件（图片/文件）。仅 IM 远控终端会消费；其它路径仍按既有逻辑走 text。
	 * 为可选字段，旧渠道未实现时直接缺省。
	 */
	inbound_files?: RemoteInboundFileRef[];
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
