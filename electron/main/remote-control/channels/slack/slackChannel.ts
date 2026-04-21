/**
 * Slack 远程控制渠道插件
 * 使用 @slack/bolt（Socket Mode，无需公网 URL）
 *
 * 阶段 3：接入 SDK 能力
 * - streaming（chat.update）
 * - typing（reactions.add "hourglass_flowing_sand"）
 * - interactive（Block Kit actions + block_actions 回调）
 * - persistent dedupe + sequential delivery
 */

import { App, LogLevel } from "@slack/bolt";
import type { Logger } from "../../../logging/types";
import type {
	RemoteChannelPlugin,
	RemoteChannelContext,
} from "../../core/channel-plugin";
import { updateChannelCapabilityEntry } from "../../core/channelCapabilityRegistry";
import type {
	RemoteOutboundMessage,
	RemoteSlackConfig,
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
	resolveUserName,
	SlackOutboundRateLimiter,
} from "./slackUtils";
import { createSlackStreamingFactory } from "./slackStreaming";
import { createSlackTypingFactory } from "./slackTyping";

export class SlackChannelPlugin implements RemoteChannelPlugin {
	readonly id = "slack" as const;
	streaming: ChannelStreamingFactory | null = null;
	typing: ChannelTypingFactory | null = null;
	actions: ChannelActions | null = null;

	private app: App | null = null;
	private ctx: RemoteChannelContext | null = null;
	private botUserId: string | undefined;
	private rateLimiter = new SlackOutboundRateLimiter();
	private readonly outboundQueue: SequentialQueue = createSequentialQueue();
	private readonly persistentDedupe: ChannelDedupe = getChannelDedupe("slack");

	constructor(private readonly logger: Logger) {}

	// ─── 生命周期 ────────────────────────────────────────

