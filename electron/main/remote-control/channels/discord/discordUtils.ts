/**
 * Discord 渠道工具函数
 * 提供: 消息分块、@bot 检测等
 */

// ─── 消息分块 ────────────────────────────────────────────

/**
 * 将长文本按 Discord 限制分块（默认 2000 字符）
 */
export function chunkText(text: string, limit = 2000): string[] {
    if (text.length <= limit) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= limit) {
            chunks.push(remaining);
            break;
        }

        let splitIndex = remaining.lastIndexOf("\n", limit);
        if (splitIndex <= 0 || splitIndex < limit * 0.3) {
            splitIndex = remaining.lastIndexOf(" ", limit);
        }
        if (splitIndex <= 0 || splitIndex < limit * 0.3) {
            splitIndex = limit;
        }

        chunks.push(remaining.slice(0, splitIndex));
        remaining = remaining.slice(splitIndex).trimStart();
    }

    return chunks;
}

// ─── @bot 检测 ──────────────────────────────────────────

/**
 * 检测 Discord 消息中是否 @了 bot
 * Discord 中 @bot 的格式为 <@BOTID>
 */
export function checkBotMentioned(
    text: string,
    botUserId: string | undefined,
): boolean {
    if (!botUserId) return false;
    return text.includes(`<@${botUserId}>`) || text.includes(`<@!${botUserId}>`);
}

/**
 * 从消息文本中移除 @bot mention
 */
export function stripBotMention(
    text: string,
    botUserId: string | undefined,
): string {
    if (!botUserId) return text;
    return text
        .replace(new RegExp(`<@!?${botUserId}>\\s*`, "g"), "")
        .trim();
}

// ─── 出站限流器 ────────────────────────────────────────

/**
 * Discord API 出站限流器
 * Discord 全局限制 50 req/sec，单频道消息 5/5sec
 */
export class DiscordOutboundRateLimiter {
    private readonly windowMs: number;
    private readonly maxPerWindow: number;
    private timestamps: number[] = [];

    constructor(maxPerSecond = 4) {
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
