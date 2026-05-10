/**
 * panels/data/utils.ts — 数据面板共用工具
 *
 * 从原 `DataSettings.tsx` 下沉的展示层工具：
 *   - `formatSize(bytes)` 把字节数渲染为 `"1.23 MB"` 之类的人类可读字符串；
 *   - `formatTime(dateStr)` 把 ISO 时间串渲染为 `"2 分钟前" / "12-31 09:30"` 等相对时间。
 *
 * 不依赖 React，不依赖项目 store；所有数据面板（storage / backup / danger / artifacts / performance / stats）
 * 如果需要同样的渲染口径，应统一从本文件 import，避免各处各自 `Math.log` 出不同精度。
 */

/** 把字节数格式化为 `"1.23 MB"` 形式（保留两位小数）。 */
export function formatSize(bytes: number): string {
	if (!bytes || bytes <= 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"] as const;
	const i = Math.min(
		sizes.length - 1,
		Math.floor(Math.log(bytes) / Math.log(k)),
	);
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * 把 ISO 时间串格式化为相对时间；`null / ""` → `"从未"`。
 *   - 1 分钟内：`刚刚`
 *   - 1 小时内：`X 分钟前`
 *   - 1 天内：`X 小时前`
 *   - 其它：`09月20日 14:30` 形式（`zh-CN`）
 */
export function formatTime(dateStr: string | null | undefined): string {
	if (!dateStr) return "从未";
	const date = new Date(dateStr);
	if (Number.isNaN(date.getTime())) return "从未";
	const now = new Date();
	const diff = now.getTime() - date.getTime();

	if (diff < 60_000) return "刚刚";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;

	return date.toLocaleString("zh-CN", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}
