import {
	Activity,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Search,
	Zap,
	X,
	XCircle,
} from "lucide-react";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import type { GraphFilter } from "./types";
import { cn } from "../../../lib/utils";

function FilterButton({
	active,
	label,
	onClick,
	icon,
}: {
	active: boolean;
	label: string;
	onClick: () => void;
	icon: ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={`筛选${label}`}
			className={cn(
				"inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition-colors",
				active
					? "bg-warm-200/90 text-text-primary border-cream-400 shadow-bai-card dark:bg-cream-800 dark:text-cream-100 dark:border-white/[0.1]"
					: "bg-surface/85 text-text-secondary border-black/[0.06] dark:bg-cream-900/70 dark:text-cream-300 dark:border-white/[0.08] hover:bg-warm-100 dark:hover:bg-cream-800",
			)}
		>
			<span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
				{icon}
			</span>
			{label}
		</button>
	);
}

interface GraphTopToolbarProps {
	searchInputRef: RefObject<HTMLInputElement | null>;
	searchQuery: string;
	onSearchQueryChange: (value: string) => void;
	onSearchInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
	onClearSearch: () => void;
	searchMatchedNodeCount: number;
	searchIndex: number;
	onFocusFirstSearchMatch: () => void;
	onFocusPreviousSearchMatch: () => void;
	onFocusNextSearchMatch: () => void;
	filter: GraphFilter;
	onFilterChange: (filter: GraphFilter) => void;
	follow: boolean;
	onToggleFollow: () => void;
	density?: "comfortable" | "compact";
}

export function GraphTopToolbar({
	searchInputRef,
	searchQuery,
	onSearchQueryChange,
	onSearchInputKeyDown,
	onClearSearch,
	searchMatchedNodeCount,
	searchIndex,
	onFocusFirstSearchMatch,
	onFocusPreviousSearchMatch,
	onFocusNextSearchMatch,
	filter,
	onFilterChange,
	follow,
	onToggleFollow,
	density = "comfortable",
}: GraphTopToolbarProps) {
	return (
		<div className="absolute inset-x-4 top-4 z-30 pointer-events-none">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="flex items-center gap-2 pointer-events-auto max-w-full">
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light" />
						<input
							ref={searchInputRef}
							type="text"
							value={searchQuery}
							onChange={(e) => onSearchQueryChange(e.target.value)}
							onKeyDown={onSearchInputKeyDown}
							placeholder="搜索节点..."
							className={cn(
								"max-w-[68vw] pl-8 pr-8 text-xs rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-surface/85 backdrop-blur-md text-text-secondary dark:text-cream-200 placeholder:text-text-muted dark:placeholder:text-text-muted focus-ring",
								density === "compact" ? "w-48 py-1.5" : "w-56 py-2",
							)}
							aria-label="搜索运行图节点"
						/>
						{searchQuery.trim() ? (
							<button
								type="button"
								onClick={onClearSearch}
								className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-light hover:text-text-secondary dark:hover:text-cream-200 hover:bg-warm-200/80 transition-colors"
								title="清空搜索"
								aria-label="清空搜索"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						) : null}
					</div>
					{searchQuery.trim() ? (
						<div className="inline-flex items-center gap-1 bg-surface/85 border border-black/[0.06] dark:border-white/[0.08] rounded-2xl px-1.5 py-1.5 text-xs">
							<button
								type="button"
								onClick={onFocusFirstSearchMatch}
								disabled={searchMatchedNodeCount === 0}
								className="inline-flex items-center gap-1 px-2 py-1 rounded-xl text-text-secondary dark:text-cream-200 hover:bg-warm-200 disabled:opacity-50"
								title="定位第一个匹配项"
								aria-label="定位第一个匹配节点"
							>
								定位
							</button>
							<button
								type="button"
								onClick={onFocusPreviousSearchMatch}
								disabled={searchMatchedNodeCount === 0}
								className="p-1 rounded-lg text-text-secondary hover:bg-warm-200 disabled:opacity-50"
								title="上一个匹配"
								aria-label="上一个匹配节点"
							>
								<ChevronUp className="w-3.5 h-3.5" />
							</button>
							<button
								type="button"
								onClick={onFocusNextSearchMatch}
								disabled={searchMatchedNodeCount === 0}
								className="p-1 rounded-lg text-text-secondary hover:bg-warm-200 disabled:opacity-50"
								title="下一个匹配"
								aria-label="下一个匹配节点"
							>
								<ChevronRight className="w-3.5 h-3.5" />
							</button>
							<span className="px-1.5 text-text-muted tabular-nums">
								{searchMatchedNodeCount === 0
									? "0/0"
									: `${searchIndex + 1}/${searchMatchedNodeCount}`}
							</span>
						</div>
					) : null}
				</div>

				<div className="flex items-center justify-end gap-2 pointer-events-auto flex-wrap">
					<FilterButton
						active={filter === "all"}
						label="全部"
						onClick={() => onFilterChange("all")}
						icon={<Zap className="w-3.5 h-3.5" />}
					/>
					<FilterButton
						active={filter === "running"}
						label="运行中"
						onClick={() => onFilterChange("running")}
						icon={<Activity className="w-3.5 h-3.5" />}
					/>
					<FilterButton
						active={filter === "error"}
						label="失败"
						onClick={() => onFilterChange("error")}
						icon={<XCircle className="w-3.5 h-3.5" />}
					/>
					<FilterButton
						active={filter === "artifact"}
						label="产物"
						onClick={() => onFilterChange("artifact")}
						icon={<Zap className="w-3.5 h-3.5" />}
					/>
					<button
						type="button"
						onClick={onToggleFollow}
						className={cn(
							"inline-flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-medium border backdrop-blur-md transition-[color,background-color,border-color,opacity,box-shadow,transform]",
							"shadow-[0_10px_30px_-18px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.02] dark:ring-white/[0.06]",
							follow
								? "bg-dark-muted text-white border-black/[0.06] dark:border-white/[0.08]"
								: "bg-surface/85 text-text-secondary dark:text-cream-200 border-black/[0.06] dark:border-white/[0.08] hover:bg-surface/70",
						)}
						title={
							follow ? "正在跟随运行节点（Alt+F）" : "暂停自动聚焦（Alt+F）"
						}
						aria-label={follow ? "关闭自动跟随" : "开启自动跟随"}
					>
						{follow ? (
							<ChevronRight className="w-4 h-4" />
						) : (
							<ChevronLeft className="w-4 h-4" />
						)}
						{follow ? "跟随中" : "手动浏览"}
					</button>
				</div>
			</div>
		</div>
	);
}
