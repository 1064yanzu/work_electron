// 编辑器画布 - 现代化所见即所得编辑器

import { Copy, Image, Loader2 } from "lucide-react";
import type { SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAISuggestion } from "../hooks/useAISuggestion";
import {
	createOutputAsset,
	fileDelete,
	fileRestore,
	generateImageForText,
	listOutputAssets,
	updateOutputAsset,
} from "../lib/api";
import { safeInvoke } from "../lib/tauriBridge";
import { buildEditorBlankContextMenu } from "../lib/contextMenu/actions";
import { debugUiLog, debugUiWarn } from "../lib/debug/uiDebug";
import { EVENTS, events } from "../lib/events";
import { measureNextPaint } from "../lib/performance/devMetrics";
import {
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../lib/workspaceStore";
import { tabStore } from "../lib/stores/tabStore";
import { diffStore } from "../lib/stores/diffStore";
import { type OutputAsset, OutputType } from "../types";
import AIContentSuggest from "./AIContentSuggest";
import DiffView from "./DiffView";
import DocCreationProposal from "./DocCreationProposal";
import DocumentTabs from "./DocumentTabs";
import { EditorDialogs } from "./editor/EditorDialogs";
import { EditorDocumentListView } from "./editor/EditorDocumentListView";
import { EditorHeader } from "./editor/EditorHeader";
import { EditorStatusBar } from "./editor/EditorStatusBar";
import { useEditorUiPrefs } from "./editor/useEditorUiPrefs";
import { EditorWorkspaceView } from "./editor/EditorWorkspaceView";
import { isMarkdownPreviewFile, isBinaryPreviewFile } from "./editor/FileTypePreview";
import { PhysicalFileViewer } from "./editor/PhysicalFileViewer";
import InlineReviewRenderer from "./InlineReviewRenderer";
import SourceReadView from "./SourceReadView";
import { DiffViewer } from "./CodeView/DiffViewer";
import { confirmDialog } from "./ui/ConfirmDialog";
import { ContextMenu, type ContextMenuItem } from "./ui/ContextMenu";
import { toast } from "./ui/Toast";

interface EditorCanvasProps {
	onBack?: () => void;
	projectId?: string;
	initialDocId?: string;
}

function isPhysicalDocId(docId: string | null | undefined): docId is string {
	if (!docId) return false;
	return docId.startsWith("/") || /^[a-zA-Z]:\\/.test(docId);
}

function getPreviewFileName(params: {
	selectedOutput: OutputAsset | null;
	activeFileSession: { path: string; title: string } | null;
	activeDocId: string | null;
	currentEditorTitle: string;
}) {
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

export default function EditorCanvas({
	onBack,
	projectId,
	initialDocId,
}: EditorCanvasProps) {
	const [outputs, setOutputs] = useState<OutputAsset[]>([]);
	const [selectedOutput, setSelectedOutput] = useState<OutputAsset | null>(
		null,
	);
	const [editorContent, setEditorContent] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
	const [deleteConfirm, setDeleteConfirm] = useState<OutputAsset | null>(null);
	// 编辑模式: 'edit' = 纯编辑, 'preview' = 纯预览, 'split' = 分屏实时预览
	const [editorMode, setEditorMode] = useState<"edit" | "preview" | "split">(
		"split",
	);
	const [userOverrodeMode, setUserOverrodeMode] = useState(false);
	const [isManaging, setIsManaging] = useState(false);
	const [selectedForManage, setSelectedForManage] = useState<string[]>([]);
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
	// 右键菜单状态
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		type: "selection" | "blank";
		selectedText?: string;
	} | null>(null);
	const [isGeneratingImage, setIsGeneratingImage] = useState(false);
	const { focusMode, density, toggleFocusMode, toggleDensity } =
		useEditorUiPrefs();

	// AI 建议管理
	const {
		pendingSuggestion,
		hasPendingSuggestion,
		addSuggestion,
		acceptSuggestion,
		rejectSuggestion,
	} = useAISuggestion();

	const openedDocs = useWorkspaceStoreSelector((state) => state.openedDocs);
	const activeDocId = useWorkspaceStoreSelector((state) => state.activeDocId);
	const storeEditorContent = useWorkspaceStoreSelector(
		(state) => state.editorContent,
	);
	const activeDocCache = useWorkspaceStoreSelector((state) =>
		activeDocId ? (state.docCache[activeDocId] ?? null) : null,
	);
	const tabs = useWorkspaceStoreSelector((state) => state.tabs);
	const activeTabId = useWorkspaceStoreSelector((state) => state.activeTabId);
	const aiReview = useWorkspaceStoreSelector((state) => state.aiReview);
	const activeFileSession = useWorkspaceStoreSelector(
		(state) => state.activeFileSession,
	);
	const activeDocCacheContent = activeDocCache?.content;
	const isPhysicalFileVisible = Boolean(
		activeFileSession &&
			activeDocId &&
			activeFileSession.path === activeDocId &&
			activeDocCache?.kind === "project_file",
	);
	const canSaveCurrentContent = Boolean(selectedOutput || isPhysicalFileVisible);
	const currentEditorTitle =
		selectedOutput?.title || activeFileSession?.title || activeDocCache?.title || "";
	const previewFileName = getPreviewFileName({
		selectedOutput,
		activeFileSession,
		activeDocId,
		currentEditorTitle,
	});
	const closeTab = workspaceStore.closeTab.bind(workspaceStore);
	const closeDoc = workspaceStore.closeDoc.bind(workspaceStore);
	const openDoc = workspaceStore.openDoc.bind(workspaceStore);
	const updateDocCache = workspaceStore.updateDocCache.bind(workspaceStore);
	const markDocDirty = workspaceStore.markDocDirty.bind(workspaceStore);
	const startAIReview = workspaceStore.startAIReview.bind(workspaceStore);
	const acceptAIReview = workspaceStore.acceptAIReview.bind(workspaceStore);
	const rejectAIReview = workspaceStore.rejectAIReview.bind(workspaceStore);

	// 检查是否有激活的资料阅读标签页
	const activeSourceTab = tabs.find(
		(t) => t.id === activeTabId && t.type === "source",
	);
	const activeSourceData = useWorkspaceStoreSelector((state) =>
		activeSourceTab?.sourceId
			? (state.sourceReadCache[activeSourceTab.sourceId] ?? null)
			: null,
	);

	// 检查是否有激活的 diff 标签页
	const activeDiffTab = tabs.find(
		(t) => t.id === activeTabId && t.type === "diff",
	);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const docCacheSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const titleSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const isSavingRef = useRef(false); // 防止并发保存
	const selectedOutputRef = useRef<OutputAsset | null>(null);
	const editorContentRef = useRef<string>("");
	const lastSavedContentRef = useRef<string>("");
	const lastSavedDocIdRef = useRef<string | null>(null); // 追踪上次保存的文档 ID
	const pendingTitleRef = useRef<{ id: string; title: string } | null>(null);
	const syncEditorBufferToStore = useCallback(
		(docId: string, content: string, options?: { immediate?: boolean }) => {
			if (docCacheSyncTimeoutRef.current) {
				clearTimeout(docCacheSyncTimeoutRef.current);
				docCacheSyncTimeoutRef.current = null;
			}

			const commit = () => {
				const snapshot = workspaceStore.getState().docCache[docId];
				if (workspaceStore.getState().editorContent !== content) {
					workspaceStore.setEditorContent(content);
				}
				if (!snapshot) return;
				if (snapshot.content === content && snapshot.dirty) return;
				updateDocCache(docId, content, true);
			};

			if (options?.immediate) {
				commit();
				return;
			}

			docCacheSyncTimeoutRef.current = setTimeout(() => {
				docCacheSyncTimeoutRef.current = null;
				commit();
			}, 320);
		},
		[updateDocCache],
	);

	const handleEditorContentChange = useCallback(
		(content: string) => {
			const startedAt = performance.now();
			setEditorContent(content);
			measureNextPaint("editor.input.commit", startedAt, {
				length: content.length,
				docId: activeDocId ?? undefined,
			});
		},
		[activeDocId],
	);

	const handleEditorBlur = useCallback(() => {
		if (!activeDocId) return;
		syncEditorBufferToStore(activeDocId, editorContentRef.current, {
			immediate: true,
		});
	}, [activeDocId, syncEditorBufferToStore]);

	const replaceEditorBuffer = useCallback((next: SetStateAction<string>) => {
		setEditorContent((previous) => {
			const resolved = typeof next === "function" ? next(previous) : next;
			if (workspaceStore.getState().editorContent !== resolved) {
				workspaceStore.setEditorContent(resolved);
			}
			return resolved;
		});
	}, []);

	// 用户手动切换编辑模式时标记为手动覆盖
	const handleUserSetEditorMode = useCallback(
		(mode: "edit" | "preview" | "split") => {
			setUserOverrodeMode(true);
			setEditorMode(mode);
		},
		[],
	);

	// 根据文件类型自动决定编辑模式（仅在切换文件时触发，用户手动选择后不再自动切换）
	useEffect(() => {
		if (!isPhysicalFileVisible || !previewFileName) return;
		if (userOverrodeMode) return;
		if (isMarkdownPreviewFile(previewFileName)) {
			setEditorMode("split");
		} else if (isBinaryPreviewFile(previewFileName)) {
			setEditorMode("preview");
		} else {
			setEditorMode("edit");
		}
	}, [isPhysicalFileVisible, previewFileName, userOverrodeMode]);

	// 切换文件时重置手动覆盖标记
	useEffect(() => {
		setUserOverrodeMode(false);
	}, [activeDocId]);

	const hasUnsavedChanges = useMemo(() => {
		if (!selectedOutput && !isPhysicalFileVisible) return false;
		const fallbackSavedContent = selectedOutput
			? selectedOutput.content
			: activeDocCache?.content || "";
		const savedContent = lastSavedContentRef.current || fallbackSavedContent;
		return editorContent !== savedContent;
	}, [activeDocCache?.content, editorContent, isPhysicalFileVisible, selectedOutput, lastSavedAt]);

	const lastSavedLabel = useMemo(() => {
		if (!lastSavedAt) return "";
		return new Date(lastSavedAt).toLocaleTimeString("zh-CN", {
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		});
	}, [lastSavedAt]);

	// 滚动同步 Refs
	const editContainerRef = useRef<HTMLDivElement>(null);
	const previewContainerRef = useRef<HTMLDivElement>(null);
	const isSyncingScrollRef = useRef(false);

	// 同步 ref
	useEffect(() => {
		selectedOutputRef.current = selectedOutput;
	}, [selectedOutput]);

	useEffect(() => {
		editorContentRef.current = editorContent;
	}, [editorContent]);

	useEffect(() => {
		if (storeEditorContent === editorContentRef.current) return;
		setEditorContent(storeEditorContent);
	}, [storeEditorContent]);

	useEffect(() => {
		if (!activeDocId || activeDocCache?.kind !== "project_file") return;
		setSelectedOutput(null);
		const targetContent = activeDocCache.content ?? "";
		if (editorContentRef.current === targetContent) return;
		setEditorContent(targetContent);
	}, [activeDocCache?.content, activeDocCache?.kind, activeDocId]);

	// 监听打开 diff 视图事件
	useEffect(() => {
		const handleOpenDiff = (data: { diffId: string; title?: string }) => {
			if (data.diffId) {
				const diff = diffStore.getState().diffs[data.diffId];
				const fileName = diff?.filePath.split("/").pop() || "Diff";
				tabStore.openDiffInMainView(data.diffId, data.title || fileName);
			}
		};
		// AGENT_FOCUS_TOOL_CALL 也可能携带 diffId
		const handleFocusToolCall = (data: { diffId?: string; type?: string }) => {
			if (data.type === "diff" && data.diffId) {
				handleOpenDiff({ diffId: data.diffId });
			}
		};
		const off1 = events.on(EVENTS.OPEN_DIFF_VIEW, handleOpenDiff);
		const off2 = events.on(EVENTS.AGENT_FOCUS_TOOL_CALL, handleFocusToolCall);
		return () => {
			off1();
			off2();
		};
	}, []);

	// 仅在真正切换到不同文档时初始化 lastSavedContentRef
	useEffect(() => {
		if (selectedOutput) {
			// 只有切换到不同文档时才重置
			if (lastSavedDocIdRef.current !== selectedOutput.id) {
				lastSavedDocIdRef.current = selectedOutput.id;
				lastSavedContentRef.current = selectedOutput.content;
				if (selectedOutput.updated_at) {
					setLastSavedAt(new Date(selectedOutput.updated_at).getTime());
				} else {
					setLastSavedAt(Date.now());
				}
			}
		} else if (isPhysicalDocId(activeDocId)) {
			// Physical file selected
			if (lastSavedDocIdRef.current !== activeDocId) {
				lastSavedDocIdRef.current = activeDocId;
				lastSavedContentRef.current = workspaceStore.getState().docCache[activeDocId]?.content || "";
				setLastSavedAt(Date.now());
			}
		} else {
			lastSavedDocIdRef.current = null;
			lastSavedContentRef.current = "";
			setLastSavedAt(null);
		}
	}, [selectedOutput?.id, activeDocId]); // 监听 id 和 activeDocId 变化

	useEffect(() => {
		setSelectedForManage((prev) =>
			prev.filter((id) => outputs.some((o) => o.id === id)),
		);
		if (outputs.length === 0) {
			setIsManaging(false);
		}
	}, [outputs]);

	useEffect(() => {
		if (selectedOutput) {
			setIsManaging(false);
			setSelectedForManage([]);
		}
	}, [selectedOutput]);

	const fetchOutputs = useCallback(
		async (preferredId?: string, options?: { skipAutoSelect?: boolean }) => {
			try {
				debugUiLog(
					"[EditorCanvas] fetchOutputs called, preferredId:",
					preferredId,
					"options:",
					options,
				);
				const data = await listOutputAssets();
				debugUiLog(
					"[EditorCanvas] listOutputAssets returned:",
					data.length,
					"items",
				);
				const filtered = projectId
					? data.filter((d) => {
							if (d.project_id === projectId) return true;
							// 兼容历史数据：旧文档还没有 project_id，也暂时展示出来
							return d.project_id == null;
						})
					: data;
				debugUiLog(
					"[EditorCanvas] filtered for project:",
					filtered.length,
					"items",
				);

				// 如果当前有选中的文档，保留它（即使不在 filtered 中）
				const currentSelected = selectedOutputRef.current;
				const currentSelectedInProject =
					currentSelected && currentSelected.project_id === projectId
						? currentSelected
						: null;

				// 跨项目切换时，清理旧选中，避免串到别的项目
				if (currentSelected && !currentSelectedInProject) {
					setSelectedOutput(null);
					replaceEditorBuffer("");
				}

				if (currentSelectedInProject) {
					// 当前选中的文档属于这个项目，确保它在列表中
					const existsInFiltered = filtered.some(
						(d) => d.id === currentSelectedInProject.id,
					);
					if (!existsInFiltered) {
						debugUiLog(
							"[EditorCanvas] 当前文档不在列表中，添加到列表:",
							currentSelectedInProject.id,
						);
						filtered.unshift(currentSelectedInProject);
					}
				}

				setOutputs(filtered);

				if (filtered.length === 0) {
					if (activeFileSession?.path && activeFileSession.content !== undefined) {
						setSelectedOutput(null);
						replaceEditorBuffer(activeFileSession.content);
						return;
					}
					setSelectedOutput(null);
					replaceEditorBuffer("");
					return;
				}

				if (options?.skipAutoSelect) {
					debugUiLog("[EditorCanvas] skip auto select, keep current view");
					return;
				}

				const pickTarget = (id?: string) =>
					id ? filtered.find((d) => d.id === id) : undefined;

				// 使用 ref 获取当前选中的文档 ID，避免循环依赖
				const currentSelectedId = currentSelectedInProject?.id;
				const targetDoc =
					pickTarget(preferredId) ??
					pickTarget(initialDocId) ??
					pickTarget(currentSelectedId);

				if (targetDoc) {
					debugUiLog(
						"[EditorCanvas] selecting targetDoc:",
						targetDoc.id,
						"content length:",
						targetDoc.content.length,
					);
					setSelectedOutput(targetDoc);
					replaceEditorBuffer(targetDoc.content);
					// 同步到多标签工作区
					openDoc(targetDoc.id, targetDoc.title, targetDoc.content);
					return;
				}

				// 如果已经有选中的文档，不要覆盖
				if (currentSelectedInProject) {
					debugUiLog(
						"[EditorCanvas] 保留当前选中的文档:",
						currentSelectedInProject.id,
					);
					// 确保 activeDocId 已设置
					openDoc(
						currentSelectedInProject.id,
						currentSelectedInProject.title,
						currentSelectedInProject.content,
					);
					return;
				}
                
                // Fallback: check if we are dealing with a physical file
				if (activeFileSession?.path && activeFileSession.content !== undefined) {
					setSelectedOutput(null);
					replaceEditorBuffer(activeFileSession.content);
					return;
				}

				// 默认不自动打开任一文档：保持文档列表视图，让用户手动选择
				debugUiLog("[EditorCanvas] no auto select fallback; show list view");
				setSelectedOutput(null);
				replaceEditorBuffer("");
			} catch (error) {
				console.error("[EditorCanvas] 获取文档失败:", error);
			}
		},
		[projectId, initialDocId, openDoc, activeFileSession?.content, activeFileSession?.path],
	); // 移除 selectedOutput?.id 依赖

	// 只在组件挂载和 projectId 变化时加载文档列表
	useEffect(() => {
		fetchOutputs();
	}, [projectId, initialDocId]);

	const flushPendingSave = useCallback(async () => {
		// 防止并发保存
		if (isSavingRef.current) {
			return;
		}

		// 使用 ref 获取最新值，避免闭包问题
		const currentOutput = selectedOutputRef.current;
		const currentContent = editorContentRef.current;
		// Danger! We are flushing the pending changes for the DOCUMENT WE WERE ON
        // That is lastSavedDocIdRef, NOT the new activeDocId (which may have already flipped!)
		const documentToSave = lastSavedDocIdRef.current;

		if (!currentOutput) {
            // Handling physical files save
            if (isPhysicalDocId(documentToSave)) {
                const savedContent = lastSavedContentRef.current;
                if (currentContent === savedContent) return;

                isSavingRef.current = true;
                setIsSaving(true);
                try {
                    await safeInvoke("write_file_safe", { path: documentToSave, content: currentContent });
                    lastSavedContentRef.current = currentContent;
                    updateDocCache(documentToSave, currentContent, false);
                    setLastSavedAt(Date.now());
                } catch (error) {
                    console.error("[EditorCanvas] Physical flushPendingSave error", error);
                } finally {
                    isSavingRef.current = false;
                    setIsSaving(false);
                }
            }
			return;
		}
		// 与 hasUnsavedChanges 保持一致：优先用 ref，回退用 currentOutput.content
		const savedContent = lastSavedContentRef.current || currentOutput.content;
		if (currentContent === savedContent) {
			return;
		}

		isSavingRef.current = true;
		setIsSaving(true);
		try {
			const updated = await updateOutputAsset({
				id: currentOutput.id,
				content: currentContent,
			});
			// 更新 ref（这些不依赖组件是否挂载）
			lastSavedContentRef.current = currentContent;
			selectedOutputRef.current = {
				...currentOutput,
				content: currentContent,
				version: updated.version,
				updated_at: updated.updated_at,
			};

			// 更新 React 状态（React 会自动忽略已卸载组件的更新）
			setOutputs((prev) =>
				prev.map((o) =>
					o.id === updated.id
						? {
								...o,
								content: currentContent,
								version: updated.version,
								updated_at: updated.updated_at,
							}
						: o,
				),
			);
			setSelectedOutput((prev) =>
				prev && prev.id === updated.id
					? {
							...prev,
							content: currentContent,
							version: updated.version,
							updated_at: updated.updated_at,
						}
					: prev,
			);
			// 更新 docCache 内容并标记为已保存（dirty = false）
			updateDocCache(updated.id, currentContent, false);
			setLastSavedAt(Date.now());
		} catch (error) {
			console.error("[EditorCanvas] flushPendingSave error", error);
		} finally {
			isSavingRef.current = false;
			setIsSaving(false);
		}
	}, [updateDocCache]);

	const flushTitleSave = useCallback(async () => {
		if (titleSaveTimeoutRef.current) {
			clearTimeout(titleSaveTimeoutRef.current);
			titleSaveTimeoutRef.current = null;
		}
		const pending = pendingTitleRef.current;
		if (!pending) {
			return;
		}
		pendingTitleRef.current = null;
		try {
			const updated = await updateOutputAsset({
				id: pending.id,
				title: pending.title,
			});
			setOutputs((prev) =>
				prev.map((o) => (o.id === updated.id ? updated : o)),
			);
			setSelectedOutput((prev) =>
				prev && prev.id === updated.id ? updated : prev,
			);
		} catch (error) {
			console.error("[EditorCanvas] flushTitleSave error", error);
		}
	}, []);

	const flushPendingSaveImmediately = useCallback(async () => {
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
			saveTimeoutRef.current = null;
		}
		await flushTitleSave();
		await flushPendingSave();
	}, [flushPendingSave, flushTitleSave]);

	// 监听 activeDocId 变化，同步切换文档（标签栏点击触发）
	useEffect(() => {
		if (!activeDocId) return;

		// 如果当前选中的文档已经是 activeDocId，不需要切换
		if (selectedOutput?.id === activeDocId) {
            return;
        }

		// 从 outputs 列表中查找目标文档
		const targetDoc = outputs.find((o) => o.id === activeDocId);
		if (targetDoc) {
			debugUiLog("[EditorCanvas] 标签栏切换文档:", activeDocId);
			// 先保存当前文档
			flushPendingSaveImmediately().then(() => {
				setSelectedOutput(targetDoc);
				replaceEditorBuffer(targetDoc.content);
			});
		} else {
            if (activeFileSession?.path === activeDocId) {
                flushPendingSaveImmediately().then(() => {
                    setSelectedOutput(null);
                    replaceEditorBuffer(activeFileSession.content);
                });
            }
        }
	}, [
		activeDocId,
		activeFileSession?.openedAt,
		activeFileSession?.path,
		outputs,
		selectedOutput?.id,
		flushPendingSaveImmediately,
	]);

	const toggleManageSelection = useCallback((id: string) => {
		setSelectedForManage((prev) => {
			if (prev.includes(id)) {
				return prev.filter((item) => item !== id);
			}
			return [...prev, id];
		});
	}, []);

	const isSelectedForManage = useCallback(
		(id: string) => selectedForManage.includes(id),
		[selectedForManage],
	);

	const isAllSelected =
		outputs.length > 0 && selectedForManage.length === outputs.length;

	const handleToggleSelectAll = useCallback(() => {
		if (isAllSelected) {
			setSelectedForManage([]);
			return;
		}
		setSelectedForManage(outputs.map((o) => o.id));
	}, [isAllSelected, outputs]);

	const handleToggleManaging = useCallback(() => {
		setIsManaging((prev) => {
			if (prev) {
				setSelectedForManage([]);
			}
			return !prev;
		});
	}, []);

	const deleteOutputsWithUndo = useCallback(
		async (ids: string[]) => {
			if (ids.length === 0) return;

			for (const id of ids) {
				await fileDelete({ id, entity_type: "output" });
				closeDoc(id);
			}

			setOutputs((prev) => prev.filter((item) => !ids.includes(item.id)));
			setSelectedOutput((prev) =>
				prev && ids.includes(prev.id) ? null : prev,
			);
			replaceEditorBuffer((prev) => {
				if (
					selectedOutputRef.current &&
					ids.includes(selectedOutputRef.current.id)
				) {
					return "";
				}
				return prev;
			});

			const label =
				ids.length === 1 ? "文档已删除" : `已删除 ${ids.length} 篇文档`;
			toast.show(label, {
				type: "warning",
				duration: 5000,
				actionLabel: "撤销",
				actionVariant: "primary",
				onAction: async () => {
					try {
						for (const id of ids) {
							await fileRestore({ id, entity_type: "output" });
						}
						await fetchOutputs(undefined, { skipAutoSelect: true });
						toast.success("已恢复删除的文档");
					} catch (error) {
						console.error("[EditorCanvas] 撤销删除失败", error);
						toast.error(
							`撤销失败: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				},
			});
		},
		[closeDoc, fetchOutputs],
	);

	const handleBulkDelete = useCallback(async () => {
		if (selectedForManage.length === 0 || isBulkDeleting) return;
		setIsBulkDeleting(true);
		try {
			await deleteOutputsWithUndo(selectedForManage);
			setSelectedForManage([]);
			setIsManaging(false);
			setShowBulkDeleteConfirm(false);
		} catch (error) {
			console.error("[EditorCanvas] 批量删除失败", error);
			toast.error("批量删除失败，请稍后重试");
		} finally {
			setIsBulkDeleting(false);
		}
	}, [selectedForManage, isBulkDeleting, deleteOutputsWithUndo]);

	const handleSelectOutput = useCallback(
		async (output: OutputAsset | null) => {
			try {
				await flushPendingSaveImmediately();
			} catch (error) {
				console.error("[EditorCanvas] 切换文档前保存失败", error);
			}

			if (output) {
				debugUiLog(
					"[EditorCanvas] handleSelectOutput, output.id:",
					output.id,
					"content.length:",
					output.content.length,
				);
				setSelectedOutput(output);
				replaceEditorBuffer(output.content);
				// 添加到多标签工作区
				openDoc(output.id, output.title, output.content);
			} else {
				debugUiLog(
					"[EditorCanvas] handleSelectOutput, output is null, 重新加载列表",
				);
				setSelectedOutput(null);
				replaceEditorBuffer("");
				// 返回列表时重新加载，确保显示最新保存的内容
				await fetchOutputs(undefined, { skipAutoSelect: true });
			}
		},
		[flushPendingSaveImmediately, fetchOutputs, openDoc],
	);

	// Auto-save - 与 hasUnsavedChanges 保持一致的判断逻辑
	useEffect(() => {
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current);
		}

		if (!selectedOutput && !isPhysicalDocId(activeDocId)) {
			return;
		}
		// 与 hasUnsavedChanges 保持一致：优先用 ref，回退用 selectedOutput.content 或物理文件缓存
		const physicalSavedContent = isPhysicalDocId(activeDocId)
			? (workspaceStore.getState().docCache[activeDocId]?.content ?? "")
			: "";
		const savedContent =
			lastSavedContentRef.current ||
			(selectedOutput ? selectedOutput.content : physicalSavedContent);
		if (editorContent === savedContent) {
			return;
		}

		saveTimeoutRef.current = setTimeout(() => {
			void flushPendingSave();
		}, 1500);

		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
		};
	}, [editorContent, selectedOutput, flushPendingSave]);

	// Flush pending save when组件卸载或离开
	useEffect(() => {
		return () => {
			if (saveTimeoutRef.current) {
				clearTimeout(saveTimeoutRef.current);
			}
			void flushPendingSave();
		};
	}, [flushPendingSave]);

	useEffect(() => {
		return () => {
			if (docCacheSyncTimeoutRef.current) {
				clearTimeout(docCacheSyncTimeoutRef.current);
				docCacheSyncTimeoutRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
        const isPhysical = isPhysicalDocId(activeDocId);
		if (!activeDocId || (!isPhysical && (!selectedOutput || selectedOutput.id !== activeDocId))) {
			return;
		}
		if (editorContent === activeDocCacheContent) {
			return;
		}
		markDocDirty(activeDocId);
		syncEditorBufferToStore(activeDocId, editorContent);
	}, [
		activeDocCacheContent,
		activeDocId,
		editorContent,
		markDocDirty,
		selectedOutput,
		syncEditorBufferToStore,
	]);

	// AI 协议事件监听
	useEffect(() => {
		debugUiLog("[EditorCanvas] 注册 AI 事件监听, activeDocId:", activeDocId);

		const unsubscribeUpdateEnd = events.on(
			EVENTS.AI_DOC_UPDATE_END,
			(data: any) => {
				debugUiLog("[EditorCanvas] 收到 AI_DOC_UPDATE_END 事件:", data);
				debugUiLog("[EditorCanvas] activeDocId:", activeDocId);
				if (activeDocId) {
					debugUiLog("[EditorCanvas] 调用 startAIReview");
					startAIReview(
						activeDocId,
						data.originalContent,
						data.suggestedContent,
					);
				} else {
					debugUiWarn("[EditorCanvas] activeDocId 为空，无法启动审查");
				}
			},
		);

		const unsubscribeCreateEnd = events.on(
			EVENTS.AI_DOC_CREATE_END,
			(data: any) => {
				debugUiLog("[EditorCanvas] 收到 AI_DOC_CREATE_END 事件:", data);
				// 自动创建文档（无提案弹窗），行为类似 Cursor：直接生成并打开
				void (async () => {
					try {
						const newAsset = await createOutputAsset({
							title: data.title || "新文档",
							content: data.content,
							output_type: OutputType.Article,
							related_notes: [],
							project_id: projectId,
						});
						// 写入多标签工作区并激活
						openDoc(newAsset.id, newAsset.title, newAsset.content);
						setOutputs((prev) => [newAsset, ...prev]);
						setSelectedOutput(newAsset);
						replaceEditorBuffer(newAsset.content);
						// 清理潜在的 aiReview 状态（如果存在旧的 create 提案状态）
						acceptAIReview();
					} catch (error) {
						console.error("[EditorCanvas] 自动创建文档失败:", error);
					}
				})();
			},
		);

		return () => {
			unsubscribeUpdateEnd();
			unsubscribeCreateEnd();
		};
	}, [
		activeDocId,
		startAIReview,
		acceptAIReview,
		openDoc,
		projectId,
		setOutputs,
	]);

	// AI Writing Event
	useEffect(() => {
		const unsubscribe = events.on(
			EVENTS.AI_WRITE_TO_OUTPUT,
			async (data: any) => {
				const contentToAdd = data.content;
				const suggestionType = data.type || "append";
				const originalContent = data.originalContent || editorContent;

				if (suggestionType === "diff") {
					addSuggestion(
						contentToAdd,
						data.prompt || "AI 修改建议",
						"diff",
						originalContent,
					);
				} else {
					addSuggestion(contentToAdd, data.prompt || "AI 生成内容", "append");
				}
			},
		);
		return unsubscribe;
	}, [addSuggestion, editorContent]);

	// 插入到编辑器事件
	useEffect(() => {
		const unsubscribe = events.on(
			EVENTS.INSERT_TO_EDITOR,
			(data: { content: string; position?: "cursor" | "end" }) => {
				if (data.position === "cursor" && textareaRef.current) {
					const textarea = textareaRef.current;
					const start = textarea.selectionStart;
					const before = editorContent.substring(0, start);
					const after = editorContent.substring(start);
					replaceEditorBuffer(before + data.content + after);
				} else {
					replaceEditorBuffer((prev) => prev + "\n\n" + data.content);
				}
			},
		);
		return unsubscribe;
	}, [editorContent]);

	// 处理接受 AI 建议
	const handleAcceptSuggestion = async () => {
		const suggestion = acceptSuggestion();
		if (!suggestion) return;

		if (suggestion.type === "diff") {
			replaceEditorBuffer(suggestion.content);
			return;
		}

		if (!selectedOutput && !isPhysicalFileVisible) {
			try {
				const newAsset = await createOutputAsset({
					title: "AI 分析报告 " + new Date().toLocaleTimeString(),
					content: "# " + suggestion.prompt + "\n\n" + suggestion.content,
					output_type: OutputType.Report,
					related_notes: [],
				});
				await fetchOutputs();
				setSelectedOutput(newAsset);
				replaceEditorBuffer(newAsset.content);
			} catch (e) {
				console.error("[EditorCanvas] 创建文档失败:", e);
			}
		} else {
			replaceEditorBuffer((prev) => prev + "\n\n" + suggestion.content);
		}
	};

	const handleRejectSuggestion = () => {
		rejectSuggestion();
	};

	const handleManualSave = useCallback(async () => {
		if (!canSaveCurrentContent) return;
		try {
			await flushPendingSaveImmediately();
			toast.success("保存成功");
		} catch (error) {
			console.error("[EditorCanvas] 手动保存失败", error);
			toast.error("保存失败，请稍后重试");
		}
	}, [canSaveCurrentContent, flushPendingSaveImmediately]);

	const handleTitleChange = useCallback(
		(newTitle: string) => {
			if (!selectedOutput) return;
			const updated = { ...selectedOutput, title: newTitle };
			setSelectedOutput(updated);
			setOutputs((prev) =>
				prev.map((o) => (o.id === updated.id ? updated : o)),
			);
			pendingTitleRef.current = { id: updated.id, title: newTitle };
			if (titleSaveTimeoutRef.current) {
				clearTimeout(titleSaveTimeoutRef.current);
			}
			titleSaveTimeoutRef.current = setTimeout(() => {
				void flushTitleSave();
			}, 800);
		},
		[selectedOutput, flushTitleSave],
	);

	const handleCopyCurrentDoc = useCallback(() => {
		if (!selectedOutput) return;
		const text = `# ${selectedOutput.title}\n\n${editorContent}`;
		void navigator.clipboard.writeText(text);
	}, [selectedOutput, editorContent]);

	const handleExportCurrentDoc = useCallback(() => {
		if (!selectedOutput) return;
		const text = `# ${selectedOutput.title}\n\n${editorContent}`;
		const blob = new Blob([text], { type: "text/markdown" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${selectedOutput.title || "未命名"}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}, [selectedOutput, editorContent]);

	// 键盘快捷键
	useEffect(() => {
		const handleKeyboard = (e: KeyboardEvent) => {
			if (!hasPendingSuggestion) return;

			if (e.key === "Tab") {
				e.preventDefault();
				handleAcceptSuggestion();
			} else if (e.key === "Escape") {
				e.preventDefault();
				handleRejectSuggestion();
			}
		};

		window.addEventListener("keydown", handleKeyboard);
		return () => window.removeEventListener("keydown", handleKeyboard);
	}, [hasPendingSuggestion, pendingSuggestion]);

	useEffect(() => {
		const handleEditorViewHotkeys = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
				e.preventDefault();
				toggleFocusMode();
			}
		};

		window.addEventListener("keydown", handleEditorViewHotkeys);
		return () => window.removeEventListener("keydown", handleEditorViewHotkeys);
	}, [toggleFocusMode]);

	// 滚动同步处理 - 双向同步，使用锁机制防止循环触发
	const handleTextareaScroll = useCallback(() => {
		if (isSyncingScrollRef.current) return;

		const textarea = textareaRef.current;
		const preview = previewContainerRef.current;
		if (!textarea || !preview) return;

		// 计算 textarea 滚动比例
		const textareaScrollable = textarea.scrollHeight - textarea.clientHeight;
		if (textareaScrollable <= 0) return;

		const percentage = textarea.scrollTop / textareaScrollable;

		// 应用到预览视图
		const previewScrollable = preview.scrollHeight - preview.clientHeight;
		if (previewScrollable > 0) {
			isSyncingScrollRef.current = true;
			preview.scrollTop = percentage * previewScrollable;
			requestAnimationFrame(() => {
				isSyncingScrollRef.current = false;
			});
		}
	}, []);

	// 预览区滚动同步到编辑区
	const handlePreviewScroll = useCallback(() => {
		if (isSyncingScrollRef.current) return;

		const textarea = textareaRef.current;
		const preview = previewContainerRef.current;
		if (!textarea || !preview) return;

		// 计算预览区滚动比例
		const previewScrollable = preview.scrollHeight - preview.clientHeight;
		if (previewScrollable <= 0) return;

		const percentage = preview.scrollTop / previewScrollable;

		// 应用到编辑区
		const textareaScrollable = textarea.scrollHeight - textarea.clientHeight;
		if (textareaScrollable > 0) {
			isSyncingScrollRef.current = true;
			textarea.scrollTop = percentage * textareaScrollable;
			requestAnimationFrame(() => {
				isSyncingScrollRef.current = false;
			});
		}
	}, []);

	const handleCreateNew = async (
		type: OutputType = OutputType.Article,
		title: string = "未命名文档",
		initialContent: string = "",
	) => {
		try {
			await flushPendingSaveImmediately();
			debugUiLog("[EditorCanvas] 创建新文档:", { title, type, projectId });
			const newAsset = await createOutputAsset({
				title: title,
				content: initialContent,
				output_type: type,
				related_notes: [],
				project_id: projectId,
			});
			debugUiLog("[EditorCanvas] 文档创建成功:", newAsset.id);
			debugUiLog("[EditorCanvas] 返回的完整数据:", JSON.stringify(newAsset));

			// 确保 newAsset 有完整的数据
			const completeAsset = {
				...newAsset,
				title: newAsset.title || title,
				content: newAsset.content || initialContent,
				output_type: newAsset.output_type || type,
			};

			debugUiLog("[EditorCanvas] 设置 selectedOutput:", completeAsset.id);
			setOutputs((prev) => {
				debugUiLog("[EditorCanvas] 更新 outputs, 之前数量:", prev.length);
				return [completeAsset, ...prev];
			});
			setSelectedOutput(completeAsset);
			replaceEditorBuffer(initialContent);
			debugUiLog("[EditorCanvas] 状态更新完成");
		} catch (error) {
			console.error("[EditorCanvas] 创建文档失败:", error);
			toast.error("创建文档失败，请重试");
		}
	};

	useEffect(() => {
		if (selectedOutput) return;

		const handleListHotkeys = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const tag = target?.tagName.toLowerCase();
			const isTyping =
				tag === "input" ||
				tag === "textarea" ||
				tag === "select" ||
				Boolean(target?.isContentEditable);
			if (isTyping) return;

			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
				e.preventDefault();
				void handleCreateNew(OutputType.Article, "未命名文档", "");
				return;
			}

			if (e.altKey && e.key.toLowerCase() === "g") {
				e.preventDefault();
				setViewMode("grid");
				return;
			}

			if (e.altKey && e.key.toLowerCase() === "l") {
				e.preventDefault();
				setViewMode("list");
				return;
			}

			if (e.altKey && e.key.toLowerCase() === "m") {
				e.preventDefault();
				handleToggleManaging();
			}
		};

		window.addEventListener("keydown", handleListHotkeys);
		return () => window.removeEventListener("keydown", handleListHotkeys);
	}, [handleCreateNew, handleToggleManaging, selectedOutput]);

	const insertMarkdown = useCallback(
		(prefix: string, suffix: string = "") => {
			const textarea = textareaRef.current;
			if (!textarea) return;

			const start = textarea.selectionStart;
			const end = textarea.selectionEnd;
			const text = editorContent;
			const before = text.substring(0, start);
			const selection = text.substring(start, end);
			const after = text.substring(end);

			const newContent = before + prefix + selection + suffix + after;
			replaceEditorBuffer(newContent);

			setTimeout(() => {
				textarea.focus();
				textarea.setSelectionRange(start + prefix.length, end + prefix.length);
			}, 0);
		},
		[editorContent],
	);

	// 右键菜单处理 - textarea
	const handleTextareaContextMenu = useCallback(
		(e: React.MouseEvent<HTMLTextAreaElement>) => {
			const textarea = e.currentTarget;
			const selectedText = textarea.value.substring(
				textarea.selectionStart,
				textarea.selectionEnd,
			);
			if (selectedText.trim()) {
				e.preventDefault();
				setContextMenu({
					x: e.clientX,
					y: e.clientY,
					type: "selection",
					selectedText: selectedText.trim(),
				});
			}
		},
		[],
	);

	// 右键菜单处理 - 预览区（使用 window.getSelection）
	const handlePreviewContextMenu = useCallback((e: React.MouseEvent) => {
		const selection = window.getSelection();
		const selectedText = selection?.toString().trim() || "";
		if (selectedText) {
			e.preventDefault();
			setContextMenu({
				x: e.clientX,
				y: e.clientY,
				type: "selection",
				selectedText,
			});
		}
	}, []);

	// AI 生成配图
	const handleGenerateImage = useCallback(async () => {
		if (!contextMenu?.selectedText) return;

		const selectedText = contextMenu.selectedText;
		setIsGeneratingImage(true);
		setContextMenu(null);

		// 生成唯一占位符 ID
		const placeholderId = `img-placeholder-${Date.now()}`;
		const placeholderMarkdown = `\n\n![生成中...](loading:${placeholderId})\n`;

		// 先插入占位符：在选中文字后面插入
		// 查找选中文字在内容中的位置
		const textIndex = editorContent.indexOf(selectedText);
		let newContentWithPlaceholder = editorContent;

		if (textIndex !== -1) {
			// 在选中文字后插入占位符
			const insertPos = textIndex + selectedText.length;
			newContentWithPlaceholder =
				editorContent.substring(0, insertPos) +
				placeholderMarkdown +
				editorContent.substring(insertPos);
		} else {
			// 找不到精确匹配，追加到末尾
			newContentWithPlaceholder = editorContent + placeholderMarkdown;
		}

		replaceEditorBuffer(newContentWithPlaceholder);

		try {
			// 使用配置服务生成图像
			const result = await generateImageForText({
				text: selectedText,
			});

			debugUiLog("[EditorCanvas] 生图结果:", result);

			if (result.images.length > 0) {
				// 后端已统一解析各种格式，直接使用 imageUrl
				// 用 <> 包裹 URL 以支持路径中的空格等特殊字符
				const { imageUrl } = result.images[0];
				const imageMarkdown = `\n\n![AI 配图](<${imageUrl}>)\n`;

				// 替换占位符
				replaceEditorBuffer((prevContent) =>
					prevContent.replace(placeholderMarkdown, imageMarkdown),
				);
			} else {
				// 没有图片结果，移除占位符
				debugUiWarn("[EditorCanvas] 生图响应无图片");
				replaceEditorBuffer((prevContent) =>
					prevContent.replace(placeholderMarkdown, ""),
				);
			}
		} catch (error) {
			console.error("生成配图失败:", error);
			// 移除占位符，显示错误提示
			replaceEditorBuffer((prevContent) =>
				prevContent.replace(
					placeholderMarkdown,
					`\n\n> ⚠️ 生图失败: ${error instanceof Error ? error.message : "未知错误"}\n`,
				),
			);
		} finally {
			setIsGeneratingImage(false);
		}
	}, [contextMenu, editorContent]);

	// 右键菜单项
	const contextMenuItems: ContextMenuItem[] = useMemo(() => {
		if (!contextMenu) return [];
		if (contextMenu.type === "blank") {
			return buildEditorBlankContextMenu({
				onCreate: () =>
					void handleCreateNew(OutputType.Article, "未命名文档", ""),
				onPaste: async () => {
					const text = await navigator.clipboard.readText();
					if (!text.trim()) return;
					await handleCreateNew(OutputType.Article, "未命名文档", text);
				},
				onRefresh: () => {
					void fetchOutputs(undefined, { skipAutoSelect: true });
				},
			});
		}

		const items: ContextMenuItem[] = [];
		if (contextMenu.selectedText) {
			items.push({
				label: isGeneratingImage ? "生成中..." : "AI 生成配图",
				icon: isGeneratingImage ? (
					<Loader2 className="w-4 h-4 animate-spin" />
				) : (
					<Image className="w-4 h-4" />
				),
				onClick: handleGenerateImage,
				disabled: isGeneratingImage,
			});
			items.push({
				label: "复制选中文字",
				icon: <Copy className="w-4 h-4" />,
				onClick: () => {
					if (contextMenu.selectedText) {
						navigator.clipboard.writeText(contextMenu.selectedText);
						setContextMenu(null);
					}
				},
			});
		}

		return items;
	}, [
		contextMenu,
		fetchOutputs,
		handleCreateNew,
		handleGenerateImage,
		isGeneratingImage,
	]);

	// 新文档处理
	const handleNewDoc = useCallback(async () => {
		try {
			const newAsset = await createOutputAsset({
				title: "未命名文档",
				content: "",
				output_type: OutputType.Article,
				related_notes: [],
				project_id: projectId,
			});

			// 添加到多标签工作区
			openDoc(newAsset.id, newAsset.title, newAsset.content);

			// 更新文档列表
			setOutputs((prev) => [newAsset, ...prev]);
			setSelectedOutput(newAsset);
			replaceEditorBuffer(newAsset.content);
		} catch (error) {
			console.error("创建文档失败:", error);
		}
	}, [projectId, openDoc]);

	const handleConfirmDelete = useCallback(
		async (target: OutputAsset) => {
			try {
				await deleteOutputsWithUndo([target.id]);
				setDeleteConfirm(null);
			} catch (error) {
				console.error("删除失败:", error);
				toast.error("删除失败，请稍后重试");
			}
		},
		[deleteOutputsWithUndo],
	);

	// 关闭文档处理
	const handleCloseDoc = useCallback(
		(docId: string, dirty: boolean) => {
			void (async () => {
				if (dirty) {
					const confirmed = await confirmDialog.warning(
						"文档有未保存的修改，确定要关闭吗？",
						"关闭文档",
					);
					if (!confirmed) return;
				}

				closeDoc(docId);

				// 如果关闭的是当前选中的文档/文件，切换到其他文档或空状态
				const isClosingSelectedOutput = selectedOutput?.id === docId;
				const isClosingSelectedProjectFile = activeFileSession?.path === docId;
				if (isClosingSelectedOutput || isClosingSelectedProjectFile) {
					if (openedDocs.length > 1) {
						const remainingDocs = openedDocs.filter((id) => id !== docId);
						const nextDocId = remainingDocs[remainingDocs.length - 1];
						const nextDoc = outputs.find((o) => o.id === nextDocId);
						if (nextDoc) {
							setSelectedOutput(nextDoc);
							replaceEditorBuffer(nextDoc.content);
						} else {
							const nextCachedDoc = workspaceStore.getState().docCache[nextDocId];
							setSelectedOutput(null);
							replaceEditorBuffer(nextCachedDoc?.content || "");
						}
					} else {
						setSelectedOutput(null);
						replaceEditorBuffer("");
					}
				}
			})();
		},
		[activeFileSession?.path, closeDoc, selectedOutput, openedDocs, outputs],
	);

	// AI 审查处理
	const handleAcceptAIReview = useCallback(async () => {
		acceptAIReview();

		// 如果是文档修改，更新编辑器内容
		if (
			aiReview.type === "update" &&
			aiReview.docId &&
			activeDocId === aiReview.docId
		) {
			replaceEditorBuffer(aiReview.suggestedContent);

			// 更新 selectedOutput
			if (selectedOutput && selectedOutput.id === aiReview.docId) {
				const updatedOutput = {
					...selectedOutput,
					content: aiReview.suggestedContent,
				};
				setSelectedOutput(updatedOutput);
				setOutputs((prev) =>
					prev.map((o) => (o.id === aiReview.docId ? updatedOutput : o)),
				);
			}
		}
	}, [acceptAIReview, aiReview, activeDocId, selectedOutput]);

	const handleRejectAIReview = useCallback(() => {
		rejectAIReview();
	}, [rejectAIReview]);

	// 新文档创建处理
	const handleAcceptCreateDoc = useCallback(async () => {
		if (aiReview.type !== "create") return;

		try {
			const newAsset = await createOutputAsset({
				title: aiReview.title || "新文档",
				content: aiReview.suggestedContent,
				output_type: OutputType.Article,
				related_notes: [],
				project_id: projectId,
			});

			// 添加到多标签工作区并激活
			openDoc(newAsset.id, newAsset.title, newAsset.content);

			// 更新文档列表
			setOutputs((prev) => [newAsset, ...prev]);
			setSelectedOutput(newAsset);
			replaceEditorBuffer(newAsset.content);

			// 清除 AI 审查状态
			acceptAIReview();
		} catch (error) {
			console.error("创建文档失败:", error);
		}
	}, [aiReview, projectId, openDoc, acceptAIReview]);

	// 文档列表视图
	const renderDocumentList = () => (
		<div
			className="h-full"
			onContextMenu={(e) => {
				const target = e.target as HTMLElement | null;
				if (!target) return;
				const tag = target.tagName.toLowerCase();
				if (
					tag === "input" ||
					tag === "textarea" ||
					tag === "button" ||
					target.closest("button")
				) {
					return;
				}
				e.preventDefault();
				setContextMenu({
					x: e.clientX,
					y: e.clientY,
					type: "blank",
				});
			}}
		>
			<EditorDocumentListView
				onBack={onBack}
				outputs={outputs}
				viewMode={viewMode}
				onToggleViewMode={() =>
					setViewMode((prev) => (prev === "grid" ? "list" : "grid"))
				}
				isManaging={isManaging}
				onToggleManaging={handleToggleManaging}
				selectedForManageCount={selectedForManage.length}
				isAllSelected={isAllSelected}
				onToggleSelectAll={handleToggleSelectAll}
				onRequestBulkDeleteConfirm={() => setShowBulkDeleteConfirm(true)}
				isBulkDeleting={isBulkDeleting}
				onCreateNew={() =>
					handleCreateNew(OutputType.Article, "未命名文档", "")
				}
				onSelectOutput={handleSelectOutput}
				isSelectedForManage={isSelectedForManage}
				onToggleManageSelection={toggleManageSelection}
			/>
		</div>
	);

	// 编辑器视图
	const renderEditor = () => (
		<div className="editor-shell flex flex-col h-full">
			{/* 文档标签栏 */}
			{!focusMode && (
				<DocumentTabs
					onNewDoc={handleNewDoc}
					onCloseDoc={handleCloseDoc}
					onDeleteDoc={(docId) => {
						const target = outputs.find((item) => item.id === docId);
						if (target) {
							setDeleteConfirm(target);
						}
					}}
				/>
			)}

			{/* AI 新文档创建提案 */}
			{aiReview.isReviewing && aiReview.type === "create" && (
				<DocCreationProposal
					title={aiReview.title || "新文档"}
					summary={aiReview.summary}
					contentPreview={aiReview.suggestedContent}
					onAccept={handleAcceptCreateDoc}
					onReject={handleRejectAIReview}
				/>
			)}

			{/* AI 建议浮窗 */}
			{hasPendingSuggestion &&
				pendingSuggestion &&
				(pendingSuggestion.type === "diff" &&
				pendingSuggestion.originalContent ? (
					<DiffView
						original={pendingSuggestion.originalContent}
						modified={pendingSuggestion.content}
						onAccept={handleAcceptSuggestion}
						onReject={handleRejectSuggestion}
						title={pendingSuggestion.prompt}
					/>
				) : (
					<AIContentSuggest
						content={pendingSuggestion.content}
						onAccept={handleAcceptSuggestion}
						onReject={handleRejectSuggestion}
					/>
				))}

			<EditorHeader
				editorMode={editorMode}
				onSetEditorMode={handleUserSetEditorMode}
				onBackToList={() => {
					if (isPhysicalFileVisible) {
						if (activeDocId) {
							handleCloseDoc(activeDocId, hasUnsavedChanges);
						}
						return;
					}
					void handleSelectOutput(null);
				}}
				onInsertMarkdown={insertMarkdown}
				onAiPolish={() =>
					events.emit(EVENTS.AI_REQUEST, {
						type: "improve",
						content: editorContent,
					})
				}
				onSave={handleManualSave}
				onCopy={handleCopyCurrentDoc}
				onExport={handleExportCurrentDoc}
				onDelete={() => {
					if (!selectedOutput) return;
					setDeleteConfirm(selectedOutput);
				}}
				canSave={canSaveCurrentContent}
				selectedOutput={Boolean(selectedOutput)}
				isSaving={isSaving}
				hasUnsavedChanges={hasUnsavedChanges}
				lastSavedLabel={lastSavedLabel}
				focusMode={focusMode}
				onToggleFocusMode={toggleFocusMode}
				density={density}
				onToggleDensity={toggleDensity}
			/>

			{/* 编辑器内容区 */}
			<div className="flex-1 overflow-hidden min-h-0 bg-transparent">
				{/* AI 审查模式 */}
				{aiReview.isReviewing && aiReview.type === "update" ? (
					<InlineReviewRenderer
						originalContent={aiReview.originalContent}
						suggestedContent={aiReview.suggestedContent}
						onAccept={handleAcceptAIReview}
						onReject={handleRejectAIReview}
					/>
				) : isPhysicalFileVisible && previewFileName && !isMarkdownPreviewFile(previewFileName) ? (
					/* 非 markdown 物理文件：直接从 store 取内容渲染，完全跳过本地 state 同步链 */
					<PhysicalFileViewer
						fileName={previewFileName}
						content={activeDocCacheContent ?? storeEditorContent}
						filePath={activeFileSession?.path}
						density={density}
						onContextMenu={handlePreviewContextMenu}
					/>
				) : (
					<EditorWorkspaceView
						editorMode={editorMode}
						selectedTitle={currentEditorTitle}
						previewFileName={previewFileName}
						titleEditable={Boolean(selectedOutput)}
						editorContent={editorContent}
						onTitleChange={handleTitleChange}
						onContentChange={handleEditorContentChange}
						onEditorBlur={handleEditorBlur}
						onTextareaScroll={handleTextareaScroll}
						onPreviewScroll={handlePreviewScroll}
						onTextareaContextMenu={handleTextareaContextMenu}
						onPreviewContextMenu={handlePreviewContextMenu}
						textareaRef={textareaRef}
						editContainerRef={editContainerRef}
						previewContainerRef={previewContainerRef}
						density={density}
						filePath={isPhysicalFileVisible ? activeFileSession?.path : undefined}
					/>
				)}
			</div>

			<EditorStatusBar
				editorContentLength={editorContent.length}
				isSaving={isSaving}
				hasUnsavedChanges={hasUnsavedChanges}
				lastSavedLabel={lastSavedLabel}
			/>
		</div>
	);

	return (
		<main className="flex-1 flex flex-col h-full relative overflow-hidden bg-transparent">
			{activeDiffTab?.diffId ? (
				<DiffViewer
					diffId={activeDiffTab.diffId}
					onClose={() => closeTab(activeDiffTab.id)}
				/>
			) : activeSourceTab && activeSourceData ? (
				<SourceReadView
					title={activeSourceData.title}
					note={activeSourceData.note}
					onClose={() => closeTab(activeSourceTab.id)}
				/>
			) : !selectedOutput && !isPhysicalFileVisible ? (
				renderDocumentList()
			) : (
				renderEditor()
			)}

			<EditorDialogs
				showBulkDeleteConfirm={showBulkDeleteConfirm}
				selectedForManageCount={selectedForManage.length}
				isBulkDeleting={isBulkDeleting}
				onCloseBulkDeleteConfirm={() => setShowBulkDeleteConfirm(false)}
				onConfirmBulkDelete={handleBulkDelete}
				deleteConfirm={deleteConfirm}
				onCloseDeleteConfirm={() => setDeleteConfirm(null)}
				onConfirmDelete={handleConfirmDelete}
			/>

			{/* 右键菜单 */}
			{contextMenu && contextMenuItems.length > 0 && (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={contextMenuItems}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</main>
	);
}
