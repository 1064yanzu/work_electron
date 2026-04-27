/**
 * Wiki 知识页面视图 - 在左侧边栏中间栏展示
 *
 * 默认不建立 Wiki，只有用户主动点击「建立 Wiki」时才启用。
 * 页面中提醒用户：知识索引适合相对稳定的、静态的知识。
 */
import { useMemo, useState } from "react";
import {
	BookOpen,
	Plus,
	Search,
	X,
	RefreshCw,
	Trash2,
	Pencil,
	ChevronRight,
	ArrowLeft,
	Info,
	AlertTriangle,
	FileText,
	Clock,
	Tag,
	RotateCcw,
	ExternalLink,
	ShieldCheck,
} from "lucide-react";
import { useWiki, type WikiPageItem } from "./useWiki";
import { WikiPageEditor } from "./WikiPageEditor";
import { WikiContentRenderer } from "./WikiContentRenderer";
import { confirmDialog } from "../ui/ConfirmDialog";
import { useActiveThreadScope } from "../../lib/chat/threadScope";
import { WikiGraphPanel } from "./WikiGraphPanel";
import { WikiLintPanel } from "./WikiLintPanel";

type WikiViewMode = "list" | "detail" | "create" | "edit";

function getScopeName(scopePath: string | null): string {
	if (!scopePath) return "";
	const parts = scopePath.split(/[/\\]/).filter(Boolean);
	return parts[parts.length - 1] || scopePath;
}

/** 根据后端 phase 字段返回状态标题 */
function getPhaseLabel(phase?: string): string {
	switch (phase) {
		case "preflight":
			return "校验 LLM 配置";
		case "scanning":
			return "扫描工作目录";
		case "filtering":
			return "对比已处理文件";
		case "extracting":
			return "提取文件文本";
		case "llm":
			return "AI 生成 Wiki 页面";
		case "linking":
			return "关联相关页面";
		case "finalizing":
			return "写入索引与日志";
		default:
			return "准备中";
	}
}

/** 进度条旁单文件动词，用于「正在处理：xxx.pdf」 */
function getPhaseVerb(phase?: string): string {
	switch (phase) {
		case "extracting":
			return "正在读取";
		case "llm":
			return "正在分析";
		default:
			return "处理中";
	}
}

/** 没有 current_source_title 时的占位提示 */
function getPhaseHint(phase?: string): string {
	switch (phase) {
		case "preflight":
			return "正在校验模型与 Provider…";
		case "scanning":
			return "正在列出目录文件…";
		case "filtering":
			return "正在比对文件哈希…";
		case "extracting":
			return "准备提取文本…";
		case "llm":
			return "准备调用 LLM…";
		case "linking":
			return "整理页面关联…";
		case "finalizing":
			return "写入索引…";
		default:
			return "准备中…";
	}
}

