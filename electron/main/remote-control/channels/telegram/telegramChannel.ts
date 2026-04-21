/**
 * Telegram 远程控制渠道插件
 * 使用 grammy SDK（Bot API 长轮询模式，无需公网 IP）
 *
 * 阶段 3：接入 SDK 能力
 * - streaming（editMessage）
 * - typing（sendChatAction）
 * - interactive（inline keyboard + callback_query）
 * - persistent dedupe + sequential delivery
 */

import { Bot, type Context } from "grammy";
import type { Logger } from "../../../logging/types";
import type {
	RemoteChannelPlugin,
	RemoteChannelContext,
} from "../../core/channel-plugin";
import { updateChannelCapabilityEntry } from "../../core/channelCapabilityRegistry";
import type {
	RemoteOutboundMessage,
	RemoteTelegramConfig,
} from "../../core/types";
import {
	createSequentialQueue,
	getChannelDedupe,
	parseApprovalCallback,
	type ChannelActions,
	type ChannelDedupe,
	type ChannelStreamingFactory,
	type ChannelTypingFactory,
	type SequentialQueue,
} from "../../sdk";
import {
	chunkText,
	stripBotMention,
	checkBotMentioned,
	TelegramOutboundRateLimiter,
} from "./telegramUtils";
import { createTelegramStreamingFactory } from "./telegramStreaming";
import { createTelegramTypingFactory } from "./telegramTyping";

export class TelegramChannelPlugin implements RemoteChannelPlugin {
	readonly id = "telegram" as const;
	streaming: ChannelStreamingFactory | null = null;
	typing: ChannelTypingFactory | null = null;
	actions: ChannelActions | null = null;

	private bot: Bot | null = null;
	private ctx: RemoteChannelContext | null = null;
	private botUsername: string | undefined;
	private rateLimiter = new TelegramOutboundRateLimiter();
	private readonly outboundQueue: SequentialQueue = createSequentialQueue();
	private readonly persistentDedupe: ChannelDedupe =
		getChannelDedupe("telegram");

	constructor(private readonly logger: Logger) {}

	// ─── 生命周期 ────────────────────────────────────────

