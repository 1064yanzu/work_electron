/**
 * Slack 远程控制渠道插件
 * 使用 @slack/bolt（Socket Mode，无需公网 URL）
 */

import { App, LogLevel } from "@slack/bolt";
import type { Logger } from "../../../logging/types";
import type {
    RemoteChannelPlugin,
    RemoteChannelContext,
} from "../../core/channel-plugin";
import type { RemoteOutboundMessage, RemoteSlackConfig } from "../../core/types";
import {
    chunkText,
    stripBotMention,
    checkBotMentioned,
    resolveUserName,
    SlackOutboundRateLimiter,
} from "./slackUtils";

export class SlackChannelPlugin implements RemoteChannelPlugin {
    readonly id = "slack" as const;

    private app: App | null = null;
    private ctx: RemoteChannelContext | null = null;
    private botUserId: string | undefined;
    private rateLimiter = new SlackOutboundRateLimiter();

    constructor(private readonly logger: Logger) { }

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

                await this.handleMessage(message as {
                    text: string;
                    user: string;
                    channel: string;
                    channel_type?: string;
                    ts: string;
                    thread_ts?: string;
                }, config);
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
            senderName = await resolveUserName(
                this.app.client,
                senderId,
                (m) => this.logger.warn({ msg: m }),
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

    // ─── 发送消息 ────────────────────────────────────────

    async send(message: RemoteOutboundMessage): Promise<void> {
        if (!this.app) {
            this.logger.warn({ msg: "slack: app 未初始化，忽略发送" });
            return;
        }

        const chunks = chunkText(
            message.text,
            this.ctx?.config.channels.slack.textChunkLimit ?? 3000,
        );

        for (const chunk of chunks) {
            await this.rateLimiter.waitForSlot();
            try {
                await this.app.client.chat.postMessage({
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
    }

    // ─── 连接测试 ────────────────────────────────────────

    async testConnection(): Promise<{ ok: boolean; message: string }> {
        const config = this.ctx?.config.channels.slack;

        if (!config?.botToken) {
            return { ok: false, message: "未配置 Bot Token" };
        }
        if (!config.appToken) {
            return { ok: false, message: "未配置 App-Level Token（Socket Mode 必需）" };
        }

        try {
            const tempApp = new App({
                token: config.botToken,
                appToken: config.appToken,
                socketMode: true,
                logLevel: LogLevel.ERROR,
            });
            const authResult = await tempApp.client.auth.test();
            await tempApp.stop().catch(() => { });
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
