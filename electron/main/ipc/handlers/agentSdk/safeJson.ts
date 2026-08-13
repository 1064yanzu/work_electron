/**
 * 日志友好的 JSON 预览。
 *
 * SDK 的工具入参里经常带循环引用（AbortSignal、Buffer 视图、SDK 内部对象），
 * 直接 `JSON.stringify` 会抛错并把整条日志链路带崩。这里做三件事：
 * 断循环、把 bigint 转成字符串、按长度截断——日志不该成为故障源。
 */

export function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function safeJsonPreview(value: unknown, maxLength = 500): string {
	const seen = new WeakSet<object>();
	let text: string;
	try {
		text = JSON.stringify(value, (_key, nextValue) => {
			if (typeof nextValue === "bigint") return nextValue.toString();
			if (nextValue && typeof nextValue === "object") {
				if (seen.has(nextValue)) return "[Circular]";
				seen.add(nextValue);
			}
			return nextValue;
		});
	} catch (error) {
		text = `[Unserializable: ${formatUnknownError(error)}]`;
	}
	if (typeof text !== "string") text = String(value);
	return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
