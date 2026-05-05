import * as Lark from "@larksuiteoapi/node-sdk";
import type { Logger } from "../../../logging/types";
import type {
	RemoteChannelPlugin,
	RemoteChannelContext,
} from "../../core/channel-plugin";
import { updateChannelCapabilityEntry } from "../../core/channelCapabilityRegistry";
import type {
	RemoteInboundMessage,
	RemoteInboundContextFile,
	RemoteOutboundMessage,
} from "../../core/types";
import {
	createSequentialQueue,
	getChannelDedupe,
	type ChannelActions,
	type ChannelDedupe,
	type ChannelStreamingFactory,
	type ChannelTypingFactory,
	type SequentialQueue,
} from "../../sdk";
import {
	parseTextContent,
	normalizeTargetType,
	checkBotMentioned,
	stripBotMention,
	resolveSenderName,
	fetchBotOpenId,
	testFeishuCredentials,
	FeishuOutboundRateLimiter,
	type FeishuMention,
} from "./feishuUtils";
import { FeishuInboundMergeBuffer } from "./feishuInboundMergeBuffer";
import { FeishuMessageResourceService } from "./feishuMessageResourceService";
import { FeishuDocLinkResolver } from "./feishuDocLinkResolver";
import { FeishuShareMessageContextService } from "./feishuShareMessageContextService";
import { FeishuShareContextBuffer } from "./feishuShareContextBuffer";
import { parseCardAction } from "./feishuCardBuilder";
import { createFeishuStreamingFactory } from "./feishuStreamingCard";
import { createFeishuTypingFactory } from "./feishuTyping";
import { createFeishuActions } from "./feishuActions";
import { FeishuDedupeManager } from "./feishuDedupe";
import { FeishuOutboundSender } from "./feishuOutbound";
import { FeishuReconnectScheduler } from "./feishuReconnect";

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
		/** 消息创建时间（Unix ms 字符串，飞书部分接口返回） */
		create_time?: string;
	};
};

// 卡片动作事件类型
type FeishuCardActionEvent = {
	operator?: {
		open_id?: string;
		user_id?: string;
		union_id?: string;
		operator_id?: {
			open_id?: string;
			union_id?: string;
			user_id?: string;
		};
	};
	action?: {
		value?: unknown;
		tag?: string;
	};
	open_message_id?: string;
	open_chat_id?: string;
	context?: {
		open_message_id?: string;
		open_chat_id?: string;
	};
};

type FeishuCardActionAck = {
	toast: {
		type: "info" | "success" | "warning" | "error";
		content: string;
	};
};

const ATTACHMENT_MESSAGE_TYPES = new Set(["file", "image", "media", "audio"]);

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") return null;
	return value as Record<string, unknown>;
}

