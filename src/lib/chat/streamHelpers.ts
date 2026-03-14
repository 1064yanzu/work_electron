/**
 * streamHelpers.ts - 流式消息处理辅助工具
 *
 * 从 CopilotSidebar.handleSendMessage 内部抽取的纯文本处理函数，
 * 无 UI 依赖、无状态闭包，可独立测试和复用。
 */

/**
 * 清除文档协议段（:::update-doc ... ::: 和 :::create-doc ... :::）
 */
export function stripDocProtocolSections(text: string): string {
	return String(text || "")
		.replace(/:::update-doc[\s\S]*?:::/g, "")
		.replace(/:::create-doc[\s\S]*?:::/g, "");
}

/**
 * 清除 AI 文件更新标记
 */
export function stripAiFileUpdateMarkers(text: string): string {
	return String(text || "").replace(
		/(<<<AI_UPDATE_PENDING>>>|<<<AI_CREATE_PENDING>>>|<<<AI_UPDATE_DONE>>>|<<<AI_CREATE_DONE>>>)/g,
		"",
	);
}

/**
 * 标准化运行时文本（清除协议段 + 标记 + 多余空行）
 */
export function normalizeRuntimeText(text: string): string {
	return stripAiFileUpdateMarkers(stripDocProtocolSections(text)).replace(
		/\n{3,}/g,
		"\n\n",
	);
}

/**
 * 获取任务中的本地图片产物路径
 */
export function getTaskImageArtifactPaths(
	artifacts: Array<{ type: string; url?: string; title?: string }> | undefined,
): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const a of artifacts || []) {
		if (a.type !== "image" || typeof a.url !== "string") continue;
		const p = String(a.url || "").trim();
		if (
			!p ||
			p.startsWith("data:image/") ||
			p.startsWith("http://") ||
			p.startsWith("https://") ||
			seen.has(p)
		) {
			continue;
		}
		seen.add(p);
		out.push(p);
	}
	return out;
}

/**
 * 将 markdown 中的 base64 data:image 替换为实际本地图片路径
 */
export function replaceDataImageMarkdownWithPaths(
	text: string,
	imagePaths: string[],
): string {
	const paths = imagePaths.filter((p) => typeof p === "string" && p.trim());
	if (paths.length === 0) return text;
	let idx = 0;
	return String(text || "").replace(
		/!\[([^\]]*)\]\(data:image\/[a-z0-9.+-]+;base64,[^)]+\)/gi,
		(_m, alt: string) => {
			const path = paths[Math.min(idx, paths.length - 1)] || paths[0] || "";
			idx += 1;
			return `![${String(alt || "image")}](${path})`;
		},
	);
}

/**
 * 非法文件名字符（包含中英文标点）
 */
const ILLEGAL_FILENAME_CHARS_RE =
	/[<>:"/\\|?*\u0000-\u001F？！\u201c\u201d\u2018\u2019\u201e\u201f\u2018\u2019：；【】（）《》、，。]/g;

/**
 * 清理文件名（用于 create-doc 时的文件命名）
 * - NFC 标准化、过滤非法字符、合并空格/下划线
 */
export function sanitizeFileName(name: string): string {
	const base = String(name || "document")
		.normalize("NFC")
		.trim();
	const normalized = base.replace(ILLEGAL_FILENAME_CHARS_RE, "_");
	const collapsed = normalized.replace(/\s+/g, " ").trim();
	const cleanUnderscores = collapsed.replace(/_+/g, "_");
	const withoutTrailingDotsOrSpaces = cleanUnderscores
		.replace(/[. _]+$/g, "")
		.trim();
	const safe =
		withoutTrailingDotsOrSpaces === "." || withoutTrailingDotsOrSpaces === ".."
			? "document"
			: withoutTrailingDotsOrSpaces;
	return safe.length > 0 ? safe.slice(0, 180) : "document";
}

/**
 * 确保文件名以 .md 结尾
 */
export function ensureMdExt(name: string): string {
	return name.toLowerCase().endsWith(".md") ? name : `${name}.md`;
}
