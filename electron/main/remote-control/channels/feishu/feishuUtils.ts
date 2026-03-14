import * as Lark from "@larksuiteoapi/node-sdk";
import {
	extractFeishuApiErrorInfo,
	isFeishuPermissionDenied,
} from "./feishuApiError";

// ─── 消息解析工具 ────────────────────────────────────────────

/**
 * 解析飞书消息内容，支持 text 和 post（富文本）类型
 */
export function parseTextContent(
	content: string | undefined,
	messageType: string | undefined,
): string {
	if (!content) return "";
	if (messageType === "text") {
		try {
			const parsed = JSON.parse(content) as { text?: string };
			return String(parsed.text ?? "").trim();
		} catch {
			return String(content).trim();
		}
	}
	if (messageType === "post") {
		const { textContent } = parsePostContent(content);
		return textContent;
	}
	// 非 text/post 不作为文本命令触发源
	return "";
}

/**
 * 解析 post（富文本）消息，提取文本和嵌入图片
 * Post 结构：{ title?: string, content: [[{ tag, text?, image_key?, ... }]] }
 */
export function parsePostContent(content: string): {
	textContent: string;
	imageKeys: string[];
} {
	try {
		const parsed = JSON.parse(content);
		const title = parsed.title || "";
		const contentBlocks = parsed.content || [];
		let textContent = title ? `${title}\n\n` : "";
		const imageKeys: string[] = [];

		for (const paragraph of contentBlocks) {
			if (Array.isArray(paragraph)) {
				for (const element of paragraph) {
					if (element.tag === "text") {
						textContent += element.text || "";
					} else if (element.tag === "a") {
						textContent += element.text || element.href || "";
					} else if (element.tag === "at") {
						textContent += `@${element.user_name || element.user_id || ""}`;
					} else if (element.tag === "img" && element.image_key) {
						imageKeys.push(element.image_key);
					}
				}
				textContent += "\n";
			}
		}

		return {
			// 仅保留真实可提取文本；避免用占位文案触发误命令。
			textContent: textContent.trim(),
			imageKeys,
		};
	} catch {
		return { textContent: "", imageKeys: [] };
	}
}

// ─── 目标类型推断 ────────────────────────────────────────────

export function normalizeTargetType(targetId: string): "chat_id" | "open_id" {
	if (targetId.startsWith("oc_") || targetId.startsWith("chat_"))
		return "chat_id";
	return "open_id";
}

// ─── @bot 检测 ──────────────────────────────────────────────

export type FeishuMention = {
	key: string;
	id: {
		open_id?: string;
		user_id?: string;
		union_id?: string;
	};
	name: string;
	tenant_key?: string;
};

/**
 * 检测消息中是否 @了 bot
 * 使用 mentions 数组精确判断，而非简单的字符串匹配
 */
export function checkBotMentioned(
	mentions: FeishuMention[] | undefined,
	botOpenId: string | undefined,
): boolean {
	if (!mentions || mentions.length === 0) return false;
	if (!botOpenId) return mentions.length > 0;
	return mentions.some((m) => m.id.open_id === botOpenId);
}

/**
 * 从消息文本中移除 @bot 的 mention 标记
 */
export function stripBotMention(
	text: string,
	mentions: FeishuMention[] | undefined,
): string {
	if (!mentions || mentions.length === 0) return text;
	let result = text;
	for (const mention of mentions) {
		result = result.replace(new RegExp(`@${mention.name}\\s*`, "g"), "").trim();
		result = result.replace(new RegExp(mention.key, "g"), "").trim();
	}
	return result;
}

// ─── 发送者名称缓存 ────────────────────────────────────────

const SENDER_NAME_TTL_MS = 10 * 60 * 1000; // 10 分钟
const CONTACT_SCOPE_COOLDOWN_MS = 30 * 60 * 1000; // 30 分钟
const senderNameCache = new Map<string, { name: string; expireAt: number }>();
let contactScopeBlockedUntil = 0;
let contactScopeLastHintAt = 0;

/**
 * 通过飞书 API 解析发送者显示名称（带缓存）
 */
