// 文件夹管理 Hook - 文件夹树的状态与操作

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
	createFolder,
	deleteFolder,
	moveSourcesToFolder,
	updateFolder,
} from "../../../lib/api";
import { queryKeys, useFoldersQuery } from "../../../lib/query";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../../../lib/workspaceStore";
import type { Folder, Source } from "../../../types";
import { toast } from "../../ui/Toast";

export const UNASSIGNED_FOLDER_ID = "__unassigned__";

export function useFolderManagement(rawSources: Source[]) {
	const [folders, setFolders] = useState<Folder[]>([]);
	const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
	const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);

	// 文件夹右键菜单
	const [folderContextMenu, setFolderContextMenu] = useState<{
		x: number;
		y: number;
		folder: Folder;
	} | null>(null);
	const [folderDeleteConfirm, setFolderDeleteConfirm] = useState<Folder | null>(
		null,
	);
	const [isRenameFolderModalOpen, setIsRenameFolderModalOpen] = useState(false);
	const [renameFolderTarget, setRenameFolderTarget] = useState<Folder | null>(
		null,
	);
	const [renameFolderName, setRenameFolderName] = useState("");
	const [isMoveFolderToModalOpen, setIsMoveFolderToModalOpen] = useState(false);
	const [moveFolderSource, setMoveFolderSource] = useState<Folder | null>(null);
	const [moveFolderToTargetId, setMoveFolderToTargetId] = useState<string>("");

	// 单个资料移动到文件夹
	const [singleSourceMoveModal, setSingleSourceMoveModal] =
		useState<Source | null>(null);
	const [singleSourceMoveTargetId, setSingleSourceMoveTargetId] =
		useState<string>("");

	const currentProjectId = useWorkspaceStoreSelector(
		(state) => state.currentProjectId,
	);
	const currentFolderId = useWorkspaceStoreSelector(
		(state) => state.currentFolderId,
	);
	const setCurrentFolder = workspaceStore.setCurrentFolder.bind(workspaceStore);
	const queryClient = useQueryClient();
	const foldersQuery = useFoldersQuery(currentProjectId);

	useEffect(() => {
		if (Array.isArray(foldersQuery.data)) {
			setFolders(foldersQuery.data);
		}
	}, [foldersQuery.data]);

	const fetchFolders = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: queryKeys.folders(currentProjectId),
		});
	}, [queryClient, currentProjectId]);

	const foldersById = useMemo(() => {
		const map = new Map<string, Folder>();
		for (const f of folders) map.set(f.id, f);
		return map;
	}, [folders]);

	const childrenByParentId = useMemo(() => {
		const map = new Map<string, Folder[]>();
		const keyOf = (parentId?: string) => parentId || "__root__";
		for (const f of folders) {
			const k = keyOf(f.parent_id);
			const list = map.get(k) || [];
			list.push(f);
			map.set(k, list);
		}
		// 稍微稳定排序：按 updated_at desc，其次 name
		for (const [k, list] of map) {
			list.sort((a, b) => {
				if (a.updated_at !== b.updated_at)
					return a.updated_at > b.updated_at ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
			map.set(k, list);
		}
		return map;
	}, [folders]);

	const getSubtreeFolderIds = useCallback(
		(rootId: string): Set<string> => {
			const out = new Set<string>();
			const stack = [rootId];
			while (stack.length) {
				const id = stack.pop()!;
				if (out.has(id)) continue;
				out.add(id);
				const children = childrenByParentId.get(id) || [];
				for (const child of children) stack.push(child.id);
			}
			return out;
		},
		[childrenByParentId],
	);

	const flatFolderOptions = useMemo(() => {
		const out: Array<{ id: string; name: string; depth: number }> = [];
		const walk = (parentId: string | null, depth: number) => {
			const key = parentId || "__root__";
			const children = childrenByParentId.get(key) || [];
			for (const f of children) {
				out.push({ id: f.id, name: f.name, depth });
				walk(f.id, depth + 1);
			}
		};
		walk(null, 0);
		return out;
	}, [childrenByParentId]);

	const folderCounts = useMemo(() => {
		const direct = new Map<string, number>();
		let unassigned = 0;
		for (const s of rawSources) {
			if (s.folder_id) {
				direct.set(s.folder_id, (direct.get(s.folder_id) || 0) + 1);
			} else {
				unassigned += 1;
			}
		}
		return { direct, unassigned, total: rawSources.length };
	}, [rawSources]);

	const getFolderSubtreeCount = useCallback(
		(folderId: string): number => {
			const subtree = getSubtreeFolderIds(folderId);
			let total = 0;
			for (const id of subtree) {
				total += folderCounts.direct.get(id) || 0;
			}
			return total;
		},
		[folderCounts.direct, getSubtreeFolderIds],
	);

	// 获取当前文件夹的子文件夹（用于整合视图）
	const currentSubfolders = useMemo(() => {
		if (currentFolderId === null) {
			// 全部资料：显示根级文件夹
			return childrenByParentId.get("__root__") || [];
		}
		if (currentFolderId === UNASSIGNED_FOLDER_ID) {
			// 未归类：不显示文件夹
			return [];
		}
		// 当前文件夹的子文件夹
		return childrenByParentId.get(currentFolderId) || [];
	}, [currentFolderId, childrenByParentId]);

	// 面包屑路径
	const breadcrumbPath = useMemo(() => {
		const path: Array<{ id: string | null; name: string }> = [
			{ id: null, name: "全部" },
		];
		if (currentFolderId === UNASSIGNED_FOLDER_ID) {
			path.push({ id: UNASSIGNED_FOLDER_ID, name: "未归类" });
			return path;
		}
		if (currentFolderId) {
			const ancestors: Folder[] = [];
			let cur = foldersById.get(currentFolderId);
			while (cur) {
				ancestors.unshift(cur);
				cur = cur.parent_id ? foldersById.get(cur.parent_id) : undefined;
			}
			for (const f of ancestors) {
				path.push({ id: f.id, name: f.name });
			}
		}
		return path;
	}, [currentFolderId, foldersById]);

	const handleCreateFolder = useCallback(
		async (name: string) => {
			const trimmed = name.trim();
			if (!trimmed) return;

			try {
				const parent_id =
					currentFolderId && currentFolderId !== UNASSIGNED_FOLDER_ID
						? currentFolderId
						: undefined;
				const folder = await createFolder({
					name: trimmed,
					project_id: currentProjectId || undefined,
					parent_id,
				});
				setIsFolderModalOpen(false);
				await fetchFolders();
				setCurrentFolder(folder.id);
			} catch (error) {
				console.error("创建文件夹失败:", error);
				toast.error(
					`创建文件夹失败: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		[currentFolderId, currentProjectId, fetchFolders, setCurrentFolder],
	);

	// 文件夹右键菜单处理
	const handleFolderContextMenu = useCallback(
		(e: React.MouseEvent, folder: Folder) => {
			e.preventDefault();
			e.stopPropagation();
			setFolderContextMenu({ x: e.clientX, y: e.clientY, folder });
		},
		[],
	);

	// 重命名文件夹
	const handleRenameFolder = useCallback(async () => {
		if (!renameFolderTarget) return;
		const name = renameFolderName.trim();
		if (!name) return;

		try {
			await updateFolder({ id: renameFolderTarget.id, name });
			setIsRenameFolderModalOpen(false);
			setRenameFolderTarget(null);
			setRenameFolderName("");
			await fetchFolders();
		} catch (error) {
			console.error("重命名文件夹失败:", error);
			toast.error(
				`重命名失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [renameFolderTarget, renameFolderName, fetchFolders]);

	// 删除文件夹
	const handleDeleteFolder = useCallback(
		async (folder: Folder, skipConfirm = false) => {
			if (!skipConfirm) {
				setFolderDeleteConfirm(folder);
				return;
			}

			try {
				await deleteFolder(folder.id);
				setFolderDeleteConfirm(null);
				// 如果删除的是当前选中的文件夹，切换到全部
				if (currentFolderId === folder.id) {
					setCurrentFolder(null);
				}
				await fetchFolders();
			} catch (error) {
				console.error("删除文件夹失败:", error);
				toast.error(
					`删除失败: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		[currentFolderId, setCurrentFolder, fetchFolders],
	);

	// 移动文件夹到其他位置
	const handleMoveFolderTo = useCallback(async () => {
		if (!moveFolderSource) return;

		try {
			const newParentId =
				moveFolderToTargetId === "" ? null : moveFolderToTargetId;
			await updateFolder({ id: moveFolderSource.id, parent_id: newParentId });
			setIsMoveFolderToModalOpen(false);
			setMoveFolderSource(null);
			setMoveFolderToTargetId("");
			await fetchFolders();
		} catch (error) {
			console.error("移动文件夹失败:", error);
			toast.error(
				`移动失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}, [moveFolderSource, moveFolderToTargetId, fetchFolders]);

	// 单个资料移动到文件夹
	const handleSingleSourceMove = useCallback(
		async (fetchSources: () => Promise<void>) => {
			if (!singleSourceMoveModal) return;

			try {
				const folderId =
					singleSourceMoveTargetId === UNASSIGNED_FOLDER_ID
						? undefined
						: singleSourceMoveTargetId || undefined;
				await moveSourcesToFolder({
					source_ids: [singleSourceMoveModal.id],
					folder_id: folderId,
				});
				setSingleSourceMoveModal(null);
				setSingleSourceMoveTargetId("");
				await fetchSources();
			} catch (error) {
				console.error("移动资料失败:", error);
				toast.error(
					`移动失败: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		},
		[singleSourceMoveModal, singleSourceMoveTargetId],
	);

	// 获取可选的父文件夹（排除自身及其子孙）
	const getAvailableParentFolders = useCallback(
		(excludeFolderId: string) => {
			const subtree = getSubtreeFolderIds(excludeFolderId);
			return flatFolderOptions.filter((opt) => !subtree.has(opt.id));
		},
		[flatFolderOptions, getSubtreeFolderIds],
	);

	const toggleFolderExpanded = useCallback((folderId: string) => {
		setExpandedFolderIds((prev) =>
			prev.includes(folderId)
				? prev.filter((x) => x !== folderId)
				: [...prev, folderId],
		);
	}, []);

	// 选中某个文件夹时自动展开其祖先
	useEffect(() => {
		if (!currentFolderId || currentFolderId === UNASSIGNED_FOLDER_ID) return;
		const expanded = new Set(expandedFolderIds);
		let cur = foldersById.get(currentFolderId);
		while (cur?.parent_id) {
			expanded.add(cur.parent_id);
			cur = foldersById.get(cur.parent_id);
		}
		setExpandedFolderIds(Array.from(expanded));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentFolderId, foldersById]);

	return {
		// State
		folders,
		expandedFolderIds,
		isFolderModalOpen,
		setIsFolderModalOpen,
		folderContextMenu,
		setFolderContextMenu,
		folderDeleteConfirm,
		setFolderDeleteConfirm,
		isRenameFolderModalOpen,
		setIsRenameFolderModalOpen,
		renameFolderTarget,
		setRenameFolderTarget,
		renameFolderName,
		setRenameFolderName,
		isMoveFolderToModalOpen,
		setIsMoveFolderToModalOpen,
		moveFolderSource,
		setMoveFolderSource,
		moveFolderToTargetId,
		setMoveFolderToTargetId,
		singleSourceMoveModal,
		setSingleSourceMoveModal,
		singleSourceMoveTargetId,
		setSingleSourceMoveTargetId,

		// Computed
		foldersById,
		childrenByParentId,
		flatFolderOptions,
		folderCounts,
		currentSubfolders,
		breadcrumbPath,
		getSubtreeFolderIds,
		getFolderSubtreeCount,
		getAvailableParentFolders,

		// Callbacks
		fetchFolders,
		handleCreateFolder,
		handleFolderContextMenu,
		handleRenameFolder,
		handleDeleteFolder,
		handleMoveFolderTo,
		handleSingleSourceMove,
		toggleFolderExpanded,
	};
}
