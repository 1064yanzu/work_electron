// 资料详情视图组件

import {
	ArrowDownToLine,
	ArrowLeft,
	BookOpen,
	Clock,
	Copy,
	Edit2,
	ExternalLink,
	FileEdit,
	Globe,
	Loader2,
	PenLine,
	Quote,
	Save,
	Search,
	Trash2,
	X,
} from "lucide-react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useState,
} from "react";
import { getSourceDetail, updateNote, updateSource } from "../../lib/api";
import { readerOpenFromSource } from "../../lib/api/reader";
import { EVENTS, events } from "../../lib/events";
import { openReader } from "../reader/ReaderApp";
import { invoke } from "../../lib/tauriCompat";
import {
	type ResearchSource,
	useWorkspaceStoreSelector,
	workspaceStore,
} from "../../lib/workspaceStore";
import {
	type Source,
	type SourceDetail,
	SourceOrigin,
	SourceType,
} from "../../types";
import { getSourceTypeConfig } from "../../lib/sourceTypeConfig";
import DocumentViewer, { extractDocumentInfo } from "../ui/DocumentViewer";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";
import { RichContentWithStyles } from "../ui/RichContentRenderer";
import { toast } from "../ui/Toast";
import { Tooltip } from "../ui/Tooltip";

interface SourceDetailViewProps {
	fetchSources: () => Promise<void>;
	onDeleteSource: (source: Source) => void;
}

export interface SourceDetailViewHandle {
	handleOpenDetail: (source: Source) => void;
	handleOpenResearchSource: (source: ResearchSource) => void;
	handleCloseDetail: () => void;
}

export const SourceDetailView = forwardRef<
	SourceDetailViewHandle,
	SourceDetailViewProps
