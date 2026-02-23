// 文件导入 Hook - 拖拽导入文件逻辑

import { useCallback, useEffect, useMemo, useRef } from "react";
import { importLocalFiles } from "../../../lib/api";
import { workspaceStore } from "../../../lib/workspaceStore";
import { useDragAndDropImport } from "../../../hooks/useDragAndDropImport";
import type { SourceDetail } from "../../../types";

interface UseSourceImportOptions {
	fetchSources: () => Promise<void>;
}

export function useSourceImport({ fetchSources }: UseSourceImportOptions) {
	const importSupportedExts = useMemo(
		() =>
			new Set([
				// 文本和标记语言
				"txt",
				"md",
				"markdown",
				"json",
				"csv",
				"html",
				"htm",
				"xml",
				"yaml",
				"yml",
				"toml",
				"rst",
				"log",
				"conf",
				"ini",
				"rtf",
				// 文档
				"pdf",
				"docx",
				// 图片
				"png",
				"jpg",
				"jpeg",
				"gif",
				"webp",
				"bmp",
				"tif",
				"tiff",
				"svg",
			]),
		[],
	);

	const acceptImportPath = useCallback(
		(path: string) => {
			const lower = path.toLowerCase();
			const idx = lower.lastIndexOf(".");
			const ext = idx >= 0 ? lower.slice(idx + 1) : "";
			return importSupportedExts.has(ext);
		},
		[importSupportedExts],
	);

	const dragImport = useDragAndDropImport<SourceDetail>({
		enabled: true,
		accept: acceptImportPath,
	});

	const autoStartEnabledRef = useRef(true);
	const prevQueueLenRef = useRef(0);

	useEffect(() => {
		if (dragImport.queue.length > prevQueueLenRef.current) {
			autoStartEnabledRef.current = true;
		}
		prevQueueLenRef.current = dragImport.queue.length;
	}, [dragImport.queue.length]);

	const importSingleFile = useCallback(async (path: string) => {
		try {
			const project_id =
				workspaceStore.getState().currentProjectId || undefined;
			const currentFolderId = workspaceStore.getState().currentFolderId;
			const folder_id =
				currentFolderId && currentFolderId !== "__unassigned__"
					? currentFolderId
					: undefined;
			const result = await importLocalFiles({
				paths: [path],
				tags: [],
				project_id,
				folder_id,
			});
			if (!result || result.length === 0) {
				throw new Error("导入失败：返回为空");
			}
			return result[0];
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(message);
		}
	}, []);

	useEffect(() => {
		if (!autoStartEnabledRef.current) return;
		if (dragImport.queueStatus !== "idle") return;
		if (dragImport.summary.pending <= 0) return;
		dragImport.startImport(importSingleFile);
	}, [
		dragImport.queueStatus,
		dragImport.summary.pending,
		dragImport.startImport,
		importSingleFile,
	]);

	const prevQueueStatusRef = useRef(dragImport.queueStatus);

	useEffect(() => {
		const prev = prevQueueStatusRef.current;
		if (prev === "importing" && dragImport.queueStatus === "idle") {
			fetchSources();
		}
		prevQueueStatusRef.current = dragImport.queueStatus;
	}, [dragImport.queueStatus, fetchSources]);

	const handleStartDragImport = useCallback(() => {
		autoStartEnabledRef.current = true;
		dragImport.startImport(importSingleFile);
	}, [dragImport.startImport, importSingleFile]);

	const handleCancelDragImport = useCallback(() => {
		autoStartEnabledRef.current = false;
		dragImport.cancelImport();
	}, [dragImport.cancelImport]);

	return {
		dragImport,
		handleStartDragImport,
		handleCancelDragImport,
	};
}
