import * as Lark from "@larksuiteoapi/node-sdk";
import type { Logger } from "../../../logging/types";
import type {
	RemoteChannelPlugin,
	RemoteChannelContext,
} from "../../core/channel-plugin";
import type {
	RemoteInboundMessage,
	RemoteOutboundMessage,
} from "../../core/types";
import {
	parseTextContent,
	normalizeTargetType,
	checkBotMentioned,
	stripBotMention,
	resolveSenderName,
	fetchBotOpenId,
	buildMarkdownCard,
	testFeishuCredentials,
	FeishuOutboundRateLimiter,
	type FeishuMention,
} from "./feishuUtils";

// ─── 消息事件类型 ──────────────────────────────────────────

type FeishuMessageEvent = {
	sender?: {
		sender_id?: {
			open_id?: string;
			user_id?: string;
			union_id?: string;
		};
		sender_type?: string;
	};
	message?: {
		message_id?: string;
		chat_id?: string;
		chat_type?: "p2p" | "group";
		message_type?: string;
		content?: string;
		root_id?: string;
		parent_id?: string;
		mentions?: FeishuMention[];
	};
};

// ─── 重连配置 ──────────────────────────────────────────────

const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_ATTEMPTS = 10;

export class FeishuChannelPlugin implements RemoteChannelPlugin {
	readonly id = "feishu" as const;
	private ctx: RemoteChannelContext | null = null;
	private client: Lark.Client | null = null;
	private wsClient: Lark.WSClient | null = null;
	private botOpenId: string | undefined;
	private readonly dedupe = new Map<string, number>();
	private readonly outboundLimiter = new FeishuOutboundRateLimiter(4);
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private stopped = false;

	constructor(private readonly logger: Logger) { }

	// ─── 消息去重 ────────────────────────────────────────

	private touchDedupe(messageId: string): boolean {
		const now = Date.now();
		for (const [id, ts] of this.dedupe.entries()) {
			if (now - ts > 30 * 60_000) {
				this.dedupe.delete(id);
			}
		}
		if (this.dedupe.has(messageId)) return false;
		this.dedupe.set(messageId, now);
		return true;
	}

	// ─── 客户端构建 ──────────────────────────────────────

	private buildClient(
		appId: string,
		appSecret: string,
		domain: "feishu" | "lark",
	): Lark.Client {
		return new Lark.Client({
			appId,
			appSecret,
			appType: Lark.AppType.SelfBuild,
			domain: domain === "lark" ? Lark.Domain.Lark : Lark.Domain.Feishu,
		});
	}

	// ─── 入站消息处理 ────────────────────────────────────

	private async onMessage(event: FeishuMessageEvent): Promise<void> {
		const ctx = this.ctx;
		if (!ctx) return;
		const message = event.message;
		if (!message?.message_id || !message.chat_id) return;
		if (!this.touchDedupe(message.message_id)) return;

		const senderOpenId = String(
			event.sender?.sender_id?.open_id ?? "",
		).trim();
		const isGroup = message.chat_type === "group";

		// 群聊中检测 @bot（使用 mentions 数组精确判断）
		const mentions = message.mentions;
		if (isGroup && ctx.config.channels.feishu.requireMention) {
			const mentioned = checkBotMentioned(mentions, this.botOpenId);
			if (!mentioned) {
				// 未 @bot 的群消息，忽略
				return;
			}
		}

		// 解析消息文本
		let text = parseTextContent(message.content, message.message_type);
		// 去除 @bot 的标记
		text = stripBotMention(text, mentions);

		// 解析发送者名称
		let senderName: string | undefined;
		if (this.client && senderOpenId) {
			senderName = await resolveSenderName(
				this.client,
				senderOpenId,
				(msg) => this.logger.info({ msg }),
			);
		}

		const targetId = isGroup
			? message.chat_id
			: senderOpenId || message.chat_id;

		const inbound: RemoteInboundMessage = {
			channel_id: "feishu",
			peer_id: senderOpenId || message.chat_id,
			peer_name: senderName || senderOpenId || undefined,
			sender_id: senderOpenId || undefined,
			sender_name: senderName || senderOpenId || undefined,
			is_group: isGroup,
			text,
			message_id: message.message_id,
			reply_to_message_id: message.parent_id ?? message.root_id,
			target_id: targetId,
			raw: event,
		};

		ctx.onStatusPatch({
			last_inbound_at: Date.now(),
			connected: true,
		});

		// 重置重连计数（成功收到消息说明连接正常）
		this.reconnectAttempts = 0;

		await ctx.onInboundMessage(inbound);
	}

	// ─── 启动 WebSocket ─────────────────────────────────