function toStringOrEmpty(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isOnlyDocLink(text: string): boolean {
	const cleaned = text
		.replace(/https?:\/\/[^\s<>"'`]+/g, "")
		.replace(/\[系统上下文[^\]]*\]/g, "")
		.trim();
	return cleaned.length === 0;
}

export class FeishuChannelPlugin implements RemoteChannelPlugin {
	readonly id = "feishu" as const;
	streaming: ChannelStreamingFactory | null = null;
	typing: ChannelTypingFactory | null = null;
	actions: ChannelActions | null = null;
	private ctx: RemoteChannelContext | null = null;
	private client: Lark.Client | null = null;
	private wsClient: Lark.WSClient | null = null;
	private botOpenId: string | undefined;
	private readonly outboundLimiter = new FeishuOutboundRateLimiter(4);
	private readonly inboundMergeBuffer = new FeishuInboundMergeBuffer();
	private readonly shareContextBuffer = new FeishuShareContextBuffer();
	private readonly outboundQueue: SequentialQueue = createSequentialQueue();
	private readonly persistentDedupe: ChannelDedupe = getChannelDedupe("feishu");
	private readonly dedupe = new FeishuDedupeManager();
	private readonly outboundSender = new FeishuOutboundSender({
		getClient: () => this.client,
		logger: this.loggerRef(),
		rateLimiter: this.outboundLimiter,
		dedupeOutboundText: (targetId, text) =>
			this.dedupe.touchOutboundText(targetId, text),
	});
	private readonly reconnect: FeishuReconnectScheduler;
	private messageResourceService: FeishuMessageResourceService | null = null;
	private shareMessageContextService: FeishuShareMessageContextService | null =
		null;
	private docLinkResolver: FeishuDocLinkResolver | null = null;
	private stopped = false;
	/** WebSocket 建连时间（ms），用于过滤积压的历史消息 */
	private connectedAt = 0;
	/** 最近一次 startWebSocket 使用的连接参数，便于重连时复用 */
	private lastWsConnectParams: {
		appId: string;
		appSecret: string;
		domain: "feishu" | "lark";
	} | null = null;

	constructor(private readonly logger: Logger) {
		this.reconnect = new FeishuReconnectScheduler({
			logger,
			isStopped: () => this.stopped,
			onGiveUp: (reason) => {
				this.ctx?.onStatusPatch({
					running: false,
					connected: false,
					last_error: reason,
				});
			},
			doReconnect: () => {
				try {
					(this.wsClient as { stop?: () => void } | null)?.stop?.();
				} catch {
					// ignore
				}
				this.wsClient = null;
				if (this.lastWsConnectParams) {
					this.startWebSocket(this.lastWsConnectParams);
				}
			},
		});
	}

	private loggerRef(): Logger {
		return this.logger;
	}

	// ─── 持久化去重 ────────────────────────────────────────

	/**
	 * 持久化去重：进程重启后依然能拦截重复消息。
	 * - 先查内存快路径；命中则直接拒绝
	 * - 未命中时 checkAndRecord 落地磁盘（原子）
	 *
	 * 仅在 features.dedupe.persistent 开启时使用；否则走内存版。
	 */
	private async touchPersistentDedupe(messageId: string): Promise<boolean> {
		const feishu = this.ctx?.config.channels.feishu;
		const persistent = feishu?.features?.dedupe.persistent !== false;
		// 先走内存，快路径命中立即返回
		if (!this.dedupe.touchInboundId(messageId)) return false;
		if (!persistent) return true;
		return this.persistentDedupe.checkAndRecord(`inbound:${messageId}`);
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

	private unwrapEventPayload(payload: unknown): Record<string, unknown> {
		const root = asRecord(payload) ?? {};
		const nestedEvent = asRecord(root.event);
		if (nestedEvent) return nestedEvent;
		return root;
	}

	private shouldBufferAttachment(messageType: string): boolean {
		return ATTACHMENT_MESSAGE_TYPES.has(messageType);
	}

	private buildConversationKey(chatId: string, senderOpenId: string): string {
		return `${chatId}::${senderOpenId || "unknown"}`;
	}

	// ─── 入站消息处理 ────────────────────────────────────

	private async onMessage(payload: unknown): Promise<void> {
		const ctx = this.ctx;
		if (!ctx) return;
		const event = this.unwrapEventPayload(payload) as FeishuMessageEvent;
		const message = event.message;
		if (!message?.message_id || !message.chat_id) return;

		// 过滤积压的历史消息：WebSocket 建连后会重放积压消息，
		// 若消息创建时间早于建连时间（留 10 秒宽容），跳过以防止同时触发多个 Agent。
		if (this.connectedAt > 0 && message.create_time) {
			const msgTs = Number(message.create_time);
			if (!Number.isNaN(msgTs) && msgTs < this.connectedAt - 10_000) {
				this.logger.info({
					msg: `feishu: skipping backlog message (created before connection)`,
					messageId: message.message_id,
					msgTs,
					connectedAt: this.connectedAt,
				});
				return;
			}
		}

		if (!(await this.touchPersistentDedupe(message.message_id))) return;
		this.inboundMergeBuffer.cleanupExpired();
		this.shareContextBuffer.cleanupExpired();
		this.dedupe.cleanupDocLinkBuffer();

		const senderOpenId = String(event.sender?.sender_id?.open_id ?? "").trim();
		const isGroup = message.chat_type === "group";
		const messageType = String(message.message_type ?? "")
			.trim()
			.toLowerCase();
		const feishuConfig = ctx.config.channels.feishu;
		const conversationKey = senderOpenId
			? this.buildConversationKey(message.chat_id, senderOpenId)
			: "";

		if (
			feishuConfig.enableAttachmentMerge &&
			this.messageResourceService &&
			this.shouldBufferAttachment(messageType) &&
			conversationKey
		) {
			const attachment =
				await this.messageResourceService.fetchBufferedAttachment({
					message_id: message.message_id,
					message_type: message.message_type,
					content: message.content,
				});
			if (attachment) {
				this.inboundMergeBuffer.push(
					conversationKey,
					attachment,
					feishuConfig.attachmentMergeWindowSec,
				);
			}
			return;
		}

		// 群聊中检测 @bot（使用 mentions 数组精确判断）
		const mentions = message.mentions;
		if (isGroup && ctx.config.channels.feishu.requireMention) {
			const mentioned = checkBotMentioned(mentions, this.botOpenId);
			if (!mentioned) {
				// 未 @bot 的群消息，忽略
				return;
			}

			if (conversationKey && this.shareMessageContextService) {
				const shareContext = this.shareMessageContextService.buildContext({
					message_id: message.message_id,
					message_type: message.message_type,
					content: message.content,
					root_id: message.root_id,
					parent_id: message.parent_id,
				});
				if (shareContext) {
					this.shareContextBuffer.push(
						conversationKey,
						shareContext,
						feishuConfig.attachmentMergeWindowSec,
					);
					this.logger.info({
						msg: "feishu share/context message buffered",
						messageId: message.message_id,
						chatId: message.chat_id,
						messageType,
					});
					return;
				}
			}
		}

		// 解析消息文本
		let text = parseTextContent(message.content, message.message_type);
		// 去除 @bot 的标记
		text = stripBotMention(text, mentions);
		if (!text.trim()) {
			return;
		}
		const textDedupeConversationKey =
			conversationKey || `${message.chat_id}::${senderOpenId || "unknown"}`;
		if (!this.dedupe.touchInboundText(textDedupeConversationKey, text)) {
			this.logger.info({
				msg: "feishu duplicate inbound text dropped",
				messageId: message.message_id,
				chatId: message.chat_id,
				messageType,
			});
			return;
		}

		if (
			feishuConfig.enableAttachmentMerge &&
			this.messageResourceService &&
			conversationKey
		) {
			const mergedAttachments =
				this.inboundMergeBuffer.consume(conversationKey);
			if (mergedAttachments.length > 0) {
				const attachmentContext =
					this.messageResourceService.buildContextBlock(mergedAttachments);
				if (attachmentContext) {
					text = `${text}\n\n${attachmentContext}`;
				}
			}

			if (conversationKey && this.shareMessageContextService) {
				const shareContexts = this.shareContextBuffer.consume(conversationKey, {
					rootId: message.root_id,
					parentId: message.parent_id,
				});
				if (shareContexts.length > 0) {
					const shareContextBlock =
						this.shareMessageContextService.buildContextBlock(shareContexts);
					if (shareContextBlock) {
						text = `${text}\n\n${shareContextBlock}`;
					}
				}
			}
		}

		const contextFiles: RemoteInboundContextFile[] = [];

		// 文档链接处理:如果是纯文档链接消息,缓冲起来等待合并
		if (
			feishuConfig.enableDocLinkPrefetch &&
			this.docLinkResolver &&
			conversationKey
		) {
			const hasDocLink =
				/https?:\/\/[^\s<>"'`]*\/(?:docx|wiki)\/[^\s<>"'`]+/.test(text);
			if (hasDocLink && isOnlyDocLink(text)) {
				// 纯文档链接消息,缓冲起来
				this.dedupe.bufferDocLink(conversationKey, text);
				this.logger.info({
					msg: "feishu pure doc link buffered",
					messageId: message.message_id,
					chatId: message.chat_id,
					messageType,
				});
				return;
			}

			let docPrefetchText = "";
			if (hasDocLink) {
				docPrefetchText = text;
			}

			// 检查是否有待合并的文档链接（纯链接 + 后续留言）
			const buffered = this.dedupe.consumeDocLink(conversationKey);
			if (buffered) {
				docPrefetchText = docPrefetchText
					? `${buffered}\n${docPrefetchText}`
					: buffered;
			}

			if (docPrefetchText) {
				const resolved = await this.docLinkResolver.resolve(docPrefetchText);
				if (resolved.contextBlock) {
					text = `${text}\n\n${resolved.contextBlock}`;
				}
				if (resolved.contextFiles.length > 0) {
					for (const file of resolved.contextFiles) {
						contextFiles.push({
							source: "feishu_doc_prefetch",
							title: file.title,
							suggested_name: file.suggestedName,
							content: file.content,
							metadata: file.metadata,
						});
					}
				}
				this.logger.info({
					msg: "feishu doc link resolved for inbound",
					messageId: message.message_id,
					chatId: message.chat_id,
					contextFileCount: resolved.contextFiles.length,
				});
			}
		}
		this.logger.info({
			msg: "feishu inbound text accepted",
			messageId: message.message_id,
			chatId: message.chat_id,
			messageType,
			textPreview: text.slice(0, 120),
		});

		// 解析发送者名称
		let senderName: string | undefined;
		if (this.client && senderOpenId) {
			senderName = await resolveSenderName(this.client, senderOpenId, (msg) =>
				this.logger.info({ msg }),
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
			context_files: contextFiles.length ? contextFiles : undefined,
			raw: payload,
		};

		ctx.onStatusPatch({
			last_inbound_at: Date.now(),
			connected: true,
		});

		// 重置重连计数（成功收到消息说明连接正常）
		this.reconnect.reset();

		await ctx.onInboundMessage(inbound);
	}

	// ─── 卡片动作处理 ────────────────────────────────────

	private async dispatchCardActionInbound(params: {
		payload: unknown;
		operatorOpenId: string;
		openMessageId: string;
		openChatId: string;
		commandText: string;
	}): Promise<void> {
		const ctx = this.ctx;
		if (!ctx) return;

		// 解析发送者名称
		let senderName: string | undefined;
		if (this.client) {
			senderName = await resolveSenderName(
				this.client,
				params.operatorOpenId,
				(msg) => this.logger.info({ msg }),
			);
		}

		// 构造入站消息,就像用户发送了命令一样
		const inbound: RemoteInboundMessage = {
			channel_id: "feishu",
			peer_id: params.operatorOpenId,
			peer_name: senderName || params.operatorOpenId || undefined,
			sender_id: params.operatorOpenId || undefined,
			sender_name: senderName || params.operatorOpenId || undefined,
			is_group: !!params.openChatId,
			text: params.commandText,
			message_id: params.openMessageId || undefined,
			target_id: params.openChatId || params.operatorOpenId,
			raw: params.payload,
		};

		await ctx.onInboundMessage(inbound);
	}

	private async onCardAction(payload: unknown): Promise<FeishuCardActionAck> {
		const event = this.unwrapEventPayload(payload) as FeishuCardActionEvent;

		const operatorOpenId = toStringOrEmpty(
			event.operator?.open_id ??
				event.operator?.operator_id?.open_id ??
				asRecord(payload)?.open_id ??
				asRecord(asRecord(payload)?.event)?.open_id,
		);
		const actionValue = event.action?.value;
		const openMessageId = toStringOrEmpty(
			event.open_message_id ?? event.context?.open_message_id,
		);
		const openChatId = toStringOrEmpty(
			event.open_chat_id ?? event.context?.open_chat_id,
		);

		if (!operatorOpenId || !actionValue) {
			this.logger.warn({
				msg: "feishu card action missing operator/value",
				hasOperator: !!operatorOpenId,
				hasActionValue: !!actionValue,
			});
			return {
				toast: {
					type: "error",
					content: "交互参数不完整，请重试。",
				},
			};
		}

		const action = parseCardAction(actionValue);
		if (!action) {
			this.logger.warn({
				msg: "feishu card action: invalid action value",
				value: actionValue,
			});
			return {
				toast: {
					type: "error",
					content: "交互参数解析失败，请重试。",
				},
			};
		}

		this.logger.info({
			msg: `feishu card action: ${action.action} ${action.requestId}`,
		});

		const commandText =
			action.action === "approve"
				? `/approve ${action.requestId}`
				: `/reject ${action.requestId}`;

		// 关键：立即返回回调响应，避免飞书 3 秒回调超时（200341/交互失败）。
		// 审批命令异步送入主链路，确保点击后不卡住飞书侧交互。
		queueMicrotask(() => {
			void this.dispatchCardActionInbound({
				payload,
				operatorOpenId,
				openMessageId,
				openChatId,
				commandText,
			}).catch((error) => {
				this.logger.error({
					msg: "feishu dispatch card action inbound failed",
					error: error instanceof Error ? error.message : String(error),
				});
			});
		});

		return {
			toast: {
				type: "info",
				content:
					action.action === "approve"
						? "已收到批准指令，正在处理。"
						: "已收到拒绝指令，正在处理。",
			},
		};
	}

	// ─── 启动 WebSocket ─────────────────────────────────

	private startWebSocket(feishu: {
		appId: string;
		appSecret: string;
		domain: "feishu" | "lark";
	}): void {
		const ctx = this.ctx;
		if (!ctx) return;
		this.lastWsConnectParams = feishu;

		const dispatcher = new Lark.EventDispatcher({});
		dispatcher.register({
			"im.message.receive_v1": async (payload: unknown) => {
				try {
					await this.onMessage(payload);
				} catch (error) {
					this.logger.error({
						msg: "feishu onMessage failed",
						error: error instanceof Error ? error.message : String(error),
					});
				}
			},
			"card.action.trigger": async (payload: unknown) => {
				try {
					return await this.onCardAction(payload);
				} catch (error) {
					this.logger.error({
						msg: "feishu onCardAction failed",
						error: error instanceof Error ? error.message : String(error),
					});
					return {
						toast: {
							type: "error",
							content: "交互处理失败，请稍后重试。",
						},
					} satisfies FeishuCardActionAck;
				}
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
			this.connectedAt = Date.now();
			ctx.onStatusPatch({
				connected: true,
				running: true,
				last_error: undefined,
			});
			this.reconnect.reset();
			this.logger.info({ msg: "feishu websocket connected" });
		} catch (error) {
			ctx.onStatusPatch({
				running: false,
				connected: false,
				last_error: error instanceof Error ? error.message : String(error),
			});
			this.logger.error({
				msg: "feishu websocket start failed",
				error: error instanceof Error ? error.message : String(error),
			});
			this.reconnect.schedule();
		}
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
		this.messageResourceService = new FeishuMessageResourceService(
			this.client,
			this.logger,
		);
		this.shareMessageContextService = new FeishuShareMessageContextService();
		this.docLinkResolver = new FeishuDocLinkResolver(this.client, this.logger);
		this.inboundMergeBuffer.clear();
		this.shareContextBuffer.clear();

		// ─── 初始化 SDK 工厂（streaming / typing / actions） ───
		const features = feishu.features;
		this.streaming = createFeishuStreamingFactory({
			client: this.client,
			credentials: {
				appId: feishu.appId,
				appSecret: feishu.appSecret,
				domain: feishu.domain,
			},
			logger: this.logger,
			enabled: () => (feishu.features?.streaming.mode ?? "card") !== "off",
			resolveReceiveIdType: (targetId) => {
				const kind = normalizeTargetType(targetId);
				if (
					kind === "chat_id" ||
					kind === "open_id" ||
					kind === "user_id" ||
					kind === "union_id" ||
					kind === "email"
				) {
					return kind;
				}
				return "chat_id";
			},
		});
		this.typing = createFeishuTypingFactory({
			client: this.client,
			logger: this.logger,
			enabled: () => feishu.features?.typing.enabled !== false,
		});
		this.actions = createFeishuActions({
			client: this.client,
			sendTextLegacy: async (message) => {
				await this.outboundSender.sendText({
					channel_id: "feishu",
					target_id: message.targetId,
					text: message.text ?? "",
					reply_to_message_id: message.replyToMessageId,
				});
			},
			sendCardLegacy: async (message) => {
				await this.outboundSender.sendCard({
					channel_id: "feishu",
					target_id: message.targetId,
					text: message.cardJson ?? "",
					reply_to_message_id: message.replyToMessageId,
					use_card: true,
				});
			},
			logger: this.logger,
		});

		// ─── 能力注册表上报 ───
		updateChannelCapabilityEntry({
			channelId: "feishu",
			status: "sdk",
			capabilities: {
				text: true,
				card: true,
				streaming: (features?.streaming.mode ?? "card") !== "off",
				typing: features?.typing.enabled !== false,
				interactive: features?.interactive.enabled !== false,
				editMessage: true,
				deleteMessage: true,
				reactions: true,
				pin: true,
				media: true,
			},
		});

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
				last_error: "当前版本仅实现 Feishu WebSocket，Webhook 已预留接口",
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
		this.reconnect.cancel();

		try {
			(this.wsClient as { stop?: () => void } | null)?.stop?.();
		} catch {
			// ignore
		}
		this.wsClient = null;
		this.client = null;
		this.botOpenId = undefined;
		this.messageResourceService = null;
		this.shareMessageContextService = null;
		this.docLinkResolver = null;
		this.streaming = null;
		this.typing = null;
		this.actions = null;
		this.inboundMergeBuffer.clear();
		this.shareContextBuffer.clear();
		this.dedupe.clear();
		// 持久化去重不清理，跨启动有效
		await this.persistentDedupe.flush().catch(() => {});
		this.ctx = null;
	}

	// ─── 出站消息（委托给 outboundSender + 串行队列） ─────

	async send(message: RemoteOutboundMessage): Promise<void> {
		if (!this.client) {
			throw new Error("Feishu channel not initialized");
		}

		// 按会话串行投递；同一 target_id 的多条消息严格按顺序到达。
		const feishu = this.ctx?.config.channels.feishu;
		const sequentialEnabled = feishu?.features?.sequential_delivery !== false;

		const doSend = async () => {
			await this.outboundSender.send(message);
			this.ctx?.onStatusPatch({
				last_outbound_at: Date.now(),
				connected: true,
			});
		};

		if (sequentialEnabled) {
			await this.outboundQueue(message.target_id, doSend);
		} else {
			await doSend();
		}
	}

	// ─── 连接测试 ───────────────────────────────────────

	async testConnection(): Promise<{ ok: boolean; message: string }> {
		const ctx = this.ctx;
		const feishu = ctx?.config.channels.feishu;
		if (!feishu?.appId || !feishu?.appSecret) {
			return { ok: false, message: "App ID / App Secret 未配置" };
		}
		// 实际调用飞书 API 验证凭证
		return testFeishuCredentials(feishu.appId, feishu.appSecret, feishu.domain);
	}
}