>(function SourceDetailView({ fetchSources, onDeleteSource }, ref) {
	const previewSource = useWorkspaceStoreSelector(
		(state) => state.previewSource,
	);
	const setPreviewSource = workspaceStore.setPreviewSource.bind(workspaceStore);
	const openSourceInMainView =
		workspaceStore.openSourceInMainView.bind(workspaceStore);

	const [sourceDetail, setSourceDetail] = useState<SourceDetail | null>(null);
	const [isLoadingDetail, setIsLoadingDetail] = useState(false);
	const [isEditing, setIsEditing] = useState(false);
	const [editTitle, setEditTitle] = useState("");
	const [editContent, setEditContent] = useState("");
	const [editHtmlContent, setEditHtmlContent] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	// 划词引用
	const [selectionPopup, setSelectionPopup] = useState<{
		x: number;
		y: number;
		text: string;
	} | null>(null);

	// 右键菜单状态
	const [contentContextMenu, setContentContextMenu] = useState<{
		x: number;
		y: number;
	} | null>(null);

	// 关闭详情
	const handleCloseDetail = useCallback(() => {
		setPreviewSource(null);
		setSourceDetail(null);
		setSelectionPopup(null);
		setIsEditing(false);
	}, [setPreviewSource]);

	// 打开资料详情
	const handleOpenDetail = useCallback(
		async (source: Source) => {
			setPreviewSource(source);
			setIsLoadingDetail(true);
			setIsEditing(false);

			try {
				const detail = await getSourceDetail(source.id);
				setSourceDetail(detail);
				setEditTitle(source.title);
				setEditContent(detail.note?.content || "");
				setEditHtmlContent(detail.note?.content_html || "");
			} catch (error) {
				console.error("加载详情失败:", error);
				toast.error("加载详情失败，请重试");
			} finally {
				setIsLoadingDetail(false);
			}
		},
		[setPreviewSource],
	);

	// 打开研究资料详情
	const handleOpenResearchSource = useCallback(
		(source: ResearchSource) => {
			setPreviewSource(source);
		},
		[setPreviewSource],
	);

	// 暴露方法给父组件
	useImperativeHandle(
		ref,
		() => ({
			handleOpenDetail,
			handleOpenResearchSource,
			handleCloseDetail,
		}),
		[handleOpenDetail, handleOpenResearchSource, handleCloseDetail],
	);

	// 当 previewSource 改变时自动加载详情数据
	useEffect(() => {
		if (!previewSource) return;
		// 只有 Source 类型需要加载详情，ResearchSource 不需要
		if (!("kind" in previewSource)) return;
		// 如果已经有对应的详情数据，跳过
		if (
			sourceDetail &&
			"id" in previewSource &&
			sourceDetail.source?.id === previewSource.id
		)
			return;

		const source = previewSource as Source;
		setIsLoadingDetail(true);
		setIsEditing(false);

		getSourceDetail(source.id)
			.then((detail) => {
				setSourceDetail(detail);
				setEditTitle(source.title);
				setEditContent(detail.note?.content || "");
				setEditHtmlContent(detail.note?.content_html || "");
			})
			.catch((error) => {
				console.error("加载详情失败:", error);
				toast.error("加载详情失败，请重试");
			})
			.finally(() => {
				setIsLoadingDetail(false);
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [previewSource]);

	// 处理文本选择（划词引用）
	const handleTextSelection = useCallback(() => {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) {
			setSelectionPopup(null);
			return;
		}

		const text = selection.toString().trim();
		if (text.length < 2) {
			setSelectionPopup(null);
			return;
		}

		const range = selection.getRangeAt(0);
		const rect = range.getBoundingClientRect();

		setSelectionPopup({
			x: rect.left + rect.width / 2,
			y: rect.top - 10,
			text,
		});
	}, []);

	// 插入选中文本到编辑器
	const handleInsertSelection = useCallback(() => {
		if (!selectionPopup) return;

		events.emit(EVENTS.INSERT_TO_EDITOR, {
			content: `> ${selectionPopup.text}\n\n`,
			source: previewSource?.title,
		});

		window.getSelection()?.removeAllRanges();
		setSelectionPopup(null);
	}, [selectionPopup, previewSource]);

	// 保存编辑
	const handleSaveEdit = useCallback(async () => {
		if (!previewSource || !sourceDetail) return;

		try {
			setIsSaving(true);

			if (editTitle !== previewSource.title) {
				await updateSource({
					id: previewSource.id,
					title: editTitle,
				});
			}

			if (sourceDetail.note) {
				if (sourceDetail.note.content_html) {
					await updateNote({
						id: sourceDetail.note.id,
						content_html: editHtmlContent,
					});
				} else {
					await updateNote({
						id: sourceDetail.note.id,
						content: editContent,
					});
				}
			}

			const updatedDetail = await getSourceDetail(previewSource.id);
			setSourceDetail(updatedDetail);
			await fetchSources();
			setIsEditing(false);
		} catch (error) {
			console.error("保存失败:", error);
			toast.error("保存失败，请重试");
		} finally {
			setIsSaving(false);
		}
	}, [
		previewSource,
		sourceDetail,
		editTitle,
		editContent,
		editHtmlContent,
		fetchSources,
	]);

	// 复制全部内容到编辑器
	const handleCopyToEditor = useCallback(() => {
		if (!sourceDetail) return;

		let contentToInsert = "";
		if (sourceDetail.note?.content) {
			contentToInsert = sourceDetail.note.content;
		} else if (sourceDetail.note?.content_html) {
			contentToInsert = "HTML 内容暂不支持直接转换，请使用划词引用。";
		}

		events.emit(EVENTS.INSERT_TO_EDITOR, {
			content: `> ${previewSource?.title}\n\n${contentToInsert}\n\n`,
			source: previewSource?.title,
		});
	}, [sourceDetail, previewSource]);

	// 处理内容区右键菜单
	const handleContentContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		const selection = window.getSelection();
		const hasSelection =
			selection &&
			!selection.isCollapsed &&
			selection.toString().trim().length > 0;

		if (hasSelection) {
			setContentContextMenu({ x: e.clientX, y: e.clientY });
		}
	}, []);

	const getKindColor = useCallback((kind: SourceType) => {
		return getSourceTypeConfig(kind).dotColor;
	}, []);

	const getScopeLabel = useCallback((source: Source) => {
		return source.scope === "project" ? "项目内" : "全局";
	}, []);

	const handleOpenReader = useCallback(async () => {
		if (!previewSource || !("kind" in previewSource)) return;
		const source = previewSource as Source;
		try {
			const res = await readerOpenFromSource(source.id);
			if (res.book) {
				openReader(res.book.id);
				return;
			}
		} catch (e) {
			console.warn("[SourceDetail] open reader failed:", e);
			toast.error(
				`打开阅读器失败：${e instanceof Error ? e.message : String(e)}`,
			);
		}
		toast.info("该资料未关联阅读器条目，如需全屏阅读请重新导入原始文件。");
	}, [previewSource]);

	const getScopeBadgeClassName = useCallback((source: Source) => {
		return source.scope === "project"
			? "bg-warm-200/80/70 text-text-secondary"
			: "bg-indigo-50 dark:bg-indigo-900/25 text-indigo-600 dark:text-indigo-300";
	}, []);

	if (!previewSource) return null;

	const isSource = "kind" in previewSource;

	return (
		<div className="flex flex-col h-full animate-in fade-in slide-in-from-right-2 duration-200 bg-surface dark:bg-[#1E1E1E]">
			{/* 划词引用弹窗 */}
			{selectionPopup && (
				<div
					className="fixed z-50 animate-in fade-in zoom-in-95 duration-150"
					style={{
						left: selectionPopup.x,
						top: selectionPopup.y,
						transform: "translate(-50%, -100%)",
					}}
				>
					<button
						onClick={handleInsertSelection}
						className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-muted hover:bg-dark-surface text-white text-xs font-medium rounded-lg shadow-lg transition-colors"
					>
						<Quote className="w-3 h-3" />
						引用到编辑器
					</button>
				</div>
			)}

			{/* 右键菜单 */}
			{contentContextMenu && (
				<>
					<div
						className="fixed inset-0 z-40"
						onClick={() => setContentContextMenu(null)}
					/>
					<div
						className="fixed z-50 bg-cream-50 dark:bg-cream-900 rounded-2xl shadow-bai-pop border border-cream-400 dark:border-cream-500 py-1.5 min-w-[160px] animate-in fade-in zoom-in-95 duration-150"
						style={{ left: contentContextMenu.x, top: contentContextMenu.y }}
					>
						<button
							onClick={() => {
								handleInsertSelection();
								setContentContextMenu(null);
							}}
							className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-warm-200 dark:hover:bg-cream-700 flex items-center gap-2"
						>
							<Quote className="w-4 h-4" />
							引用到编辑器
						</button>
						<button
							onClick={() => {
								const selection = window.getSelection();
								if (selection) {
									navigator.clipboard.writeText(selection.toString());
								}
								setContentContextMenu(null);
							}}
							className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-warm-200 dark:hover:bg-cream-700 flex items-center gap-2"
						>
							<Copy className="w-4 h-4" />
							复制
						</button>
					</div>
				</>
			)}

			{/* Header */}
			<div className="px-4 py-3 flex items-center gap-2 border-b border-border shrink-0 bg-surface/50 backdrop-blur-sm">
				<Tooltip content="返回" placement="bottom">
					<button
						onClick={handleCloseDetail}
						className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
					>
						<ArrowLeft className="w-4 h-4" />
					</button>
				</Tooltip>

				<div className="flex-1 min-w-0">
					{isEditing ? (
						<input
							value={editTitle}
							onChange={(e) => setEditTitle(e.target.value)}
							className="w-full px-2 py-1 text-sm font-semibold bg-warm-200 rounded focus:outline-none focus:ring-2 focus:ring-zinc-200"
							placeholder="标题"
						/>
					) : (
						<h2
							className="font-semibold text-sm text-text-primary truncate"
							title={previewSource.title}
						>
							{previewSource.title}
						</h2>
					)}
				</div>

				{isSource && !isEditing && (
					<div className="flex items-center gap-1">
						<Tooltip content="编辑" placement="bottom">
							<button
								onClick={() => setIsEditing(true)}
								className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
							>
								<Edit2 className="w-4 h-4" />
							</button>
						</Tooltip>
					</div>
				)}

				{isSource && isEditing && (
					<div className="flex items-center gap-1">
						<Tooltip content="取消" placement="bottom">
							<button
								onClick={() => setIsEditing(false)}
								className="p-1.5 text-text-light hover:text-text-secondary hover:bg-warm-200 rounded-lg"
							>
								<X className="w-4 h-4" />
							</button>
						</Tooltip>
						<Tooltip content="保存" placement="bottom">
							<button
								onClick={handleSaveEdit}
								disabled={isSaving}
								className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"
							>
								{isSaving ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<Save className="w-4 h-4" />
								)}
							</button>
						</Tooltip>
					</div>
				)}
			</div>

			{/* Content */}
			<div
				className="flex-1 overflow-y-auto scrollbar-hide bg-[#FDFDFD] dark:bg-[#1E1E1E]"
				onContextMenu={handleContentContextMenu}
			>
				{isLoadingDetail ? (
					<div className="flex items-center justify-center h-48">
						<Loader2 className="w-5 h-5 animate-spin text-text-light" />
					</div>
				) : (
					<div className="p-6 space-y-6 max-w-3xl mx-auto">
						{/* Meta Info (Read Only) */}
						{!isEditing && (
							<div className="flex items-center gap-3 text-xs text-text-light flex-wrap pb-4 border-b border-border/50">
								{isSource && (
									<span
										className={`w-2 h-2 rounded-full ${getKindColor((previewSource as Source).kind)}`}
									/>
								)}
								<span className="flex items-center gap-1">
									<Clock className="w-3 h-3" />
									{isSource
										? new Date(
												(previewSource as Source).created_at,
											).toLocaleDateString("zh-CN")
										: new Date(
												(previewSource as ResearchSource).timestamp,
											).toLocaleDateString("zh-CN")}
								</span>
								{/* 来源标记 */}
								{isSource &&
									(previewSource as Source).source_type ===
										SourceOrigin.BrowserClip && (
										<span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-success/8 dark:bg-emerald-900/20 text-success dark:text-success rounded text-[10px] font-medium">
											<Globe className="w-2.5 h-2.5" />
											浏览器剪存
										</span>
									)}
								{isSource &&
									(previewSource as Source).source_type ===
										SourceOrigin.WebSearch && (
										<span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-focus/8 dark:bg-blue-900/20 text-focus dark:text-focus rounded text-[10px] font-medium">
											<Search className="w-2.5 h-2.5" />
											网络搜索
										</span>
									)}
								{isSource &&
									(previewSource as Source).source_type ===
										SourceOrigin.Import && (
										<span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-warm-200/70/60 text-text-secondary rounded text-[10px] font-medium">
											<ArrowDownToLine className="w-2.5 h-2.5" />
											本地导入
										</span>
									)}
								{isSource && (
									<span
										className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${getScopeBadgeClassName(previewSource as Source)}`}
									>
										{getScopeLabel(previewSource as Source)}
									</span>
								)}
								{isSource &&
									((previewSource as Source).tags || [])
										.slice(0, 3)
										.map((tag) => (
											<span
												key={`${previewSource.id}-detail-tag-${tag}`}
												className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-warm-200/80/70 text-text-secondary"
											>
												#{tag}
											</span>
										))}
								{isSource && (previewSource as Source).storage_path ? (
									<button
										onClick={() =>
											void navigator.clipboard.writeText(
												(previewSource as Source).storage_path!,
											)
										}
										className="inline-flex items-center gap-1 text-text-muted hover:text-text-secondary text-[11px]"
										title={(previewSource as Source).storage_path}
									>
										<Copy className="w-3 h-3" />
										复制路径
									</button>
								) : null}

								{/* URL Link */}
								{previewSource.url && (
									<button
										onClick={() =>
											invoke("open_external_url", { url: previewSource.url })
										}
										className="flex items-center gap-1.5 text-xs text-focus hover:text-focus hover:underline cursor-pointer ml-auto"
									>
										<ExternalLink className="w-3 h-3" />
										访问原文
									</button>
								)}
							</div>
						)}

						{/* Main Content */}
						<div
							className="relative min-h-[200px]"
							onMouseUp={!isEditing ? handleTextSelection : undefined}
						>
							{isEditing ? (
								<div className="space-y-4">
									{sourceDetail?.note?.content_html ? (
										// HTML 内容编辑：使用 contentEditable 富文本编辑
										<div
											contentEditable
											suppressContentEditableWarning
											onBlur={(e) =>
												setEditHtmlContent(e.currentTarget.innerHTML)
											}
											dangerouslySetInnerHTML={{ __html: editHtmlContent }}
											className="w-full min-h-[60vh] p-6 bg-surface border border-border rounded-xl text-base leading-7 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600 prose prose-zinc dark:prose-invert max-w-none overflow-auto"
										/>
									) : (
										<textarea
											value={editContent}
											onChange={(e) => setEditContent(e.target.value)}
											className="w-full h-[60vh] p-4 bg-warm-50/50 border border-border rounded-xl text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-zinc-200 resize-none font-mono"
											placeholder="输入内容..."
										/>
									)}
								</div>
							) : (
								<>
									{isSource ? (
										// 智能渲染：检测内容类型
										(() => {
											const contentHtml = sourceDetail?.note?.content_html;
											const content = sourceDetail?.note?.content;
											const isImageExtraction = contentHtml?.includes(
												'data-has-markdown="true"',
											);
											const docInfo = contentHtml
												? extractDocumentInfo(contentHtml)
												: null;

											// 文档类型：使用内嵌阅读器
											if (docInfo && docInfo.src) {
												return (
													<DocumentViewer
														src={docInfo.src}
														type={docInfo.type}
														className="min-h-[60vh]"
														onOpenReader={
															docInfo.type === "epub"
																? handleOpenReader
																: undefined
														}
													/>
												);
											}

											if (isImageExtraction && content && contentHtml) {
												// 图片抽取结果：先渲染 Markdown 内容，再显示原图
												return (
													<div className="space-y-6">
														<article className="prose prose-zinc dark:prose-invert max-w-none select-text">
															<MarkdownRenderer
																content={content}
																className="text-base leading-relaxed"
															/>
														</article>
														<RichContentWithStyles
															html={contentHtml}
															className="text-base leading-relaxed select-text"
														/>
													</div>
												);
											} else if (contentHtml) {
												// 普通富文本内容
												return (
													<RichContentWithStyles
														html={contentHtml}
														className="text-base leading-relaxed select-text prose-lg"
													/>
												);
											} else if (content) {
												// 纯 Markdown 内容
												return (
													<article className="prose prose-zinc dark:prose-invert max-w-none select-text">
														<MarkdownRenderer
															content={content}
															className="text-base leading-relaxed"
														/>
													</article>
												);
											} else {
												// 无内容
												return (
													<div className="flex flex-col items-center justify-center py-12 text-text-light">
														<FileEdit className="w-8 h-8 mb-2 opacity-50" />
														<p className="text-sm">暂无内容</p>
														<button
															onClick={() => setIsEditing(true)}
															className="mt-2 text-xs text-focus hover:underline"
														>
															开始编辑
														</button>
													</div>
												);
											}
										})()
									) : // ResearchSource
									(previewSource as ResearchSource).content ? (
										<article className="prose prose-zinc dark:prose-invert max-w-none select-text">
											<MarkdownRenderer
												content={(previewSource as ResearchSource).content!}
												className="text-base leading-relaxed"
											/>
										</article>
									) : (previewSource as ResearchSource).snippet ? (
										<p className="text-sm text-text-secondary leading-relaxed select-text">
											{(previewSource as ResearchSource).snippet}
										</p>
									) : (
										<p className="text-sm text-text-light text-center py-8">
											暂无内容
										</p>
									)}
								</>
							)}
						</div>
					</div>
				)}
			</div>

			{/* 固定底部操作栏 */}
			{!isEditing && (
				<div className="shrink-0 px-4 py-3 border-t border-border bg-surface">
					<div className="flex items-center gap-2">
						{/* 全屏阅读：reader 支持的格式（pdf/epub/mobi/azw3/txt/md/html/docx/cbz）走真正的阅读器 Overlay；其它退化为中间栏标签页 */}
						{isSource && sourceDetail && (
							<button
								onClick={async () => {
									const source = previewSource as Source;
									console.log(
										"[SourceDetail] 全屏阅读 clicked, source:",
										source.id,
										source.title,
									);
									let book: Awaited<
										ReturnType<typeof readerOpenFromSource>
									>["book"] = null;
									try {
										const res = await readerOpenFromSource(source.id);
										book = res.book;
										console.log("[SourceDetail] readerOpenFromSource ->", book);
									} catch (e) {
										console.warn("[SourceDetail] open reader failed:", e);
										toast.error(
											`打开阅读器失败：${e instanceof Error ? e.message : String(e)}`,
										);
									}
									if (book) {
										openReader(book.id);
										return;
									}
									// 阅读器没法打开（不是阅读器格式或原文件不存在），给用户一个反馈再回退
									toast.info(
										"该资料未关联阅读器条目，已切换为内嵌预览。如需全屏阅读请重新导入原始文件。",
									);
									openSourceInMainView(
										source.id,
										source.title,
										sourceDetail.note
											? {
													content: sourceDetail.note.content,
													content_html: sourceDetail.note.content_html,
												}
											: undefined,
									);
								}}
								className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-border text-text-secondary rounded-xl text-sm font-medium hover:bg-warm-50 transition-colors"
							>
								<BookOpen className="w-4 h-4" />
								全屏阅读
							</button>
						)}
						<button
							onClick={handleCopyToEditor}
							className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-dark-muted text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
						>
							<PenLine className="w-4 h-4" />
							添加到编辑器
						</button>
						{isSource && (
							<Tooltip content="删除" placement="top">
								<button
									onClick={() => onDeleteSource(previewSource as Source)}
									className="p-2.5 text-text-light hover:text-error hover:bg-[rgba(181,51,51,0.08)] dark:hover:bg-red-900/20 rounded-xl transition-colors"
								>
									<Trash2 className="w-4 h-4" />
								</button>
							</Tooltip>
						)}
					</div>
				</div>
			)}
		</div>
	);
});
