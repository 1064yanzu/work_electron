/**
 * QQ Bot 渠道插件
 *
 * 基于官方 QQ 开放平台 Bot API（https://bot.q.qq.com/wiki/）：
 *   - WebSocket Gateway + 心跳 + Resume（[qqbotGateway.ts](qqbotGateway.ts)）
 *   - REST v2 消息 API（[qqbotApi.ts](qqbotApi.ts)）
 *   - SDK 能力：edit-based streaming、input_notify typing（仅 C2C）、按钮文本降级 interactive、持久化去重、顺序投递
 *
 * target_id 约定：`c2c:{openid}` / `group:{group_openid}` / `guild:{channel_id}` / `dm:{guild_id}`
 */

import type { Logger } from "../../../logging/types";
import type {
	RemoteChannelPlugin,
	RemoteChannelContext,
} from "../../core/channel-plugin";
import { updateChannelCapabilityEntry } from "../../core/channelCapabilityRegistry";
import type {
	RemoteOutboundMessage,
	RemoteQqbotConfig,
} from "../../core/types";
import {
	createSequentialQueue,
	getChannelDedupe,
	parseApprovalCallback,
	type ChannelActions,
	type ChannelDedupe,
	type ChannelInteractiveComponents,
	type ChannelStreamingFactory,
	type ChannelTypingFactory,
	type SequentialQueue,
} from "../../sdk";
import {
	clearAccessTokenCache,
	editMessage,
	getAccessToken,
	sendC2CMessage,
	sendChannelMessage,
	sendDmMessage,
	sendGroupMessage,
	type QqbotApiCredentials,
} from "./qqbotApi";
import { QqbotGateway } from "./qqbotGateway";
import { createQqbotStreamingFactory } from "./qqbotStreaming";
import { createQqbotTypingFactory } from "./qqbotTyping";
import { componentsToQqbotText } from "./qqbotInteractive";
import {
	chunkText,
	checkAtMention,
	encodeTarget,
	stripAtMention,
	QqbotOutboundRateLimiter,
} from "./qqbotUtils";

export class QqbotChannelPlugin implements RemoteChannelPlugin {
	readonly id = "qqbot" as const;
	streaming: ChannelStreamingFactory | null = null;
	typing: ChannelTypingFactory | null = null;
	actions: ChannelActions | null = null;

	private gateway: QqbotGateway | null = null;
	private ctx: RemoteChannelContext | null = null;
	private botId: string | undefined;
	private credentials: QqbotApiCredentials | null = null;
	private rateLimiter = new QqbotOutboundRateLimiter();
	private readonly outboundQueue: SequentialQueue = createSequentialQueue();
	private readonly persistentDedupe: ChannelDedupe = getChannelDedupe("qqbot");

	constructor(private readonly logger: Logger) {}

