/**
 * Discord 远程控制渠道插件
 * 使用 discord.js（Gateway WebSocket，无需公网 IP）
 *
 * 阶段 3：接入 SDK 能力
 * - streaming（message.edit）
 * - typing（channel.sendTyping）
 * - interactive（ActionRow + Button + interactionCreate 回调）
 * - persistent dedupe + sequential delivery
 */

import {
	Client,
	GatewayIntentBits,
	type Message,
	type OmitPartialGroupDMChannel,
} from "discord.js";
import type { Logger } from "../../../logging/types";
import type {
	RemoteChannelPlugin,
	RemoteChannelContext,
} from "../../core/channel-plugin";
import { updateChannelCapabilityEntry } from "../../core/channelCapabilityRegistry";
import type {
	RemoteInboundFileRef,
	RemoteOutboundMessage,
	RemoteDiscordConfig,
} from "../../core/types";
import {
	createSequentialQueue,
	getChannelDedupe,
	parseApprovalCallback,
	type ChannelActions,
	type ChannelDedupe,
	type ChannelFileTransfer,
	type ChannelStreamingFactory,
	type ChannelTypingFactory,
	type SequentialQueue,
} from "../../sdk";
import {
	chunkText,
	stripBotMention,
	checkBotMentioned,
	DiscordOutboundRateLimiter,
} from "./discordUtils";
import { createDiscordFileTransfer } from "./discordFileTransfer";
import { createDiscordStreamingFactory } from "./discordStreaming";
import { createDiscordTypingFactory } from "./discordTyping";

export class DiscordChannelPlugin implements RemoteChannelPlugin {
	readonly id = "discord" as const;
	streaming: ChannelStreamingFactory | null = null;
	typing: ChannelTypingFactory | null = null;
	actions: ChannelActions | null = null;
	fileTransfer: ChannelFileTransfer | null = null;

	private client: Client | null = null;
	private ctx: RemoteChannelContext | null = null;
	private botUserId: string | undefined;
	private rateLimiter = new DiscordOutboundRateLimiter();
	private readonly outboundQueue: SequentialQueue = createSequentialQueue();
	private readonly persistentDedupe: ChannelDedupe =
		getChannelDedupe("discord");

	constructor(private readonly logger: Logger) {}

	// ─── 生命周期 ────────────────────────────────────────

