import type { OutputAsset } from "../../types";
import { isBinaryPreviewFile } from "./FileTypePreview";

/**
 * 判断 `docId` 是否为物理文件路径（绝对 POSIX 路径或 Windows 盘符路径）。
 * 与 `OutputAsset.id`（UUID）做区分。
 */
export function isPhysicalDocId(
	docId: string | null | undefined,
): docId is string {
	if (!docId) return false;
	return docId.startsWith("/") || /^[a-zA-Z]:\\/.test(docId);
}

/** 物理文件路径且文件名属于二进制白名单时返回 true */
export function isBinaryPhysicalDocId(
	docId: string | null | undefined,
): docId is string {
	if (!isPhysicalDocId(docId)) return false;
	const fileName = docId.split(/[/\\]/).pop() || docId;
	return isBinaryPreviewFile(fileName);
}

interface GetPreviewFileNameParams {
	selectedOutput: OutputAsset | null;
	activeFileSession: { path: string; title: string } | null;
	activeDocId: string | null;
	currentEditorTitle: string;
}

/**
 * 计算预览文件名 — 选中输出 / 文件会话 / docId basename / fallback。
 * 用于编辑器顶部 + 导出文件名 + Diff 标题。
 */
export function getPreviewFileName(params: GetPreviewFileNameParams): string {
	if (params.selectedOutput) {
		return `${params.selectedOutput.title || "未命名文档"}.md`;
	}
	if (params.activeFileSession?.title) {
		return params.activeFileSession.title;
	}
	if (params.activeDocId) {
		return params.activeDocId.split(/[/\\]/).pop() || params.activeDocId;
	}
	return params.currentEditorTitle || "document.txt";
}
