/**
 * Telegram 远程控制渠道插件
 * 使用 grammy SDK（Bot API 长轮询模式，无需公网 IP）
 */

import { Bot, type Context } from "grammy";
import type { Logger } from "../../../logging/types";
import type {
    RemoteChannelPlugin,
    RemoteChannelContext,
} from "../../core/channel-plugin";
import type { RemoteOutboundMessage, RemoteTelegramConfig } from "../../core/types";
import {
    chunkText,
    stripBotMention,
    checkBotMentioned,
    TelegramOutboundRateLimiter,
} from "./telegramUtils";

export class TelegramChannelPlugin implements RemoteChannelPlugin {
    readonly id = "telegram" as const;

    private bot: Bot | null = null;
    private ctx: RemoteChannelContext | null = null;
    private botUsername: string | undefined;
    private rateLimiter = new TelegramOutboundRateLimiter();

    constructor(private readonly logger: Logger) { }

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
    }

    // ─── 消息处理 ────────────────────────────────────────

    private async handleMessage(
        grammyCtx: Context,
        config: RemoteTelegramConfig,
    ): Promise<void> {
        const msg = grammyCtx.message;
        if (!msg?.text || !msg.from) return;

        const isGroup =
            msg.chat.type === "group" || msg.chat.type === "supergroup";
        const senderId = String(msg.from.id);
        const senderName =
            msg.from.first_name +
            (msg.from.last_name ? ` ${msg.from.last_name}` : "");
        const chatId = String(msg.chat.id);

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
            message_id: String(msg.message_id),
            target_id: chatId,
        });
    }

    // ─── 发送消息 ────────────────────────────────────────

    async send(message: RemoteOutboundMessage): Promise<void> {
        if (!this.bot) {
            this.logger.warn({ msg: "telegram: bot 未初始化，忽略发送" });
            return;
        }

        const chunks = chunkText(
            message.text,
            this.ctx?.config.channels.telegram.textChunkLimit ?? 4000,
        );

        for (const chunk of chunks) {
            await this.rateLimiter.waitForSlot();
            try {
                await this.bot.api.sendMessage(message.target_id, chunk, {
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
                await this.bot.api.sendMessage(message.target_id, chunk);
            }
        }

        this.ctx?.onStatusPatch({ last_outbound_at: Date.now() });
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
