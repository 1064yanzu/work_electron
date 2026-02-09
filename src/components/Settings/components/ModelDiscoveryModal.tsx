import {
	Box,
	Check,
	ChevronDown,
	ChevronRight,
	Loader2,
	Plus,
	RefreshCw,
	Search,
	Server,
	Sparkles,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type DiscoveredModel,
	fetchModelsFromProvider,
} from "../../../lib/model-discovery";
import { type Provider } from "../constants";
import { getModelIcon } from "../modelIcons";

interface ModelDiscoveryModalProps {
	isOpen: boolean;
	onClose: () => void;
	provider: Provider;
	onAddModels: (models: string[]) => void;
}

export function ModelDiscoveryModal({
	isOpen,
	onClose,
	provider,
	onAddModels,
}: ModelDiscoveryModalProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>(
		[],
	);
	const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
	const [searchQuery, setSearchQuery] = useState("");

	// 折叠状态管理
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);

	// 初始化：自动获取
	useEffect(() => {
		if (isOpen && provider) {
			handleFetch();
		}
	}, [isOpen, provider]);

	const handleFetch = async () => {
		setIsLoading(true);
		setError(null);
		try {
			const result = await fetchModelsFromProvider(provider);
			if (result.error) {
				setError(result.error);
			} else {
				setDiscoveredModels(result.models);
			}
		} catch (e) {
			setError("未知错误");
		} finally {
			setIsLoading(false);
		}
	};

	// 过滤和分组
	const filteredModels = useMemo(() => {
		if (!searchQuery) return discoveredModels;
		const lower = searchQuery.toLowerCase();
		return discoveredModels.filter((m) => m.id.toLowerCase().includes(lower));
	}, [discoveredModels, searchQuery]);

	const groupedModels = useMemo(() => {
		const groups: Record<string, DiscoveredModel[]> = {};
		filteredModels.forEach((m) => {
			const parts = m.id.split(/[-/:]/);
			// 优化分组逻辑：取第一个有意义的部分，或者根据已知厂商
			let groupName = parts.length > 1 ? parts[0] : m.owned_by || "other";

			// 特殊处理一些常见前缀
			if (m.id.startsWith("gpt-")) groupName = "OpenAI GPT";
			if (m.id.startsWith("claude-")) groupName = "Anthropic Claude";
			if (m.id.startsWith("gemini-")) groupName = "Google Gemini";
			if (m.id.startsWith("deepseek-")) groupName = "DeepSeek";

			if (!groups[groupName]) groups[groupName] = [];
			groups[groupName].push(m);
		});
		// 排序 groups
		return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
	}, [filteredModels]);

	const toggleModel = (id: string) => {
		setSelectedModels((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleGroupSelection = (models: DiscoveredModel[]) => {
		const allSelected = models.every((m) => selectedModels.has(m.id));
		setSelectedModels((prev) => {
			const next = new Set(prev);
			models.forEach((m) => {
				if (allSelected) next.delete(m.id);
				else next.add(m.id);
			});
			return next;
		});
	};

	const toggleGroupCollapse = (groupName: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(groupName)) next.delete(groupName);
			else next.add(groupName);
			return next;
		});
	};

	const handleConfirm = () => {
		onAddModels(Array.from(selectedModels));
		onClose();
	};

	const existingModelSet = useMemo(
		() => new Set(provider.models),
		[provider.models],
	);

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 font-sans">
			<div
				className="w-full max-w-2xl bg-background dark:bg-zinc-900 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-zinc-200/70 dark:border-zinc-700 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
				style={{ height: "85vh", maxHeight: "850px" }}
			>
				{/* Header */}
				<div className="px-6 py-5 bg-white border-b border-zinc-100 flex items-center justify-between shrink-0">
					<div>
						<h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
							<Server className="w-5 h-5 text-zinc-500" />
							发现模型
						</h2>
						<p className="text-xs text-zinc-400 mt-1">
							从{" "}
							<span className="font-medium text-zinc-600">{provider.name}</span>{" "}
							获取最新的模型列表
						</p>
					</div>
					<button
						onClick={onClose}
						className="p-2 hover:bg-zinc-100 rounded-full transition-colors text-zinc-400 hover:text-zinc-600"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Toolbar */}
				<div className="px-6 py-4 bg-white border-b border-zinc-100 flex gap-3 shrink-0">
					<div className="relative flex-1 group">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-zinc-600 transition-colors" />
						<input
							type="text"
							placeholder="搜索模型 ID..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-transparent focus:bg-white focus:border-zinc-200 rounded-xl text-sm outline-none transition-all"
						/>
					</div>
					<button
						onClick={handleFetch}
						disabled={isLoading}
						className="px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-600 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm"
					>
						<RefreshCw
							className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
						/>
						刷新列表
					</button>
				</div>

				{/* Content */}
				<div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
					{error ? (
						<div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
							<div className="p-4 bg-red-50 rounded-full text-red-500 mb-2">
								<Server className="w-8 h-8" />
							</div>
							<p className="font-medium text-zinc-700">获取失败</p>
							<p className="text-sm text-center max-w-xs opacity-80 bg-white px-4 py-2 rounded-lg border border-red-100 text-red-600">
								{error}
							</p>
							<button
								onClick={handleFetch}
								className="mt-4 text-blue-600 hover:underline text-sm font-medium"
							>
								重试连接
							</button>
						</div>
					) : isLoading && discoveredModels.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-4">
							<Loader2 className="w-10 h-10 animate-spin text-zinc-300" />
							<p className="text-sm font-medium text-zinc-500">
								正在连接 {provider.name} API...
							</p>
						</div>
					) : discoveredModels.length === 0 ? (
						<div className="flex flex-col items-center justify-center h-full text-zinc-400">
							<Box className="w-16 h-16 mb-4 opacity-10" />
							<p className="text-zinc-500 font-medium">未找到任何模型</p>
							<p className="text-xs mt-1">请尝试刷新或检查网络连接</p>
						</div>
					) : (
						<div className="space-y-4">
							{groupedModels.map(([groupName, models]) => {
								const isCollapsed = collapsedGroups.has(groupName);
								const allSelected = models.every((m) =>
									selectedModels.has(m.id),
								);

								return (
									<div
										key={groupName}
										className="bg-white rounded-2xl border border-zinc-100 shadow-sm overflow-hidden"
									>
										{/* Group Header */}
										<div
											className="flex items-center justify-between px-4 py-3 bg-zinc-50/50 border-b border-zinc-100 cursor-pointer hover:bg-zinc-50 transition-colors select-none"
											onClick={() => toggleGroupCollapse(groupName)}
										>
											<div className="flex items-center gap-2">
												{isCollapsed ? (
													<ChevronRight className="w-4 h-4 text-zinc-400" />
												) : (
													<ChevronDown className="w-4 h-4 text-zinc-400" />
												)}
												<h3 className="text-sm font-semibold text-zinc-700 flex items-center gap-2 uppercase tracking-tight">
													{groupName}
													<span className="bg-zinc-200/60 text-zinc-500 px-1.5 py-0.5 rounded text-[10px] font-bold">
														{models.length}
													</span>
												</h3>
											</div>
											<div
												className="flex items-center gap-3"
												onClick={(e) => e.stopPropagation()}
											>
												<button
													onClick={() => toggleGroupSelection(models)}
													className="text-xs font-medium text-zinc-400 hover:text-blue-600 transition-colors px-2 py-1 hover:bg-blue-50 rounded-md"
												>
													{allSelected ? "取消全选" : "全选"}
												</button>
											</div>
										</div>

										{/* Group Content */}
										{!isCollapsed && (
											<div className="divide-y divide-zinc-50">
												{models.map((model) => {
													const isSelected = selectedModels.has(model.id);
													const isExisting = existingModelSet.has(model.id);

													return (
														<div
															key={model.id}
															onClick={() =>
																!isExisting && toggleModel(model.id)
															}
															className={`
                                group flex items-center justify-between px-4 py-3 transition-all duration-200
                                ${isExisting ? "opacity-60 bg-zinc-50/30 cursor-default" : "cursor-pointer hover:bg-zinc-50"}
                                ${isSelected && !isExisting ? "bg-blue-50/30" : ""}
                              `}
														>
															<div className="flex items-center gap-3 min-w-0 flex-1">
																{/* Checkbox Icon */}
																<div
																	className={`
                                  w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0
                                  ${
																		isExisting
																			? "bg-zinc-100 border-zinc-200 text-zinc-400"
																			: isSelected
																				? "bg-blue-500 border-blue-500 text-white shadow-sm shadow-blue-200"
																				: "border-zinc-300 text-transparent group-hover:border-zinc-400 bg-white"
																	}
                                `}
																>
																	<Check
																		className="w-3.5 h-3.5"
																		strokeWidth={3}
																	/>
																</div>

																<div className="min-w-0 flex-1 flex items-center gap-3">
																	{getModelIcon(model.id) ? (
																		<img
																			src={getModelIcon(model.id)}
																			alt={model.id}
																			className="w-5 h-5 object-contain shrink-0"
																		/>
																	) : null}
																	<div className="flex items-center gap-2 flex-wrap min-w-0">
																		<span
																			className={`text-sm font-medium truncate ${isSelected && !isExisting ? "text-blue-700" : "text-zinc-700"}`}
																		>
																			{model.id}
																		</span>
																		{isExisting && (
																			<span className="text-[10px] px-1.5 py-0.5 bg-zinc-100 text-zinc-400 rounded border border-zinc-200 flex items-center gap-1 shrink-0">
																				<Check className="w-2.5 h-2.5" />
																				已添加
																			</span>
																		)}
																	</div>
																</div>
															</div>

															{/* Right Action (Optional) */}
															{!isExisting && (
																<div
																	className={`
                                  w-8 h-8 flex items-center justify-center rounded-full transition-all ml-2
                                  ${
																		isSelected
																			? "text-blue-500 bg-blue-50"
																			: "text-zinc-300 group-hover:text-zinc-400 bg-transparent group-hover:bg-zinc-100"
																	}
                                `}
																>
																	{isSelected ? (
																		<Check className="w-4 h-4" />
																	) : (
																		<Plus className="w-4 h-4" />
																	)}
																</div>
															)}
														</div>
													);
												})}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="px-6 py-5 bg-white border-t border-zinc-100 flex justify-between items-center shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.02)] z-10">
					<div className="text-sm text-zinc-500 flex items-center gap-2">
						<div className="w-2 h-2 rounded-full bg-blue-500"></div>
						已选择{" "}
						<span className="font-bold text-zinc-900">
							{selectedModels.size}
						</span>{" "}
						个模型
					</div>
					<div className="flex gap-3">
						<button
							onClick={onClose}
							className="px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
						>
							取消
						</button>
						<button
							onClick={handleConfirm}
							disabled={selectedModels.size === 0}
							className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-medium shadow-lg shadow-zinc-500/20 transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
						>
							<Sparkles className="w-4 h-4 text-yellow-300" />
							添加选中模型
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
