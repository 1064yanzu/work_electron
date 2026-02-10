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

type FeishuMessageEvent = {
	sender?: {
		sender_id?: {
			open_id?: string;
		};
	};
	message?: {
		message_id?: string;
		chat_id?: string;
		chat_type?: "p2p" | "group";
		message_type?: string;
		content?: string;
		root_id?: string;
		parent_id?: string;
	};
};

function parseTextContent(
	content: string | undefined,
	messageType: string | undefined,
): string {
	if (!content) return "";
	if (messageType !== "text") return `[${messageType ?? "message"}]`;
	try {
		const parsed = JSON.parse(content) as { text?: string };
		return String(parsed.text ?? "").trim();
	} catch {
		return String(content).trim();
	}
}

function normalizeTargetType(targetId: string): "chat_id" | "open_id" {
	if (targetId.startsWith("oc_") || targetId.startsWith("chat_"))
		return "chat_id";
	return "open_id";
}

export class FeishuChannelPlugin implements RemoteChannelPlugin {
	readonly id = "feishu" as const;
	private ctx: RemoteChannelContext | null = null;
	private client: Lark.Client | null = null;
	private wsClient: Lark.WSClient | null = null;
	private readonly dedupe = new Map<string, number>();

	constructor(private readonly logger: Logger) {}

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

	private async onMessage(event: FeishuMessageEvent): Promise<void> {
		const ctx = this.ctx;
		if (!ctx) return;
		const message = event.message;
		if (!message?.message_id || !message.chat_id) return;
		if (!this.touchDedupe(message.message_id)) return;

		const senderOpenId = String(event.sender?.sender_id?.open_id ?? "").trim();
		const isGroup = message.chat_type === "group";
		const targetId = isGroup
			? message.chat_id
			: senderOpenId || message.chat_id;
		const inbound: RemoteInboundMessage = {
			channel_id: "feishu",
			peer_id: senderOpenId || message.chat_id,
			peer_name: senderOpenId || undefined,
			sender_id: senderOpenId || undefined,
			sender_name: senderOpenId || undefined,
			is_group: isGroup,
			text: parseTextContent(message.content, message.message_type),
			message_id: message.message_id,
			reply_to_message_id: message.parent_id ?? message.root_id,
			target_id: targetId,
			raw: event,
		};
		ctx.onStatusPatch({
			last_inbound_at: Date.now(),
			connected: true,
		});
		await ctx.onInboundMessage(inbound);
	}

	async start(ctx: RemoteChannelContext): Promise<void> {
		this.ctx = ctx;
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
				last_error: "当前版本仅实现 Feishu WebSocket，Webhook 已预留接口",
			});
			return;
		}

		const dispatcher = new Lark.EventDispatcher({});
		dispatcher.register({
			"im.message.receive_v1": async (payload: unknown) => {
				await this.onMessage(payload as FeishuMessageEvent);
			},
		});

		this.wsClient = new Lark.WSClient({
			appId: feishu.appId,
			appSecret: feishu.appSecret,
			domain: feishu.domain === "lark" ? Lark.Domain.Lark : Lark.Domain.Feishu,
			loggerLevel: Lark.LoggerLevel.warn,
		});
		try {
			this.wsClient.start({ eventDispatcher: dispatcher });
			ctx.onStatusPatch({ connected: true, running: true });
		} catch (error) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: error instanceof Error ? error.message : String(error),
			});
			this.logger.error({
				msg: "remote feishu websocket start failed",
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async stop(): Promise<void> {
		try {
			(this.wsClient as { stop?: () => void } | null)?.stop?.();
		} catch {
			// ignore
		}
		this.wsClient = null;
		this.client = null;
		this.ctx = null;
	}

	async send(message: RemoteOutboundMessage): Promise<void> {
		if (!this.client) {
			throw new Error("Feishu channel not initialized");
		}
		const receiveIdType = normalizeTargetType(message.target_id);
		const content = JSON.stringify({ text: message.text });
		if (message.reply_to_message_id) {
			const response = await this.client.im.message.reply({
				path: { message_id: message.reply_to_message_id },
				data: {
					msg_type: "text",
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
					msg_type: "text",
					content,
				},
			});
			if (response.code !== 0) {
				throw new Error(response.msg || `Feishu send failed: ${response.code}`);
			}
		}
		this.ctx?.onStatusPatch({ last_outbound_at: Date.now(), connected: true });
	}

	async testConnection(): Promise<{ ok: boolean; message: string }> {
		const ctx = this.ctx;
		const feishu = ctx?.config.channels.feishu;
		if (!feishu?.appId || !feishu?.appSecret) {
			return { ok: false, message: "App ID / App Secret 未配置" };
		}
		try {
			this.buildClient(feishu.appId, feishu.appSecret, feishu.domain);
			return { ok: true, message: "凭证格式有效（已完成本地校验）" };
		} catch (error) {
			return {
				ok: false,
				message: error instanceof Error ? error.message : String(error),
			};
		}
	}
}
