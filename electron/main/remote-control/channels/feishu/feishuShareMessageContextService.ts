type IncomingShareMessage = {
	message_id?: string;
	message_type?: string;
	content?: string;
	root_id?: string;
	parent_id?: string;
};

export type FeishuBufferedShareContext = {
	messageId: string;
	messageType: string;
	rootId?: string;
	parentId?: string;
	title?: string;
	summary: string;
};

const MAX_SUMMARY_LEN = 500;

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object") return null;
	return value as Record<string, unknown>;
}

function toStringOrUndefined(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeParseJson(raw: string | undefined): Record<string, unknown> | null {
	if (!raw) return null;
	try {
		return asRecord(JSON.parse(raw));
	} catch {
		return null;
	}
}

function clamp(text: string, max = MAX_SUMMARY_LEN): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}...`;
}

function compactWhitespace(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function parseInteractiveSummary(content: Record<string, unknown> | null): {
	title?: string;
	summary?: string;
} {
	if (!content) return {};
	const title = toStringOrUndefined(content.title);
	const elements = Array.isArray(content.elements)
		? content.elements.map((item) => {
			const line = asRecord(item);
			return toStringOrUndefined(line?.text) || toStringOrUndefined(line?.tag);
		})
		.filter(Boolean)
		.join(" / ")
		: undefined;
	return {
		title,
		summary: elements,
	};
}

function buildSummary(messageType: string, content: Record<string, unknown> | null): {
	title?: string;
	summary?: string;
} {
	if (!content) {
		return { summary: "该分享消息无结构化内容。" };
	}
	switch (messageType) {
		case "share_chat":
			return {
				title: "群名片分享",
				summary: `chat_id=${toStringOrUndefined(content.chat_id) || "unknown"}`,
			};
		case "share_user":
			return {
				title: "个人名片分享",
				summary: `user_id=${toStringOrUndefined(content.user_id) || "unknown"}`,
			};
		case "share_calendar_event":
		case "calendar":
		case "general_calendar": {
			const summary = toStringOrUndefined(content.summary);
			const start = toStringOrUndefined(content.start_time);
			const end = toStringOrUndefined(content.end_time);
			return {
				title: "日程分享",
				summary: compactWhitespace(
					`summary=${summary || "unknown"} start=${start || "unknown"} end=${end || "unknown"}`,
				),
			};
		}
		case "merge_forward":
			return {
				title: "合并转发消息",
				summary: toStringOrUndefined(content.content) || "Merged and Forwarded Message",
			};
		case "interactive":
			return parseInteractiveSummary(content);
		default:
			return {
				summary: clamp(JSON.stringify(content)),
			};
	}
}

export class FeishuShareMessageContextService {
	private readonly supportedTypes = new Set<string>([
		"interactive",
		"share_chat",
		"share_user",
		"share_calendar_event",
		"calendar",
		"general_calendar",
		"merge_forward",
		"system",
		"location",
		"video_chat",
		"todo",
		"vote",
	]);

	isContextMessageType(messageType: string): boolean {
		return this.supportedTypes.has(messageType);
	}

	buildContext(message: IncomingShareMessage): FeishuBufferedShareContext | null {
		const messageId = toStringOrUndefined(message.message_id);
		const messageType = toStringOrUndefined(message.message_type)?.toLowerCase();
		if (!messageId || !messageType) return null;
		if (!this.isContextMessageType(messageType)) return null;
		const content = safeParseJson(message.content);
		const parsed = buildSummary(messageType, content);
		const summary = compactWhitespace(parsed.summary || "");
		if (!summary) return null;
		return {
			messageId,
			messageType,
			rootId: toStringOrUndefined(message.root_id),
			parentId: toStringOrUndefined(message.parent_id),
			title: parsed.title,
			summary,
		};
	}

	buildContextBlock(items: FeishuBufferedShareContext[]): string {
		if (!items.length) return "";
		const lines: string[] = ["[系统上下文：飞书分享消息]"];
		for (const [index, item] of items.entries()) {
			lines.push(`分享 ${index + 1}:`);
			lines.push(`- 来源消息: ${item.messageId}`);
			lines.push(`- 消息类型: ${item.messageType}`);
			if (item.rootId) lines.push(`- root_id: ${item.rootId}`);
			if (item.parentId) lines.push(`- parent_id: ${item.parentId}`);
			if (item.title) lines.push(`- 标题: ${item.title}`);
			lines.push(`- 摘要: ${item.summary}`);
		}
		return lines.join("\n");
	}
}

