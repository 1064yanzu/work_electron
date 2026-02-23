// 资料批量选择管理 Hook

import { useCallback, useMemo, useState } from "react";
import { moveSourcesToFolder } from "../../../lib/api";
import { EVENTS, events } from "../../../lib/events";
import type { Source } from "../../../types";
import { toast } from "../../ui/Toast";
import { UNASSIGNED_FOLDER_ID } from "./useFolderManagement";

interface UseSourceSelectionOptions {
	sources: Source[];
	fetchSources: () => Promise<void>;
	deleteSourcesWithUndo: (ids: string[]) => Promise<void>;
}

export function useSourceSelection({
	sources,
	fetchSources,
	deleteSourcesWithUndo,
}: UseSourceSelectionOptions) {
	const [selectionMode, setSelectionMode] = useState(false);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [batchDeleteConfirm, setBatchDeleteConfirm] = useState<string[] | null>(
		null,
	);
	const [isMoveFolderModalOpen, setIsMoveFolderModalOpen] = useState(false);
	const [moveFolderTargetId, setMoveFolderTargetId] = useState<string>("");

	const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
	const selectedSources = useMemo(
		() => sources.filter((source) => selectedIdSet.has(source.id)),
		[selectedIdSet, sources],
	);

	const exitSelectionMode = useCallback(() => {
		setSelectionMode(false);
		setSelectedIds([]);
	}, []);

	const toggleSelection = useCallback((sourceId: string) => {
		setSelectionMode(true);
		setSelectedIds((prev) =>
			prev.includes(sourceId)
				? prev.filter((id) => id !== sourceId)
				: [...prev, sourceId],
		);
	}, []);

	const handleSelectAll = useCallback(() => {
		if (selectedIds.length === sources.length) {
			setSelectedIds([]);
		} else {
			setSelectedIds(sources.map((source) => source.id));
			setSelectionMode(true);
		}
	}, [selectedIds.length, sources]);

	const handleBulkAddToContext = useCallback(() => {
		selectedSources.forEach((source) => {
			events.emit(EVENTS.ADD_TO_CONTEXT, { source });
		});
		exitSelectionMode();
	}, [selectedSources, exitSelectionMode]);

	// 批量删除
	const handleDeleteSelected = useCallback(async () => {
		if (selectedSources.length === 0) return;
		setBatchDeleteConfirm(selectedSources.map((item) => item.id));
	}, [selectedSources]);

	const handleConfirmBatchDelete = useCallback(async () => {
		if (!batchDeleteConfirm) return;
		try {
			await deleteSourcesWithUndo(batchDeleteConfirm);
			exitSelectionMode();
		} catch (error) {
			console.error("批量删除失败:", error);
			toast.error("批量删除失败，请重试");
		} finally {
			setBatchDeleteConfirm(null);
		}
	}, [batchDeleteConfirm, deleteSourcesWithUndo, exitSelectionMode]);

	const handleCancelBatchDelete = useCallback(() => {
		setBatchDeleteConfirm(null);
	}, []);

	const handleMoveSelectedToFolder = useCallback(async () => {
		if (!selectedIds.length) return;

		try {
			const payload: { source_ids: string[]; folder_id?: string } = {
				source_ids: selectedIds,
			};
			if (moveFolderTargetId && moveFolderTargetId !== UNASSIGNED_FOLDER_ID) {
				payload.folder_id = moveFolderTargetId;
			}
			await moveSourcesToFolder(payload);
			setIsMoveFolderModalOpen(false);
			setMoveFolderTargetId("");
			setSelectedIds([]);
			await fetchSources();
		} catch (error) {
			console.error("移动文件夹失败:", error);
			toast.error(
				`移动失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [selectedIds, moveFolderTargetId, fetchSources]);

	return {
		selectionMode,
		setSelectionMode,
		selectedIds,
		setSelectedIds,
		selectedIdSet,
		selectedSources,
		batchDeleteConfirm,
		setBatchDeleteConfirm,
		isMoveFolderModalOpen,
		setIsMoveFolderModalOpen,
		moveFolderTargetId,
		setMoveFolderTargetId,
		exitSelectionMode,
		toggleSelection,
		handleSelectAll,
		handleBulkAddToContext,
		handleDeleteSelected,
		handleConfirmBatchDelete,
		handleCancelBatchDelete,
		handleMoveSelectedToFolder,
	};
}
