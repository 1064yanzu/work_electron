import {
	ExternalLink,
	Globe,
	Loader2,
	Monitor,
	Plus,
	Search,
	X,
} from "lucide-react";
import { useState } from "react";
import { fetchUrlContent } from "../lib/api";
import { type BrowserSearchResult, smartBrowserSearch } from "../lib/config";
import { workspaceStore } from "../lib/workspaceStore";

interface WebSearchPanelProps {
	onAddSource?: (sourceId: string) => void;
	onClose?: () => void;
}

/**
 * Web 搜索面板
 * 混合策略：
 * - 默认使用 HTTP API（DuckDuckGo 无需 Key，跨平台稳定）
 * - 可选启用浏览器模式（需要 Chrome，更强大）
 */
export default function WebSearchPanel({
	onAddSource,
	onClose,
}: WebSearchPanelProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<BrowserSearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [selectedEngine, setSelectedEngine] = useState<
		"duckduckgo" | "bing" | "google"
	>("duckduckgo");
	const [useBrowser, setUseBrowser] = useState(false); // 默认关闭浏览器模式
	const [error, setError] = useState<string | null>(null);
	const [addingUrl, setAddingUrl] = useState<string | null>(null);

	const handleSearch = async () => {
		if (!query.trim()) return;

		setIsSearching(true);
		setError(null);

		try {
			console.log(
				"[WebSearch] 搜索:",
				query,
				"引擎:",
				selectedEngine,
				"浏览器模式:",
				useBrowser,
			);
			const searchResults = await smartBrowserSearch({
				query: query.trim(),
				engine: selectedEngine,
				use_playwright: useBrowser,
				limit: 10,
			});
			console.log("[WebSearch] 结果:", searchResults.length, "条");
			setResults(searchResults);
		} catch (e) {
			console.error("[WebSearch] 搜索失败:", e);
			const errorMsg = e instanceof Error ? e.message : String(e);
			if (
				useBrowser &&
				(errorMsg.includes("启动浏览器") || errorMsg.includes("Chrome"))
			) {
				setError("浏览器模式需要安装 Chrome。请关闭浏览器模式或安装 Chrome。");
			} else {
				setError(errorMsg);
			}
			setResults([]);
		} finally {
			setIsSearching(false);
		}
	};

	const handleAddAsSource = async (result: BrowserSearchResult) => {
		setAddingUrl(result.url);
		try {
			console.log("[WebSearch] 添加资料:", result.url);
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
			console.log("[WebSearch] 资料已添加:", source.id);
			onAddSource?.(source.id);
		} catch (e) {
			console.error("[WebSearch] 添加资料失败:", e);
			setError(e instanceof Error ? e.message : "添加失败");
		} finally {
			setAddingUrl(null);
		}
	};

	const engines = [
		{ id: "duckduckgo", name: "DuckDuckGo", icon: "🦆" },
		{ id: "bing", name: "Bing", icon: "🔍" },
		{ id: "google", name: "Google", icon: "🌐" },
	] as const;

	return (
		<div className="flex flex-col h-full bg-white dark:bg-[#1E1E1E]">
			{/* Header */}
			<div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Globe className="w-4 h-4 text-blue-500" />
					<span className="font-medium text-sm text-zinc-800 dark:text-zinc-200">
						网络搜索
					</span>
				</div>
				{onClose && (
					<button
						onClick={onClose}
						className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
					>
						<X className="w-4 h-4" />
					</button>
				)}
			</div>

			{/* Search Input */}
			<div className="p-4 space-y-3">
				{/* Engine Selector */}
				<div className="flex gap-1 flex-wrap">
					{engines.map((engine) => (
						<button
							key={engine.id}
							onClick={() => setSelectedEngine(engine.id)}
							className={`
                px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${
									selectedEngine === engine.id
										? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
										: "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
								}
              `}
						>
							<span className="mr-1">{engine.icon}</span>
							{engine.name}
						</button>
					))}
				</div>

				{/* Browser Mode Toggle */}
				<div className="flex items-center justify-between px-1">
					<div className="flex items-center gap-2">
						<Monitor className="w-3.5 h-3.5 text-zinc-400" />
						<span className="text-xs text-zinc-500">浏览器模式</span>
					</div>
					<button
						onClick={() => setUseBrowser(!useBrowser)}
						className={`
              relative w-9 h-5 rounded-full transition-colors
              ${useBrowser ? "bg-blue-500" : "bg-zinc-200 dark:bg-zinc-700"}
            `}
					>
						<span
							className={`
                absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform
                ${useBrowser ? "translate-x-4" : "translate-x-0.5"}
              `}
						/>
					</button>
				</div>
				{useBrowser && (
					<p className="text-[10px] text-amber-600 dark:text-amber-400 px-1">
						⚠️ 浏览器模式需要安装 Chrome，Windows 用户可能需要额外配置
					</p>
				)}

				{/* Search Box */}
				<div className="relative">
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleSearch()}
						placeholder="搜索网络内容..."
						className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-none text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
					/>
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
					{isSearching && (
						<Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
					)}
				</div>

				{/* Search Button */}
				<button
					onClick={handleSearch}
					disabled={isSearching || !query.trim()}
					className="w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
				>
					{isSearching ? (
						<>
							<Loader2 className="w-4 h-4 animate-spin" />
							搜索中...
						</>
					) : (
						<>
							<Search className="w-4 h-4" />
							搜索
						</>
					)}
				</button>
			</div>

			{/* Error */}
			{error && (
				<div className="mx-4 mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
					{error}
				</div>
			)}

			{/* Results */}
			<div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 scrollbar-hide">
				{results.length === 0 && !isSearching && query && (
					<div className="text-center py-8 text-zinc-400 text-sm">
						未找到相关结果
					</div>
				)}

				{results.map((result, idx) => (
					<div
						key={idx}
						className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="flex-1 min-w-0">
								<a
									href={result.url}
									target="_blank"
									rel="noopener noreferrer"
									className="font-medium text-sm text-zinc-800 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400 line-clamp-2 flex items-center gap-1"
								>
									{result.title}
									<ExternalLink className="w-3 h-3 shrink-0 opacity-50" />
								</a>
								<p className="text-xs text-zinc-400 mt-1 line-clamp-2">
									{result.snippet}
								</p>
								<p className="text-[10px] text-zinc-300 dark:text-zinc-600 mt-2 truncate">
									{result.url}
								</p>
							</div>
							<button
								onClick={() => handleAddAsSource(result)}
								disabled={addingUrl === result.url}
								className="shrink-0 p-2 rounded-lg text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors opacity-0 group-hover:opacity-100"
								title="添加为资料"
							>
								{addingUrl === result.url ? (
									<Loader2 className="w-4 h-4 animate-spin" />
								) : (
									<Plus className="w-4 h-4" />
								)}
							</button>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
