/**
 * Wiki 知识页面视图 - 在左侧边栏中间栏展示
 *
 * 默认不建立 Wiki，只有用户主动点击「建立 Wiki」时才启用。
 * 页面中提醒用户：知识索引适合相对稳定的、静态的知识。
 */
import { useEffect, useMemo, useState } from "react";
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
	FileText,
	Clock,
	Tag,
	RotateCcw,
} from "lucide-react";
import { useWiki, type WikiPageItem } from "./useWiki";
import { WikiPageEditor } from "./WikiPageEditor";
import { WikiContentRenderer } from "./WikiContentRenderer";
import { confirmDialog } from "../ui/ConfirmDialog";
import { sessionStore } from "../../lib/agent/sessionManager";
import { WikiGraphPanel } from "./WikiGraphPanel";

type WikiViewMode = "list" | "detail" | "create" | "edit";

function getScopeName(scopePath: string | null): string {
	if (!scopePath) return "";
	const parts = scopePath.split(/[/\\]/).filter(Boolean);
	return parts[parts.length - 1] || scopePath;
}

export function WikiView() {
	const [scopePath, setScopePath] = useState<string | null>(() => {
		return sessionStore.getCurrentSession()?.cwd ?? null;
	});
	const [threadTitle, setThreadTitle] = useState<string | null>(() => {
		return sessionStore.getCurrentSession()?.title ?? null;
	});

	useEffect(() => {
		const syncSession = () => {
			const currentSession = sessionStore.getCurrentSession();
			setScopePath(currentSession?.cwd ?? null);
			setThreadTitle(currentSession?.title ?? null);
		};
		syncSession();
		return sessionStore.subscribe(syncSession);
	}, []);

	const {
		pages,
		loading,
		isInitializing,
		enabled,
		error,
		generationProgress,
		enable,
		rebuild,
		createPage,
		updatePage,
		deletePage,
		searchPages,
		generateWiki,
		refresh,
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
				"将扫描当前目录下的所有源文件（PDF、文档等），使用 AI 自动提取知识点并生成 Wiki 页面。已有页面不会被覆盖。",
			confirmText: "开始生成",
			cancelText: "取消",
			type: "info",
		});
		if (!confirmed) return;
		try {
			await generateWiki();
		} catch {
			// error 已在 useWiki 内部处理
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
					<div className="w-16 h-16 rounded-2xl bg-zinc-100/80 dark:bg-zinc-800/80 flex items-center justify-center mb-5">
						<BookOpen className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
					</div>
					<h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100 mb-2">
						暂无线程工作目录
					</h3>
					<p className="text-sm text-zinc-500 dark:text-zinc-400 text-center leading-relaxed max-w-[260px]">
						Wiki 跟随当前线程的工作目录。请先在线程列表中选择一个线程，再整理该目录下的结构化知识。
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
					<h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100 mb-2">
						知识 Wiki
					</h3>
					<p className="text-sm text-zinc-500 dark:text-zinc-400 text-center leading-relaxed mb-6 max-w-[260px]">
						将当前线程工作目录中的稳定知识整理为结构化索引，方便快速查阅和积累。
					</p>
					{scopeLabel ? (
						<div className="mb-4 text-xs text-zinc-400 dark:text-zinc-500">
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
				<RefreshCw className="w-5 h-5 text-zinc-400 animate-spin" />
			</div>
		);
	}

	// --- 页面详情 ---
	if (viewMode === "detail" && selectedPage) {
		return (
			<div className="flex flex-col h-full">
				{/* Header */}
				<div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-zinc-100 dark:border-zinc-800">
					<div className="flex items-center gap-2">
						<button
							onClick={() => {
								setViewMode("list");
								setSelectedPage(null);
							}}
							className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						>
							<ArrowLeft className="w-4 h-4" />
						</button>
						<FileText className="w-4 h-4 text-primary" />
						<h2 className="font-semibold text-sm text-zinc-800 dark:text-zinc-100 truncate max-w-[180px]">
							{selectedPage.title}
						</h2>
					</div>
					<div className="flex items-center gap-1">
						<button
							onClick={() => setViewMode("edit")}
							className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
							title="编辑"
						>
							<Pencil className="w-4 h-4" />
						</button>
						<button
							onClick={() => handleDeletePage(selectedPage)}
							className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
							title="删除"
						>
							<Trash2 className="w-4 h-4" />
						</button>
					</div>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto p-4">
					{selectedPage.page_type && selectedPage.page_type !== "entity" && (
						<div className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-md mb-3 uppercase tracking-wider">
							{selectedPage.page_type}
						</div>
					)}
					{selectedPage.summary && (
						<p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 italic">
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
					<div className="mt-6 flex items-center gap-3 text-[11px] text-zinc-400">
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
			<div className="px-4 py-3 flex items-center justify-between shrink-0 border-b border-zinc-100 dark:border-zinc-800">
				<div className="flex items-center gap-2">
					<BookOpen className="w-4 h-4 text-primary" />
					<h2 className="font-semibold text-sm text-zinc-800 dark:text-zinc-100">
						知识 Wiki
					</h2>
					{scopeLabel ? (
						<span className="max-w-[120px] truncate text-[11px] text-zinc-400 dark:text-zinc-500">
							{scopeLabel}
						</span>
					) : null}
					<span className="text-[11px] text-zinc-400 dark:text-zinc-500 tabular-nums">
						{pages.length}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						onClick={refresh}
						disabled={loading}
						className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-40"
						title="刷新"
					>
						<RefreshCw
							className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
						/>
					</button>
					<button
						onClick={handleRebuildWiki}
						disabled={loading || isInitializing}
						className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-40"
						title="重建 Wiki 结构"
					>
						<RotateCcw className="w-4 h-4" />
					</button>
					<button
						onClick={handleGenerateWiki}
						disabled={loading || isInitializing || isGenerating}
						className="p-1.5 text-zinc-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-40"
						title="AI 生成 Wiki 页面"
					>
						<BookOpen
							className={`w-4 h-4 ${isGenerating ? "animate-pulse" : ""}`}
						/>
					</button>
					<button
						onClick={() => setViewMode("create")}
						className="p-1.5 text-zinc-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
						title="新建知识页面"
					>
						<Plus className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Search */}
			<div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
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
						className="w-full pl-8 pr-8 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors"
					/>
					{searchQuery && (
						<button
							onClick={() => {
								setSearchQuery("");
								setSearchResults(null);
							}}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-600 rounded"
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

			{/* Error */}
			{error && (
				<div className="mx-3 mt-2 px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded-lg">
					{error}
				</div>
			)}

			{isInitializing ? (
				<div className="mx-3 mt-2 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
					正在初始化知识地图...
				</div>
			) : null}

			{isGenerating && generationProgress ? (
				<div className="mx-3 mt-2 px-3 py-3 bg-primary/5 rounded-lg border border-primary/10">
					<div className="flex items-center gap-2 mb-2">
						<RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
						<span className="text-xs font-medium text-primary">
							AI 正在生成 Wiki 页面
						</span>
					</div>
					{/* 进度条 */}
					{generationProgress.total_sources > 0 && (
						<div className="mb-2">
							<div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
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
					<div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
						<span className="truncate max-w-[200px]">
							{generationProgress.current_source_title
								? `正在处理：${generationProgress.current_source_title}`
								: "准备中..."}
						</span>
						<span className="flex-shrink-0 tabular-nums">
							{generationProgress.processed_sources}/{generationProgress.total_sources} 源文件
							{generationProgress.generated_pages > 0 &&
								` · ${generationProgress.generated_pages} 页`}
						</span>
					</div>
					{generationProgress.error && (
						<div className="mt-1.5 text-[11px] text-red-500">
							{generationProgress.error}
						</div>
					)}
				</div>
			) : null}

			{pages.length > 0 ? (
				<WikiGraphPanel
					scopeLabel={scopeLabel}
					pages={pages}
					onOpenPage={openPage}
				/>
			) : null}

			{/* Page List */}
			<div className="flex-1 overflow-y-auto">
				{loading && pages.length === 0 ? (
					<div className="flex items-center justify-center py-12">
						<RefreshCw className="w-5 h-5 text-zinc-400 animate-spin" />
					</div>
				) : filteredPages.length === 0 && searchQuery ? (
					<div className="flex flex-col items-center justify-center py-12 text-zinc-400">
						<Search className="w-8 h-8 mb-2 opacity-40" />
						<p className="text-sm">未找到匹配的页面</p>
					</div>
				) : (
					<div className="py-1">
						{filteredPages.map((page) => (
							<button
								key={page.id}
								onClick={() => openPage(page)}
								className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group border-b border-zinc-50 dark:border-zinc-800/50 last:border-b-0"
							>
								<div className="flex items-start justify-between gap-2">
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 mb-1">
											<FileText className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
											<h4 className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">
												{page.title}
											</h4>
											{page.page_type &&
												page.page_type !== "entity" && (
													<span className="px-1.5 py-0.5 text-[9px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 rounded uppercase tracking-wider flex-shrink-0">
														{page.page_type}
													</span>
												)}
										</div>
										{page.summary && (
											<p className="text-xs text-zinc-500 dark:text-zinc-400 truncate pl-5.5 ml-[22px]">
												{page.summary}
											</p>
										)}
										{page.tags.length > 0 && (
											<div className="flex flex-wrap gap-1 mt-1.5 ml-[22px]">
												{page.tags.slice(0, 3).map((tag) => (
													<span
														key={tag}
														className="px-1.5 py-0.5 text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded"
													>
														{tag}
													</span>
												))}
												{page.tags.length > 3 && (
													<span className="text-[10px] text-zinc-400">
														+{page.tags.length - 3}
													</span>
												)}
											</div>
										)}
									</div>
									<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
										<span className="text-[10px] text-zinc-400 whitespace-nowrap">
											{formatDate(page.updated_at)}
										</span>
										<ChevronRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600" />
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