	async start(ctx: RemoteChannelContext): Promise<void> {
		this.ctx = ctx;
		const config = ctx.config.channels.telegram;

		if (!config.botToken) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: "未配置 Bot Token",
			});
			return;
		}

		try {
			this.bot = new Bot(config.botToken);

			// 获取 bot 信息
			const me = await this.bot.api.getMe();
			this.botUsername = me.username;
			this.logger.info({
				msg: "telegram: bot 信息获取成功",
				username: me.username,
				id: me.id,
			});

			// 注册消息处理器
			this.bot.on("message:text", (grammyCtx) =>
				this.handleMessage(grammyCtx, config),
			);

			// 注册交互回调（按钮点击）
			this.bot.on("callback_query:data", (grammyCtx) =>
				this.handleCallbackQuery(grammyCtx, config),
			);

			// ─── 能力工厂初始化 ───
			const features = config.features;
			this.streaming = createTelegramStreamingFactory({
				bot: this.bot,
				logger: this.logger,
				enabled: () => (features?.streaming.mode ?? "edit") !== "off",
			});
			this.typing = createTelegramTypingFactory({
				bot: this.bot,
				logger: this.logger,
				enabled: () => features?.typing.enabled !== false,
			});

			// 简易 actions：edit / delete（Telegram 原生 API）
			const bot = this.bot;
			this.actions = {
				send: async () => ({}),
				edit: async (params) => {
					const chatId = /^-?\d+$/.test(params.targetId)
						? Number(params.targetId)
						: params.targetId;
					const text = params.text ?? "";
					await bot.api
						.editMessageText(chatId, Number(params.messageId), text)
						.catch(() => {});
				},
				delete: async (params) => {
					const chatId = /^-?\d+$/.test(params.targetId)
						? Number(params.targetId)
						: params.targetId;
					await bot.api
						.deleteMessage(chatId, Number(params.messageId))
						.catch(() => {});
				},
			};

			// 能力上报
			updateChannelCapabilityEntry({
				channelId: "telegram",
				status: "sdk",
				capabilities: {
					text: true,
					card: false,
					streaming: (features?.streaming.mode ?? "edit") !== "off",
					typing: features?.typing.enabled !== false,
					interactive: features?.interactive.enabled !== false,
					editMessage: true,
					deleteMessage: true,
					reactions: false,
					pin: false,
					media: false,
				},
			});

			// 启动长轮询
			this.bot.start({
				onStart: () => {
					this.logger.info({ msg: "telegram: 长轮询已启动" });
					ctx.onStatusPatch({
						running: true,
						connected: true,
						mode: "long-polling",
						last_error: undefined,
					});
				},
			});
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			this.logger.error({ msg: "telegram: 启动失败", error: errMsg });
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: errMsg,
			});
		}
	}

	async stop(): Promise<void> {
		if (this.bot) {
			await this.bot.stop();
			this.bot = null;
		}
		this.ctx = null;
		this.botUsername = undefined;
		this.streaming = null;
		this.typing = null;
		this.actions = null;
		await this.persistentDedupe.flush().catch(() => {});
	}

	// ─── 消息处理 ────────────────────────────────────────

	private async handleMessage(
		grammyCtx: Context,
		config: RemoteTelegramConfig,
	): Promise<void> {
		const msg = grammyCtx.message;
		if (!msg?.text || !msg.from) return;

		const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
		const senderId = String(msg.from.id);
		const senderName =
			msg.from.first_name +
			(msg.from.last_name ? ` ${msg.from.last_name}` : "");
		const chatId = String(msg.chat.id);
		const messageId = String(msg.message_id);

		// 持久化去重
		const persistent = config.features?.dedupe.persistent !== false;
		if (persistent) {
			const fresh = await this.persistentDedupe.checkAndRecord(
				`inbound:${chatId}:${messageId}`,
			);
			if (!fresh) return;
		}

		// 群组消息需要 @bot
		if (isGroup && config.requireMention) {
			const mentioned = checkBotMentioned(
				msg.text,
				msg.entities,
				this.botUsername,
			);
			if (!mentioned) return;
		}

		// 清理消息文本（移除 @bot）
		let text = msg.text;
		if (isGroup) {
			text = stripBotMention(text, this.botUsername);
		}

		if (!text.trim()) return;

		// 更新最后收到消息时间
		this.ctx?.onStatusPatch({ last_inbound_at: Date.now() });

		// 投递到编排器
		await this.ctx?.onInboundMessage({
			channel_id: "telegram",
			peer_id: senderId,
			peer_name: senderName,
			sender_id: senderId,
			sender_name: senderName,
			is_group: isGroup,
			text,
			message_id: messageId,
			target_id: chatId,
		});
	}

	/**
	 * callback_query（按钮点击）处理：转换为 `/approve <id>` / `/reject <id>` 等命令。
	 */
	private async handleCallbackQuery(
		grammyCtx: Context,
		_config: RemoteTelegramConfig,
	): Promise<void> {
		const query = grammyCtx.callbackQuery;
		if (!query?.data || !query.from || !query.message) return;

		const senderId = String(query.from.id);
		const senderName =
			query.from.first_name +
			(query.from.last_name ? ` ${query.from.last_name}` : "");
		const chatId = String(query.message.chat.id);

		// 尝试解析为审批动作
		const approval = parseApprovalCallback(query.data, query.data);
		let commandText: string;
		if (approval) {
			commandText =
				approval.action === "approve"
					? `/approve ${approval.requestId}`
					: `/reject ${approval.requestId}`;
		} else {
			// 其他 callback 透传
			commandText = `/${query.data}`;
		}

		// ack 按钮避免 loading 状态转圈
		await grammyCtx.answerCallbackQuery({ text: "已收到操作" }).catch(() => {});

		await this.ctx?.onInboundMessage({
			channel_id: "telegram",
			peer_id: senderId,
			peer_name: senderName,
			sender_id: senderId,
			sender_name: senderName,
			is_group:
				query.message.chat.type === "group" ||
				query.message.chat.type === "supergroup",
			text: commandText,
			message_id: String(query.message.message_id),
			target_id: chatId,
		});
	}

	// ─── 发送消息 ────────────────────────────────────────

	async send(message: RemoteOutboundMessage): Promise<void> {
		if (!this.bot) {
			this.logger.warn({ msg: "telegram: bot 未初始化，忽略发送" });
			return;
		}

		const config = this.ctx?.config.channels.telegram;
		const sequentialEnabled = config?.features?.sequential_delivery !== false;

		const doSend = async () => {
			const bot = this.bot;
			if (!bot) return;

			const chunks = chunkText(
				message.text,
				this.ctx?.config.channels.telegram.textChunkLimit ?? 4000,
			);

			for (const chunk of chunks) {
				await this.rateLimiter.waitForSlot();
				try {
					await bot.api.sendMessage(message.target_id, chunk, {
						parse_mode: "Markdown",
						...(message.reply_to_message_id
							? {
									reply_parameters: {
										message_id: Number(message.reply_to_message_id),
									},
								}
							: {}),
					});
				} catch (err) {
					// Markdown 解析失败时回退为纯文本
					this.logger.warn({
						msg: "telegram: Markdown 发送失败，回退纯文本",
						error: String(err),
					});
					await bot.api.sendMessage(message.target_id, chunk);
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
		const config = this.ctx?.config.channels.telegram;
		const token = config?.botToken;

		if (!token) {
			return { ok: false, message: "未配置 Bot Token" };
		}

		try {
			const tempBot = new Bot(token);
			const me = await tempBot.api.getMe();
			return {
				ok: true,
				message: `凭证有效，Bot: @${me.username} (${me.first_name})`,
			};
		} catch (err) {
			return {
				ok: false,
				message: `连接失败: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}
}
