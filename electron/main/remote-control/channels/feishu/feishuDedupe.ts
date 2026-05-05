/**
 * 飞书渠道去重管理器
 *
 * 集中管理 4 类去重缓存：
 * 1. 入站消息 ID 去重（30 分钟窗口）
 * 2. 入站文本命令去重（5 秒窗口，对抗飞书短时重复投递）
 * 3. 出站文本去重（8 秒窗口，对抗 agent 短时重复发送）
 * 4. 文档链接缓冲（10 秒窗口，待与后续留言合并）
 *
 * 持久化去重通过外部 ChannelDedupe 注入，不在此模块内管理。
 */

function normalizeInboundTextForDedupe(text: string): string {
	let normalized = String(text || "")
		.replace(/\r\n/g, "\n")
		.trim();
	normalized = normalized.replace(/^回复\s*[^:\n：]{1,40}[：:]\s*/u, "");
	normalized = normalized.replace(/^(?:>\s?.*(?:\n|$))+/g, "");
	return normalized.replace(/\s+/g, " ").trim();
}

function normalizeOutboundTextForDedupe(text: string): string {
	return String(text || "")
		.replace(/\r\n/g, "\n")
		.replace(/\s+/g, " ")
		.trim();
}

export interface DocLinkBufferEntry {
	text: string;
	timestamp: number;
}

export class FeishuDedupeManager {
	/** 入站消息 ID（messageId → first seen timestamp） */
	private readonly inboundIds = new Map<string, number>();
	/** 入站文本指纹（conversationKey::normalized → last seen timestamp） */
	private readonly inboundTextCommands = new Map<string, number>();
	/** 出站文本指纹（targetId::normalized → last seen timestamp） */
	private readonly outboundTexts = new Map<string, number>();
	/** 纯文档链接缓冲（conversationKey → {text, timestamp}） */
	private readonly docLinkBuffer = new Map<string, DocLinkBufferEntry>();

	/**
	 * 入站消息 ID 去重：返回 true 表示首次见到，应继续处理。
	 * 30 分钟过期回收。
	 */
	touchInboundId(messageId: string): boolean {
		const now = Date.now();
		for (const [id, ts] of this.inboundIds.entries()) {
			if (now - ts > 30 * 60_000) this.inboundIds.delete(id);
		}
		if (this.inboundIds.has(messageId)) return false;
		this.inboundIds.set(messageId, now);
		return true;
	}

	/**
	 * 入站文本命令去重：5 秒窗口内同 conversation + 同文本视为重复。
	 * 飞书偶发同内容短时重复投递，本机制丢弃重复。
	 */
	touchInboundText(conversationKey: string, text: string): boolean {
		const now = Date.now();
		for (const [key, ts] of this.inboundTextCommands.entries()) {
			if (now - ts > 10_000) this.inboundTextCommands.delete(key);
		}
		const normalized = normalizeInboundTextForDedupe(text);
		if (!normalized) return false;
		const fingerprint = `${conversationKey}::${normalized}`;
		const lastAt = this.inboundTextCommands.get(fingerprint);
		this.inboundTextCommands.set(fingerprint, now);
		if (!lastAt) return true;
		return now - lastAt > 5_000;
	}

	/**
	 * 出站文本去重：8 秒窗口内同 target + 同文本视为重复。
	 * 防御 agent 短时重复发送相同文案。
	 */
	touchOutboundText(targetId: string, text: string): boolean {
		const now = Date.now();
		for (const [key, ts] of this.outboundTexts.entries()) {
			if (now - ts > 15_000) this.outboundTexts.delete(key);
		}
		const normalized = normalizeOutboundTextForDedupe(text);
		if (!normalized) return false;
		const fingerprint = `${targetId}::${normalized}`;
		const lastAt = this.outboundTexts.get(fingerprint);
		this.outboundTexts.set(fingerprint, now);
		if (!lastAt) return true;
		return now - lastAt > 8_000;
	}

	/** 缓冲纯文档链接（用于和后续留言合并） */
	bufferDocLink(conversationKey: string, text: string): void {
		this.docLinkBuffer.set(conversationKey, { text, timestamp: Date.now() });
	}

	/** 取出并清除文档链接缓冲（仅返回 10 秒内的） */
	consumeDocLink(conversationKey: string): string | null {
		const entry = this.docLinkBuffer.get(conversationKey);
		this.docLinkBuffer.delete(conversationKey);
		if (!entry) return null;
		if (Date.now() - entry.timestamp >= 10_000) return null;
		return entry.text;
	}

	/** 清理过期的文档链接缓冲（30 秒过期） */
	cleanupDocLinkBuffer(): void {
		const now = Date.now();
		for (const [key, entry] of this.docLinkBuffer.entries()) {
			if (now - entry.timestamp > 30_000) this.docLinkBuffer.delete(key);
		}
	}

	/** 全量清理：channel.stop 时调用 */
	clear(): void {
		this.inboundIds.clear();
		this.inboundTextCommands.clear();
		this.outboundTexts.clear();
		this.docLinkBuffer.clear();
	}
}