	async start(ctx: RemoteChannelContext): Promise<void> {
		this.ctx = ctx;
		const config = ctx.config.channels.slack;

		if (!config.botToken || !config.appToken) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: "未配置 Bot Token 或 App-Level Token",
			});
			return;
		}

		try {
			this.app = new App({
				token: config.botToken,
				appToken: config.appToken,
				socketMode: true,
				logLevel: LogLevel.WARN,
			});

			// 获取 bot 信息
			const authResult = await this.app.client.auth.test();
			this.botUserId = authResult.user_id ?? undefined;
			this.logger.info({
				msg: "slack: bot 信息获取成功",
				userId: this.botUserId,
				botName: authResult.user,
			});

			// 注册消息监听
			this.app.message(async ({ message }) => {
				// 只处理常规文本消息
				if (message.subtype) return;
				if (!("text" in message) || !message.text) return;
				if (!("user" in message) || !message.user) return;

				await this.handleMessage(
					message as {
						text: string;
						user: string;
						channel: string;
						channel_type?: string;
						ts: string;
						thread_ts?: string;
					},
					config,
				);
			});

			// 注册 block_actions 回调（按钮点击）
			this.app.action(/.*/, async ({ body, ack }) => {
				await ack();
				if (body.type !== "block_actions") return;
				await this.handleBlockActions(body);
			});

			// ─── 能力工厂 ───
			const features = config.features;
			this.streaming = createSlackStreamingFactory({
				app: this.app,
				logger: this.logger,
				enabled: () => (features?.streaming.mode ?? "edit") !== "off",
			});
			this.typing = createSlackTypingFactory({
				app: this.app,
				logger: this.logger,
				enabled: () => features?.typing.enabled !== false,
			});

			const app = this.app;
			this.actions = {
				send: async () => ({}),
				edit: async (params) => {
					await app.client.chat
						.update({
							channel: params.targetId,
							ts: params.messageId,
							text: params.text ?? "",
						})
						.catch(() => {});
				},
				delete: async (params) => {
					await app.client.chat
						.delete({
							channel: params.targetId,
							ts: params.messageId,
						})
						.catch(() => {});
				},
				react: async (params) => {
					await app.client.reactions
						.add({
							channel: params.targetId,
							timestamp: params.messageId,
							name: params.emoji,
						})
						.catch(() => {});
					return {};
				},
				unreact: async (params) => {
					await app.client.reactions
						.remove({
							channel: params.targetId,
							timestamp: params.messageId,
							name: params.emojiOrReactionId,
						})
						.catch(() => {});
				},
				pin: async (params) => {
					await app.client.pins
						.add({
							channel: params.targetId,
							timestamp: params.messageId,
						})
						.catch(() => {});
					return {};
				},
				unpin: async (params) => {
					await app.client.pins
						.remove({
							channel: params.targetId,
							timestamp: params.messageId,
						})
						.catch(() => {});
				},
			};

			updateChannelCapabilityEntry({
				channelId: "slack",
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
					media: false,
				},
			});

			// 启动 Socket Mode
			await this.app.start();
			this.logger.info({ msg: "slack: Socket Mode 已启动" });
			ctx.onStatusPatch({
				running: true,
				connected: true,
				mode: "socket-mode",
				last_error: undefined,
			});
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			this.logger.error({ msg: "slack: 启动失败", error: errMsg });
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: errMsg,
			});
		}
	}

	async stop(): Promise<void> {
		if (this.app) {
			await this.app.stop();
			this.app = null;
		}
		this.ctx = null;
		this.botUserId = undefined;
		this.streaming = null;
		this.typing = null;
		this.actions = null;
		await this.persistentDedupe.flush().catch(() => {});
	}

	// ─── 消息处理 ────────────────────────────────────────

	private async handleMessage(
		msg: {
			text: string;
			user: string;
			channel: string;
			channel_type?: string;
			ts: string;
			thread_ts?: string;
		},
		config: RemoteSlackConfig,
	): Promise<void> {
		// im = DM, channel/group = 群组/频道
		const isGroup = msg.channel_type !== "im";
		const senderId = msg.user;

		// 持久化去重
		if (config.features?.dedupe.persistent !== false) {
			const fresh = await this.persistentDedupe.checkAndRecord(
				`inbound:${msg.channel}:${msg.ts}`,
			);
			if (!fresh) return;
		}

		// 群组消息需要 @bot
		if (isGroup && config.requireMention) {
			if (!checkBotMentioned(msg.text, this.botUserId)) return;
		}

		// 清理消息文本
		let text = msg.text;
		if (isGroup) {
			text = stripBotMention(text, this.botUserId);
		}
		if (!text.trim()) return;

		// 解析发送者名称
		let senderName: string | undefined;
		if (this.app) {
			senderName = await resolveUserName(this.app.client, senderId, (m) =>
				this.logger.warn({ msg: m }),
			);
		}

		this.ctx?.onStatusPatch({ last_inbound_at: Date.now() });

		await this.ctx?.onInboundMessage({
			channel_id: "slack",
			peer_id: senderId,
			peer_name: senderName,
			sender_id: senderId,
			sender_name: senderName,
			is_group: isGroup,
			text,
			message_id: msg.ts,
			reply_to_message_id: msg.thread_ts,
			target_id: msg.channel,
		});
	}

	/**
	 * block_actions 事件处理（按钮点击）。
	 */
	private async handleBlockActions(body: {
		user?: { id?: string; name?: string };
		channel?: { id?: string };
		actions?: Array<{ action_id?: string; value?: string }>;
		message?: { ts?: string };
	}): Promise<void> {
		const action = body.actions?.[0];
		if (!action?.action_id) return;
		const approval = parseApprovalCallback(action.action_id, action.value);
		let commandText: string;
		if (approval) {
			commandText =
				approval.action === "approve"
					? `/approve ${approval.requestId}`
					: `/reject ${approval.requestId}`;
		} else {
			commandText = `/${action.action_id}`;
		}
		const senderId = body.user?.id ?? "unknown";
		const channel = body.channel?.id ?? "unknown";

		await this.ctx?.onInboundMessage({
			channel_id: "slack",
			peer_id: senderId,
			peer_name: body.user?.name,
			sender_id: senderId,
			sender_name: body.user?.name,
			is_group: true,
			text: commandText,
			message_id: body.message?.ts,
			target_id: channel,
		});
	}

	// ─── 发送消息 ────────────────────────────────────────

	async send(message: RemoteOutboundMessage): Promise<void> {
		if (!this.app) {
			this.logger.warn({ msg: "slack: app 未初始化，忽略发送" });
			return;
		}

		const config = this.ctx?.config.channels.slack;
		const sequentialEnabled = config?.features?.sequential_delivery !== false;

		const doSend = async () => {
			const app = this.app;
			if (!app) return;

			const chunks = chunkText(
				message.text,
				this.ctx?.config.channels.slack.textChunkLimit ?? 3000,
			);

			for (const chunk of chunks) {
				await this.rateLimiter.waitForSlot();
				try {
					await app.client.chat.postMessage({
						channel: message.target_id,
						text: chunk,
						mrkdwn: true,
						...(message.reply_to_message_id
							? { thread_ts: message.reply_to_message_id }
							: {}),
					});
				} catch (err) {
					this.logger.error({
						msg: "slack: 发送消息失败",
						channel: message.target_id,
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
		const config = this.ctx?.config.channels.slack;

		if (!config?.botToken) {
			return { ok: false, message: "未配置 Bot Token" };
		}
		if (!config.appToken) {
			return {
				ok: false,
				message: "未配置 App-Level Token（Socket Mode 必需）",
			};
		}

		try {
			const tempApp = new App({
				token: config.botToken,
				appToken: config.appToken,
				socketMode: true,
				logLevel: LogLevel.ERROR,
			});
			const authResult = await tempApp.client.auth.test();
			await tempApp.stop().catch(() => {});
			return {
				ok: true,
				message: `凭证有效，Bot: ${authResult.user ?? authResult.user_id ?? "unknown"}`,
			};
		} catch (err) {
			return {
				ok: false,
				message: `连接失败: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}
}