export async function resolveSenderName(
	client: Lark.Client,
	senderOpenId: string,
	log?: (msg: string) => void,
): Promise<string | undefined> {
	if (!senderOpenId) return undefined;

	const cached = senderNameCache.get(senderOpenId);
	const now = Date.now();
	if (cached && cached.expireAt > now) return cached.name;
	if (now < contactScopeBlockedUntil) return undefined;

	try {
		const res: Record<string, unknown> = await (
			client.contact.user.get as (opts: {
				path: { user_id: string };
				params: { user_id_type: string };
			}) => Promise<Record<string, unknown>>
		)({
			path: { user_id: senderOpenId },
			params: { user_id_type: "open_id" },
		});

		const data = res?.data as
			| {
					user?: {
						name?: string;
						display_name?: string;
						nickname?: string;
						en_name?: string;
					};
			  }
			| undefined;
		const name =
			data?.user?.name ||
			data?.user?.display_name ||
			data?.user?.nickname ||
			data?.user?.en_name;

		if (name && typeof name === "string") {
			senderNameCache.set(senderOpenId, {
				name,
				expireAt: now + SENDER_NAME_TTL_MS,
			});
			return name;
		}
		return undefined;
	} catch (err) {
		const info = extractFeishuApiErrorInfo(err);
		if (
			isFeishuPermissionDenied(err) &&
			/(^|[^a-z])contact:/i.test(String(info.msg || ""))
		) {
			contactScopeBlockedUntil = Date.now() + CONTACT_SCOPE_COOLDOWN_MS;
			if (Date.now() - contactScopeLastHintAt > 60_000) {
				contactScopeLastHintAt = Date.now();
				log?.(
					"feishu: 联系人权限不足，已暂停发送者名称解析。请在飞书开放平台为应用开通 contact 只读权限后重试。",
				);
			}
			return undefined;
		}
		log?.(`feishu: 解析发送者名称失败 ${senderOpenId}: ${String(err)}`);
		return undefined;
	}
}

// ─── Bot 信息获取 ───────────────────────────────────────────

/**
 * 获取 bot 自身的 open_id
 */
export async function fetchBotOpenId(
	client: Lark.Client,
	log?: (msg: string) => void,
): Promise<string | undefined> {
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bot API exists at runtime but not in SDK types
		const res: Record<string, unknown> = await (
			client as any
		).bot.botInfo.list();
		const data = res?.data as { bot?: { open_id?: string } } | undefined;
		return data?.bot?.open_id ?? undefined;
	} catch (err) {
		log?.(`feishu: 获取 bot open_id 失败: ${String(err)}`);
		return undefined;
	}
}

// ─── 卡片消息构建 ───────────────────────────────────────────

/**
 * 将 Markdown 文本包装为飞书 Interactive Card JSON
 * 用于替代纯文本发送，提升消息可读性
 */
export function buildMarkdownCard(text: string, title?: string): string {
	const elements: Record<string, unknown>[] = [
		{
			tag: "markdown",
			content: text,
		},
	];

	const card: Record<string, unknown> = {
		config: {
			wide_screen_mode: true,
		},
		elements,
	};

	if (title) {
		card.header = {
			title: {
				tag: "plain_text",
				content: title,
			},
			template: "blue",
		};
	}

	return JSON.stringify(card);
}

// ─── 出站消息限流器 ────────────────────────────────────────

/**
 * 飞书 API 出站限流器
 * 飞书限制约 5 条/秒/应用，这里做保守的全局限流
 */
export class FeishuOutboundRateLimiter {
	private readonly windowMs: number;
	private readonly maxPerWindow: number;
	private timestamps: number[] = [];

	constructor(maxPerSecond = 4) {
		this.windowMs = 1000;
		this.maxPerWindow = maxPerSecond;
	}

	/**
	 * 等待直到可以发送下一条消息
	 */
	async waitForSlot(): Promise<void> {
		const now = Date.now();
		this.timestamps = this.timestamps.filter((ts) => now - ts < this.windowMs);
		if (this.timestamps.length >= this.maxPerWindow) {
			const oldest = this.timestamps[0]!;
			const waitMs = this.windowMs - (now - oldest) + 50; // +50ms 安全边距
			await new Promise((resolve) => setTimeout(resolve, waitMs));
		}
		this.timestamps.push(Date.now());
	}
}

// ─── 连接测试 ──────────────────────────────────────────────

/**
 * 实际调用飞书 API 测试凭证有效性
 */
export async function testFeishuCredentials(
	appId: string,
	appSecret: string,
	domain: "feishu" | "lark",
): Promise<{ ok: boolean; message: string }> {
	try {
		const client = new Lark.Client({
			appId,
			appSecret,
			appType: Lark.AppType.SelfBuild,
			domain: domain === "lark" ? Lark.Domain.Lark : Lark.Domain.Feishu,
		});
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- bot API exists at runtime but not in SDK types
		const res: Record<string, unknown> = await (
			client as any
		).bot.botInfo.list();
		const code = (res as { code?: number })?.code;
		if (code === 0) {
			const data = res?.data as
				| { bot?: { open_id?: string; app_name?: string } }
				| undefined;
			const botName = data?.bot?.app_name || data?.bot?.open_id || "unknown";
			return {
				ok: true,
				message: `凭证有效，Bot: ${botName}`,
			};
		}
		return {
			ok: false,
			message: `飞书 API 返回错误码: ${code} - ${(res as { msg?: string })?.msg ?? ""}`,
		};
	} catch (err) {
		return {
			ok: false,
			message: `连接失败: ${err instanceof Error ? err.message : String(err)}`,
		};
	}
}
