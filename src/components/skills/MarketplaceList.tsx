/**
 * MarketplaceList —— 市场卡片网格 + 搜索栏
 */

import { AlertTriangle, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	skillsMarketplaceStore,
	useMarketplaceStore,
} from "../../lib/skillsMarketplaceStore";
import { Select } from "../ui/Select";
import { MarketplaceCard } from "./MarketplaceCard";

export function MarketplaceList() {
	const { entries, errors, loading, progress, config } = useMarketplaceStore();
	const [query, setQuery] = useState("");
	const [sourceId, setSourceId] = useState("");

	useEffect(() => {
		const t = setTimeout(() => {
			skillsMarketplaceStore.search(query, sourceId || undefined);
		}, 300);
		return () => clearTimeout(t);
	}, [query, sourceId]);

	const sourceOptions = useMemo(() => {
		const list = config?.sources?.filter((s) => s.enabled) ?? [];
		return [
			{ value: "", label: "全部启用源" },
			...list.map((s) => ({ value: s.id, label: s.name })),
		];
	}, [config?.sources]);

	return (
		<div className="flex flex-col h-full">
			{/* 搜索 / 源筛选 */}
			<div className="px-4 py-3 flex gap-2 shrink-0">
				<div className="relative flex-1">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light" />
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="搜索市场技能…"
						className="w-full pl-9 pr-8 py-2 text-xs bg-warm-200/80/50 border-none rounded-lg text-text-secondary placeholder:text-text-light focus:outline-none focus:ring-1 focus:ring-primary/30"
					/>
					{query && (
						<button
							type="button"
							onClick={() => setQuery("")}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-light hover:text-text-secondary"
						>
							<X className="w-3 h-3" />
						</button>
					)}
				</div>
				<Select
					value={sourceId}
					onChange={(e) => setSourceId(e.target.value)}
					variant="compact"
					options={sourceOptions}
					containerClassName="w-32"
				/>
			</div>

			{/* 错误提示 */}
			{errors.length > 0 && (
				<div className="mx-4 mb-2 rounded-lg border border-amber-200/70 dark:border-amber-500/30 bg-peach-100/70 dark:bg-peach-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-2">
					<AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
					<div className="flex-1">
						部分来源不可达：
						{errors.map((e) => (
							<div key={e.sourceId} className="font-mono truncate">
								{e.sourceId}: {e.error}
							</div>
						))}
					</div>
				</div>
			)}

			{/* 列表 */}
			<div className="flex-1 overflow-y-auto scrollbar-hide px-4 pb-6">
				{loading && entries.length === 0 ? (
					<div className="text-center py-10 text-xs text-text-muted">
						加载中…
					</div>
				) : entries.length === 0 ? (
					<div className="text-center py-10 mt-6">
						<p className="text-sm text-text-muted font-medium">未找到技能</p>
						<p className="text-xs text-text-light mt-1.5">
							试试更换关键词，或在「设置 → Agent 技能 → 市场源」检查源连通性
						</p>
					</div>
				) : (
					<div className="space-y-2">
						{entries.map((entry) => (
							<MarketplaceCard
								key={entry.id}
								entry={entry}
								progress={progress[entry.id]}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
