// ToolCallInline 工具函数 — 文件名/路径解析、Artifact 类型推断、文件大小、Bash 检测
//
// 从 ToolCallInline 主文件抽出，方便单独测试与复用。

import type { ToolCall } from "../../../lib/agent/types";
import type { ArtifactFileType } from "../ArtifactCard";

/** 提取文件名 */
export function getFileName(filePath: string): string {
	if (!filePath) return "";
	return filePath.split("/").pop() || filePath;
}

/** 提取文件夹路径（用于显示） */
export function getFilePath(filePath: string): string {
	if (!filePath) return "";
	const parts = filePath.split("/");
	if (parts.length <= 2) return filePath;
	return parts.slice(-2).join("/");
}

/** 根据后缀推断 Artifact 文件类型 */
export function inferArtifactFileType(filePath: string): ArtifactFileType {
	const lower = filePath.toLowerCase();
	const ext = lower.includes(".") ? lower.split(".").pop() || "" : "";
	if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
		return "image";
	if (["htm", "html"].includes(ext)) return "html";
	if (["pdf"].includes(ext)) return "pdf";
	if (
		[
			"js",
			"jsx",
			"ts",
			"tsx",
			"css",
			"scss",
			"less",
			"json",
			"md",
			"yml",
			"yaml",
			"toml",
			"xml",
			"sql",
			"sh",
			"bash",
			"py",
			"java",
			"kt",
			"go",
			"rs",
			"c",
			"cc",
			"cpp",
			"h",
			"hpp",
		].includes(ext)
	) {
		return "code";
	}
	if (ext) return "text";
	return "other";
}

/** 通过 IPC 获取文件大小，失败返回 0 */
export async function statFileSize(filePath: string): Promise<number> {
	try {
		const entries = await (window as any).electronAPI?.invoke(
			"list_files_safe",
			{
				path: filePath,
				recursive: false,
			},
		);
		const first = Array.isArray(entries) ? entries[0] : null;
		const size = first && typeof first.size === "number" ? first.size : 0;
		return Number.isFinite(size) ? size : 0;
	} catch {
		return 0;
	}
}

/** 检查是否为终端/Bash 工具调用 */
export function isBashToolCall(toolCall: ToolCall): boolean {
	const name = toolCall.name?.toLowerCase() || "";
	const type = toolCall.type;
	return (
		name === "bash" ||
		name.includes("terminal") ||
		name.includes("shell") ||
		type === "code_execute"
	);
}
