import {
	CheckCircle2,
	Circle,
	Clock,
	FileText,
	Home,
	LayoutGrid,
	LayoutList,
	Plus,
	Search,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { OutputAsset } from "../../types";

interface EditorDocumentListViewProps {
	onBack?: () => void;
	outputs: OutputAsset[];
	viewMode: "grid" | "list";
	onToggleViewMode: () => void;
	isManaging: boolean;
	onToggleManaging: () => void;
	selectedForManageCount: number;
	isAllSelected: boolean;
	onToggleSelectAll: () => void;
	onRequestBulkDeleteConfirm: () => void;
	isBulkDeleting: boolean;
	onCreateNew: () => void | Promise<void>;
	onSelectOutput: (output: OutputAsset) => void | Promise<void>;
	isSelectedForManage: (id: string) => boolean;
	onToggleManageSelection: (id: string) => void;
}

export function EditorDocumentListView({
	onBack,
	outputs,
	viewMode,
	onToggleViewMode,
	isManaging,
	onToggleManaging,
	selectedForManageCount,
	isAllSelected,
	onToggleSelectAll,
	onRequestBulkDeleteConfirm,
	isBulkDeleting,
	onCreateNew,
	onSelectOutput,
	isSelectedForManage,
	onToggleManageSelection,
}: EditorDocumentListViewProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const normalizedQuery = searchQuery.trim().toLowerCase();
	const filteredOutputs = useMemo(() => {
		if (!normalizedQuery) return outputs;
		return outputs.filter((output) => {
			const title = (output.title || "").toLowerCase();
			const type = (output.output_type || "").toLowerCase();
			return title.includes(normalizedQuery) || type.includes(normalizedQuery);
		});
	}, [normalizedQuery, outputs]);

	const getScopeBadge = (scope?: "global" | "project") => {
		if (scope === "project") {
			return {
				label: "项目内",
				className:
					"bg-zinc-100 dark:bg-zinc-700/70 text-zinc-600 dark:text-zinc-300",
			};
		}
		return {
			label: "全局",
			className:
				"bg-indigo-50 dark:bg-indigo-900/25 text-indigo-600 dark:text-indigo-300",
		};
	};

	return (
		<div className="flex flex-col h-full editor-shell">
			<div className="px-6 py-5 shrink-0 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 bg-white/45 dark:bg-zinc-900/45 backdrop-blur-sm">
				<div className="flex items-center gap-3">
					{onBack ? (
						<button
							onClick={onBack}
							className="p-2 -ml-2 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
							title="返回首页"
						>
							<Home className="w-5 h-5" />
						</button>
					) : null}
					<div>
						<h2 className="font-bold text-xl text-zinc-800 dark:text-zinc-100">
							文档
						</h2>
						<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
							{outputs.length} 篇文档
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={onToggleViewMode}
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
						onClick={onToggleManaging}
						className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${
							isManaging
								? "border-black bg-black text-white dark:border-white dark:bg-white/10 dark:text-white"
								: "border-zinc-200 text-zinc-600 hover:text-zinc-900 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-300"
						}`}
					>
						{isManaging ? "完成" : "管理"}
					</button>
					<button
						onClick={() => void onCreateNew()}
						className="flex items-center gap-2 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
					>
						<Plus className="w-4 h-4" />
						新建
					</button>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-hide">
				{outputs.length > 0 ? (
					<div className="mb-4">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Escape") {
										setSearchQuery("");
									}
								}}
								placeholder="搜索文档标题或类型..."
								className="w-full pl-9 pr-9 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-700 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300/60 dark:focus:ring-zinc-600/60 transition-all"
							/>
							{searchQuery ? (
								<button
									type="button"
									onClick={() => setSearchQuery("")}
									className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
									title="清空搜索"
								>
									<X className="w-3.5 h-3.5" />
								</button>
							) : null}
						</div>
						<div className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
							{normalizedQuery
								? `匹配 ${filteredOutputs.length}/${outputs.length}`
								: `共 ${outputs.length} 篇文档`}
						</div>
					</div>
				) : null}
				{isManaging && outputs.length > 0 ? (
					<div className="flex items-center justify-between mb-4 px-4 py-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl text-sm text-zinc-500">
						<div className="flex items-center gap-3">
							<button
								onClick={onToggleSelectAll}
								className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300"
							>
								{isAllSelected ? (
									<CheckCircle2 className="w-4 h-4" />
								) : (
									<Circle className="w-4 h-4" />
								)}
								{isAllSelected ? "取消全选" : "全选"}
							</button>
							<span>已选择 {selectedForManageCount} 篇</span>
						</div>
						<button
							onClick={onRequestBulkDeleteConfirm}
							disabled={selectedForManageCount === 0 || isBulkDeleting}
							className="px-3 py-1.5 rounded-xl text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 text-sm"
						>
							批量删除
						</button>
					</div>
				) : null}
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
							onClick={() => void onCreateNew()}
							className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-medium transition-colors shadow-sm"
						>
							<Plus className="w-4 h-4" />
							新建文档
						</button>
					</div>
				) : filteredOutputs.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-16 text-center">
						<p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
							没有匹配的文档
						</p>
						<button
							type="button"
							onClick={() => setSearchQuery("")}
							className="text-xs text-zinc-500 dark:text-zinc-300 underline underline-offset-2"
						>
							清空搜索
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
						{filteredOutputs.map((output) => {
							const checked = isSelectedForManage(output.id);
							const scopeBadge = getScopeBadge(output.scope);
							const cardCommon =
								"relative bg-white dark:bg-zinc-800/50 border border-zinc-200/50 dark:border-zinc-700/50 rounded-2xl hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-600 transition-all";
							if (viewMode === "list") {
								return (
									<div
										key={output.id}
										className={`${cardCommon} flex items-center justify-between p-4 mb-3 last:mb-0`}
									>
										<div className="flex items-center gap-4">
											{isManaging ? (
												<button
													onClick={() => onToggleManageSelection(output.id)}
													className="p-1"
												>
													{checked ? (
														<CheckCircle2 className="w-5 h-5 text-black dark:text-white" />
													) : (
														<Circle className="w-5 h-5 text-zinc-400" />
													)}
												</button>
											) : null}
											<div
												onClick={() =>
													!isManaging && void onSelectOutput(output)
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
												<div className="mt-1 flex items-center gap-1.5 flex-wrap">
													<span
														className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${scopeBadge.className}`}
													>
														{scopeBadge.label}
													</span>
													{(output.tags || []).slice(0, 2).map((tag) => (
														<span
															key={`${output.id}-list-tag-${tag}`}
															className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100/80 dark:bg-zinc-700/70 text-zinc-500 dark:text-zinc-300"
														>
															#{tag}
														</span>
													))}
												</div>
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
									{isManaging ? (
										<button
											onClick={() => onToggleManageSelection(output.id)}
											className="absolute top-3 left-3"
										>
											{checked ? (
												<CheckCircle2 className="w-5 h-5 text-black dark:text-white" />
											) : (
												<Circle className="w-5 h-5 text-zinc-300" />
											)}
										</button>
									) : null}
									<button
										onClick={() => !isManaging && void onSelectOutput(output)}
										className="text-left flex-1"
									>
										<div className="flex items-start justify-between mb-3">
											<div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-700 rounded-xl flex items-center justify-center text-zinc-500 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors">
												<FileText className="w-5 h-5" />
											</div>
											<div className="flex items-center gap-1.5 flex-wrap justify-end">
												<span
													className={`text-[10px] font-medium px-2 py-1 rounded-lg ${scopeBadge.className}`}
												>
													{scopeBadge.label}
												</span>
												<span className="text-[10px] font-medium px-2 py-1 bg-zinc-100 dark:bg-zinc-700 rounded-lg text-zinc-500">
													{output.output_type || "Article"}
												</span>
											</div>
										</div>
										<h4 className="font-semibold text-zinc-800 dark:text-zinc-100 line-clamp-2 mb-auto leading-snug">
											{output.title || "无标题文档"}
										</h4>
										{(output.tags || []).length > 0 ? (
											<div className="mt-2 flex items-center gap-1.5 flex-wrap">
												{(output.tags || []).slice(0, 2).map((tag) => (
													<span
														key={`${output.id}-grid-tag-${tag}`}
														className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-100/80 dark:bg-zinc-700/70 text-zinc-500 dark:text-zinc-300"
													>
														#{tag}
													</span>
												))}
											</div>
										) : null}
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
		</div>
	);
}
