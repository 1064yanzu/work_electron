/**
 * MarketplaceList —— 市场列表 + 搜索 + 源筛选 + 错误折叠
 */

import { AlertTriangle, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	skillsMarketplaceStore,
	useMarketplaceStore,
} from "../../lib/skillsMarketplaceStore";
import type { MarketplaceSourceConfig } from "../../lib/config";
import { cn } from "../../lib/utils";
import { Select } from "../ui/Select";
import { MarketplaceCard } from "./MarketplaceCard";

export function MarketplaceList() {
	const { entries, errors, loading, progress, config } = useMarketplaceStore();
	const [query, setQuery] = useState("");
	const [sourceId, setSourceId] = useState("");
	const [errorsExpanded, setErrorsExpanded] = useState(false);
	const [visibleCount, setVisibleCount] = useState(50);

	useEffect(() => {
		const t = setTimeout(() => {
			skillsMarketplaceStore.search(query, sourceId || undefined);
		}, 300);
		return () => clearTimeout(t);
	}, [query, sourceId]);

	// 切换搜索条件或源筛选时，重置可见条数
	useEffect(() => {
		setVisibleCount(50);
	}, [query, sourceId]);

	const sourceOptions = useMemo(() => {
		const list = config?.sources?.filter((s) => s.enabled) ?? [];
		return [
			{ value: "", label: "全部启用源" },
			...list.map((s) => ({ value: s.id, label: s.name })),
		];
	}, [config?.sources]);

	const handleDisableSource = async (sourceIdToDisable: string) => {
		if (!config?.sources) return;
		const next: MarketplaceSourceConfig[] = config.sources.map((s) =>
			s.id === sourceIdToDisable ? { ...s, enabled: false } : s,
		);
		await skillsMarketplaceStore.saveConfig({ sources: next });
		// 重新拉一下
		skillsMarketplaceStore.search(query, sourceId || undefined);
	};

	const handleRetry = () => {
		skillsMarketplaceStore.search(query, sourceId || undefined);
	};

	const sourceName = (sid: string) =>
		config?.sources?.find((s) => s.id === sid)?.name ?? sid;

	return (
		<div className="flex flex-col h-full">
			{/* 搜索 / 源筛选 */}
			<div className="px-5 pt-4 pb-3 shrink-0 space-y-2.5">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light pointer-events-none" />
					<input
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="搜索市场技能…"
						className="w-full pl-9 pr-8 py-2 text-xs bg-surface dark:bg-cream-900/40 border border-cream-300/80 dark:border-cream-500/30 rounded-lg text-text-secondary placeholder:text-text-light focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/8 transition"
					/>
					{query && (
						<button
							type="button"
							onClick={() => setQuery("")}
							className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-light hover:text-text-secondary hover:bg-cream-200/70"
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
					containerClassName="w-full"
				/>
			</div>

			{/* 错误胶囊：折叠态 = 一行警告 + 数量；展开态 = 列出每个源 + 一键禁用 */}
			{errors.length > 0 && (
				<div className="mx-5 mb-2 shrink-0">
					<button
						type="button"
						onClick={() => setErrorsExpanded((v) => !v)}
						className={cn(
							"w-full flex items-center gap-2 px-3 py-2 rounded-lg",
							"bg-amber-50/80 dark:bg-amber-500/10",
							"border border-amber-200/80 dark:border-amber-500/30",
							"text-xs text-amber-800 dark:text-amber-300",
							"hover:bg-amber-100/70 dark:hover:bg-amber-500/15 transition",
						)}
					>
						<AlertTriangle className="w-3.5 h-3.5 shrink-0" />
						<span className="flex-1 text-left">{errors.length} 个源不可达</span>
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								handleRetry();
							}}
							className="text-[11px] underline underline-offset-2 hover:no-underline"
						>
							重试
						</button>
						<ChevronDown
							className={cn(
								"w-3 h-3 transition-transform",
								errorsExpanded && "rotate-180",
							)}
						/>
					</button>
					{errorsExpanded && (
						<div className="mt-1 space-y-1 px-1 animate-fade-in">
							{errors.map((e) => (
								<div
									key={e.sourceId}
									className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-amber-50/40 dark:bg-amber-500/5"
								>
									<div className="flex-1 min-w-0">
										<div className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
											{sourceName(e.sourceId)}
										</div>
										<div className="text-[11px] font-mono text-amber-700/80 dark:text-amber-400/70 truncate">
											{e.error}
										</div>
									</div>
									<button
										type="button"
										onClick={() => handleDisableSource(e.sourceId)}
										className="text-[11px] text-amber-800 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-200 px-1.5 py-0.5 rounded hover:bg-amber-100 dark:hover:bg-amber-500/15 shrink-0"
									>
										禁用
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* 列表 */}
			<div className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-6">
				{loading && entries.length === 0 ? (
					<SkeletonList />
				) : entries.length === 0 ? (
					<MarketplaceEmpty hasQuery={query.length > 0} />
				) : (
					<>
						<ul className="space-y-1.5">
							{entries.slice(0, visibleCount).map((entry) => (
								<li key={entry.id}>
									<MarketplaceCard
										entry={entry}
										progress={progress[entry.id]}
									/>
								</li>
							))}
						</ul>
						{entries.length > visibleCount && (
							<div className="mt-3 flex flex-col items-center gap-1.5">
								<button
									type="button"
									onClick={() =>
										setVisibleCount((c) => Math.min(c + 50, entries.length))
									}
									className="px-4 py-1.5 text-xs font-medium text-text-secondary bg-cream-100/70 hover:bg-cream-200/80 dark:bg-cream-800/30 dark:hover:bg-cream-800/50 border border-cream-300/60 dark:border-cream-500/20 rounded-lg transition"
								>
									显示更多（剩 {entries.length - visibleCount} 条）
								</button>
								<span className="text-[11px] text-text-light">
									已显示 {visibleCount} / {entries.length}
								</span>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}

function SkeletonList() {
	return (
		<ul className="space-y-1.5 pt-1">
			{[0, 1, 2, 3].map((i) => (
				<li
					key={i}
					className="h-[68px] rounded-xl bg-cream-200/60 dark:bg-cream-800/30 animate-pulse"
					style={{ animationDelay: `${i * 80}ms` }}
				/>
			))}
		</ul>
	);
}

function MarketplaceEmpty({ hasQuery }: { hasQuery: boolean }) {
	return (
		<div className="text-center py-14 px-6">
			<div className="text-[32px] font-serif text-text-light/60 leading-none mb-3">
				—
			</div>
			<p className="text-xs text-text-secondary font-medium">
				{hasQuery ? "没有匹配的技能" : "市场暂时为空"}
			</p>
			<p className="text-xs text-text-light mt-2 leading-relaxed">
				{hasQuery
					? "试试更换关键词，或在「设置 → Agent 技能」检查源连通性"
					: "在「设置 → Agent 技能 → 市场源」添加更多源"}
			</p>
		</div>
	);
}
