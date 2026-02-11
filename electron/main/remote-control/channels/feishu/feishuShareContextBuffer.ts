import type { FeishuBufferedShareContext } from "./feishuShareMessageContextService";

type BufferEntry = {
	context: FeishuBufferedShareContext;
	expireAt: number;
};

type ConsumeOptions = {
	rootId?: string;
	parentId?: string;
};

export class FeishuShareContextBuffer {
	private readonly byConversation = new Map<string, BufferEntry[]>();

	push(
		conversationKey: string,
		context: FeishuBufferedShareContext,
		windowSec: number,
	): void {
		const now = Date.now();
		const expireAt = now + Math.max(5, windowSec) * 1000;
		this.cleanupExpired(now);
		const list = this.byConversation.get(conversationKey) ?? [];
		list.push({ context, expireAt });
		this.byConversation.set(conversationKey, list);
	}

	consume(
		conversationKey: string,
		options?: ConsumeOptions,
	): FeishuBufferedShareContext[] {
		const now = Date.now();
		const list = this.byConversation.get(conversationKey);
		if (!list || list.length === 0) return [];
		const alive = list.filter((item) => item.expireAt > now);
		if (alive.length === 0) {
			this.byConversation.delete(conversationKey);
			return [];
		}

		const rootId = options?.rootId?.trim();
		const parentId = options?.parentId?.trim();
		let selected = alive;
		if (rootId || parentId) {
			const related = alive.filter((item) => {
				const sourceId = item.context.messageId;
				return Boolean(
					(rootId && sourceId === rootId) || (parentId && sourceId === parentId),
				);
			});
			if (related.length > 0) {
				selected = related;
			}
		}

		const selectedIds = new Set(selected.map((item) => item.context.messageId));
		const remaining = alive.filter(
			(item) => !selectedIds.has(item.context.messageId),
		);
		if (remaining.length > 0) {
			this.byConversation.set(conversationKey, remaining);
		} else {
			this.byConversation.delete(conversationKey);
		}

		return selected.map((item) => item.context);
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

