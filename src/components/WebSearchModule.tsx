// 网络搜索模块 - 类似 NotebookLM 的搜索体验

import {
	ArrowRight,
	Check,
	ChevronDown,
	ExternalLink,
	Eye,
	Globe,
	Loader2,
	Plus,
	Search,
	X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchUrlContent } from "../lib/api";
import {
	type BrowserSearchResult,
	fetchPageContent,
	openBrowserWindow,
	type PageContent,
	smartBrowserSearch,
} from "../lib/config";
import { workspaceStore } from "../lib/workspaceStore";
import { FocusTrap } from "./ui/FocusTrap";

interface WebSearchModuleProps {
	onAddSource?: (sourceId: string) => void;
	className?: string;
}

type SearchEngine = "duckduckgo" | "bing" | "google" | "baidu";

const ENGINES: { id: SearchEngine; name: string }[] = [
	{ id: "duckduckgo", name: "DuckDuckGo" },
	{ id: "bing", name: "Bing" },
	{ id: "google", name: "Google" },
	{ id: "baidu", name: "百度" },
];

export default function WebSearchModule({
	onAddSource,
	className = "",
}: WebSearchModuleProps) {
	const [query, setQuery] = useState("");
	const [isSearching, setIsSearching] = useState(false);
	const [results, setResults] = useState<BrowserSearchResult[]>([]);
	const [selectedEngine, setSelectedEngine] = useState<SearchEngine>("bing");
	const [showEngineDropdown, setShowEngineDropdown] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [addingUrls, setAddingUrls] = useState<Set<string>>(new Set());
	const [addedUrls, setAddedUrls] = useState<Set<string>>(new Set());

	// 预览模态框状态
	const [previewResult, setPreviewResult] =
		useState<BrowserSearchResult | null>(null);
	const [previewContent, setPreviewContent] = useState<PageContent | null>(
		null,
	);
	const [isLoadingPreview, setIsLoadingPreview] = useState(false);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [isMacPlatform, setIsMacPlatform] = useState(false);

	const inputRef = useRef<HTMLInputElement>(null);
	const engineDropdownRef = useRef<HTMLDivElement>(null);

	// 自动聚焦输入框
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// 点击外部关闭下拉菜单
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				engineDropdownRef.current &&
				!engineDropdownRef.current.contains(e.target as Node)
			) {
				setShowEngineDropdown(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// 获取当前平台（基于 navigator）
	useEffect(() => {
		if (typeof navigator !== "undefined") {
			setIsMacPlatform(/mac/i.test(navigator.platform || navigator.userAgent));
		}
	}, []);

	const useReadingMode = !isMacPlatform;

	const handleSearch = async () => {
		if (!query.trim() || isSearching) return;

		setIsSearching(true);
		setError(null);
		setResults([]);

		try {
			console.log("[WebSearchModule] 搜索:", query, "引擎:", selectedEngine);

			// 统一使用浏览器模式（不需要 API Key）
			const searchResults = await smartBrowserSearch({
				query: query.trim(),
				engine: selectedEngine,
				use_playwright: true,
				limit: 10,
			});

			console.log("[WebSearchModule] 结果:", searchResults.length, "条");
			setResults(searchResults);
		} catch (e) {
			console.error("[WebSearchModule] 搜索失败:", e);
			const errorMsg = e instanceof Error ? e.message : String(e);
			setError(errorMsg);
		} finally {
			setIsSearching(false);
		}
	};

	// 打开预览（根据平台选择模式）
	const handlePreview = useCallback(
		async (result: BrowserSearchResult) => {
			setPreviewResult(result);
			setPreviewContent(null);
			setPreviewError(null);

			if (!useReadingMode) {
				setIsLoadingPreview(false);
				return;
			}

			setIsLoadingPreview(true);
			try {
				console.log("[WebSearchModule] 获取预览内容:", result.url);
				const content = await fetchPageContent(result.url);
				console.log("[WebSearchModule] 预览内容获取成功:", content.title);
				setPreviewContent(content);
			} catch (e) {
				console.error("[WebSearchModule] 获取预览内容失败:", e);
				setPreviewError(e instanceof Error ? e.message : "无法加载页面内容");
			} finally {
				setIsLoadingPreview(false);
			}
		},
		[useReadingMode],
	);

	// 关闭预览模态框
	const closePreview = useCallback(() => {
		setPreviewResult(null);
		setPreviewContent(null);
		setPreviewError(null);
	}, []);

	// 在外部浏览器中打开
	const handleOpenExternal = useCallback(async (url: string) => {
		try {
			await openBrowserWindow(url);
		} catch (e) {
			// 如果 Tauri 窗口失败，回退到系统浏览器
			window.open(url, "_blank");
		}
	}, []);

	// 从预览添加为资料
	const handleAddFromPreview = async () => {
		if (
			!previewResult ||
			addingUrls.has(previewResult.url) ||
			addedUrls.has(previewResult.url)
		)
			return;

		setAddingUrls((prev) => new Set(prev).add(previewResult.url));

		try {
			console.log("[WebSearchModule] 添加资料:", previewResult.url);
			const project_id =
				workspaceStore.getState().currentProjectId || undefined;
			const currentFolderId = workspaceStore.getState().currentFolderId;
			const folder_id =
				currentFolderId && currentFolderId !== "__unassigned__"
					? currentFolderId
					: undefined;
			const source = await fetchUrlContent({
				url: previewResult.url,
				project_id,
				folder_id,
			});
			console.log("[WebSearchModule] 资料已添加:", source.id);

			setAddedUrls((prev) => new Set(prev).add(previewResult.url));
			onAddSource?.(source.id);
			closePreview();
		} catch (e) {
			console.error("[WebSearchModule] 添加资料失败:", e);
			setError(e instanceof Error ? e.message : "添加失败");
		} finally {
			setAddingUrls((prev) => {
				const next = new Set(prev);
				next.delete(previewResult?.url || "");
				return next;
			});
		}
	};

	const handleAddAsSource = async (result: BrowserSearchResult) => {
		if (addingUrls.has(result.url) || addedUrls.has(result.url)) return;

		setAddingUrls((prev) => new Set(prev).add(result.url));

		try {
			console.log("[WebSearchModule] 添加资料:", result.url);
			const project_id =
				workspaceStore.getState().currentProjectId || undefined;
			const currentFolderId = workspaceStore.getState().currentFolderId;
			const folder_id =
				currentFolderId && currentFolderId !== "__unassigned__"
					? currentFolderId
					: undefined;
			const source = await fetchUrlContent({
				url: result.url,
				project_id,
				folder_id,
			});
			console.log("[WebSearchModule] 资料已添加:", source.id);

			setAddedUrls((prev) => new Set(prev).add(result.url));
			onAddSource?.(source.id);
		} catch (e) {
			console.error("[WebSearchModule] 添加资料失败:", e);
			setError(e instanceof Error ? e.message : "添加失败");
		} finally {
			setAddingUrls((prev) => {
				const next = new Set(prev);
				next.delete(result.url);
				return next;
			});
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSearch();
		}
	};

	const currentEngine = ENGINES.find((e) => e.id === selectedEngine)!;

	return (
		<div className={`flex flex-col h-full ${className}`}>
			{/* 搜索输入区域 - 紧凑设计 */}
			<div className="space-y-2 mb-3">
				{/* 搜索框 */}
				<div className="relative flex items-center gap-2 px-3 py-2.5 bg-warm-200/80 rounded-xl transition-all focus-within:bg-surface dark:focus-within:bg-dark-surface focus-within:shadow-sm focus-within:ring-1 focus-within:ring-zinc-200 dark:focus-within:ring-zinc-700">
					<Search className="w-4 h-4 text-text-light shrink-0" />
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="搜索网络内容..."
						className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary dark:text-zinc-200 placeholder:text-text-light"
					/>
					{query && (
						<button
							onClick={() => setQuery("")}
							aria-label="清空搜索关键词"
							className="p-0.5 text-text-light hover:text-text-secondary dark:hover:text-text-light rounded transition-colors"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					)}
					{/* 搜索按钮内嵌 */}
					<button
						onClick={handleSearch}
						disabled={!query.trim() || isSearching}
						aria-label="执行搜索"
						className={`p-1.5 rounded-lg transition-all ${
							query.trim() && !isSearching
								? "bg-dark-muted text-white hover:opacity-90"
								: "bg-cream-400/50 dark:bg-cream-700/50 text-text-light cursor-not-allowed"
						}`}
					>
						{isSearching ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<ArrowRight className="w-3.5 h-3.5" />
						)}
					</button>
				</div>

				{/* 选项栏 - 简化为单行 */}
				<div className="flex items-center gap-1.5">
					{/* 搜索引擎选择 */}
					<div className="relative" ref={engineDropdownRef}>
						<button
							onClick={() => setShowEngineDropdown(!showEngineDropdown)}
							className="flex items-center gap-1 px-2 py-1 hover:bg-warm-200 rounded-md text-xs text-text-muted transition-colors"
						>
							<Globe className="w-3 h-3" />
							<span>{currentEngine.name}</span>
							<ChevronDown className="w-2.5 h-2.5" />
						</button>

						{showEngineDropdown && (
							<div className="absolute top-full left-0 mt-1 w-36 bg-cream-50 dark:bg-cream-900 rounded-2xl shadow-bai-pop border border-cream-400 dark:border-cream-500 py-1 z-[100]">
								{ENGINES.map((engine) => (
									<button
										key={engine.id}
										onClick={() => {
											setSelectedEngine(engine.id);
											setShowEngineDropdown(false);
										}}
										className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
											selectedEngine === engine.id
												? "bg-warm-200 dark:bg-cream-700 text-text-primary"
												: "text-text-secondary hover:bg-warm-50 dark:hover:bg-cream-700/50"
										}`}
									>
										<span>{engine.name}</span>
									</button>
								))}
							</div>
						)}
					</div>
				</div>
			</div>

			{/* 错误提示 */}
			{error && (
				<div className="px-3 py-2 rounded-lg bg-[rgba(181,51,51,0.08)] dark:bg-red-900/20 text-error dark:text-error text-xs mb-2">
					{error}
				</div>
			)}

			{/* 搜索结果 */}
			{results.length > 0 && (
				<div className="flex-1 overflow-hidden flex flex-col min-h-0">
					<div className="flex items-center justify-between py-1.5 text-[11px] text-text-light shrink-0">
						<span>找到 {results.length} 个结果</span>
					</div>

					<div className="flex-1 overflow-y-auto scrollbar-hide space-y-1">
						{results.map((result, idx) => {
							const isAdding = addingUrls.has(result.url);
							const isAdded = addedUrls.has(result.url);

							return (
								<div
									key={idx}
									className={`p-2.5 rounded-lg transition-all group ${
										isAdded
											? "bg-green-50 dark:bg-green-900/10 ring-1 ring-green-200 dark:ring-green-800"
											: "hover:bg-warm-200/80"
									}`}
								>
									<div className="flex items-start gap-2">
										{/* 预览按钮 */}
										<button
											onClick={() => handlePreview(result)}
											aria-label={`预览 ${result.title}`}
											className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5 bg-warm-200 hover:bg-focus/16 dark:hover:bg-blue-900/30 transition-colors"
											title="预览内容"
										>
											<Eye className="w-3.5 h-3.5 text-text-light group-hover:text-focus" />
										</button>

										{/* 添加按钮 */}
										<button
											onClick={() => handleAddAsSource(result)}
											disabled={isAdding || isAdded}
											aria-label={
												isAdded
													? `${result.title} 已添加`
													: `添加 ${result.title} 为资料`
											}
											className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5 transition-colors ${
												isAdded
													? "bg-green-500 text-white cursor-default"
													: isAdding
														? "bg-warm-300 dark:bg-cream-700 cursor-wait"
														: "bg-warm-200 hover:bg-green-100 dark:hover:bg-green-900/30"
											}`}
											title={isAdded ? "已添加" : "添加为资料"}
										>
											{isAdding ? (
												<Loader2 className="w-3 h-3 animate-spin text-text-light" />
											) : isAdded ? (
												<Check className="w-3 h-3" />
											) : (
												<Plus className="w-3 h-3 text-text-light hover:text-green-500" />
											)}
										</button>

										{/* 内容 */}
										<div className="flex-1 min-w-0">
											<h4 className="text-[13px] font-medium text-text-primary dark:text-zinc-200 line-clamp-1 leading-tight">
												{result.title}
											</h4>
											<p className="text-[11px] text-text-muted mt-0.5 line-clamp-1">
												{result.snippet}
											</p>
										</div>

										{/* 外链按钮 */}
										<a
											href={result.url}
											target="_blank"
											rel="noopener noreferrer"
											onClick={(e) => e.stopPropagation()}
											aria-label={`在浏览器打开 ${result.title}`}
											className="shrink-0 p-1 text-text-light hover:text-text-muted dark:hover:text-text-light opacity-0 group-hover:opacity-100 transition-opacity"
											title="在浏览器中打开"
										>
											<ExternalLink className="w-3 h-3" />
										</a>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}

			{/* 空状态 / 初始状态 */}
			{!isSearching && results.length === 0 && (
				<div className="flex-1 flex items-center justify-center">
					<div className="text-center py-8">
						<div className="w-10 h-10 rounded-full bg-warm-200 flex items-center justify-center mx-auto mb-3">
							<Search className="w-5 h-5 text-text-light" />
						</div>
						<p className="text-xs text-text-light">
							{query ? "未找到相关结果" : "输入关键词搜索网络内容"}
						</p>
					</div>
				</div>
			)}

			{/* 预览模态框 - 根据平台切换模式 */}
			{previewResult && (
				<div
					className="fixed inset-0 z-[200] flex items-center justify-center bg-cream-900/40 backdrop-blur-sm"
					onClick={closePreview}
				>
					<FocusTrap
						className="w-[90vw] h-[85vh] max-w-4xl bg-surface rounded-2xl shadow-bai-pop border border-border overflow-hidden flex flex-col"
						onClick={(e) => e.stopPropagation()}
						onEscape={closePreview}
						role="dialog"
						aria-modal="true"
						aria-label="网页预览"
					>
						{/* 模态框头部 */}
						<div className="flex items-center justify-between px-5 py-4 border-b border-border bg-warm-50/80">
							<div className="flex items-center gap-3 min-w-0 flex-1">
								<div className="w-8 h-8 rounded-lg bg-warm-200 dark:bg-cream-700 flex items-center justify-center shrink-0">
									<Globe className="w-4 h-4 text-text-muted" />
								</div>
								<div className="min-w-0 flex-1">
									<h3 className="text-base font-medium text-text-primary dark:text-zinc-200 truncate">
										{previewContent?.title || previewResult.title}
									</h3>
									<p className="text-xs text-text-light truncate mt-0.5">
										{previewResult.url}
									</p>
								</div>
							</div>
							<button
								onClick={closePreview}
								aria-label="关闭预览"
								className="p-2 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-lg transition-colors"
							>
								<X className="w-5 h-5" />
							</button>
						</div>

						{/* 阅读模式（Windows 等） vs iframe（macOS） */}
						{useReadingMode ? (
							<div className="flex-1 overflow-y-auto bg-surface">
								{isLoadingPreview ? (
									<div className="flex flex-col items-center justify-center h-full gap-3">
										<Loader2 className="w-8 h-8 animate-spin text-text-light" />
										<p className="text-sm text-text-muted">
											正在加载页面内容...
										</p>
									</div>
								) : previewError ? (
									<div className="flex flex-col items-center justify-center h-full gap-4 px-8">
										<div className="w-16 h-16 rounded-full bg-[rgba(181,51,51,0.08)] dark:bg-red-900/20 flex items-center justify-center">
											<X className="w-8 h-8 text-error" />
										</div>
										<div className="text-center">
											<p className="text-sm font-medium text-text-secondary mb-1">
												无法加载页面内容
											</p>
											<p className="text-xs text-text-muted max-w-md">
												{previewError}
											</p>
										</div>
										<button
											onClick={() => handleOpenExternal(previewResult.url)}
											className="flex items-center gap-2 px-4 py-2 bg-warm-200 hover:bg-warm-300 dark:hover:bg-cream-700 rounded-lg text-sm text-text-secondary transition-colors"
										>
											<ExternalLink className="w-4 h-4" />
											<span>在浏览器中打开</span>
										</button>
									</div>
								) : previewContent ? (
									<article className="max-w-3xl mx-auto px-8 py-8">
										{previewContent.description && (
											<p className="text-text-muted text-sm mb-6 pb-6 border-b border-border">
												{previewContent.description}
											</p>
										)}
										<div
											className="prose prose-zinc dark:prose-invert prose-sm max-w-none
                        prose-headings:font-medium prose-headings:text-text-primary dark:prose-headings:text-zinc-200
                        prose-p:text-text-secondary dark:prose-p:text-text-light prose-p:leading-relaxed
                        prose-a:text-focus dark:prose-a:text-focus prose-a:no-underline hover:prose-a:underline
                        prose-strong:text-text-secondary dark:prose-strong:text-text-light
                        prose-code:text-text-secondary dark:prose-code:text-text-light prose-code:bg-warm-200 dark:prose-code:bg-dark-surface prose-code:px-1 prose-code:rounded
                        prose-pre:bg-warm-200 dark:prose-pre:bg-dark-surface
                        prose-blockquote:border-cream-400 dark:prose-blockquote:border-dark-border
                        prose-li:text-text-secondary dark:prose-li:text-text-light"
											style={{ whiteSpace: "pre-wrap" }}
										>
											{previewContent.content}
										</div>
									</article>
								) : (
									<div className="flex items-center justify-center h-full">
										<p className="text-sm text-text-light">暂无内容</p>
									</div>
								)}
							</div>
						) : (
							<div className="flex-1 bg-surface">
								<iframe
									src={previewResult.url}
									className="w-full h-full border-0"
									sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
									title={previewResult.title}
								/>
							</div>
						)}

						{/* 模态框底部 */}
						<div className="flex items-center justify-between px-5 py-4 border-t border-border bg-warm-50/80">
							<button
								onClick={() => handleOpenExternal(previewResult.url)}
								className="flex items-center gap-2 text-sm text-text-muted hover:text-text-secondary dark:hover:text-text-light transition-colors"
							>
								<ExternalLink className="w-4 h-4" />
								<span>在浏览器中打开</span>
							</button>

							<div className="flex items-center gap-3">
								<button
									onClick={closePreview}
									className="px-4 py-2 text-sm text-text-secondary hover:bg-warm-200 rounded-lg transition-colors"
								>
									取消
								</button>
								<button
									onClick={handleAddFromPreview}
									disabled={
										addingUrls.has(previewResult.url) ||
										addedUrls.has(previewResult.url)
									}
									className={`flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-lg transition-all ${
										addedUrls.has(previewResult.url)
											? "bg-green-500 text-white cursor-default"
											: addingUrls.has(previewResult.url)
												? "bg-warm-300 dark:bg-cream-700 text-text-light cursor-not-allowed"
												: "bg-dark-muted text-white hover:opacity-90"
									}`}
								>
									{addingUrls.has(previewResult.url) ? (
										<>
											<Loader2 className="w-4 h-4 animate-spin" />
											<span>添加中...</span>
										</>
									) : addedUrls.has(previewResult.url) ? (
										<>
											<Check className="w-4 h-4" />
											<span>已添加</span>
										</>
									) : (
										<>
											<Plus className="w-4 h-4" />
											<span>添加为资料</span>
										</>
									)}
								</button>
							</div>
						</div>
					</FocusTrap>
				</div>
			)}
		</div>
	);
}