	private startWebSocket(feishu: {
		appId: string;
		appSecret: string;
		domain: "feishu" | "lark";
	}): void {
		const ctx = this.ctx;
		if (!ctx) return;

		const dispatcher = new Lark.EventDispatcher({});
		dispatcher.register({
			"im.message.receive_v1": async (payload: unknown) => {
				await this.onMessage(payload as FeishuMessageEvent);
			},
		});

		this.wsClient = new Lark.WSClient({
			appId: feishu.appId,
			appSecret: feishu.appSecret,
			domain:
				feishu.domain === "lark"
					? Lark.Domain.Lark
					: Lark.Domain.Feishu,
			loggerLevel: Lark.LoggerLevel.warn,
		});

		try {
			this.wsClient.start({ eventDispatcher: dispatcher });
			ctx.onStatusPatch({
				connected: true,
				running: true,
				last_error: undefined,
			});
			this.reconnectAttempts = 0;
			this.logger.info({ msg: "feishu websocket connected" });
		} catch (error) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error:
					error instanceof Error ? error.message : String(error),
			});
			this.logger.error({
				msg: "feishu websocket start failed",
				error: error instanceof Error ? error.message : String(error),
			});
			this.scheduleReconnect(feishu);
		}
	}

	// ─── 重连逻辑 ───────────────────────────────────────

	private scheduleReconnect(feishu: {
		appId: string;
		appSecret: string;
		domain: "feishu" | "lark";
	}): void {
		if (this.stopped) return;
		if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			this.logger.error({
				msg: `feishu websocket 重连次数已达上限 (${MAX_RECONNECT_ATTEMPTS})`,
			});
			this.ctx?.onStatusPatch({
				running: false,
				connected: false,
				last_error: `重连失败：已尝试 ${MAX_RECONNECT_ATTEMPTS} 次`,
			});
			return;
		}

		this.reconnectAttempts++;
		const delay =
			RECONNECT_DELAY_MS * Math.min(this.reconnectAttempts, 6);

		this.logger.info({
			msg: `feishu websocket 将在 ${delay}ms 后重连 (第 ${this.reconnectAttempts} 次)`,
		});

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			if (this.stopped) return;

			// 先停掉旧的 ws client
			try {
				(
					this.wsClient as { stop?: () => void } | null
				)?.stop?.();
			} catch {
				// ignore
			}
			this.wsClient = null;

			this.startWebSocket(feishu);
		}, delay);
	}

	// ─── 频道生命周期 ───────────────────────────────────

	async start(ctx: RemoteChannelContext): Promise<void> {
		this.ctx = ctx;
		this.stopped = false;
		const feishu = ctx.config.channels.feishu;

		if (!ctx.config.enabled || !feishu.enabled) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: undefined,
			});
			return;
		}

		if (!feishu.appId || !feishu.appSecret) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: "Feishu App ID / App Secret 未配置",
			});
			return;
		}

		this.client = this.buildClient(
			feishu.appId,
			feishu.appSecret,
			feishu.domain,
		);

		// 获取 bot 自身的 open_id（用于精确 @bot 检测）
		this.botOpenId = await fetchBotOpenId(this.client, (msg) =>
			this.logger.info({ msg }),
		);
		if (this.botOpenId) {
			this.logger.info({
				msg: `feishu bot open_id: ${this.botOpenId}`,
			});
		}

		ctx.onStatusPatch({
			running: true,
			connected: false,
			mode: feishu.connectionMode,
			last_error: undefined,
		});

		if (feishu.connectionMode !== "websocket") {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error:
					"当前版本仅实现 Feishu WebSocket，Webhook 已预留接口",
			});
			return;
		}

		this.startWebSocket({
			appId: feishu.appId,
			appSecret: feishu.appSecret,
			domain: feishu.domain,
		});
	}

	async stop(): Promise<void> {
		this.stopped = true;

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		try {
			(this.wsClient as { stop?: () => void } | null)?.stop?.();
		} catch {
			// ignore
		}
		this.wsClient = null;
		this.client = null;
		this.botOpenId = undefined;
		this.ctx = null;
	}

	// ─── 出站消息 ───────────────────────────────────────

	async send(message: RemoteOutboundMessage): Promise<void> {
		if (!this.client) {
			throw new Error("Feishu channel not initialized");
		}

		// 等待限流器放行
		await this.outboundLimiter.waitForSlot();

		const receiveIdType = normalizeTargetType(message.target_id);

		// 根据文本长度决定使用纯文本还是卡片
		const useCard = message.text.length > 200 || message.text.includes("```");
		const msgType = useCard ? "interactive" : "text";
		const content = useCard
			? buildMarkdownCard(message.text)
			: JSON.stringify({ text: message.text });

		if (message.reply_to_message_id) {
			const response = await this.client.im.message.reply({
				path: { message_id: message.reply_to_message_id },
				data: {
					msg_type: msgType,
					content,
				},
			});
			if (response.code !== 0) {
				throw new Error(
					response.msg || `Feishu reply failed: ${response.code}`,
				);
			}
		} else {
			const response = await this.client.im.message.create({
				params: { receive_id_type: receiveIdType },
				data: {
					receive_id: message.target_id,
					msg_type: msgType,
					content,
				},
			});
			if (response.code !== 0) {
				throw new Error(
					response.msg || `Feishu send failed: ${response.code}`,
				);
			}
		}

		this.ctx?.onStatusPatch({
			last_outbound_at: Date.now(),
			connected: true,
		});
	}

	// ─── 连接测试 ───────────────────────────────────────

	async testConnection(): Promise<{ ok: boolean; message: string }> {
		const ctx = this.ctx;
		const feishu = ctx?.config.channels.feishu;
		if (!feishu?.appId || !feishu?.appSecret) {
			return { ok: false, message: "App ID / App Secret 未配置" };
		}
		// 实际调用飞书 API 验证凭证
		return testFeishuCredentials(
			feishu.appId,
			feishu.appSecret,
			feishu.domain,
		);
	}
}