export function WikiView() {
	const { scopePath, threadTitle } = useActiveThreadScope();

	const {
		pages,
		loading,
		isInitializing,
		enabled,
		error,
		generationProgress,
		clearGenerationProgress,
		enable,
		rebuild,
		createPage,
		updatePage,
		deletePage,
		searchPages,
		generateWiki,
		openInEditor,
		refresh,
		schemaStats,
		loadSchemaStats,
		resetSkippedSources,
		resetProcessedSources,
		lintReport,
		lintLoading,
		runLint,
		clearLintReport,
	} = useWiki(scopePath);

	const [viewMode, setViewMode] = useState<WikiViewMode>("list");
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<WikiPageItem[] | null>(
		null,
	);
	const [selectedPage, setSelectedPage] = useState<WikiPageItem | null>(null);
	const isGenerating = generationProgress?.is_generating ?? false;
	const scopeLabel = useMemo(() => {
		return threadTitle?.trim() || getScopeName(scopePath);
	}, [scopePath, threadTitle]);

	const filteredPages = useMemo(() => {
		if (!searchQuery.trim() && !searchResults) return pages;
		if (searchResults) return searchResults;
		const q = searchQuery.toLowerCase();
		return pages.filter(
			(p) =>
				p.title.toLowerCase().includes(q) ||
				p.summary.toLowerCase().includes(q) ||
				p.tags.some((t) => t.toLowerCase().includes(q)),
		);
	}, [pages, searchQuery, searchResults]);

	const handleSearch = async () => {
		if (!searchQuery.trim()) {
			setSearchResults(null);
			return;
		}
		const results = await searchPages(searchQuery);
		setSearchResults(results);
	};

	const openPage = (page: WikiPageItem) => {
		setSelectedPage(page);
		setViewMode("detail");
	};

	const handleCreatePage = async (data: {
		title: string;
		content: string;
		summary: string;
		tags: string[];
		page_type: string;
	}) => {
		const page = await createPage(data);
		if (page) {
			setViewMode("list");
		}
	};

	const handleUpdatePage = async (data: {
		title: string;
		content: string;
		summary: string;
		tags: string[];
		page_type: string;
	}) => {
		if (!selectedPage) return;
		await updatePage(selectedPage.id, data);
		setViewMode("list");
		setSelectedPage(null);
	};

	const handleDeletePage = async (page: WikiPageItem) => {
		const confirmed = await confirmDialog.show({
			title: "删除知识页面",
			message: `确定要删除「${page.title}」吗？此操作不可撤销。`,
			confirmText: "删除",
			cancelText: "取消",
			type: "danger",
		});
		if (confirmed) {
			await deletePage(page.id);
			if (selectedPage?.id === page.id) {
				setSelectedPage(null);
				setViewMode("list");
			}
		}
	};

	const handleRebuildWiki = async () => {
		const confirmed = await confirmDialog.show({
			title: "重建 Wiki 结构",
			message:
				"这会重新补齐当前线程目录下的 .llm-wiki 结构，并确保存在默认的知识地图页面。不会删除已有页面内容。",
			confirmText: "重建",
			cancelText: "取消",
			type: "warning",
		});
		if (!confirmed) return;
		await rebuild();
	};

	const handleGenerateWiki = async () => {
		const confirmed = await confirmDialog.show({
			title: "AI 生成 Wiki",
			message:
				"将直接扫描当前工作目录中的文件（PDF、Markdown、TXT、DOCX 等），使用 AI 自动提取知识点并生成 Wiki 页面。只需把文件放入目录即可，无需导入。已处理过的文件不会重复处理。",
			confirmText: "开始生成",
			cancelText: "取消",
			type: "info",
		});
		if (!confirmed) return;
		try {
			await generateWiki();
			await loadSchemaStats();
		} catch {
			// error 已在 useWiki 内部处理
		}
	};

	const handleRetrySkipped = async () => {
		const skippedCount = schemaStats?.skipped_count ?? 0;
		if (skippedCount === 0) return;
		const confirmed = await confirmDialog.show({
			title: "重试跳过的文件",
			message:
				`将清空「跳过列表」中的 ${skippedCount} 条记录，下次点击「生成 Wiki」时这些文件会被重新尝试。` +
				`如果它们仍然是扫描版 PDF 或无法提取文本，会再次被跳过。`,
			confirmText: "清空并准备重试",
			cancelText: "取消",
			type: "warning",
		});
		if (!confirmed) return;
		const cleared = await resetSkippedSources();
		if (cleared > 0) {
			clearGenerationProgress();
		}
	};

	const handleResetProcessed = async () => {
		const processedCount = schemaStats?.processed_count ?? 0;
		if (processedCount === 0) return;
		const confirmed = await confirmDialog.show({
			title: "重置已处理记录",
			message:
				`将清空「已处理」名单中的 ${processedCount} 条记录。下次点击「生成 Wiki」时所有文件都会被重新处理。` +
				`已存在的 Wiki 页面不会被删除。`,
			confirmText: "重置并准备重新生成",
			cancelText: "取消",
			type: "warning",
		});
		if (!confirmed) return;
		const cleared = await resetProcessedSources();
		if (cleared > 0) {
			clearGenerationProgress();
		}
	};

	const formatDate = (ts: number) => {
		const d = new Date(ts);
		const now = new Date();
		const diff = now.getTime() - d.getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return "刚刚";
		if (mins < 60) return `${mins} 分钟前`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours} 小时前`;
		const days = Math.floor(hours / 24);
		if (days < 30) return `${days} 天前`;
		return d.toLocaleDateString("zh-CN");
	};

	// --- 未进入线程工作目录 ---
	if (!scopePath) {
		return (
			<div className="flex flex-col h-full">
				<div className="flex-1 flex flex-col items-center justify-center px-6">
					<div className="w-16 h-16 rounded-2xl bg-warm-200/80/80 flex items-center justify-center mb-5">
						<BookOpen className="w-8 h-8 text-text-light" />
					</div>
					<h3 className="text-base font-semibold text-text-primary mb-2">
						暂无线程工作目录
					</h3>
					<p className="text-sm text-text-muted text-center leading-relaxed max-w-[260px]">
						Wiki
						跟随当前线程的工作目录。请先在线程列表中选择一个线程，再整理该目录下的结构化知识。
					</p>
				</div>
			</div>
		);
	}

	// --- Wiki 尚未启用的空状态 ---
	if (enabled === false) {
		return (
			<div className="flex flex-col h-full">
				<div className="flex-1 flex flex-col items-center justify-center px-6">
					<div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
						<BookOpen className="w-8 h-8 text-primary" />
					</div>
					<h3 className="text-base font-semibold text-text-primary mb-2">
						知识 Wiki
					</h3>
					<p className="text-sm text-text-muted text-center leading-relaxed mb-6 max-w-[260px]">
						将当前线程工作目录中的稳定知识整理为结构化索引，方便快速查阅和积累。
					</p>
					{scopeLabel ? (
						<div className="mb-4 text-xs text-text-light">
							当前目录：{scopeLabel}
						</div>
					) : null}

					{/* 提醒 */}
					<div className="w-full max-w-[280px] rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 p-3.5 mb-6">
						<div className="flex items-start gap-2">
							<Info className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
							<div className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
								知识 Wiki 适合整理<strong>相对稳定的、静态的知识</strong>
								，如概念解释、技术原理、方法论等。不太适合动态性较高、频繁变化的文件内容。
							</div>
						</div>
					</div>

					<button
						onClick={enable}
						className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-xl shadow-sm transition-all duration-200 hover:shadow-md"
					>
						<BookOpen className="w-4 h-4" />
						建立 Wiki
					</button>
				</div>
			</div>
		);
	}

	// --- 加载中 ---
	if (enabled === null) {
		return (
			<div className="flex flex-col h-full items-center justify-center">
				<RefreshCw className="w-5 h-5 text-text-light animate-spin" />
			</div>
		);
	}

	// --- 页面详情 ---
	if (viewMode === "detail" && selectedPage) {
		return (
			<div className="flex flex-col h-full">
				{/* Header */}
				<div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-border">
					<div className="flex items-center gap-2">
						<button
							onClick={() => {
								setViewMode("list");
								setSelectedPage(null);
							}}
							className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
						>
							<ArrowLeft className="w-4 h-4" />
						</button>
						<FileText className="w-4 h-4 text-primary" />
						<h2 className="font-semibold text-sm text-text-primary truncate max-w-[180px]">
							{selectedPage.title}
						</h2>
					</div>
					<div className="flex items-center gap-1">
						<button
							onClick={() => openInEditor(selectedPage.id, selectedPage.title)}
							className="p-1.5 text-text-light hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
							title="在文档编辑器中打开（支持分屏预览、语法高亮、完整 Markdown 编辑）"
						>
							<ExternalLink className="w-4 h-4" />
						</button>
						<button
							onClick={() => setViewMode("edit")}
							className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
							title="快速编辑"
						>
							<Pencil className="w-4 h-4" />
						</button>
						<button
							onClick={() => handleDeletePage(selectedPage)}
							className="p-1.5 text-text-light hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
							title="删除"
						>
							<Trash2 className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto p-4">
					{selectedPage.page_type && selectedPage.page_type !== "entity" && (
						<div className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-warm-200 text-text-muted rounded-md mb-3 uppercase tracking-wider">
							{selectedPage.page_type}
						</div>
					)}
					{selectedPage.summary && (
						<p className="text-sm text-text-muted mb-4 italic">
							{selectedPage.summary}
						</p>
					)}
					{selectedPage.tags.length > 0 && (
						<div className="flex flex-wrap gap-1.5 mb-4">
							{selectedPage.tags.map((tag) => (
								<span
									key={tag}
									className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-primary/8 text-primary/80 rounded-md"
								>
									<Tag className="w-2.5 h-2.5" />
									{tag}
								</span>
							))}
						</div>
					)}
					<WikiContentRenderer
						content={selectedPage.content || "（暂无内容）"}
						pages={pages}
						onNavigate={openPage}
					/>
					<div className="mt-6 flex items-center gap-3 text-[11px] text-text-light">
						<span className="flex items-center gap-1">
							<Clock className="w-3 h-3" />
							更新于 {formatDate(selectedPage.updated_at)}
						</span>
						<span>
							来源: {selectedPage.last_updated_by === "user" ? "手动" : "AI"}
						</span>
					</div>
				</div>
			</div>
		);
	}

	// --- 创建/编辑模式 ---
	if (viewMode === "create") {
		return (
			<WikiPageEditor
				mode="create"
				onSave={handleCreatePage}
				onCancel={() => setViewMode("list")}
			/>
		);
	}

	if (viewMode === "edit" && selectedPage) {
		return (
			<WikiPageEditor
				mode="edit"
				initialData={{
					title: selectedPage.title,
					content: selectedPage.content,
					summary: selectedPage.summary,
					tags: selectedPage.tags,
					page_type: selectedPage.page_type,
				}}
				onSave={handleUpdatePage}
				onCancel={() => {
					setViewMode("detail");
				}}
			/>
		);
	}

	// --- 列表视图 ---
	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-border">
				<div className="flex items-center gap-2">
					<BookOpen className="w-4 h-4 text-primary" />
					<h2 className="font-semibold text-sm text-text-primary">知识 Wiki</h2>
					{scopeLabel ? (
						<span className="max-w-[120px] truncate text-[11px] text-text-light">
							{scopeLabel}
						</span>
					) : null}
					<span className="text-[11px] text-text-light tabular-nums">
						{pages.length}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						onClick={refresh}
						disabled={loading}
						className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors disabled:opacity-40"
						title="刷新"
					>
						<RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
					</button>
					<button
						onClick={runLint}
						disabled={
							loading || isInitializing || lintLoading || pages.length === 0
						}
						className="p-1.5 text-text-light hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-40"
						title="Wiki 健康检查（孤儿页 / stub / 断链 / 未摄入源）"
					>
						<ShieldCheck
							className={`w-4 h-4 ${lintLoading ? "animate-pulse" : ""}`}
						/>
					</button>
					<button
						onClick={handleRebuildWiki}
						disabled={loading || isInitializing}
						className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors disabled:opacity-40"
						title="重建 Wiki 结构"
					>
						<RotateCcw className="w-4 h-4" />
					</button>
					<button
						onClick={handleGenerateWiki}
						disabled={loading || isInitializing || isGenerating}
						className="p-1.5 text-text-light hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-40"
						title="AI 生成 Wiki 页面"
					>
						<BookOpen
							className={`w-4 h-4 ${isGenerating ? "animate-pulse" : ""}`}
						/>
					</button>
					<button
						onClick={() => setViewMode("create")}
						className="p-1.5 text-text-light hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
						title="新建知识页面"
					>
						<Plus className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Search */}
			<div className="px-3 py-2 border-b border-border">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => {
							setSearchQuery(e.target.value);
							if (!e.target.value.trim()) {
								setSearchResults(null);
							}
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSearch();
						}}
						placeholder="搜索知识页面..."
						className="w-full pl-8 pr-8 py-1.5 text-sm bg-warm-50/60 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors"
					/>
					{searchQuery && (
						<button
							onClick={() => {
								setSearchQuery("");
								setSearchResults(null);
							}}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-light hover:text-text-secondary rounded"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					)}
				</div>
			</div>

			{/* 提示 Banner */}
			{pages.length === 0 && !loading && (
				<div className="mx-3 mt-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40 p-3">
					<div className="flex items-start gap-2">
						<Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
						<div className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
							Wiki 已建立。系统会先自动生成一张知识地图，你也可以继续点击右上角{" "}
							<Plus className="w-3 h-3 inline" /> 添加专题页。
							<br />
							<span className="text-blue-500/80 dark:text-blue-400/70 mt-1 block">
								适合整理稳定的知识：概念、原理、方法论、最佳实践等。
							</span>
						</div>
					</div>
				</div>
			)}

			{/* Schema 诊断：检测到跳过记录或数据不一致 */}
			{!isGenerating &&
				schemaStats &&
				(schemaStats.skipped_count > 0 ||
					(schemaStats.processed_count > 0 &&
						schemaStats.real_page_count === 0)) && (
					<div className="mx-3 mt-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 p-3">
						<div className="flex items-start gap-2 mb-2">
							<AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
							<div className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed flex-1">
								{schemaStats.processed_count > 0 &&
								schemaStats.real_page_count === 0 ? (
									<>
										<strong>检测到数据不一致</strong>：schema 中标记了{" "}
										{schemaStats.processed_count}{" "}
										个文件为「已处理」，但工作目录下尚未生成任何 Wiki 页面。
										{schemaStats.skipped_count > 0 && (
											<>
												<br />
												另有 {schemaStats.skipped_count} 个文件曾被跳过。
											</>
										)}
										<br />
										<span className="text-amber-600/80 dark:text-amber-400/70 mt-1 block">
											这通常是旧版本（v1）遗留：当时「无法提取内容」的文件被错误地标记成了「已处理」。
											点击下方按钮重置后再次生成即可。
										</span>
									</>
								) : (
									<>
										<strong>
											有 {schemaStats.skipped_count} 个文件曾被跳过
										</strong>
										（内容无法提取 / LLM
										未返回知识点）。如需重新尝试（例如更换模型、修复 PDF
										后），点击下方按钮清空跳过记录。
									</>
								)}
							</div>
						</div>

						{schemaStats.skipped_files.length > 0 && (
							<div className="mb-2 max-h-32 overflow-y-auto rounded border border-amber-200/40 dark:border-amber-800/30 bg-surface/40 dark:bg-amber-950/40 p-1.5">
								{schemaStats.skipped_files.slice(0, 10).map((f) => (
									<div
										key={f.path}
										className="text-[11px] text-amber-700/90 dark:text-amber-300/90 py-0.5 px-1 truncate"
										title={f.reason_detail || f.reason}
									>
										• {f.name}
										<span className="text-amber-500/70 ml-1">
											（{f.reason_detail || f.reason}）
										</span>
									</div>
								))}
								{schemaStats.skipped_files.length > 10 && (
									<div className="text-[10px] text-amber-500 px-1">
										...还有 {schemaStats.skipped_files.length - 10} 个
									</div>
								)}
							</div>
						)}

						<div className="flex flex-wrap items-center gap-1.5">
							{schemaStats.skipped_count > 0 && (
								<button
									onClick={handleRetrySkipped}
									className="px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-200 bg-surface dark:bg-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-300/60 dark:border-amber-700/60 rounded-md transition-colors"
								>
									重试跳过的 {schemaStats.skipped_count} 个文件
								</button>
							)}
							{schemaStats.processed_count > 0 &&
								schemaStats.real_page_count === 0 && (
									<button
										onClick={handleResetProcessed}
										className="px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-200 bg-surface dark:bg-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-300/60 dark:border-amber-700/60 rounded-md transition-colors"
									>
										重置 {schemaStats.processed_count} 条已处理记录
									</button>
								)}
							<button
								onClick={() => loadSchemaStats()}
								className="px-2.5 py-1 text-[11px] font-medium text-amber-600/70 dark:text-amber-400/70 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
							>
								刷新诊断
							</button>
						</div>
					</div>
				)}

			{/* Error */}
			{error && (
				<div className="mx-3 mt-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg">
					{error}
				</div>
			)}

			{isInitializing ? (
				<div className="mx-3 mt-2 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
					正在初始化 Wiki 结构...
				</div>
			) : null}

			{isGenerating && generationProgress ? (
				<div className="mx-3 mt-2 px-3 py-3 bg-primary/5 rounded-lg border border-primary/10">
					<div className="flex items-center gap-2 mb-2">
						<RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
						<span className="text-xs font-medium text-primary">
							{getPhaseLabel(generationProgress.phase)}
						</span>
					</div>
					{/* 进度条 */}
					{generationProgress.total_sources > 0 &&
						(generationProgress.phase === "extracting" ||
							generationProgress.phase === "llm") && (
							<div className="mb-2">
								<div className="w-full h-1.5 bg-warm-300 dark:bg-zinc-700 rounded-full overflow-hidden">
									<div
										className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
										style={{
											width: `${Math.round((generationProgress.processed_sources / generationProgress.total_sources) * 100)}%`,
										}}
									/>
								</div>
							</div>
						)}
					{/* 状态文字 */}
					<div className="flex items-center justify-between text-[11px] text-text-muted">
						<span className="truncate max-w-[200px]">
							{generationProgress.current_source_title
								? `${getPhaseVerb(generationProgress.phase)}：${generationProgress.current_source_title}`
								: getPhaseHint(generationProgress.phase)}
						</span>
						{generationProgress.total_sources > 0 &&
						(generationProgress.phase === "extracting" ||
							generationProgress.phase === "llm") ? (
							<span className="flex-shrink-0 tabular-nums">
								{generationProgress.processed_sources}/
								{generationProgress.total_sources}
								{generationProgress.generated_pages > 0 &&
									` · ${generationProgress.generated_pages} 页`}
							</span>
						) : null}
					</div>
					{generationProgress.error && (
						<div className="mt-1.5 text-[11px] text-red-500">
							{generationProgress.error}
						</div>
					)}
				</div>
			) : null}

			{/* 生成完成后的结果提示 */}
			{!isGenerating &&
			generationProgress &&
			(generationProgress.error ||
				generationProgress.generated_pages > 0 ||
				(generationProgress.warnings &&
					generationProgress.warnings.length > 0)) ? (
				<div
					className={`mx-3 mt-2 px-3 py-2.5 rounded-lg border ${
						generationProgress.error && generationProgress.generated_pages === 0
							? "bg-red-50 dark:bg-red-950/30 border-red-200/60 dark:border-red-800/40"
							: generationProgress.generated_pages > 0
								? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/40"
								: "bg-amber-50 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/40"
					}`}
				>
					{generationProgress.generated_pages > 0 && (
						<div className="text-xs text-emerald-700 dark:text-emerald-300 mb-1">
							已生成 {generationProgress.generated_pages} 个 Wiki 页面
						</div>
					)}
					{generationProgress.error && (
						<div className="text-xs text-red-600 dark:text-red-400">
							{generationProgress.error}
						</div>
					)}
					{generationProgress.warnings &&
						generationProgress.warnings.length > 0 && (
							<div className="mt-1 space-y-0.5">
								{generationProgress.warnings.slice(0, 5).map((w, i) => (
									<div
										key={i}
										className="text-[11px] text-amber-600 dark:text-amber-400"
									>
										• {w}
									</div>
								))}
								{generationProgress.warnings.length > 5 && (
									<div className="text-[11px] text-amber-500">
										...还有 {generationProgress.warnings.length - 5} 条警告
									</div>
								)}
							</div>
						)}
					<button
						onClick={() => clearGenerationProgress()}
						className="mt-1.5 text-[11px] text-text-light hover:text-text-secondary dark:hover:text-text-light underline"
					>
						关闭
					</button>
				</div>
			) : null}

			{pages.length > 0 ? (
				<WikiGraphPanel
					scopeLabel={scopeLabel}
					pages={pages}
					onOpenPage={openPage}
				/>
			) : null}

			{lintReport && (
				<WikiLintPanel
					report={lintReport}
					onDismiss={clearLintReport}
					onOpenPage={(slug) => {
						const p = pages.find((x) => x.slug === slug || x.id === slug);
						if (p) openPage(p);
					}}
				/>
			)}

			{/* Page List */}
			<div className="flex-1 overflow-y-auto">
				{loading && pages.length === 0 ? (
					<div className="flex items-center justify-center py-12">
						<RefreshCw className="w-5 h-5 text-text-light animate-spin" />
					</div>
				) : filteredPages.length === 0 && searchQuery ? (
					<div className="flex flex-col items-center justify-center py-12 text-text-light">
						<Search className="w-8 h-8 mb-2 opacity-40" />
						<p className="text-sm">未找到匹配的页面</p>
					</div>
				) : (
					<div className="py-1">
						{filteredPages.map((page) => (
							<button
								key={page.id}
								onClick={() => openPage(page)}
								className="w-full text-left px-4 py-3 hover:bg-warm-50/50 transition-colors group border-b border-zinc-50/50 last:border-b-0"
							>
								<div className="flex items-start justify-between gap-2">
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 mb-1">
											<FileText className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
											<h4 className="text-sm font-medium text-text-primary truncate">
												{page.title}
											</h4>
											{page.page_type && page.page_type !== "entity" && (
												<span className="px-1.5 py-0.5 text-[9px] font-medium bg-warm-200 text-text-light rounded uppercase tracking-wider flex-shrink-0">
													{page.page_type}
												</span>
											)}
										</div>
										{page.summary && (
											<p className="text-xs text-text-muted truncate pl-5.5 ml-[22px]">
												{page.summary}
											</p>
										)}
										{page.tags.length > 0 && (
											<div className="flex flex-wrap gap-1 mt-1.5 ml-[22px]">
												{page.tags.slice(0, 3).map((tag) => (
													<span
														key={tag}
														className="px-1.5 py-0.5 text-[10px] font-medium bg-warm-200 text-text-muted rounded"
													>
														{tag}
													</span>
												))}
												{page.tags.length > 3 && (
													<span className="text-[10px] text-text-light">
														+{page.tags.length - 3}
													</span>
												)}
											</div>
										)}
									</div>
									<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										<span className="text-[10px] text-text-light whitespace-nowrap">
											{formatDate(page.updated_at)}
										</span>
										<ChevronRight className="w-3.5 h-3.5 text-text-light" />
									</div>
								</div>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
