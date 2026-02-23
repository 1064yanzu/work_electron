// 资料拖拽 Hook - HTML5 拖拽逻辑

import { useCallback, useEffect, useRef, useState } from "react";
import { moveSourcesToFolder } from "../../../lib/api";
import type { Source } from "../../../types";
import { toast } from "../../ui/Toast";
import { UNASSIGNED_FOLDER_ID } from "./useFolderManagement";

interface UseSourceDragDropOptions {
	sources: Source[];
	fetchSources: () => Promise<void>;
	debugLog: (...args: unknown[]) => void;
	debugWarn: (...args: unknown[]) => void;
}

export function useSourceDragDrop({
	sources,
	fetchSources,
	debugLog,
	debugWarn,
}: UseSourceDragDropOptions) {
	const [draggedSourceId, setDraggedSourceId] = useState<string | null>(null);
	const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

	// 使用 ref 保存 draggedSourceId，避免闭包问题
	const draggedSourceIdRef = useRef<string | null>(null);
	useEffect(() => {
		draggedSourceIdRef.current = draggedSourceId;
	}, [draggedSourceId]);

	const handleDragStart = useCallback(
		(e: React.DragEvent, sourceId: string) => {
			// 添加多种 MIME 类型，确保 WebKit 兼容性
			e.dataTransfer.setData("text/plain", sourceId); // WebKit 需要标准类型
			e.dataTransfer.setData("application/x-source-id", sourceId);
			// 添加序列化的资料数据，用于跨面板拖拽到 AI 对话
			const source = sources.find((s) => s.id === sourceId);
			if (source) {
				e.dataTransfer.setData(
					"application/x-source-data",
					JSON.stringify(source),
				);
			}
			e.dataTransfer.effectAllowed = "copyMove"; // 允许 copy 或 move

			setDraggedSourceId(sourceId);
			debugLog(
				"[Drag] 开始拖拽资料:",
				sourceId,
				"types:",
				e.dataTransfer.types,
			);
		},
		[sources, debugLog],
	);

	const handleDragEnd = useCallback((e: React.DragEvent) => {
		// 拖拽结束时清理状态
		debugLog("[Drag] 拖拽结束, dropEffect:", e.dataTransfer.dropEffect);
		// 延迟清理，确保 drop 事件能获取到 draggedSourceId
		setTimeout(() => {
			setDraggedSourceId(null);
			setDragOverFolderId(null);
		}, 100);
	}, [debugLog]);

	const handleFolderDragOver = useCallback(
		(e: React.DragEvent, folderId: string) => {
			e.preventDefault();
			e.stopPropagation();
			if (draggedSourceId) {
				e.dataTransfer.dropEffect = "move";
				setDragOverFolderId(folderId);
			}
		},
		[draggedSourceId],
	);

	const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
		// 只有当真正离开文件夹容器时才清除高亮
		if (e.currentTarget.contains(e.relatedTarget as Node)) {
			return;
		}
		setDragOverFolderId(null);
	}, []);

	const handleFolderDrop = useCallback(
		async (e: React.DragEvent, folderId: string) => {
			e.preventDefault();
			e.stopPropagation();
			const sourceId =
				draggedSourceId || e.dataTransfer.getData("application/x-source-id");
			debugLog("[Drag] 文件夹 drop 事件:", {
				sourceId,
				folderId,
				draggedSourceId,
			});
			if (!sourceId) {
				debugWarn("[Drag] 没有 sourceId，无法移动");
				return;
			}

			try {
				// 如果 folderId 是 UNASSIGNED_FOLDER_ID，设置为 undefined
				const actualFolderId =
					folderId === UNASSIGNED_FOLDER_ID ? undefined : folderId;
				debugLog("[Drag] 开始移动资料到文件夹:", {
					sourceId,
					actualFolderId,
				});
				await moveSourcesToFolder({
					source_ids: [sourceId],
					folder_id: actualFolderId,
				});
				await fetchSources();
				debugLog("[Drag] 移动成功");
			} catch (error) {
				console.error("[Drag] 移动资料失败:", error);
				toast.error(
					`移动失败: ${error instanceof Error ? error.message : String(error)}`,
				);
			} finally {
				setDraggedSourceId(null);
				setDragOverFolderId(null);
			}
		},
		[fetchSources, draggedSourceId, debugLog, debugWarn],
	);

	// 容器级别的 drop 处理（处理拖拽到空白区域）
	const handleContainerDragOver = useCallback((e: React.DragEvent) => {
		debugLog("[Drag] handleContainerDragOver 被调用");
		// 允许 drop
		if (e.dataTransfer.types.includes("application/x-source-id")) {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
			debugLog("[Drag] 容器 dragover，允许 drop");
		}
	}, [debugLog]);

	const handleContainerDrop = useCallback(
		(e: React.DragEvent) => {
			// 如果事件已经被子元素处理（比如拖到了具体文件夹），就不再处理
			if (e.defaultPrevented) return;

			e.preventDefault();

			const sourceId = e.dataTransfer.getData("application/x-source-id");
			if (sourceId) {
				debugLog("[Drag] 拖拽到侧边栏空白区域，移动到未归类");
				handleFolderDrop(e, UNASSIGNED_FOLDER_ID);
			}
		},
		[handleFolderDrop, debugLog],
	);

	return {
		draggedSourceId,
		setDraggedSourceId,
		dragOverFolderId,
		setDragOverFolderId,
		draggedSourceIdRef,
		handleDragStart,
		handleDragEnd,
		handleFolderDragOver,
		handleFolderDragLeave,
		handleFolderDrop,
		handleContainerDragOver,
		handleContainerDrop,
	};
}
