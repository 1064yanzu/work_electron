/**
 * QQ Bot 渠道工具函数
 * 提供: 消息分块、QQ @bot 检测、出站限流、target 路由解析
 */

/**
 * QQ Bot 消息分块（默认 2000 字符，QQ 单条上限 4000 字符但保留裕度）
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

/**
 * QQ @bot 判断（频道消息里 @bot 通常会被协议自动处理，仅剩纯文本；
 * 但有些场景带 <@bot_id> 前缀，这里统一剥离）。
 */
export function stripAtMention(
	text: string,
	botId: string | undefined,
): string {
	if (!text) return text;
	if (botId) {
		const trimmed = text.replace(new RegExp(`<@!?${botId}>\\s*`, "g"), "");
		return trimmed.trim();
	}
	return text.trim();
}

/**
 * 检查文本前缀是否包含 @bot mention，用于群组 requireMention
 */
export function checkAtMention(
	text: string,
	botId: string | undefined,
): boolean {
	if (!botId) return true;
	if (!text) return false;
	return text.includes(`<@${botId}>`) || text.includes(`<@!${botId}>`);
}

/**
 * 出站限流器（QQ Bot 官方 API 限流比较严，做一个本地保守限制）
 */
export class QqbotOutboundRateLimiter {
	private readonly windowMs: number;
	private readonly maxPerWindow: number;
	private timestamps: number[] = [];

	constructor(maxPerSecond = 3) {
		this.windowMs = 1000;
		this.maxPerWindow = maxPerSecond;
	}

	async waitForSlot(): Promise<void> {
		const now = Date.now();
		this.timestamps = this.timestamps.filter((ts) => now - ts < this.windowMs);
		if (this.timestamps.length >= this.maxPerWindow) {
			const oldest = this.timestamps[0] ?? now;
			const waitMs = this.windowMs - (now - oldest) + 50;
			await new Promise((resolve) => setTimeout(resolve, waitMs));
		}
		this.timestamps.push(Date.now());
	}
}

/**
 * target_id 编解码 —— 本渠道的 target_id 由 {scope}:{id} 组成，方便 sendToChannel 区分场景。
 * 与 QQ REST 路径一致，避免多套别名：
 *   - c2c:{openid}           → /v2/users/{openid}/messages
 *   - group:{group_openid}   → /v2/groups/{group_openid}/messages
 *   - channel:{channel_id}   → /channels/{channel_id}/messages    (Guild 子频道)
 *   - dm:{guild_id}          → /dms/{guild_id}/messages           (Guild 私信)
 */
export type QqbotTargetScope = "c2c" | "group" | "channel" | "dm";

export type QqbotTarget = {
	scope: QqbotTargetScope;
	id: string;
};

export function encodeTarget(scope: QqbotTargetScope, id: string): string {
	return `${scope}:${id}`;
}

export function decodeTarget(targetId: string): QqbotTarget | null {
	const idx = targetId.indexOf(":");
	if (idx <= 0) return null;
	const scope = targetId.slice(0, idx) as QqbotTargetScope;
	const id = targetId.slice(idx + 1);
	if (!id) return null;
	if (
		scope !== "c2c" &&
		scope !== "group" &&
		scope !== "channel" &&
		scope !== "dm"
	) {
		return null;
	}
	return { scope, id };
}
