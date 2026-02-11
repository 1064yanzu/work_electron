/**
 * Telegram 渠道工具函数
 * 提供: MarkdownV2 转义、消息分块、@bot 检测等
 */

// ─── MarkdownV2 转义 ────────────────────────────────────

/**
 * 转义 Telegram MarkdownV2 特殊字符
 * https://core.telegram.org/bots/api#markdownv2-style
 */
export function escapeMarkdownV2(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// ─── 消息分块 ────────────────────────────────────────────

/**
 * 将长文本分割成 Telegram 可接受的消息块（默认 4096 字符）
 * 尽量在换行符处分割以保持可读性
 */
export function chunkText(text: string, limit = 4096): string[] {
    if (text.length <= limit) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= limit) {
            chunks.push(remaining);
            break;
        }

        // 尝试在换行符处分割
        let splitIndex = remaining.lastIndexOf("\n", limit);
        if (splitIndex <= 0 || splitIndex < limit * 0.3) {
            // 没找到合适的换行符，尝试在空格处分割
            splitIndex = remaining.lastIndexOf(" ", limit);
        }
        if (splitIndex <= 0 || splitIndex < limit * 0.3) {
            // 仍然没找到，强制在 limit 处切割
            splitIndex = limit;
        }

        chunks.push(remaining.slice(0, splitIndex));
        remaining = remaining.slice(splitIndex).trimStart();
    }

    return chunks;
}

// ─── @bot 检测 ──────────────────────────────────────────

/**
 * 检测 Telegram 消息中是否 @了 bot
 * Telegram 消息中的 entities 含有 bot_command 和 mention 类型
 */
export function checkBotMentioned(
    text: string,
    entities: Array<{ type: string; offset: number; length: number }> | undefined,
    botUsername: string | undefined,
): boolean {
    if (!entities || !botUsername) return false;
    const lower = botUsername.toLowerCase();
    return entities.some((e) => {
        if (e.type !== "mention") return false;
        const mention = text.slice(e.offset, e.offset + e.length);
        return mention.toLowerCase() === `@${lower}`;
    });
}

/**
 * 从消息文本中移除 @bot 的 mention
 */
export function stripBotMention(
    text: string,
    botUsername: string | undefined,
): string {
    if (!botUsername) return text;
    return text
        .replace(new RegExp(`@${botUsername}\\s*`, "gi"), "")
        .trim();
}

// ─── 出站限流器 ────────────────────────────────────────

/**
 * Telegram Bot API 限流器
 * Telegram 限制约 30 条/秒（全局），单聊天 1 条/秒
 * 这里做保守的全局限流
 */
export class TelegramOutboundRateLimiter {
    private readonly windowMs: number;
    private readonly maxPerWindow: number;
    private timestamps: number[] = [];

    constructor(maxPerSecond = 25) {
        this.windowMs = 1000;
        this.maxPerWindow = maxPerSecond;
    }

    async waitForSlot(): Promise<void> {
        const now = Date.now();
        this.timestamps = this.timestamps.filter(
            (ts) => now - ts < this.windowMs,
        );
        if (this.timestamps.length >= this.maxPerWindow) {
            const oldest = this.timestamps[0]!;
            const waitMs = this.windowMs - (now - oldest) + 50;
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        this.timestamps.push(Date.now());
    }
}
