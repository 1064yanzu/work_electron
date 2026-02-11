import type { FeishuBufferedAttachment } from "./feishuMessageResourceService";

type BufferEntry = {
	attachment: FeishuBufferedAttachment;
	expireAt: number;
};

export class FeishuInboundMergeBuffer {
	private readonly byConversation = new Map<string, BufferEntry[]>();

	push(
		conversationKey: string,
		attachment: FeishuBufferedAttachment,
		windowSec: number,
	): void {
		const now = Date.now();
		const expireAt = now + Math.max(5, windowSec) * 1000;
		this.cleanupExpired(now);
		const list = this.byConversation.get(conversationKey) ?? [];
		list.push({
			attachment,
			expireAt,
		});
		this.byConversation.set(conversationKey, list);
	}

	consume(conversationKey: string): FeishuBufferedAttachment[] {
		const now = Date.now();
		const list = this.byConversation.get(conversationKey);
		if (!list || list.length === 0) {
			return [];
		}
		this.byConversation.delete(conversationKey);
		return list
			.filter((item) => item.expireAt > now)
			.map((item) => item.attachment);
	}

	cleanupExpired(now = Date.now()): void {
		for (const [key, list] of this.byConversation.entries()) {
			const next = list.filter((item) => item.expireAt > now);
			if (next.length === 0) {
				this.byConversation.delete(key);
				continue;
			}
			this.byConversation.set(key, next);
		}
	}

	clear(): void {
		this.byConversation.clear();
	}
}
