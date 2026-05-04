import { Globe, Loader2, Plus, Search } from "lucide-react";
import { useState } from "react";
import { createSource } from "../../lib/api";
import { smartWebSearch } from "../../lib/config";
import type { WebSearchResult } from "../../types";
import { toast } from "./Toast";
import { Select } from "./Select";

interface WebSearchPanelProps {
	onClose: () => void;
	onAddSource?: (url: string) => void;
}

export function WebSearchPanel({ onClose, onAddSource }: WebSearchPanelProps) {
	const [query, setQuery] = useState("");
	const [engine, setEngine] = useState<"duckduckgo" | "google" | "bing">(
		"duckduckgo",
	);
	const [results, setResults] = useState<WebSearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);

	const handleSearch = async () => {
		if (!query.trim()) return;

		setIsSearching(true);
		try {
			const searchResults = await smartWebSearch({ query, engine, limit: 10 });
			setResults(searchResults);
		} catch (error) {
			console.error("搜索失败:", error);
			toast.error(
				`搜索失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			setIsSearching(false);
		}
	};

	const handleAddToSources = async (result: WebSearchResult) => {
		try {
			await createSource({
				title: result.title,
				kind: "Url" as any,
				url: result.url,
				tags: ["web-search"],
			});
			toast.success(`已添加到输入源: ${result.title}`);
			if (onAddSource) {
				onAddSource(result.url);
			}
		} catch (error) {
			console.error("添加失败:", error);
			toast.error(
				`添加失败: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	};

	return (
		<div
			className="fixed inset-0 bg-cream-900/30 backdrop-blur-sm flex items-center justify-center z-50"
			onClick={onClose}
		>
			<div
				className="bg-surface rounded-2xl shadow-bai-pop border border-border w-full max-w-3xl max-h-[80vh] flex flex-col"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="p-6 border-b border-border">
					<div className="flex items-center gap-3 mb-4">
						<Globe className="w-6 h-6 text-text-secondary" strokeWidth={1.5} />
						<h2 className="text-lg font-semibold text-text-primary tracking-tight">
							网页搜索
						</h2>
					</div>

					{/* Search Bar */}
					<div className="flex gap-2">
						<div className="flex-1 relative">
							<Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
							<input
								type="text"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								onKeyPress={(e) => e.key === "Enter" && handleSearch()}
								placeholder="搜索网页内容..."
								className="w-full pl-10 pr-4 py-2.5 bg-surface border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
								autoFocus
							/>
						</div>

						<Select
							value={engine}
							onChange={(e) => setEngine(e.target.value as any)}
							options={[
								{ value: "duckduckgo", label: "DuckDuckGo" },
								{ value: "google", label: "Google" },
								{ value: "bing", label: "Bing" },
							]}
							containerClassName="w-36"
						/>

						<button
							onClick={handleSearch}
							disabled={isSearching || !query.trim()}
							className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
						>
							{isSearching ? (
								<>
									<Loader2 className="w-4 h-4 animate-spin" />
									搜索中
								</>
							) : (
								"搜索"
							)}
						</button>
					</div>

					{engine !== "duckduckgo" && (
						<p className="text-xs text-peach-500 mt-2">
							⚠️ {engine === "google" ? "Google" : "Bing"} 搜索需要配置 API
							密钥（环境变量）
						</p>
					)}
				</div>

				{/* Results */}
				<div className="flex-1 overflow-y-auto p-6">
					{results.length === 0 && !isSearching && (
						<div className="text-center py-12 text-text-muted">
							<Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
							<p>输入关键词开始搜索</p>
						</div>
					)}

					{isSearching && (
						<div className="text-center py-12">
							<Loader2 className="w-8 h-8 mx-auto mb-3 text-primary animate-spin" />
							<p className="text-text-secondary">正在搜索...</p>
						</div>
					)}

					<div className="space-y-3">
						{results.map((result, index) => (
							<div
								key={index}
								className="p-4 bg-surface hover:bg-border/30 rounded-lg border border-border transition-colors group"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="flex-1 min-w-0">
										<h3 className="font-medium text-text-primary mb-1 line-clamp-1">
											{result.title}
										</h3>
										<p className="text-sm text-text-secondary line-clamp-2 mb-2">
											{result.snippet}
										</p>
										<a
											href={result.url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-xs text-primary hover:underline truncate block"
										>
											{result.url}
										</a>
									</div>

									<button
										onClick={() => handleAddToSources(result)}
										className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-colors text-sm font-medium whitespace-nowrap flex items-center gap-1.5 opacity-0 group-hover:opacity-100"
									>
										<Plus className="w-3.5 h-3.5" />
										添加
									</button>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Footer */}
				<div className="p-4 border-t border-border flex justify-end gap-2">
					<button
						onClick={onClose}
						className="px-4 py-2 bg-surface border border-border rounded-lg hover:bg-border/30 transition-colors text-sm font-medium"
					>
						关闭
					</button>
				</div>
			</div>
		</div>
	);
}
