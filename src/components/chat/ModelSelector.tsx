import {
	Check,
	ChevronRight,
	Search,
	Zap,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getModelIcon } from "../Settings/modelIcons";

export interface Model {
	id: string;
	provider: string;
}

interface ModelSelectorProps {
	models: Model[];
	activeModel: string | null;
	onSelect: (modelId: string) => void;
	onClose: () => void;
	className?: string; // 允许外部控制定位
}

// 供应商配置
const PROVIDER_CONFIG: Record<
	string,
	{
		label: string;
		order: number;
		color: string;
	}
> = {
	anthropic: { label: "Anthropic", order: 1, color: "text-orange-500" },
	openai: { label: "OpenAI", order: 2, color: "text-emerald-500" },
	google: { label: "Google", order: 3, color: "text-blue-500" },
	deepseek: { label: "DeepSeek", order: 0, color: "text-indigo-500" }, // DeepSeek 优先
	default: { label: "Other", order: 99, color: "text-zinc-500" },
};

function getProviderInfo(provider: string) {
	const key = provider.toLowerCase();
	// 简单匹配
	if (key.includes("anthropic")) return PROVIDER_CONFIG.anthropic;
	if (key.includes("openai")) return PROVIDER_CONFIG.openai;
	if (key.includes("google")) return PROVIDER_CONFIG.google;
	if (key.includes("deepseek")) return PROVIDER_CONFIG.deepseek;
	return { ...PROVIDER_CONFIG.default, label: provider }; // Fallback
}

function formatModelName(modelId: string): string {
	const name = modelId.split("/").pop() || modelId;
	// 简单的格式化：去除连字符，首字母大写
	return name
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ModelSelector({
	models,
	activeModel,
	onSelect,
	onClose,
	className = "",
}: ModelSelectorProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	// 默认展开所有分组，或者只展开当前模型的分组
	// 为了更好的体验，默认展开 activeModel 所在的分组
	const activeProvider = models.find((m) => m.id === activeModel)?.provider;
	const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
		new Set(activeProvider ? [activeProvider] : []),
	);

	useEffect(() => {
		// 打开时聚焦搜索框
		requestAnimationFrame(() => {
			inputRef.current?.focus();
		});
	}, []);

	// 处理数据分组
	const groups = useMemo(() => {
		const filtered = searchQuery
			? models.filter(
				(m) =>
					m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
					m.provider.toLowerCase().includes(searchQuery.toLowerCase()),
			)
			: models;

		const g = filtered.reduce(
			(acc, model) => {
				const p = model.provider;
				if (!acc[p]) acc[p] = [];
				acc[p].push(model);
				return acc;
			},
			{} as Record<string, Model[]>,
		);

		// 排序分组
		return Object.entries(g).sort((a, b) => {
			const infoA = getProviderInfo(a[0]);
			const infoB = getProviderInfo(b[0]);
			return infoA.order - infoB.order;
		});
	}, [models, searchQuery]);

	const toggleProvider = (p: string) => {
		setExpandedProviders((prev) => {
			const next = new Set(prev);
			if (next.has(p)) next.delete(p);
			else next.add(p);
			return next;
		});
	};

	return (
		<>
			{/* 透明遮罩，点击关闭 */}
			<div className="fixed inset-0 z-40" onClick={onClose} />

			<div
				className={`absolute z-50 flex flex-col bg-white dark:bg-[#1a1a1a] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden w-72 animate-in fade-in zoom-in-95 duration-100 origin-bottom-left ${className}`}
				style={{ maxHeight: "400px" }}
			>
				{/* 搜索头 */}
				<div className="shrink-0 p-3 border-b border-zinc-100 dark:border-zinc-800/50">
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
						<input
							ref={inputRef}
							type="text"
							placeholder="Search models..."
							className="w-full bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-zinc-100 text-sm rounded-lg pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-700 placeholder:text-zinc-500"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>
				</div>

				{/* 列表内容 */}
				<div className="flex-1 overflow-y-auto p-1.5 space-y-1 custom-scrollbar">
					{groups.length === 0 ? (
						<div className="p-4 text-center text-xs text-zinc-500">
							No models found
						</div>
					) : (
						groups.map(([provider, providerModels]) => {
							const info = getProviderInfo(provider);
							const isExpanded =
								expandedProviders.has(provider) || searchQuery.length > 0; // 搜索时默认全部展开

							return (
								<div key={provider} className="rounded-lg overflow-hidden">
									{/* 分组标题 */}
									{!searchQuery && (
										<button
											onClick={() => toggleProvider(provider)}
											className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group"
										>
											<div className="flex items-center gap-2">
												<span
													className={`text-[10px] font-bold uppercase tracking-wider ${info.color}`}
												>
													{info.label}
												</span>
												<span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-full">
													{providerModels.length}
												</span>
											</div>
											<ChevronRight
												className={`w-3 h-3 text-zinc-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
											/>
										</button>
									)}

									{/* 模型列表 */}
									{(isExpanded || searchQuery) && (
										<div className="space-y-0.5 mt-0.5 pb-1">
											{providerModels.map((model) => {
												const isActive = activeModel === model.id;
												const icon = getModelIcon(model.id);

												return (
													<button
														key={model.id}
														onClick={() => {
															onSelect(model.id);
															onClose();
														}}
														className={`w-full text-left flex items-start gap-3 px-2.5 py-2 rounded-lg transition-all border border-transparent ${isActive
															? "bg-zinc-100 dark:bg-[#262626] border-zinc-200 dark:border-zinc-700/50 shadow-sm"
															: "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400"
															}`}
													>
														{/* 模型图标 */}
														<div className="shrink-0 mt-0.5">
															{icon ? (
																<img
																	src={icon}
																	alt={model.id}
																	className="w-4 h-4 object-contain opacity-80"
																/>
															) : (
																<Zap className="w-4 h-4 text-zinc-400" />
															)}
														</div>

														<div className="flex-1 min-w-0">
															<div
																className={`text-sm font-medium truncate ${isActive ? "text-zinc-900 dark:text-zinc-100" : ""}`}
															>
																{formatModelName(model.id)}
															</div>
															<div className="text-[10px] text-zinc-400 truncate opacity-60">
																{model.id}
															</div>
														</div>

														{isActive && (
															<Check className="w-3.5 h-3.5 text-zinc-900 dark:text-zinc-100 mt-1" />
														)}
													</button>
												);
											})}
										</div>
									)}
								</div>
							);
						})
					)}
				</div>
			</div>
		</>
	);
}
