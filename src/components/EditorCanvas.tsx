// 编辑器画布 - 现代化所见即所得编辑器

import {
	Bold,
	Check,
	CheckCircle2,
	ChevronLeft,
	Circle,
	Clock,
	Code,
	Columns,
	Copy,
	Download,
	Edit3,
	Eye,
	FileText,
	Heading1,
	Home,
	Image,
	Italic,
	LayoutGrid,
	LayoutList,
	LayoutTemplate,
	Link,
	List,
	Loader2,
	MoreHorizontal,
	Plus,
	Quote,
	Save,
	Sparkles,
	Trash2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAISuggestion } from "../hooks/useAISuggestion";
import {
	createOutputAsset,
	deleteOutputAsset,
	generateImageForText,
	listOutputAssets,
	updateOutputAsset,
} from "../lib/api";
import { EVENTS, events } from "../lib/events";
import { useWorkspaceStore, workspaceStore } from "../lib/workspaceStore";
import { type OutputAsset, OutputType } from "../types";
import AIContentSuggest from "./AIContentSuggest";
import DiffView from "./DiffView";
import DocCreationProposal from "./DocCreationProposal";
import DocumentTabs from "./DocumentTabs";
import InlineReviewRenderer from "./InlineReviewRenderer";
import SourceReadView from "./SourceReadView";
import { ContextMenu, type ContextMenuItem } from "./ui/ContextMenu";
import { MarkdownRenderer } from "./ui/MarkdownRenderer";

