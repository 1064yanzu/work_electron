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
import { useCallback, useMemo, useState } from "react";
import { fetchUrlContent } from "../lib/api";
import { buildLinkContextMenu } from "../lib/contextMenu/actions";
import {
	fetchPageContent,
	openBrowserWindow,
	type PageContent,
} from "../lib/config";
import { workspaceStore } from "../lib/workspaceStore";
import { ContextMenu } from "./ui/ContextMenu";
import { toast } from "./ui/Toast";

interface BrowserPanelProps {
	initialUrl?: string;
}

type SearchEngine = "duckduckgo" | "bing" | "google";
type NavigationStatus = "idle" | "opening" | "success" | "error";

interface HistoryItem {
	url: string;
	title: string;
	openedAt: number;
}

function normalizeUrl(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return "";
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	return `https://${trimmed}`;
}

function isLikelyUrl(input: string): boolean {
	const value = input.trim();
	if (!value) return false;
	if (/^https?:\/\//i.test(value)) return true;
	return /^(localhost|[\w.-]+\.[a-z]{2,})(:\d+)?(\/.*)?$/i.test(value);
}

function buildSearchUrl(engine: SearchEngine, query: string): string {
	const encoded = encodeURIComponent(query.trim());
	switch (engine) {
		case "google":
			return `https://www.google.com/search?q=${encoded}`;
		case "bing":
			return `https://www.bing.com/search?q=${encoded}`;
		case "duckduckgo":
		default:
			return `https://duckduckgo.com/?q=${encoded}`;
	}
}

export default function BrowserPanel({ initialUrl }: BrowserPanelProps) {
	const [url, setUrl] = useState(initialUrl || "");
	const [inputValue, setInputValue] = useState(initialUrl || "");
	const [history, setHistory] = useState<HistoryItem[]>([]);
	const [historyIndex, setHistoryIndex] = useState(-1);
	const [selectedEngine, setSelectedEngine] =
		useState<SearchEngine>("duckduckgo");
	const [navigationStatus, setNavigationStatus] =
		useState<NavigationStatus>("idle");
	const [error, setError] = useState<string | null>(null);
	const [readerContent, setReaderContent] = useState<PageContent | null>(null);
	const [isReaderLoading, setIsReaderLoading] = useState(false);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		url: string;
		removeIndex?: number;
	} | null>(null);

	const quickLinks = useMemo(
		() => [
			{ name: "Google", url: "https://www.google.com", icon: "🔍" },
			{ name: "GitHub", url: "https://github.com", icon: "🐙" },
			{ name: "Stack Overflow", url: "https://stackoverflow.com", icon: "📚" },
			{ name: "MDN", url: "https://developer.mozilla.org", icon: "📖" },
			{ name: "Hacker News", url: "https://news.ycombinator.com", icon: "🔶" },
			{ name: "Product Hunt", url: "https://www.producthunt.com", icon: "🚀" },
		],
		[],
	);

	const navigateTo = useCallback(
		async (
			target: string,
			options?: {
				recordHistory?: boolean;
				silentToast?: boolean;
			},
		) => {
			const normalized = normalizeUrl(target);
			if (!normalized) return;

			const recordHistory = options?.recordHistory !== false;
			setNavigationStatus("opening");
			setError(null);
			setReaderContent(null);
			setInputValue(normalized);
			setUrl(normalized);

			if (!options?.silentToast) {
				toast.info("正在外部窗口打开...", 1200);
			}

			if (recordHistory) {
				setHistory((prev) => {
					const next = prev.slice(0, historyIndex + 1);
					next.push({
						url: normalized,
						title: normalized,
						openedAt: Date.now(),
					});
					setHistoryIndex(next.length - 1);
					return next;
				});
			}

			try {
				await openBrowserWindow(normalized);
				setNavigationStatus("success");
				if (!options?.silentToast) {
					toast.success("已在外部窗口打开");
				}
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				setNavigationStatus("error");
				setError(message);
				toast.error(`打开失败: ${message}`);
			}
		},
		[historyIndex],
	);

	const handleSearch = useCallback(
		async (query: string) => {
			if (!query.trim()) return;
			await navigateTo(buildSearchUrl(selectedEngine, query));
		},
		[navigateTo, selectedEngine],
	);

	const handleInputSubmit = useCallback(async () => {
		const value = inputValue.trim();
		if (!value) return;
		if (isLikelyUrl(value)) {
			await navigateTo(value);
			return;
		}
		await handleSearch(value);
	}, [handleSearch, inputValue, navigateTo]);

	const goBack = useCallback(() => {
		if (historyIndex <= 0) return;
		const targetIndex = historyIndex - 1;
		const target = history[targetIndex];
		if (!target) return;
		setHistoryIndex(targetIndex);
		void navigateTo(target.url, { recordHistory: false, silentToast: true });
	}, [history, historyIndex, navigateTo]);

	const goForward = useCallback(() => {
		if (historyIndex >= history.length - 1) return;
		const targetIndex = historyIndex + 1;
		const target = history[targetIndex];
		if (!target) return;
		setHistoryIndex(targetIndex);
		void navigateTo(target.url, { recordHistory: false, silentToast: true });
	}, [history, historyIndex, navigateTo]);

	const refresh = useCallback(() => {
		if (!url) return;
		void navigateTo(url, { recordHistory: false });
	}, [navigateTo, url]);

	const openInNewWindow = useCallback(async () => {
		if (!url) return;
		try {
			setNavigationStatus("opening");
			await openBrowserWindow(url);
			setNavigationStatus("success");
			toast.success("已在外部窗口打开");
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			setNavigationStatus("error");
			setError(message);
			toast.error(`打开失败: ${message}`);
		}
	}, [url]);

	const loadReaderMode = useCallback(async () => {
		if (!url) {
			toast.warning("请先输入 URL 或完成一次搜索");
			return;
		}
		setIsReaderLoading(true);
		setError(null);
		try {
			const content = await fetchPageContent(url);
			setReaderContent(content);
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			setError(message);
			toast.error(`阅读模式加载失败: ${message}`);
		} finally {
			setIsReaderLoading(false);
		}
	}, [url]);

	const saveAsSource = useCallback(async () => {
		if (!url) {
			toast.warning("当前没有可保存的链接");
			return;
		}
		try {
			const state = workspaceStore.getState();
			const projectId = state.currentProjectId || undefined;
			const folderId =
				state.currentFolderId && state.currentFolderId !== "__unassigned__"
					? state.currentFolderId
					: undefined;
			await fetchUrlContent({
				url,
				project_id: projectId,
				folder_id: folderId,
			});
			toast.success("已保存为资料");
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			toast.error(`保存失败: ${message}`);
		}
	}, [url]);

	const saveUrlAsSource = useCallback(
		async (targetUrl: string, scope: "global" | "project") => {
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
			toast.success(scope === "project" ? "已保存到当前项目" : "已保存到全局");
		},
		[],
	);

	const contextMenuItems = contextMenu
		? buildLinkContextMenu({
				onOpen: () => void navigateTo(contextMenu.url),
				onCopy: () => {
					void navigator.clipboard.writeText(contextMenu.url);
					toast.success("链接已复制");
				},
				onSaveGlobal: () => void saveUrlAsSource(contextMenu.url, "global"),
				onSaveProject: () => void saveUrlAsSource(contextMenu.url, "project"),
				onRemove:
					typeof contextMenu.removeIndex === "number"
						? () => {
								const removeIndex = contextMenu.removeIndex!;
								setHistory((prev) =>
									prev.filter((_, idx) => idx !== removeIndex),
								);
								setHistoryIndex((prev) => {
									if (prev > removeIndex) return prev - 1;
									if (prev === removeIndex) return Math.max(0, prev - 1);
									return prev;
								});
							}
						: undefined,
			})
		: [];

	const recentHistory = useMemo(() => history.slice(-6).reverse(), [history]);

	return (
		<div className="flex flex-col h-full bg-white dark:bg-[#1E1E1E] relative overflow-hidden">
			<div className="flex items-center gap-2 px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06] bg-white/80 dark:bg-[#1E1E1E]/80 backdrop-blur-xl z-10">
				<div className="flex items-center gap-1">
					<button
						onClick={goBack}
						disabled={historyIndex <= 0}
						aria-label="后退"
						className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
						title="后退"
					>
						<ArrowLeft className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
					</button>
					<button
						onClick={goForward}
						disabled={historyIndex >= history.length - 1}
						aria-label="前进"
						className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
						title="前进"
					>
						<ArrowRight className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
					</button>
					<button
						onClick={refresh}
						disabled={!url || navigationStatus === "opening"}
						aria-label="刷新"
						className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 transition-colors"
						title="刷新"
					>
						{navigationStatus === "opening" ? (
							<Loader2 className="w-4 h-4 text-primary animate-spin" />
						) : (
							<RotateCw className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
						)}
					</button>
					<button
						onClick={() => {
							setReaderContent(null);
							setInputValue("");
							setUrl("");
							setError(null);
							setNavigationStatus("idle");
						}}
						aria-label="返回主页"
						className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
						title="主页"
					>
						<Home className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
					</button>
				</div>

				<div className="flex-1 max-w-3xl mx-auto relative group">
					<div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
						{navigationStatus === "opening" ? (
							<Loader2 className="w-4 h-4 text-primary animate-spin" />
						) : (
							<Search className="w-4 h-4 text-zinc-400" />
						)}
					</div>
					<input
						type="text"
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								void handleInputSubmit();
							}
						}}
						onFocus={(e) => e.currentTarget.select()}
						placeholder="输入网址或搜索内容，按 Enter 在外部窗口打开"
						className="w-full pl-10 pr-4 py-2.5 bg-zinc-100 dark:bg-black/20 border border-transparent focus:border-primary/30 focus:bg-white dark:focus:bg-black/40 rounded-xl text-sm text-zinc-800 dark:text-zinc-200 transition-[border-color,background-color] outline-none shadow-sm"
					/>
				</div>

				<div className="flex items-center gap-1">
					{url && (
						<>
							<button
								onClick={() => void loadReaderMode()}
								aria-label="阅读模式"
								className={`p-2 rounded-lg transition-colors ${readerContent ? "bg-primary/10 text-primary" : "hover:bg-black/5 dark:hover:bg-white/10 text-zinc-600 dark:text-zinc-400"}`}
								title="阅读模式"
							>
								<BookOpen className="w-4 h-4" />
							</button>
							<button
								onClick={() => void openInNewWindow()}
								aria-label="在外部窗口打开"
								className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
								title="在外部窗口打开"
							>
								<ExternalLink className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
							</button>
							<button
								onClick={() => void saveAsSource()}
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
						aria-label="返回编辑器"
						className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
						title="返回编辑器"
					>
						<X className="w-4 h-4" />
					</button>
				</div>
			</div>

			<div className="flex-1 overflow-hidden relative bg-zinc-50/50 dark:bg-[#151515]">
				{readerContent ? (
					<div className="h-full overflow-y-auto">
						<article className="max-w-3xl mx-auto p-8 bg-white dark:bg-[#1E1E1E] min-h-full">
							<header className="mb-8 pb-6 border-b border-zinc-100 dark:border-zinc-800">
								<div className="flex items-start justify-between gap-4">
									<div className="min-w-0">
										<h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-3 leading-tight">
											{readerContent.title}
										</h1>
										{readerContent.description ? (
											<p className="text-zinc-500 dark:text-zinc-400 text-lg">
												{readerContent.description}
											</p>
										) : null}
									</div>
									<button
										type="button"
										onClick={() => setReaderContent(null)}
										className="shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
									>
										退出阅读模式
									</button>
								</div>
								<div className="flex items-center gap-2 mt-4 text-xs text-zinc-400">
									<Globe className="w-3 h-3" />
									<a
										href={readerContent.url}
										target="_blank"
										rel="noreferrer"
										className="hover:text-primary hover:underline truncate max-w-lg"
									>
										{readerContent.url}
									</a>
								</div>
							</header>

							<div className="prose prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-p:leading-relaxed prose-a:text-primary">
								<div className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300 leading-relaxed">
									{readerContent.content}
								</div>
							</div>
						</article>
					</div>
				) : (
					<div className="h-full overflow-y-auto p-8">
						<div className="max-w-2xl mx-auto">
							<div className="text-center mb-10 pt-10">
								<h1 className="text-3xl font-bold text-zinc-800 dark:text-zinc-100 mb-2">
									外部浏览器模式
								</h1>
								<p className="text-zinc-400 mb-6">
									输入网址或搜索词后会在外部窗口打开
								</p>
								<div className="flex justify-center gap-2 mb-4">
									{(["duckduckgo", "bing", "google"] as const).map((engine) => (
										<button
											key={engine}
											onClick={() => setSelectedEngine(engine)}
											className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
												selectedEngine === engine
													? "bg-primary/10 dark:bg-primary/20 text-primary"
													: "bg-white dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700"
											}`}
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
								{isReaderLoading ? (
									<div className="inline-flex items-center gap-2 text-xs text-zinc-500">
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
										加载阅读模式中...
									</div>
								) : null}
							</div>

							<div className="grid grid-cols-3 gap-4">
								{quickLinks.map((link) => (
									<button
										key={link.url}
										onClick={() => void navigateTo(link.url)}
										onContextMenu={(e) => {
											e.preventDefault();
											e.stopPropagation();
											setContextMenu({
												x: e.clientX,
												y: e.clientY,
												url: link.url,
											});
										}}
										className="flex flex-col items-center gap-2 p-4 bg-white dark:bg-zinc-800/50 rounded-2xl hover:shadow-lg hover:scale-[1.02] transition-[transform,box-shadow] group"
									>
										<span className="text-3xl">{link.icon}</span>
										<span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-primary">
											{link.name}
										</span>
									</button>
								))}
							</div>

							{recentHistory.length > 0 ? (
								<div className="mt-8">
									<h3 className="text-sm font-medium text-zinc-500 mb-3">
										最近访问
									</h3>
									<div className="space-y-2">
										{recentHistory.map((item, i) => {
											const sourceIndex = history.length - 1 - i;
											return (
												<button
													key={`${item.url}-${item.openedAt}`}
													onClick={() => void navigateTo(item.url)}
													onContextMenu={(e) => {
														e.preventDefault();
														e.stopPropagation();
														setContextMenu({
															x: e.clientX,
															y: e.clientY,
															url: item.url,
															removeIndex: sourceIndex,
														});
													}}
													className="w-full flex items-center gap-3 p-3 bg-white dark:bg-zinc-800/50 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left"
												>
													<Globe className="w-4 h-4 text-zinc-400" />
													<span className="text-sm text-zinc-600 dark:text-zinc-300 truncate">
														{item.url}
													</span>
												</button>
											);
										})}
									</div>
								</div>
							) : null}

							{error ? (
								<div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl text-red-600 dark:text-red-400 text-sm text-center">
									{error}
								</div>
							) : null}

							<div className="mt-6 p-4 bg-surface dark:bg-zinc-800/50 rounded-xl text-text-secondary text-sm text-center border border-border">
								{navigationStatus === "opening"
									? "正在打开外部窗口..."
									: navigationStatus === "success"
										? "已按外部窗口策略执行"
										: "输入网址或搜索词后按 Enter，将在独立窗口中打开"}
							</div>
						</div>
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
