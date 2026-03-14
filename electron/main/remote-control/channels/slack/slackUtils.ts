/**
 * Slack 渠道工具函数
 * 提供: mrkdwn 转义、消息分块、@bot 检测等
 */

// ─── mrkdwn 格式处理 ────────────────────────────────────

/**
 * 转义 Slack mrkdwn 特殊字符
 * Slack 使用自己的 mrkdwn 格式，不是标准 Markdown
 */
export function escapeMrkdwn(text: string): string {
	return text.replace(/([&<>])/g, (_, ch: string) => {
		if (ch === "&") return "&amp;";
		if (ch === "<") return "&lt;";
		if (ch === ">") return "&gt;";
		return ch;
	});
}

// ─── 消息分块 ────────────────────────────────────────────

/**
 * 将长文本按 Slack 限制分块（默认 3000 字符）
 */
export function chunkText(text: string, limit = 3000): string[] {
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
 * 检测 Slack 消息中是否 @了 bot
 * Slack 中 @bot 的格式为 <@BOTID>
 */
export function checkBotMentioned(
	text: string,
	botUserId: string | undefined,
): boolean {
	if (!botUserId) return false;
	return text.includes(`<@${botUserId}>`);
}

/**
 * 从消息文本中移除 @bot mention
 */
export function stripBotMention(
	text: string,
	botUserId: string | undefined,
): string {
	if (!botUserId) return text;
	return text.replace(new RegExp(`<@${botUserId}>\\s*`, "g"), "").trim();
}

// ─── 用户名解析缓存 ────────────────────────────────────

const USER_NAME_TTL_MS = 10 * 60 * 1000;
const userNameCache = new Map<string, { name: string; expireAt: number }>();

export async function resolveUserName(
	webClient: {
		users: {
			info: (opts: {
				user: string;
			}) => Promise<{
				user?: { real_name?: string; display_name?: string; name?: string };
			}>;
		};
	},
	userId: string,
	log?: (msg: string) => void,
): Promise<string | undefined> {
	if (!userId) return undefined;

	const cached = userNameCache.get(userId);
	const now = Date.now();
	if (cached && cached.expireAt > now) return cached.name;

	try {
		const res = await webClient.users.info({ user: userId });
		const name =
			res.user?.real_name || res.user?.display_name || res.user?.name;

		if (name && typeof name === "string") {
			userNameCache.set(userId, {
				name,
				expireAt: now + USER_NAME_TTL_MS,
			});
			return name;
		}
		return undefined;
	} catch (err) {
		log?.(`slack: 解析用户名失败 ${userId}: ${String(err)}`);
		return undefined;
	}
}

// ─── 出站限流器 ────────────────────────────────────────

/**
 * Slack API 出站限流器
 * Slack Web API 一般限制 1 req/sec/method（Tier 3）
 */
export class SlackOutboundRateLimiter {
	private readonly windowMs: number;
	private readonly maxPerWindow: number;
	private timestamps: number[] = [];

	constructor(maxPerSecond = 1) {
		this.windowMs = 1000;
		this.maxPerWindow = maxPerSecond;
	}

	async waitForSlot(): Promise<void> {
		const now = Date.now();
		this.timestamps = this.timestamps.filter((ts) => now - ts < this.windowMs);
		if (this.timestamps.length >= this.maxPerWindow) {
			const oldest = this.timestamps[0]!;
			const waitMs = this.windowMs - (now - oldest) + 100;
			await new Promise((resolve) => setTimeout(resolve, waitMs));
		}
		this.timestamps.push(Date.now());
	}
}