interface EditorCanvasProps {
	onBack?: () => void;
	projectId?: string;
	initialDocId?: string;
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
	const [showMoreMenu, setShowMoreMenu] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState<OutputAsset | null>(null);
	// 编辑模式: 'edit' = 纯编辑, 'preview' = 纯预览, 'split' = 分屏实时预览
	const [editorMode, setEditorMode] = useState<"edit" | "preview" | "split">(
		"split",
	);
	const [showTemplates, setShowTemplates] = useState(false);
	const [isManaging, setIsManaging] = useState(false);
	const [selectedForManage, setSelectedForManage] = useState<string[]>([]);
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
	// 右键菜单状态
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		selectedText: string;
	} | null>(null);
	const [isGeneratingImage, setIsGeneratingImage] = useState(false);

	// AI 建议管理
	const {
		pendingSuggestion,
		hasPendingSuggestion,
		addSuggestion,
		acceptSuggestion,
		rejectSuggestion,
	} = useAISuggestion();

	// 工作区状态管理（不传 selector，保持与 store 定义一致，避免类型报错）
	const {
		openedDocs,
		activeDocId,
		docCache,
		tabs,
		activeTabId,
		sourceReadCache,
		closeTab,
		closeDoc,
		openDoc,
		updateDocCache,
		markDocSaved,
		aiReview,
		startAIReview,
		acceptAIReview,
		rejectAIReview,
	} = useWorkspaceStore();

	const activeDocCacheContent = activeDocId
		? docCache[activeDocId]?.content
		: undefined;

	// 检查是否有激活的资料阅读标签页
	const activeSourceTab = tabs.find(
		(t) => t.id === activeTabId && t.type === "source",
	);
	const activeSourceData = activeSourceTab?.sourceId
		? sourceReadCache[activeSourceTab.sourceId]
		: null;

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const titleSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const isSavingRef = useRef(false); // 防止并发保存
	const selectedOutputRef = useRef<OutputAsset | null>(null);
	const editorContentRef = useRef<string>("");
	const lastSavedContentRef = useRef<string>("");
	const lastSavedDocIdRef = useRef<string | null>(null); // 追踪上次保存的文档 ID
	const pendingTitleRef = useRef<{ id: string; title: string } | null>(null);
	const hasUnsavedChanges = useMemo(() => {
		if (!selectedOutput) return false;
		// 优先使用 lastSavedContentRef，如果为空则回退到 selectedOutput.content
		const savedContent = lastSavedContentRef.current || selectedOutput.content;
		return editorContent !== savedContent;
	}, [editorContent, selectedOutput, lastSavedAt]);

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
		} else {
			lastSavedDocIdRef.current = null;
			lastSavedContentRef.current = "";
			setLastSavedAt(null);
		}
	}, [selectedOutput?.id]); // 只监听 id 变化

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
				console.log(
					"[EditorCanvas] fetchOutputs called, preferredId:",
					preferredId,
					"options:",
					options,
				);
				const data = await listOutputAssets();
				console.log(
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
				console.log(
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
					setEditorContent("");
				}

				if (currentSelectedInProject) {
					// 当前选中的文档属于这个项目，确保它在列表中
					const existsInFiltered = filtered.some(
						(d) => d.id === currentSelectedInProject.id,
					);
					if (!existsInFiltered) {
						console.log(
							"[EditorCanvas] 当前文档不在列表中，添加到列表:",
							currentSelectedInProject.id,
						);
						filtered.unshift(currentSelectedInProject);
					}
				}

				setOutputs(filtered);

				if (filtered.length === 0) {
					setSelectedOutput(null);
					setEditorContent("");
					return;
				}

				if (options?.skipAutoSelect) {
					console.log("[EditorCanvas] skip auto select, keep current view");
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
					console.log(
						"[EditorCanvas] selecting targetDoc:",
						targetDoc.id,
						"content length:",
						targetDoc.content.length,
					);
					setSelectedOutput(targetDoc);
					setEditorContent(targetDoc.content);
					// 同步到多标签工作区
					openDoc(targetDoc.id, targetDoc.title, targetDoc.content);
					return;
				}

				// 如果已经有选中的文档，不要覆盖
				if (currentSelectedInProject) {
					console.log(
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

				// 默认不自动打开任一文档：保持文档列表视图，让用户手动选择
				console.log("[EditorCanvas] no auto select fallback; show list view");
				setSelectedOutput(null);
				setEditorContent("");
			} catch (error) {
				console.error("[EditorCanvas] 获取文档失败:", error);
			}
		},
		[projectId, initialDocId, openDoc],
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

		if (!currentOutput) {
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
	}, [markDocSaved, updateDocCache]);

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
		if (selectedOutput?.id === activeDocId) return;

		// 从 outputs 列表中查找目标文档
		const targetDoc = outputs.find((o) => o.id === activeDocId);
		if (targetDoc) {
			console.log("[EditorCanvas] 标签栏切换文档:", activeDocId);
			// 先保存当前文档
			flushPendingSaveImmediately().then(() => {
				setSelectedOutput(targetDoc);
				setEditorContent(targetDoc.content);
			});
		}
	}, [activeDocId, outputs, selectedOutput?.id, flushPendingSaveImmediately]);

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

	const handleBulkDelete = useCallback(async () => {
		if (selectedForManage.length === 0 || isBulkDeleting) return;
		setIsBulkDeleting(true);
		try {
			for (const id of selectedForManage) {
				await deleteOutputAsset(id);
			}
			setOutputs((prev) =>
				prev.filter((o) => !selectedForManage.includes(o.id)),
			);
			if (selectedOutput && selectedForManage.includes(selectedOutput.id)) {
				setSelectedOutput(null);
				setEditorContent("");
			}
			setSelectedForManage([]);
			setIsManaging(false);
			setShowBulkDeleteConfirm(false);
		} catch (error) {
			console.error("[EditorCanvas] 批量删除失败", error);
			alert("批量删除失败，请稍后重试");
		} finally {
			setIsBulkDeleting(false);
		}
	}, [selectedForManage, isBulkDeleting, outputs, selectedOutput]);

	const handleSelectOutput = useCallback(
		async (output: OutputAsset | null) => {
			try {
				await flushPendingSaveImmediately();
			} catch (error) {
				console.error("[EditorCanvas] 切换文档前保存失败", error);
			}

			if (output) {
				console.log(
					"[EditorCanvas] handleSelectOutput, output.id:",
					output.id,
					"content.length:",
					output.content.length,
				);
				setSelectedOutput(output);
				setEditorContent(output.content);
				// 添加到多标签工作区
				openDoc(output.id, output.title, output.content);
			} else {
				console.log(
					"[EditorCanvas] handleSelectOutput, output is null, 重新加载列表",
				);
				setSelectedOutput(null);
				setEditorContent("");
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

		if (!selectedOutput) {
			return;
		}
		// 与 hasUnsavedChanges 保持一致：优先用 ref，回退用 selectedOutput.content
		const savedContent = lastSavedContentRef.current || selectedOutput.content;
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

	// 同步编辑器内容到 workspaceStore
	useEffect(() => {
		if (workspaceStore.getState().editorContent !== editorContent) {
			workspaceStore.setEditorContent(editorContent);
		}

		if (!activeDocId) return;
		if (activeDocCacheContent === editorContent) return;

		updateDocCache(activeDocId, editorContent);
	}, [editorContent, activeDocId, activeDocCacheContent, updateDocCache]);

	// AI 协议事件监听
	useEffect(() => {
		console.log("[EditorCanvas] 注册 AI 事件监听, activeDocId:", activeDocId);

		const unsubscribeUpdateEnd = events.on(
			EVENTS.AI_DOC_UPDATE_END,
			(data: any) => {
				console.log("[EditorCanvas] 收到 AI_DOC_UPDATE_END 事件:", data);
				console.log("[EditorCanvas] activeDocId:", activeDocId);
				if (activeDocId) {
					console.log("[EditorCanvas] 调用 startAIReview");
					startAIReview(
						activeDocId,
						data.originalContent,
						data.suggestedContent,
					);
				} else {
					console.warn("[EditorCanvas] activeDocId 为空，无法启动审查");
				}
			},
		);

		const unsubscribeCreateEnd = events.on(
			EVENTS.AI_DOC_CREATE_END,
			(data: any) => {
				console.log("[EditorCanvas] 收到 AI_DOC_CREATE_END 事件:", data);
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
						setEditorContent(newAsset.content);
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
					setEditorContent(before + data.content + after);
				} else {
					setEditorContent((prev) => prev + "\n\n" + data.content);
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
			setEditorContent(suggestion.content);
			return;
		}

		if (!selectedOutput) {
			try {
				const newAsset = await createOutputAsset({
					title: "AI 分析报告 " + new Date().toLocaleTimeString(),
					content: "# " + suggestion.prompt + "\n\n" + suggestion.content,
					output_type: OutputType.Report,
					related_notes: [],
				});
				await fetchOutputs();
				setSelectedOutput(newAsset);
				setEditorContent(newAsset.content);
			} catch (e) {
				console.error("[EditorCanvas] 创建文档失败:", e);
			}
		} else {
			setEditorContent((prev) => prev + "\n\n" + suggestion.content);
		}
	};

	const handleRejectSuggestion = () => {
		rejectSuggestion();
	};

	const handleManualSave = useCallback(async () => {
		if (!selectedOutput) return;
		try {
			await flushPendingSaveImmediately();
		} catch (error) {
			console.error("[EditorCanvas] 手动保存失败", error);
			alert("保存失败，请稍后重试");
		}
	}, [flushPendingSaveImmediately, selectedOutput]);

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
			console.log("[EditorCanvas] 创建新文档:", { title, type, projectId });
			const newAsset = await createOutputAsset({
				title: title,
				content: initialContent,
				output_type: type,
				related_notes: [],
				project_id: projectId,
			});
			console.log("[EditorCanvas] 文档创建成功:", newAsset.id);
			console.log("[EditorCanvas] 返回的完整数据:", JSON.stringify(newAsset));

			// 确保 newAsset 有完整的数据
			const completeAsset = {
				...newAsset,
				title: newAsset.title || title,
				content: newAsset.content || initialContent,
				output_type: newAsset.output_type || type,
			};

			console.log("[EditorCanvas] 设置 selectedOutput:", completeAsset.id);
			setOutputs((prev) => {
				console.log("[EditorCanvas] 更新 outputs, 之前数量:", prev.length);
				return [completeAsset, ...prev];
			});
			setSelectedOutput(completeAsset);
			setEditorContent(initialContent);
			setShowTemplates(false);
			console.log("[EditorCanvas] 状态更新完成");
		} catch (error) {
			console.error("[EditorCanvas] 创建文档失败:", error);
			alert("创建文档失败，请重试");
		}
	};

	const templates = [
		{
			title: "空白文档",
			icon: FileText,
			color: "from-zinc-400 to-zinc-500",
			content: "",
		},
		{
			title: "日报",
			icon: LayoutTemplate,
			color: "from-blue-400 to-blue-600",
			content:
				"# 今日工作日报\n\n## ✅ 已完成工作\n- \n\n## 🚧 进行中工作\n- \n\n## 📅 明日计划\n- ",
		},
		{
			title: "会议纪要",
			icon: LayoutTemplate,
			color: "from-zinc-500 to-zinc-700",
			content:
				"# 会议纪要\n\n**时间**：\n**参会人**：\n\n## 📝 会议内容\n\n## ⚡️ 待办事项\n- [ ] ",
		},
		{
			title: "研究报告",
			icon: LayoutTemplate,
			color: "from-orange-400 to-orange-600",
			content:
				"# 研究报告\n\n## 摘要\n\n## 背景\n\n## 研究方法\n\n## 发现\n\n## 结论\n",
		},
	];

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
			setEditorContent(newContent);

			setTimeout(() => {
				textarea.focus();
				textarea.setSelectionRange(start + prefix.length, end + prefix.length);
			}, 0);
		},
		[editorContent],
	);

	// 右键菜单处理
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
					selectedText: selectedText.trim(),
				});
			}
		},
		[],
	);

	// AI 生成配图
	const handleGenerateImage = useCallback(async () => {
		if (!contextMenu?.selectedText) return;

		setIsGeneratingImage(true);
		setContextMenu(null);

		try {
			// 使用配置服务生成图像
			const result = await generateImageForText({
				text: contextMenu.selectedText,
			});

			if (result.images.length > 0) {
				const imageUrl = result.images[0].url || result.images[0].base64;
				if (imageUrl) {
					// 在选中文字后插入图片 Markdown
					const textarea = textareaRef.current;
					if (textarea) {
						const end = textarea.selectionEnd;
						const text = editorContent;
						const before = text.substring(0, end);
						const after = text.substring(end);
						const imageMarkdown = result.images[0].base64
							? `\n\n![AI 配图](data:image/png;base64,${result.images[0].base64})\n`
							: `\n\n![AI 配图](${imageUrl})\n`;
						const newContent = before + imageMarkdown + after;
						setEditorContent(newContent);
					}
				}
			}
		} catch (error) {
			console.error("生成配图失败:", error);
			// TODO: 添加 toast 通知显示错误消息
		} finally {
			setIsGeneratingImage(false);
		}
	}, [contextMenu, editorContent]);

	// 右键菜单项
	const contextMenuItems: ContextMenuItem[] = useMemo(() => {
		const items: ContextMenuItem[] = [];

		if (contextMenu?.selectedText) {
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
					if (contextMenu?.selectedText) {
						navigator.clipboard.writeText(contextMenu.selectedText);
						setContextMenu(null);
					}
				},
			});
		}

		return items;
	}, [contextMenu, isGeneratingImage, handleGenerateImage]);

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
			setEditorContent(newAsset.content);
		} catch (error) {
			console.error("创建文档失败:", error);
		}
	}, [projectId, openDoc]);

	// 关闭文档处理
	const handleCloseDoc = useCallback(
		(docId: string, dirty: boolean) => {
			if (dirty) {
				// 显示保存确认对话框
				const confirmed = window.confirm("文档有未保存的修改，确定要关闭吗？");
				if (!confirmed) return;
			}

			closeDoc(docId);

			// 如果关闭的是当前选中的文档，切换到其他文档或空状态
			if (selectedOutput?.id === docId) {
				if (openedDocs.length > 1) {
					const remainingDocs = openedDocs.filter((id) => id !== docId);
					const nextDocId = remainingDocs[remainingDocs.length - 1];
					const nextDoc = outputs.find((o) => o.id === nextDocId);
					if (nextDoc) {
						setSelectedOutput(nextDoc);
						setEditorContent(nextDoc.content);
					}
				} else {
					setSelectedOutput(null);
					setEditorContent("");
				}
			}
		},
		[closeDoc, selectedOutput, openedDocs, outputs],
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
			setEditorContent(aiReview.suggestedContent);

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
			setEditorContent(newAsset.content);

			// 清除 AI 审查状态
			acceptAIReview();
		} catch (error) {
			console.error("创建文档失败:", error);
		}
	}, [aiReview, projectId, openDoc, acceptAIReview]);

	// 空状态 - 文档列表
	const renderEmptyState = () => (
		<div className="flex flex-col h-full">
			{/* 批量删除确认对话框 */}
			{showBulkDeleteConfirm && (
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200">
						<h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100 mb-2">
							确认批量删除
						</h3>
						<p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
							确定要删除选中的 {selectedForManage.length}{" "}
							篇文档吗？此操作无法撤销。
						</p>
						<div className="flex justify-end gap-2">
							<button
								onClick={() => setShowBulkDeleteConfirm(false)}
								className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
							>
								取消
							</button>
							<button
								onClick={handleBulkDelete}
								disabled={isBulkDeleting}
								className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
							>
								{isBulkDeleting ? "删除中…" : "确认删除"}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Header */}
			<div className="px-6 py-5 shrink-0 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
				<div className="flex items-center gap-3">
					{onBack && (
						<button
							onClick={onBack}
							className="p-2 -ml-2 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
							title="返回首页"
						>
							<Home className="w-5 h-5" />
						</button>
					)}
					<h2 className="font-bold text-xl text-zinc-800 dark:text-zinc-100">
						文档
					</h2>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
						className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
						title={viewMode === "grid" ? "切换到列表视图" : "切换到卡片视图"}
					>
						{viewMode === "grid" ? (
							<LayoutList className="w-5 h-5" />
						) : (
							<LayoutGrid className="w-5 h-5" />
						)}
					</button>
					<button
						onClick={() => {
							setIsManaging((prev) => {
								if (prev) {
									setSelectedForManage([]);
								}
								return !prev;
							});
						}}
						className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${isManaging
							? "border-black bg-black text-white dark:border-white dark:bg-white/10 dark:text-white"
							: "border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300"
							}`}
					>
						{isManaging ? "完成" : "管理"}
					</button>
					<button
						onClick={() => {
							console.log("[EditorCanvas] 点击新建按钮");
							handleCreateNew(OutputType.Article, "未命名文档", "");
						}}
						className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
					>
						<Plus className="w-4 h-4" />
						新建
					</button>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide">
				{isManaging && outputs.length > 0 && (
					<div className="flex items-center justify-between mb-4 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl text-sm text-zinc-500">
						<div className="flex items-center gap-3">
							<button
								onClick={handleToggleSelectAll}
								className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300"
							>
								{isAllSelected ? (
									<CheckCircle2 className="w-4 h-4" />
								) : (
									<Circle className="w-4 h-4" />
								)}
								{isAllSelected ? "取消全选" : "全选"}
							</button>
							<span>已选择 {selectedForManage.length} 篇</span>
						</div>
						<div className="flex items-center gap-2">
							<button
								onClick={() => setShowBulkDeleteConfirm(true)}
								disabled={selectedForManage.length === 0 || isBulkDeleting}
								className="px-3 py-1.5 rounded-xl text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 text-sm"
							>
								批量删除
							</button>
						</div>
					</div>
				)}
				{outputs.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full text-center">
						<div className="w-20 h-20 bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700 rounded-3xl flex items-center justify-center mb-6">
							<FileText className="w-10 h-10 text-zinc-400" />
						</div>
						<h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 mb-2">
							开始创作
						</h3>
						<p className="text-sm text-zinc-400 max-w-[240px] mb-6">
							创建你的第一个文档，或让 AI 助手帮你生成内容
						</p>
						<button
							onClick={() => {
								console.log("[EditorCanvas] 点击空状态新建按钮");
								handleCreateNew(OutputType.Article, "未命名文档", "");
							}}
							className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-medium transition-colors shadow-sm"
						>
							<Plus className="w-4 h-4" />
							新建文档
						</button>
					</div>
				) : (
					<div
						className={
							viewMode === "grid"
								? "grid grid-cols-2 lg:grid-cols-3 gap-4"
								: "flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800"
						}
					>
						{outputs.map((output) => {
							const checked = isSelectedForManage(output.id);
							const cardCommon =
								"relative bg-white dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/50 rounded-2xl hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-600 transition-all";
							if (viewMode === "list") {
								return (
									<div
										key={output.id}
										className={`${cardCommon} flex items-center justify-between p-4 mb-3 last:mb-0`}
									>
										<div className="flex items-center gap-4">
											{isManaging && (
												<button
													onClick={() => toggleManageSelection(output.id)}
													className="p-1"
												>
													{checked ? (
														<CheckCircle2 className="w-5 h-5 text-black dark:text-white" />
													) : (
														<Circle className="w-5 h-5 text-zinc-400" />
													)}
												</button>
											)}
											<div
												onClick={() =>
													!isManaging && handleSelectOutput(output)
												}
												className="cursor-pointer"
											>
												<p className="font-semibold text-zinc-800 dark:text-zinc-100">
													{output.title || "无标题文档"}
												</p>
												<p className="text-sm text-zinc-400 flex items-center gap-2">
													<Clock className="w-3 h-3" />
													{new Date(output.updated_at).toLocaleDateString(
														"zh-CN",
														{ month: "short", day: "numeric" },
													)}
												</p>
											</div>
										</div>
										<span className="text-xs px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-500">
											{output.output_type || "Article"}
										</span>
									</div>
								);
							}

							return (
								<div
									key={output.id}
									className={`${cardCommon} p-5 flex flex-col h-44`}
								>
									{isManaging && (
										<button
											onClick={() => toggleManageSelection(output.id)}
											className="absolute top-3 left-3"
										>
											{checked ? (
												<CheckCircle2 className="w-5 h-5 text-black dark:text-white" />
											) : (
												<Circle className="w-5 h-5 text-zinc-300" />
											)}
										</button>
									)}
									<button
										onClick={() => !isManaging && handleSelectOutput(output)}
										className="text-left flex-1"
									>
										<div className="flex items-start justify-between mb-3">
											<div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors">
												<FileText className="w-5 h-5" />
											</div>
											<span className="text-[10px] font-medium px-2 py-1 bg-zinc-100 dark:bg-zinc-700 rounded-lg text-zinc-500">
												{output.output_type || "Article"}
											</span>
										</div>
										<h4 className="font-semibold text-zinc-800 dark:text-zinc-100 line-clamp-2 mb-auto leading-snug">
											{output.title || "无标题文档"}
										</h4>
										<div className="flex items-center gap-2 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-700/50 text-xs text-zinc-400">
											<Clock className="w-3 h-3" />
											{new Date(output.updated_at).toLocaleDateString("zh-CN", {
												month: "short",
												day: "numeric",
											})}
										</div>
									</button>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* 模板选择弹窗 */}
			{showTemplates && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-6 max-w-lg w-full mx-4 animate-in fade-in zoom-in-95 duration-200">
						<div className="flex items-center justify-between mb-6">
							<h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100">
								选择模板
							</h3>
							<button
								onClick={() => setShowTemplates(false)}
								className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
							>
								<X className="w-5 h-5" />
							</button>
						</div>
						<div className="grid grid-cols-2 gap-3">
							{templates.map((tpl, idx) => (
								<button
									key={idx}
									onClick={() =>
										handleCreateNew(
											OutputType.Article,
											tpl.title === "空白文档" ? "未命名文档" : tpl.title,
											tpl.content,
										)
									}
									className="flex flex-col items-start gap-3 p-4 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-2xl text-left transition-colors group"
								>
									<div
										className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tpl.color} flex items-center justify-center text-white`}
									>
										<tpl.icon className="w-5 h-5" />
									</div>
									<span className="font-medium text-sm text-zinc-700 dark:text-zinc-200 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">
										{tpl.title}
									</span>
								</button>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	);

	// 编辑器视图
	const renderEditor = () => (
		<div className="flex flex-col h-full bg-[#F7F7F5] dark:bg-[#0F0F10]">
			{/* 文档标签栏 */}
			<DocumentTabs onNewDoc={handleNewDoc} onCloseDoc={handleCloseDoc} />

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

			{/* 删除确认对话框 */}
			{deleteConfirm && (
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl p-6 max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-200">
						<h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100 mb-2">
							确认删除
						</h3>
						<p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
							确定要删除「{deleteConfirm.title || "未命名文档"}
							」吗？此操作无法撤销。
						</p>
						<div className="flex justify-end gap-2">
							<button
								onClick={() => setDeleteConfirm(null)}
								className="px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
							>
								取消
							</button>
							<button
								onClick={() => {
									deleteOutputAsset(deleteConfirm.id)
										.then(() => {
											setSelectedOutput(null);
											setOutputs((prev) =>
												prev.filter((o) => o.id !== deleteConfirm.id),
											);
											setDeleteConfirm(null);
										})
										.catch((err) => console.error("删除失败:", err));
								}}
								className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
							>
								删除
							</button>
						</div>
					</div>
				</div>
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

			{/* 顶部 Header */}
			<header className="flex items-center justify-between px-4 py-3 border-b border-black/[0.03] dark:border-white/[0.05] bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm shrink-0 z-40 relative">
				{/* 左侧：返回 */}
				<div className="flex items-center gap-2 w-1/4">
					<button
						onClick={() => void handleSelectOutput(null)}
						className="p-2 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
						title="返回列表"
					>
						<ChevronLeft className="w-5 h-5" />
					</button>
				</div>

				{/* 中间：格式工具栏 (仅在编辑和分屏模式显示) */}
				<div className="flex items-center justify-center flex-1 overflow-x-auto scrollbar-hide">
					{editorMode !== "preview" && (
						<div className="flex items-center gap-0.5 px-2 py-1 bg-zinc-100/50 dark:bg-zinc-800/50 rounded-lg">
							<button
								onClick={() => insertMarkdown("**", "**")}
								className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
								title="粗体"
							>
								<Bold className="w-3.5 h-3.5" />
							</button>
							<button
								onClick={() => insertMarkdown("*", "*")}
								className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
								title="斜体"
							>
								<Italic className="w-3.5 h-3.5" />
							</button>

							<div className="w-px h-3.5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

							<button
								onClick={() => insertMarkdown("# ")}
								className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
								title="标题"
							>
								<Heading1 className="w-3.5 h-3.5" />
							</button>
							<button
								onClick={() => insertMarkdown("- ")}
								className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
								title="列表"
							>
								<List className="w-3.5 h-3.5" />
							</button>
							<button
								onClick={() => insertMarkdown("> ")}
								className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
								title="引用"
							>
								<Quote className="w-3.5 h-3.5" />
							</button>

							<div className="w-px h-3.5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

							<button
								onClick={() => insertMarkdown("[", "](url)")}
								className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
								title="链接"
							>
								<Link className="w-3.5 h-3.5" />
							</button>
							<button
								onClick={() => insertMarkdown("```\n", "\n```")}
								className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-700 rounded transition-all"
								title="代码"
							>
								<Code className="w-3.5 h-3.5" />
							</button>

							<div className="w-px h-3.5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />

							<button
								onClick={() =>
									events.emit(EVENTS.AI_REQUEST, {
										type: "improve",
										content: editorContent,
									})
								}
								className="p-1.5 text-zinc-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-all"
								title="AI 润色"
							>
								<Sparkles className="w-3.5 h-3.5" />
							</button>
						</div>
					)}
				</div>

				{/* 右侧：功能区 */}
				<div className="flex items-center justify-end gap-1 shrink-0">
					{/* 模式切换按钮组 */}
					<div className="flex items-center bg-zinc-100/50 dark:bg-zinc-800/50 rounded-md p-0.5">
						<button
							onClick={() => setEditorMode("edit")}
							className={`p-1 rounded transition-all ${editorMode === "edit"
								? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
								}`}
							title="编辑"
						>
							<Edit3 className="w-3.5 h-3.5" />
						</button>
						<button
							onClick={() => setEditorMode("split")}
							className={`p-1 rounded transition-all ${editorMode === "split"
								? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
								}`}
							title="分屏"
						>
							<Columns className="w-3.5 h-3.5" />
						</button>
						<button
							onClick={() => setEditorMode("preview")}
							className={`p-1 rounded transition-all ${editorMode === "preview"
								? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
								: "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
								}`}
							title="预览"
						>
							<Eye className="w-3.5 h-3.5" />
						</button>
					</div>

					<div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-700" />

					<button
						onClick={handleManualSave}
						disabled={!selectedOutput || isSaving || !hasUnsavedChanges}
						className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${hasUnsavedChanges
							? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-200"
							: "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
							} ${isSaving ? "pointer-events-none" : ""}`}
						title={
							isSaving
								? "正在保存到本地数据库"
								: hasUnsavedChanges
									? "保存当前更改"
									: lastSavedLabel
										? `所有更改已保存 · ${lastSavedLabel}`
										: "所有更改已保存"
						}
					>
						{isSaving ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : hasUnsavedChanges ? (
							<Save className="w-3.5 h-3.5" />
						) : (
							<Check className="w-3.5 h-3.5" />
						)}
						<span>
							{isSaving
								? "保存中…"
								: hasUnsavedChanges
									? "保存"
									: lastSavedLabel
										? `已保存 · ${lastSavedLabel}`
										: "已保存"}
						</span>
					</button>

					<div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-700" />

					<button
						onClick={() => {
							if (!selectedOutput) return;
							const text = `# ${selectedOutput.title}\n\n${editorContent}`;
							navigator.clipboard.writeText(text).then(() => {
								// toast
							});
						}}
						className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
						title="复制"
					>
						<Copy className="w-3.5 h-3.5" />
					</button>

					<div className="relative">
						<button
							onClick={() => setShowMoreMenu(!showMoreMenu)}
							className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all"
							title="更多操作"
						>
							<MoreHorizontal className="w-4 h-4" />
						</button>
						{showMoreMenu && (
							<>
								<div
									className="fixed inset-0 z-40"
									onClick={() => setShowMoreMenu(false)}
								/>
								<div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 py-2 z-50">
									<button
										onClick={() => {
											if (!selectedOutput) return;
											const text = `# ${selectedOutput.title}\n\n${editorContent}`;
											const blob = new Blob([text], { type: "text/markdown" });
											const url = URL.createObjectURL(blob);
											const a = document.createElement("a");
											a.href = url;
											a.download = `${selectedOutput.title || "未命名"}.md`;
											a.click();
											URL.revokeObjectURL(url);
											setShowMoreMenu(false);
										}}
										className="w-full px-4 py-2 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 flex items-center gap-2"
									>
										<Download className="w-4 h-4" />
										导出 Markdown
									</button>
									<div className="my-1 border-t border-zinc-100 dark:border-zinc-700/50" />
									<button
										onClick={() => {
											if (!selectedOutput) return;
											setDeleteConfirm(selectedOutput);
											setShowMoreMenu(false);
										}}
										className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
									>
										<Trash2 className="w-4 h-4" />
										删除文档
									</button>
								</div>
							</>
						)}
					</div>
				</div>
			</header>

			{/* 编辑器内容区 */}
			<div className="flex-1 overflow-hidden min-h-0 bg-white dark:bg-[#1A1A1A]">
				{/* AI 审查模式 */}
				{aiReview.isReviewing && aiReview.type === "update" ? (
					<InlineReviewRenderer
						originalContent={aiReview.originalContent}
						suggestedContent={aiReview.suggestedContent}
						onAccept={handleAcceptAIReview}
						onReject={handleRejectAIReview}
					/>
				) : editorMode === "split" ? (
					/* 分屏模式: 左边编辑，右边实时预览 */
					<div className="flex h-full">
						{/* 左侧编辑区 */}
						<div
							ref={editContainerRef}
							className="flex-1 overflow-y-auto scrollbar-hide border-r border-zinc-100 dark:border-zinc-800"
						>
							<div className="max-w-2xl mx-auto px-6 py-6">
								{/* 标题输入 */}
								<input
									type="text"
									value={selectedOutput?.title || ""}
									onChange={(e) => {
										if (!selectedOutput) return;
										const newTitle = e.target.value;
										const updated = { ...selectedOutput, title: newTitle };
										setSelectedOutput(updated);
										setOutputs((prev) =>
											prev.map((o) => (o.id === updated.id ? updated : o)),
										);
										pendingTitleRef.current = {
											id: updated.id,
											title: newTitle,
										};
										if (titleSaveTimeoutRef.current) {
											clearTimeout(titleSaveTimeoutRef.current);
										}
										titleSaveTimeoutRef.current = setTimeout(() => {
											void flushTitleSave();
										}, 800);
									}}
									className="w-full text-2xl font-semibold text-zinc-800 dark:text-zinc-50 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 border-none focus:ring-0 focus:outline-none bg-transparent p-0 mb-4 leading-tight selection:bg-amber-100 dark:selection:bg-amber-900/30"
									placeholder="无标题"
									style={{ boxShadow: "none" }}
								/>
								{/* 编辑区 */}
								<textarea
									ref={textareaRef}
									value={editorContent}
									onChange={(e) => setEditorContent(e.target.value)}
									onScroll={handleTextareaScroll}
									onContextMenu={handleTextareaContextMenu}
									className="w-full min-h-[calc(100vh-200px)] resize-none border-none outline-none focus:ring-0 focus:outline-none p-0 bg-transparent text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 selection:bg-amber-100 dark:selection:bg-amber-900/30 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 caret-zinc-700 dark:caret-zinc-300 font-mono"
									placeholder="开始写作 Markdown..."
									style={{ boxShadow: "none" }}
								/>
							</div>
						</div>

						{/* 右侧实时预览区 */}
						<div
							ref={previewContainerRef}
							onScroll={handlePreviewScroll}
							className="flex-1 overflow-y-auto scrollbar-hide bg-zinc-50/50 dark:bg-zinc-900/50"
						>
							<div className="max-w-2xl mx-auto px-6 py-6">
								{/* 预览标题 */}
								<h1 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-50 mb-4 leading-tight">
									{selectedOutput?.title || "无标题"}
								</h1>
								{/* 预览内容 */}
								<article className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-p:text-zinc-600 dark:prose-p:text-zinc-400 prose-sm">
									{editorContent ? (
										<MarkdownRenderer
											content={editorContent}
											className="text-sm leading-relaxed"
										/>
									) : (
										<p className="text-zinc-400 italic">
											在左侧输入 Markdown 内容，这里会实时预览...
										</p>
									)}
								</article>
							</div>
						</div>
					</div>
				) : (
					/* 单栏模式: 编辑或预览 */
					<div className="h-full overflow-y-auto scrollbar-hide">
						<div className="max-w-4xl mx-auto px-8 py-6">
							{/* 标题输入 */}
							<input
								type="text"
								value={selectedOutput?.title || ""}
								onChange={(e) => {
									if (!selectedOutput) return;
									const newTitle = e.target.value;
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
								}}
								className="w-full text-3xl font-semibold text-zinc-800 dark:text-zinc-50 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 border-none focus:ring-0 focus:outline-none bg-transparent p-0 mb-6 leading-tight selection:bg-amber-100 dark:selection:bg-amber-900/30"
								placeholder="无标题"
								style={{ boxShadow: "none" }}
								readOnly={editorMode === "preview"}
							/>

							{/* 内容区 */}
							{editorMode === "preview" ? (
								<article className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-p:text-zinc-600 dark:prose-p:text-zinc-400">
									<MarkdownRenderer
										content={editorContent}
										className="text-base leading-relaxed"
									/>
								</article>
							) : (
								<textarea
									ref={textareaRef}
									value={editorContent}
									onChange={(e) => setEditorContent(e.target.value)}
									onContextMenu={handleTextareaContextMenu}
									className="w-full min-h-[calc(100vh-200px)] resize-none border-none outline-none focus:ring-0 focus:outline-none p-0 bg-transparent text-base leading-relaxed text-zinc-600 dark:text-zinc-400 selection:bg-amber-100 dark:selection:bg-amber-900/30 placeholder:text-zinc-300 dark:placeholder:text-zinc-600 caret-zinc-700 dark:caret-zinc-300"
									placeholder="开始写作..."
									style={{ boxShadow: "none" }}
								/>
							)}
						</div>
					</div>
				)}
			</div>

			{/* 底部状态栏 */}
			<div className="shrink-0 px-4 py-2 border-t border-zinc-100 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm flex items-center justify-between text-xs text-zinc-400">
				<span>{editorContent.length} 字</span>
				<div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
					{isSaving ? (
						<>
							<Loader2 className="w-3 h-3 animate-spin" />
							<span>保存中…</span>
						</>
					) : hasUnsavedChanges ? (
						<>
							<span className="w-2 h-2 rounded-full bg-amber-400" />
							<span>待保存</span>
						</>
					) : (
						<>
							<Check className="w-3 h-3 text-green-500" />
							<span>
								{lastSavedLabel ? `已保存 · ${lastSavedLabel}` : "已保存"}
							</span>
						</>
					)}
				</div>
			</div>
		</div>
	);

	return (
		<main className="flex-1 flex flex-col h-full relative overflow-hidden bg-transparent">
			{activeSourceTab && activeSourceData ? (
				<SourceReadView
					title={activeSourceData.title}
					note={activeSourceData.note}
					onClose={() => closeTab(activeSourceTab.id)}
				/>
			) : !selectedOutput ? (
				renderEmptyState()
			) : (
				renderEditor()
			)}

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
