// 运行图顶部悬浮工具栏。
//
// 形制纪律（对齐 Codex 画布工具栏的克制感）：
//   - 所有控件同高（h-8）、同圆角（rounded-lg）、同描边（border-border）、
//     同底（bg-surface/90 + backdrop-blur），不出现第二种形制。
//   - 筛选是「一组互斥选项」→ 一个分段控件，而不是四颗各自描边的药片。
//     分段内不放图标：四个小图标挤在一起只剩噪音，文字本身已经可辨。
//   - 「跟随」是开关不是动作 → 图标语义用定位（LocateFixed/LocateOff），
//     开着时也保持安静（不再是一大块深色常驻按钮）。

import {
	ChevronDown,
	ChevronUp,
	LocateFixed,
	LocateOff,
	Search,
	X,
} from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";
import type { GraphFilter } from "./types";
import { cn } from "../../../lib/utils";

/** 工具栏统一的「浮在画布上」容器形制 */
const SURFACE =
	"rounded-lg border border-border bg-surface/90 backdrop-blur-sm shadow-node";

const FILTER_SEGMENTS: { value: GraphFilter; label: string }[] = [
	{ value: "all", label: "全部" },
	{ value: "running", label: "运行中" },
	{ value: "error", label: "失败" },
	{ value: "artifact", label: "产物" },
];

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
	const hasQuery = searchQuery.trim().length > 0;
	const hasMatch = searchMatchedNodeCount > 0;

	return (
		<div className="absolute inset-x-4 top-4 z-30 pointer-events-none">
			<div className="flex flex-wrap items-start justify-between gap-2">
				{/* 左：搜索 + 匹配导航 */}
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
								SURFACE,
								"h-8 max-w-[68vw] pl-8 pr-8 text-xs text-text-primary",
								"placeholder:text-text-muted focus-ring",
								density === "compact" ? "w-44" : "w-56",
							)}
							aria-label="搜索运行图节点"
						/>
						{hasQuery ? (
							<button
								type="button"
								onClick={onClearSearch}
								className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-light hover:text-text-secondary hover:bg-warm-200/80 transition-colors cursor-pointer"
								title="清空搜索"
								aria-label="清空搜索"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						) : null}
					</div>

					{hasQuery ? (
						<div
							className={cn(
								SURFACE,
								"flex h-8 items-center gap-0.5 px-1 text-xs",
							)}
						>
							<button
								type="button"
								onClick={onFocusFirstSearchMatch}
								disabled={!hasMatch}
								className="px-1.5 py-1 rounded-md text-text-secondary hover:bg-warm-200 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
								title="定位第一个匹配项"
								aria-label="定位第一个匹配节点"
							>
								定位
							</button>
							<button
								type="button"
								onClick={onFocusPreviousSearchMatch}
								disabled={!hasMatch}
								className="p-1 rounded-md text-text-secondary hover:bg-warm-200 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
								title="上一个匹配"
								aria-label="上一个匹配节点"
							>
								<ChevronUp className="w-3.5 h-3.5" />
							</button>
							<button
								type="button"
								onClick={onFocusNextSearchMatch}
								disabled={!hasMatch}
								className="p-1 rounded-md text-text-secondary hover:bg-warm-200 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-default"
								title="下一个匹配"
								aria-label="下一个匹配节点"
							>
								<ChevronDown className="w-3.5 h-3.5" />
							</button>
							<span className="px-1.5 text-text-muted tabular-nums">
								{hasMatch
									? `${searchIndex + 1}/${searchMatchedNodeCount}`
									: "0/0"}
							</span>
						</div>
					) : null}
				</div>

				{/* 右：筛选分段控件 + 跟随开关 */}
				<div className="flex items-center justify-end gap-2 pointer-events-auto flex-wrap">
					<div
						role="radiogroup"
						aria-label="筛选运行图节点"
						className={cn(SURFACE, "flex h-8 items-center gap-0.5 p-0.5")}
					>
						{FILTER_SEGMENTS.map((segment) => {
							const active = filter === segment.value;
							return (
								<button
									key={segment.value}
									type="button"
									role="radio"
									aria-checked={active}
									onClick={() => onFilterChange(segment.value)}
									className={cn(
										"h-full px-2.5 rounded-[6px] text-xs transition-colors cursor-pointer",
										active
											? "bg-warm-200 font-medium text-text-primary"
											: "text-text-muted hover:text-text-primary",
									)}
								>
									{segment.label}
								</button>
							);
						})}
					</div>

					<button
						type="button"
						onClick={onToggleFollow}
						aria-pressed={follow}
						className={cn(
							SURFACE,
							"inline-flex h-8 items-center gap-1.5 px-2.5 text-xs transition-colors cursor-pointer",
							follow
								? "font-medium text-text-primary"
								: "text-text-muted hover:text-text-primary",
						)}
						title={
							follow
								? "正在跟随运行节点，点击改为手动浏览（Alt+F）"
								: "手动浏览中，点击开启自动跟随（Alt+F）"
						}
						aria-label={follow ? "关闭自动跟随" : "开启自动跟随"}
					>
						{follow ? (
							<LocateFixed
								className="w-3.5 h-3.5 text-terracotta"
								strokeWidth={1.7}
							/>
						) : (
							<LocateOff className="w-3.5 h-3.5" strokeWidth={1.7} />
						)}
						{follow ? "跟随" : "手动"}
					</button>
				</div>
			</div>
		</div>
	);
}