	async start(ctx: RemoteChannelContext): Promise<void> {
		this.ctx = ctx;
		const config = ctx.config.channels.discord;

		if (!config.botToken) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: "未配置 Bot Token",
			});
			return;
		}

		try {
			this.client = new Client({
				intents: [
					GatewayIntentBits.Guilds,
					GatewayIntentBits.GuildMessages,
					GatewayIntentBits.DirectMessages,
					GatewayIntentBits.MessageContent,
				],
			});

			// Ready 事件
			this.client.once("ready", (readyClient) => {
				this.botUserId = readyClient.user.id;
				this.logger.info({
					msg: "discord: bot 已就绪",
					username: readyClient.user.tag,
					id: readyClient.user.id,
				});
				ctx.onStatusPatch({
					running: true,
					connected: true,
					mode: "gateway",
					last_error: undefined,
				});
			});

			// 消息事件
			this.client.on("messageCreate", (msg) => {
				void this.handleMessage(msg, config);
			});

			// 按钮/菜单交互事件
			this.client.on("interactionCreate", (interaction) => {
				if (!interaction.isButton()) return;
				void this.handleButtonInteraction({
					customId: interaction.customId,
					user: {
						id: interaction.user.id,
						username: interaction.user.username,
					},
					channelId: interaction.channelId,
					message: { id: interaction.message.id },
					deferUpdate: () =>
						interaction.deferUpdate().then(() => {
							/* discard */
						}),
				});
			});

			// 断线重连事件
			this.client.on("error", (err) => {
				this.logger.error({
					msg: "discord: WebSocket 错误",
					error: err.message,
				});
				ctx.onStatusPatch({ last_error: err.message });
			});

			// ─── 能力工厂 ───
			const features = config.features;
			this.streaming = createDiscordStreamingFactory({
				client: this.client,
				logger: this.logger,
				enabled: () => (features?.streaming.mode ?? "edit") !== "off",
			});
			this.typing = createDiscordTypingFactory({
				client: this.client,
				logger: this.logger,
				enabled: () => features?.typing.enabled !== false,
			});
			this.fileTransfer = createDiscordFileTransfer({
				client: this.client,
				logger: this.logger,
				enabled: () => Boolean(this.client),
			});

			const client = this.client;
			this.actions = {
				send: async () => ({}),
				edit: async (params) => {
					const channel = await client.channels
						.fetch(params.targetId)
						.catch(() => null);
					if (!channel || !("messages" in channel)) return;
					const msgChannel = channel as unknown as {
						messages: {
							fetch: (id: string) => Promise<Message>;
						};
					};
					const msg = await msgChannel.messages
						.fetch(params.messageId)
						.catch(() => null);
					if (!msg) return;
					await msg.edit({ content: params.text ?? "" }).catch(() => {});
				},
				delete: async (params) => {
					const channel = await client.channels
						.fetch(params.targetId)
						.catch(() => null);
					if (!channel || !("messages" in channel)) return;
					const msgChannel = channel as unknown as {
						messages: {
							fetch: (id: string) => Promise<Message>;
						};
					};
					const msg = await msgChannel.messages
						.fetch(params.messageId)
						.catch(() => null);
					if (!msg) return;
					await msg.delete().catch(() => {});
				},
				react: async (params) => {
					const channel = await client.channels
						.fetch(params.targetId)
						.catch(() => null);
					if (!channel || !("messages" in channel)) return {};
					const msgChannel = channel as unknown as {
						messages: {
							fetch: (id: string) => Promise<Message>;
						};
					};
					const msg = await msgChannel.messages
						.fetch(params.messageId)
						.catch(() => null);
					if (!msg) return {};
					await msg.react(params.emoji).catch(() => {});
					return {};
				},
				pin: async (params) => {
					const channel = await client.channels
						.fetch(params.targetId)
						.catch(() => null);
					if (!channel || !("messages" in channel)) return {};
					const msgChannel = channel as unknown as {
						messages: {
							fetch: (id: string) => Promise<Message>;
						};
					};
					const msg = await msgChannel.messages
						.fetch(params.messageId)
						.catch(() => null);
					if (!msg) return {};
					await msg.pin().catch(() => {});
					return {};
				},
				unpin: async (params) => {
					const channel = await client.channels
						.fetch(params.targetId)
						.catch(() => null);
					if (!channel || !("messages" in channel)) return;
					const msgChannel = channel as unknown as {
						messages: {
							fetch: (id: string) => Promise<Message>;
						};
					};
					const msg = await msgChannel.messages
						.fetch(params.messageId)
						.catch(() => null);
					if (!msg) return;
					await msg.unpin().catch(() => {});
				},
			};

			updateChannelCapabilityEntry({
				channelId: "discord",
				status: "sdk",
				capabilities: {
					text: true,
					card: false,
					streaming: (features?.streaming.mode ?? "edit") !== "off",
					typing: features?.typing.enabled !== false,
					interactive: features?.interactive.enabled !== false,
					editMessage: true,
					deleteMessage: true,
					reactions: true,
					pin: true,
					media: true,
				},
			});

			// 登录
			await this.client.login(config.botToken);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			this.logger.error({ msg: "discord: 启动失败", error: errMsg });
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: errMsg,
			});
		}
	}

	async stop(): Promise<void> {
		if (this.client) {
			this.client.destroy();
			this.client = null;
		}
		this.ctx = null;
		this.botUserId = undefined;
		this.streaming = null;
		this.typing = null;
		this.actions = null;
		this.fileTransfer = null;
		await this.persistentDedupe.flush().catch(() => {});
	}

	// ─── 消息处理 ────────────────────────────────────────

	private async handleMessage(
		msg: OmitPartialGroupDMChannel<Message>,
		config: RemoteDiscordConfig,
	): Promise<void> {
		// 忽略 bot 自身的消息
		if (msg.author.bot) return;
		// content 可以为空（仅附件）但 attachments 也可空，二者都空才略过
		const hasAttachment = msg.attachments && msg.attachments.size > 0;
		if (!msg.content && !hasAttachment) return;

		const isDM = !msg.guild;
		const isGroup = !isDM;
		const senderId = msg.author.id;
		const senderName = msg.author.displayName || msg.author.username;
		const channelId = msg.channelId;

		// 持久化去重
		if (config.features?.dedupe.persistent !== false) {
			const fresh = await this.persistentDedupe.checkAndRecord(
				`inbound:${channelId}:${msg.id}`,
			);
			if (!fresh) return;
		}

		// 群组消息需要 @bot
		if (isGroup && config.requireMention) {
			if (!checkBotMentioned(msg.content ?? "", this.botUserId)) return;
		}

		// 清理消息文本
		let text = msg.content ?? "";
		if (isGroup) {
			text = stripBotMention(text, this.botUserId);
		}
		// 仅附件、没文字时给一个占位，便于 IM 远控终端识别
		if (!text.trim() && hasAttachment) {
			text = "[附件]";
		}
		if (!text.trim()) return;

		// 把附件包装成 inbound_files（IM 远控终端 PtyBridge 会下载到 cwd/.uploads/）
		const inboundFiles: RemoteInboundFileRef[] = [];
		if (hasAttachment) {
			for (const attachment of msg.attachments.values()) {
				inboundFiles.push({
					filename: attachment.name ?? `file_${attachment.id}`,
					mimeType: attachment.contentType ?? undefined,
					bytes: attachment.size,
					download: async () => {
						const url = attachment.url;
						const resp = await fetch(url);
						if (!resp.ok) {
							throw new Error(
								`discord attachment fetch HTTP ${resp.status}: ${url}`,
							);
						}
						const arrayBuffer = await resp.arrayBuffer();
						return Buffer.from(arrayBuffer);
					},
				});
			}
		}

		this.ctx?.onStatusPatch({ last_inbound_at: Date.now() });

		await this.ctx?.onInboundMessage({
			channel_id: "discord",
			peer_id: senderId,
			peer_name: senderName,
			sender_id: senderId,
			sender_name: senderName,
			is_group: isGroup,
			text,
			message_id: msg.id,
			target_id: channelId,
			inbound_files: inboundFiles.length > 0 ? inboundFiles : undefined,
		});
	}

	private async handleButtonInteraction(interaction: {
		customId: string;
		user: { id: string; username: string };
		channelId: string | null;
		message: { id: string };
		deferUpdate: () => Promise<void>;
	}): Promise<void> {
		const customId = interaction.customId;
		if (!customId) return;
		let commandText = "";
		// pty:<idx>:<kind>[:payload...]  → 反射回 /cli 文本指令，由 ptyCommandParser 解析
		if (customId.startsWith("pty:")) {
			const parts = customId.split(":");
			const kind = parts[2] ?? "";
			const rest = parts.slice(3).join(":");
			switch (kind) {
				case "key":
					commandText = `/cli key ${rest}`;
					break;
				case "stop":
					commandText = "/cli stop";
					break;
				case "text":
					// /i 是 stdin 注入短形式（含自动换行），比 /cli send 更稳
					commandText = `/i ${rest}`;
					break;
				case "scroll": {
					const [dir, amt] = rest.split(":");
					commandText = amt ? `/cli ${dir} ${amt}` : `/cli ${dir}`;
					break;
				}
				case "more":
					commandText = "/cli more";
					break;
				case "confirm":
					commandText = "/cli confirm";
					break;
				case "cancel":
					commandText = "/cli cancel";
					break;
				default:
					commandText = "";
			}
		}
		if (!commandText) {
			const approval = parseApprovalCallback(customId, customId);
			if (approval) {
				commandText =
					approval.action === "approve"
						? `/approve ${approval.requestId}`
						: `/reject ${approval.requestId}`;
			} else {
				commandText = `/${customId}`;
			}
		}
		await interaction.deferUpdate().catch(() => {});

		const channelId = interaction.channelId ?? "";
		await this.ctx?.onInboundMessage({
			channel_id: "discord",
			peer_id: interaction.user.id,
			peer_name: interaction.user.username,
			sender_id: interaction.user.id,
			sender_name: interaction.user.username,
			is_group: true,
			text: commandText,
			message_id: interaction.message.id,
			target_id: channelId,
		});
	}

	// ─── 发送消息 ────────────────────────────────────────

	async send(message: RemoteOutboundMessage): Promise<void> {
		if (!this.client) {
			this.logger.warn({ msg: "discord: client 未初始化，忽略发送" });
			return;
		}

		const config = this.ctx?.config.channels.discord;
		const sequentialEnabled = config?.features?.sequential_delivery !== false;

		const doSend = async () => {
			const client = this.client;
			if (!client) return;

			const channel = await client.channels
				.fetch(message.target_id)
				.catch(() => null);

			if (!channel || !("send" in channel)) {
				this.logger.error({
					msg: "discord: 无法找到目标频道或频道不支持发送",
					channelId: message.target_id,
				});
				return;
			}

			const chunks = chunkText(
				message.text,
				this.ctx?.config.channels.discord.textChunkLimit ?? 1800,
			);

			const sendable = channel as {
				send: (opts: {
					content: string;
					reply?: { messageReference: string };
				}) => Promise<unknown>;
			};

			for (const chunk of chunks) {
				await this.rateLimiter.waitForSlot();
				try {
					await sendable.send({
						content: chunk,
						...(message.reply_to_message_id
							? { reply: { messageReference: message.reply_to_message_id } }
							: {}),
					});
				} catch (err) {
					this.logger.error({
						msg: "discord: 发送消息失败",
						channelId: message.target_id,
						error: String(err),
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

	// ─── 连接测试 ────────────────────────────────────────

	async testConnection(): Promise<{ ok: boolean; message: string }> {
		const config = this.ctx?.config.channels.discord;
		const token = config?.botToken;

		if (!token) {
			return { ok: false, message: "未配置 Bot Token" };
		}

		try {
			const tempClient = new Client({
				intents: [GatewayIntentBits.Guilds],
			});

			return new Promise((resolve) => {
				const timeout = setTimeout(() => {
					tempClient.destroy();
					resolve({ ok: false, message: "连接超时（10 秒）" });
				}, 10000);

				tempClient.once("ready", (readyClient) => {
					clearTimeout(timeout);
					const result = {
						ok: true,
						message: `凭证有效，Bot: ${readyClient.user.tag}`,
					};
					tempClient.destroy();
					resolve(result);
				});

				tempClient.once("error", (err) => {
					clearTimeout(timeout);
					tempClient.destroy();
					resolve({
						ok: false,
						message: `连接失败: ${err.message}`,
					});
				});

				tempClient.login(token).catch((err) => {
					clearTimeout(timeout);
					resolve({
						ok: false,
						message: `登录失败: ${err instanceof Error ? err.message : String(err)}`,
					});
				});
			});
		} catch (err) {
			return {
				ok: false,
				message: `连接失败: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}
}