	async start(ctx: RemoteChannelContext): Promise<void> {
		this.ctx = ctx;
		const config = ctx.config.channels.qqbot;
		if (!config) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: "配置缺失",
			});
			return;
		}
		if (!config.appId || !config.clientSecret) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: "未配置 appId / clientSecret",
			});
			return;
		}

		const credentials: QqbotApiCredentials = {
			appId: config.appId,
			clientSecret: config.clientSecret,
			environment: config.environment ?? "prod",
		};
		this.credentials = credentials;

		try {
			// 主动拉一次 token 验证凭证可用
			await getAccessToken(credentials, this.logger);
		} catch (err) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error:
					err instanceof Error
						? `获取 access_token 失败：${err.message}`
						: "获取 access_token 失败",
			});
			return;
		}

		const gateway = new QqbotGateway(
			credentials,
			{
				onReady: (info) => {
					this.botId = info.botId;
					this.logger.info({
						msg: "qqbot: gateway ready",
						botId: info.botId,
					});
					ctx.onStatusPatch({
						running: true,
						connected: true,
						mode: config.environment === "sandbox" ? "sandbox" : "prod",
						last_error: undefined,
					});
				},
				onMessage: async (incoming) => {
					await this.handleInboundMessage(incoming, config);
				},
				onError: (err) => {
					ctx.onStatusPatch({ last_error: err.message });
				},
				onClose: (reason) => {
					ctx.onStatusPatch({
						connected: false,
						last_error: `gateway closed: ${reason}`,
					});
				},
				onStatus: ({ connected, note }) => {
					ctx.onStatusPatch({
						connected,
						last_error: note,
					});
				},
			},
			this.logger,
		);
		this.gateway = gateway;

		// SDK 能力工厂
		const features = config.features;
		const streamingEnabled = (features?.streaming.mode ?? "edit") !== "off";
		const typingEnabled = features?.typing.enabled !== false;
		this.streaming = createQqbotStreamingFactory({
			credentials,
			logger: this.logger,
			enabled: () => streamingEnabled,
		});
		this.typing = createQqbotTypingFactory({
			credentials,
			logger: this.logger,
			enabled: () => typingEnabled,
		});
		this.actions = {
			send: async () => ({}),
			edit: async (params) => {
				await editMessage({
					credentials,
					scope: this.resolveScopeForTarget(params.targetId),
					targetId: this.stripScope(params.targetId),
					messageId: params.messageId,
					content: params.text ?? "",
					logger: this.logger,
				}).catch(() => {});
			},
			delete: async () => {
				// QQ 官方 API 不开放机器人删除消息，忽略
			},
			react: async () => ({}),
			pin: async () => ({}),
			unpin: async () => {},
		};

		updateChannelCapabilityEntry({
			channelId: "qqbot",
			label: "QQ Bot（官方 API）",
			status: "sdk",
			capabilities: {
				text: true,
				card: false,
				streaming: streamingEnabled,
				typing: typingEnabled,
				interactive: features?.interactive.enabled !== false,
				editMessage: true,
				deleteMessage: false,
				reactions: false,
				pin: false,
				media: false,
			},
		});

		await gateway.start();
	}

	async stop(): Promise<void> {
		if (this.gateway) {
			await this.gateway.stop();
			this.gateway = null;
		}
		clearAccessTokenCache(this.credentials?.appId);
		this.ctx = null;
		this.botId = undefined;
		this.credentials = null;
		this.streaming = null;
		this.typing = null;
		this.actions = null;
		await this.persistentDedupe.flush().catch(() => {});
	}

	async testConnection(): Promise<{ ok: boolean; message: string }> {
		const config = this.ctx?.config.channels.qqbot;
		if (!config?.appId || !config?.clientSecret) {
			return { ok: false, message: "未配置 appId / clientSecret" };
		}
		const credentials: QqbotApiCredentials = {
			appId: config.appId,
			clientSecret: config.clientSecret,
			environment: config.environment ?? "prod",
		};
		try {
			const token = await getAccessToken(credentials, this.logger);
			if (!token) {
				return { ok: false, message: "token 响应为空" };
			}
			return {
				ok: true,
				message: `凭证有效，appId=${config.appId}，环境=${credentials.environment}`,
			};
		} catch (err) {
			return {
				ok: false,
				message: err instanceof Error ? err.message : String(err),
			};
		}
	}

	async send(message: RemoteOutboundMessage): Promise<void> {
		if (!this.credentials) {
			this.logger.warn({
				msg: "qqbot: credentials 未初始化，忽略发送",
			});
			return;
		}
		const config = this.ctx?.config.channels.qqbot;
		if (!config) return;

		const sequentialEnabled = config.features?.sequential_delivery !== false;
		const credentials = this.credentials;

		const doSend = async () => {
			const scope = this.resolveScopeForTarget(message.target_id);
			const id = this.stripScope(message.target_id);
			const chunks = chunkText(message.text, config.textChunkLimit ?? 1800);
			// interactive_components 降级为提示文本
			const componentsNote = message.interactive_components
				? componentsToQqbotText(
						message.interactive_components as ChannelInteractiveComponents,
					)
				: "";

			for (let i = 0; i < chunks.length; i++) {
				await this.rateLimiter.waitForSlot();
				const isLast = i === chunks.length - 1;
				const content =
					isLast && componentsNote
						? `${chunks[i]}\n\n${componentsNote}`
						: chunks[i];
				try {
					switch (scope) {
						case "c2c":
							await sendC2CMessage({
								credentials,
								openid: id,
								content,
								messageReference: message.reply_to_message_id,
								logger: this.logger,
							});
							break;
						case "group":
							await sendGroupMessage({
								credentials,
								groupOpenid: id,
								content,
								messageReference: message.reply_to_message_id,
								logger: this.logger,
							});
							break;
						case "channel":
							await sendChannelMessage({
								credentials,
								channelId: id,
								content,
								msgId: message.reply_to_message_id,
								logger: this.logger,
							});
							break;
						case "dm":
							await sendDmMessage({
								credentials,
								guildId: id,
								content,
								msgId: message.reply_to_message_id,
								logger: this.logger,
							});
							break;
					}
				} catch (err) {
					this.logger.error({
						msg: "qqbot: 发送消息失败",
						scope,
						id,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}

			this.ctx?.onStatusPatch({ last_outbound_at: Date.now() });
		};

		if (sequentialEnabled) {
			await this.outboundQueue(message.target_id, doSend);
		} else {
			await doSend();
		}
	}

	// ─── 内部消息路由 ────────────────────────────────────────

	private async handleInboundMessage(
		incoming: {
			scope: "c2c" | "group" | "guild_at" | "dm";
			event: {
				id: string;
				content: string;
				channel_id?: string;
				guild_id?: string;
				group_openid?: string;
				author: {
					id?: string;
					username?: string;
					user_openid?: string;
					member_openid?: string;
				};
			};
		},
		config: RemoteQqbotConfig,
	): Promise<void> {
		const { scope, event } = incoming;

		// scope 开关（config）
		if (scope === "guild_at" && !config.enableGuild) return;
		if (scope === "dm" && !config.enableGuild) return;
		if (scope === "group" && !config.enableGroup) return;
		if (scope === "c2c" && !config.enableC2c) return;

		// 持久化去重
		if (config.features?.dedupe.persistent !== false) {
			const fresh = await this.persistentDedupe.checkAndRecord(
				`inbound:${scope}:${event.id}`,
			);
			if (!fresh) return;
		}

		const isGroup = scope === "group" || scope === "guild_at";
		const senderId =
			scope === "c2c"
				? event.author.user_openid
				: scope === "group"
					? event.author.member_openid
					: event.author.id;
		const senderName = event.author.username;

		let text = event.content ?? "";
		if (isGroup) {
			if (config.requireMention && !checkAtMention(text, this.botId)) {
				return;
			}
			text = stripAtMention(text, this.botId);
		}
		text = text.trim();
		if (!text) return;

		const targetScope =
			scope === "c2c"
				? "c2c"
				: scope === "group"
					? "group"
					: scope === "guild_at"
						? "channel"
						: "dm";
		const targetKey =
			targetScope === "c2c"
				? (event.author.user_openid ?? "")
				: targetScope === "group"
					? (event.group_openid ?? "")
					: targetScope === "channel"
						? (event.channel_id ?? "")
						: (event.guild_id ?? "");
		if (!targetKey) return;

		this.ctx?.onStatusPatch({ last_inbound_at: Date.now() });

		await this.ctx?.onInboundMessage({
			channel_id: "qqbot",
			peer_id: senderId ?? "",
			peer_name: senderName,
			sender_id: senderId,
			sender_name: senderName,
			is_group: isGroup,
			text,
			message_id: event.id,
			target_id: encodeTarget(targetScope, targetKey),
		});

		// 审批按钮回调（QQ 没有 native button，用户通过输入命令触发；这里无 callback 事件）
		// 如果 text 是 ap_{requestId} 或 rj_{requestId}，解析为审批命令
		const approval = parseApprovalCallback(text, text);
		if (approval) {
			await this.ctx?.onInboundMessage({
				channel_id: "qqbot",
				peer_id: senderId ?? "",
				peer_name: senderName,
				sender_id: senderId,
				sender_name: senderName,
				is_group: isGroup,
				text:
					approval.action === "approve"
						? `/approve ${approval.requestId}`
						: `/reject ${approval.requestId}`,
				message_id: event.id,
				target_id: encodeTarget(targetScope, targetKey),
			});
		}
	}

	private resolveScopeForTarget(
		targetId: string,
	): "c2c" | "group" | "channel" | "dm" {
		if (targetId.startsWith("c2c:")) return "c2c";
		if (targetId.startsWith("group:")) return "group";
		if (targetId.startsWith("channel:")) return "channel";
		if (targetId.startsWith("dm:")) return "dm";
		return "c2c";
	}

	private stripScope(targetId: string): string {
		const idx = targetId.indexOf(":");
		if (idx < 0) return targetId;
		return targetId.slice(idx + 1);
	}
}
