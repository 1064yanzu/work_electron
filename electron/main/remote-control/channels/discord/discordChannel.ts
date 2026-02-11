/**
 * Discord 远程控制渠道插件
 * 使用 discord.js（Gateway WebSocket，无需公网 IP）
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
import type { RemoteOutboundMessage, RemoteDiscordConfig } from "../../core/types";
import {
    chunkText,
    stripBotMention,
    checkBotMentioned,
    DiscordOutboundRateLimiter,
} from "./discordUtils";

export class DiscordChannelPlugin implements RemoteChannelPlugin {
    readonly id = "discord" as const;

    private client: Client | null = null;
    private ctx: RemoteChannelContext | null = null;
    private botUserId: string | undefined;
    private rateLimiter = new DiscordOutboundRateLimiter();

    constructor(private readonly logger: Logger) { }

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

            // 断线重连事件
            this.client.on("error", (err) => {
                this.logger.error({
                    msg: "discord: WebSocket 错误",
                    error: err.message,
                });
                ctx.onStatusPatch({ last_error: err.message });
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
    }

    // ─── 消息处理 ────────────────────────────────────────

    private async handleMessage(
        msg: OmitPartialGroupDMChannel<Message>,
        config: RemoteDiscordConfig,
    ): Promise<void> {
        // 忽略 bot 自身的消息
        if (msg.author.bot) return;
        if (!msg.content) return;

        const isDM = !msg.guild;
        const isGroup = !isDM;
        const senderId = msg.author.id;
        const senderName = msg.author.displayName || msg.author.username;
        const channelId = msg.channelId;

        // 群组消息需要 @bot
        if (isGroup && config.requireMention) {
            if (!checkBotMentioned(msg.content, this.botUserId)) return;
        }

        // 清理消息文本
        let text = msg.content;
        if (isGroup) {
            text = stripBotMention(text, this.botUserId);
        }
        if (!text.trim()) return;

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
        });
    }

    // ─── 发送消息 ────────────────────────────────────────

    async send(message: RemoteOutboundMessage): Promise<void> {
        if (!this.client) {
            this.logger.warn({ msg: "discord: client 未初始化，忽略发送" });
            return;
        }

        const channel = await this.client.channels
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

        const sendable = channel as { send: (opts: { content: string; reply?: { messageReference: string } }) => Promise<unknown> };

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
