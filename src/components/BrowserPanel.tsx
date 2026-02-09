import {
	ArrowLeft,
	ArrowRight,
	BookOpen,
	ExternalLink,
	Globe,
	Home,
	Loader2,
	Plus,
	RotateCw,
	Search,
	X,
} from "lucide-react";
import { useState } from "react";
import { fetchUrlContent } from "../lib/api";
import { buildLinkContextMenu } from "../lib/contextMenu/actions";
import {
	fetchPageContent,
	openBrowserWindow,
	type PageContent,
} from "../lib/config";
import { workspaceStore } from "../lib/workspaceStore";
import { ContextMenu } from "./ui/ContextMenu";

interface BrowserPanelProps {
	initialUrl?: string;
}

type ViewMode = "home" | "iframe" | "reader" | "loading";

interface HistoryItem {
	url: string;
	title: string;
}

export default function BrowserPanel({ initialUrl }: BrowserPanelProps) {
	const [url, setUrl] = useState(initialUrl || "");
	const [inputValue, setInputValue] = useState(initialUrl || "");
	const [isLoading, setIsLoading] = useState(false);
	const [viewMode, setViewMode] = useState<ViewMode>("home");
	const [history, setHistory] = useState<HistoryItem[]>([]);
	const [historyIndex, setHistoryIndex] = useState(-1);
	const [error, setError] = useState<string | null>(null);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		url: string;
		removeIndex?: number;
	} | null>(null);

	// Content state
	const [pageContent, setPageContent] = useState<PageContent | null>(null);
	const [selectedEngine, setSelectedEngine] = useState<
		"duckduckgo" | "bing" | "google"
	>("duckduckgo");

	// 快捷网站
	const quickLinks = [
		{ name: "Google", url: "https://www.google.com", icon: "🔍" },
		{ name: "GitHub", url: "https://github.com", icon: "🐙" },
		{ name: "Stack Overflow", url: "https://stackoverflow.com", icon: "📚" },
		{ name: "MDN", url: "https://developer.mozilla.org", icon: "📖" },
		{ name: "Hacker News", url: "https://news.ycombinator.com", icon: "🔶" },
		{ name: "Product Hunt", url: "https://www.producthunt.com", icon: "🚀" },
	];

	// 导航到 URL - 直接打开新窗口
	const navigateTo = async (targetUrl: string) => {
		if (!targetUrl) return;

		// 确保 URL 有协议
		let normalizedUrl = targetUrl;
		if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
			normalizedUrl = "https://" + targetUrl;
		}

		setInputValue(normalizedUrl);
		setUrl(normalizedUrl);
		setIsLoading(true);
		setError(null);

		try {
			// 更新历史记录
			const newItem: HistoryItem = {
				url: normalizedUrl,
				title: normalizedUrl,
			};
			const newHistory = history.slice(0, historyIndex + 1);
			newHistory.push(newItem);
			setHistory(newHistory);
			setHistoryIndex(newHistory.length - 1);

			// 直接打开新窗口（因为大多数网站不支持 iframe）
			console.log("[Browser] 打开新窗口:", normalizedUrl);
			await openBrowserWindow(normalizedUrl);

			// 保持在首页，显示成功提示
			setViewMode("home");
		} catch (e) {
			console.error("[Browser] 打开窗口失败:", e);
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setIsLoading(false);
		}
	};

	// 搜索 (构造 URL 并打开新窗口)
	const handleSearch = async (query: string) => {
		if (!query.trim()) return;

		let searchUrl = "";
		switch (selectedEngine) {
			case "google":
				searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
				break;
			case "bing":
				searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
				break;
			case "duckduckgo":
			default:
				searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
				break;
		}

		// 直接打开搜索结果
		navigateTo(searchUrl);
	};

	// 获取阅读内容 (手动触发)
	const loadReaderMode = async () => {
		if (!url) return;

		setIsLoading(true);
		try {
			const content = await fetchPageContent(url);
			setPageContent(content);
			setViewMode("reader");
		} catch (e) {
			console.error("[Browser] 阅读模式加载失败:", e);
			// 保持在当前模式，或者显示错误 Toast
		} finally {
			setIsLoading(false);
		}
	};

	// 处理输入
	const handleInputKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && inputValue.trim()) {
			// 判断是 URL 还是搜索词
			const isUrl = /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(
				inputValue.trim(),
			);
			if (isUrl) {
				navigateTo(inputValue.trim());
			} else {
				handleSearch(inputValue.trim());
			}
		}
	};

	// 后退
	const goBack = () => {
		if (historyIndex > 0) {
			const prevItem = history[historyIndex - 1];
			setHistoryIndex(historyIndex - 1);
			setInputValue(prevItem.url);
			setUrl(prevItem.url); // 这里直接更新 URL 状态，因为是 Iframe 模式
			setPageContent(null);
			setViewMode("iframe");
		}
	};

	// 前进
	const goForward = () => {
		if (historyIndex < history.length - 1) {
			const nextItem = history[historyIndex + 1];
			setHistoryIndex(historyIndex + 1);
			setInputValue(nextItem.url);
			setUrl(nextItem.url);
			setPageContent(null);
			setViewMode("iframe");
		}
	};

	// 刷新
	const refresh = () => {
		if (url) {
			// 通过重新设置 key 来强制刷新 iframe，或者重新 navigate
			const currentUrl = url;
			setUrl("");
			setTimeout(() => setUrl(currentUrl), 10);
		}
	};

	// 在新窗口打开
	const openInNewWindow = async () => {
		if (url) {
			try {
				await openBrowserWindow(url);
			} catch (e) {
				console.error("[Browser] 打开窗口失败:", e);
			}
		}
	};

	// 保存为资料
	const saveAsSource = async () => {
		if (url) {
			try {
				const project_id =
					workspaceStore.getState().currentProjectId || undefined;
				const currentFolderId = workspaceStore.getState().currentFolderId;
				const folder_id =
					currentFolderId && currentFolderId !== "__unassigned__"
						? currentFolderId
						: undefined;
				await fetchUrlContent({ url: url, project_id, folder_id });
				console.log("[Browser] 已保存为资料");
			} catch (e) {
				console.error("[Browser] 保存失败:", e);
			}
		}
	};

	const saveUrlAsSource = async (targetUrl: string, scope: "global" | "project") => {
		const state = workspaceStore.getState();
		const projectId = state.currentProjectId || undefined;
		const folderId =
			state.currentFolderId && state.currentFolderId !== "__unassigned__"
				? state.currentFolderId
				: undefined;
		await fetchUrlContent({
			url: targetUrl,
			project_id: scope === "project" ? projectId : undefined,
			folder_id: scope === "project" ? folderId : undefined,
		});
	};

	const contextMenuItems = contextMenu
		? buildLinkContextMenu({
			onOpen: () => navigateTo(contextMenu.url),
			onCopy: () => navigator.clipboard.writeText(contextMenu.url),
			onSaveGlobal: () => void saveUrlAsSource(contextMenu.url, "global"),
			onSaveProject: () => void saveUrlAsSource(contextMenu.url, "project"),
			onRemove:
				typeof contextMenu.removeIndex === "number"
					? () =>
						setHistory((prev) =>
							prev.filter((_, idx) => idx !== contextMenu.removeIndex),
						)
					: undefined,
		})
		: [];

	// Iframe Sandbox attributes
	const iframeSandbox =
		"allow-scripts allow-same-origin allow-forms allow-popups";

	return (
		<div className="flex flex-col h-full bg-white dark:bg-[#1E1E1E] relative overflow-hidden">
			{/* Browser Chrome / Toolbar */}
			<div className="flex items-center gap-2 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] bg-white/80 dark:bg-[#1E1E1E]/80 backdrop-blur-xl z-10">
				{/* Navigation Controls */}
				<div className="flex items-center gap-1">
					<button
						onClick={goBack}
						disabled={historyIndex <= 0}
						className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
						title="后退"
					>
						<ArrowLeft className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
					</button>
					<button
						onClick={goForward}
						disabled={historyIndex >= history.length - 1}
						className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
						title="前进"
					>
						<ArrowRight className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
					</button>
					<button
						onClick={refresh}
						disabled={!url}
						className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
						title="刷新"
					>
						{isLoading ? (
							<Loader2 className="w-4 h-4 text-primary animate-spin" />
						) : (
							<RotateCw className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
						)}
					</button>
					<button
						onClick={() => {
							setViewMode("home");
							setInputValue("");
							setUrl("");
						}}
						className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
						title="主页"
					>
						<Home className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
					</button>
				</div>

				{/* Address Bar */}
				<div className="flex-1 max-w-3xl mx-auto relative group">
					<div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
						{isLoading ? (
							<Globe className="w-4 h-4 text-primary animate-pulse" />
						) : (
							<Search className="w-4 h-4 text-zinc-400" />
						)}
					</div>
					<input
						type="text"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleInputKeyDown}
						onFocus={(e) => e.currentTarget.select()}
						placeholder="输入网址或搜索内容，按 Enter 访问..."
						className="w-full pl-10 pr-4 py-2.5 bg-zinc-100 dark:bg-black/20 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-black/40 rounded-xl text-sm text-zinc-800 dark:text-zinc-200 transition-all outline-none shadow-sm"
					/>
				</div>

				{/* Actions */}
				<div className="flex items-center gap-1">
					{url && (
						<>
							<button
								onClick={loadReaderMode}
								className={`p-2 rounded-lg transition-colors ${viewMode === "reader" ? "bg-primary/10 text-primary" : "hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400"}`}
								title="阅读模式"
							>
								<BookOpen className="w-4 h-4" />
							</button>
							<button
								onClick={openInNewWindow}
								className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
								title="在新窗口打开"
							>
								<ExternalLink className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
							</button>
							<button
								onClick={saveAsSource}
								className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 dark:bg-zinc-100 hover:bg-zinc-700 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-lg text-xs font-medium transition-colors"
							>
								<Plus className="w-3.5 h-3.5" />
								保存
							</button>
						</>
					)}

					<div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

					<button
						onClick={() => workspaceStore.setMainView("editor")}
						className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						title="返回编辑器"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Main Content Area */}
			<div className="flex-1 overflow-hidden relative bg-zinc-50/50 dark:bg-[#151515]">
				{/* Home View */}
				{viewMode === "home" && (
					<div className="h-full overflow-y-auto p-8">
						<div className="max-w-2xl mx-auto">
							{/* Search Box */}
							<div className="text-center mb-12 pt-16">
								<h1 className="text-4xl font-bold text-zinc-800 dark:text-zinc-100 mb-2">
									内置浏览器
								</h1>
								<p className="text-zinc-400 mb-8">搜索网络或输入网址</p>

								{/* Engine Selector */}
								<div className="flex justify-center gap-2 mb-4">
									{(["duckduckgo", "bing", "google"] as const).map((engine) => (
										<button
											key={engine}
											onClick={() => setSelectedEngine(engine)}
											className={`
                        px-4 py-2 rounded-xl text-sm font-medium transition-all
                        ${selectedEngine === engine
													? "bg-primary/10 dark:bg-primary/20 text-primary shadow-sm"
													: "bg-white dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
												}
                      `}
										>
											{engine === "duckduckgo"
												? "🦆"
												: engine === "bing"
													? "🔍"
													: "🌐"}
											{engine.charAt(0).toUpperCase() + engine.slice(1)}
										</button>
									))}
								</div>
							</div>

							{/* Quick Links */}
							<div className="grid grid-cols-3 gap-4">
								{quickLinks.map((link) => (
									<button
										key={link.url}
										onClick={() => navigateTo(link.url)}
										onContextMenu={(e) => {
											e.preventDefault();
											e.stopPropagation();
											setContextMenu({
												x: e.clientX,
												y: e.clientY,
												url: link.url,
											});
										}}
										className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-zinc-800/50 rounded-2xl hover:shadow-lg hover:scale-105 transition-all group"
									>
										<span className="text-3xl">{link.icon}</span>
										<span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-primary">
											{link.name}
										</span>
									</button>
								))}
							</div>

							{/* 最近访问 */}
							{history.length > 0 && (
								<div className="mt-8">
									<h3 className="text-sm font-medium text-zinc-500 mb-3">
										最近访问
									</h3>
									<div className="space-y-2">
										{history
											.slice(-5)
											.reverse()
											.map((item, i) => (
												<button
													key={i}
													onClick={() => navigateTo(item.url)}
													onContextMenu={(e) => {
														e.preventDefault();
														e.stopPropagation();
														setContextMenu({
															x: e.clientX,
															y: e.clientY,
															url: item.url,
															removeIndex: history.length - 1 - i,
														});
													}}
													className="w-full flex items-center gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left"
												>
													<Globe className="w-4 h-4 text-zinc-400" />
													<span className="text-sm text-zinc-600 dark:text-zinc-300 truncate">
														{item.url}
													</span>
												</button>
											))}
									</div>
								</div>
							)}

							{/* Error Message */}
							{error && (
								<div className="mt-8 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-sm text-center">
									{error}
								</div>
							)}

							{/* 提示信息 */}
							<div className="mt-8 p-4 bg-surface dark:bg-zinc-800/50 rounded-xl text-text-secondary text-sm text-center border border-border">
								💡 输入网址或搜索词后按 Enter，将在独立窗口中打开
							</div>
						</div>
					</div>
				)}

				{/* Loading View */}
				{viewMode === "loading" && (
					<div className="h-full flex flex-col items-center justify-center">
						<Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
						<p className="text-zinc-400">加载中...</p>
					</div>
				)}

				{/* Iframe View */}
				{viewMode === "iframe" && url && (
					<div className="w-full h-full relative">
						<iframe
							key={url} // 强制刷新
							src={url}
							className="w-full h-full border-none bg-white"
							sandbox={iframeSandbox}
							title="Browser View"
							onError={() =>
								setError(
									"无法加载此网页，可能是由于安全策略（X-Frame-Options）。建议在独立窗口中打开。",
								)
							}
						/>
						{/* Iframe 遮罩提示 (如果加载失败或需要提示) */}
						<div className="absolute bottom-4 right-4 bg-white/90 dark:bg-black/90 backdrop-blur px-4 py-2 rounded-lg shadow-lg text-xs text-zinc-500 pointer-events-none">
							Iframe 模式
						</div>
					</div>
				)}

				{/* Reader View */}
				{viewMode === "reader" && pageContent && (
					<div className="h-full overflow-y-auto">
						<article className="max-w-3xl mx-auto p-8 bg-white dark:bg-[#1E1E1E] min-h-full">
							{/* Page Header */}
							<header className="mb-8 pb-6 border-b border-zinc-100 dark:border-zinc-800">
								<h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-3 leading-tight">
									{pageContent.title}
								</h1>
								{pageContent.description && (
									<p className="text-zinc-500 dark:text-zinc-400 text-lg">
										{pageContent.description}
									</p>
								)}
								<div className="flex items-center gap-2 mt-4 text-xs text-zinc-400">
									<Globe className="w-3 h-3" />
									<a
										href={pageContent.url}
										target="_blank"
										rel="noreferrer"
										className="hover:text-primary hover:underline truncate max-w-lg"
									>
										{pageContent.url}
									</a>
								</div>
							</header>

							{/* Page Content */}
							<div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-a:text-primary">
								<div className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 leading-relaxed">
									{pageContent.content}
								</div>
							</div>
						</article>
					</div>
				)}
			</div>
			{contextMenu && contextMenuItems.length > 0 ? (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={contextMenuItems}
					onClose={() => setContextMenu(null)}
				/>
			) : null}
		</div>
	);
}
