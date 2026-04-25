import { Home, LayoutGrid, LayoutList, Plus } from "lucide-react";
import type { DocumentViewMode } from "./documentListMeta";
import { cn } from "../../../lib/utils";

interface DocumentListHeaderProps {
	onBack?: () => void;
	totalCount: number;
	viewMode: DocumentViewMode;
	onToggleViewMode: () => void;
	isManaging: boolean;
	onToggleManaging: () => void;
	onCreateNew: () => void | Promise<void>;
}

export function DocumentListHeader({
	onBack,
	totalCount,
	viewMode,
	onToggleViewMode,
	isManaging,
	onToggleManaging,
	onCreateNew,
}: DocumentListHeaderProps) {
	return (
		<header className="doc-toolbar px-4 py-3 sm:px-5 sm:py-3.5 border-b border-border/70/70 shrink-0">
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3 min-w-0">
					{onBack ? (
						<button
							type="button"
							onClick={onBack}
							className="focus-ring min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl text-text-muted hover:text-text-primary hover:bg-warm-200/90/80 transition-colors"
							aria-label="返回首页"
							title="返回首页"
						>
							<Home className="w-5 h-5" />
						</button>
					) : null}
					<div className="min-w-0">
						<h2 className="text-[24px] leading-none font-semibold tracking-tight text-text-primary">
							文档
						</h2>
						<p className="mt-1 text-[13px] text-text-secondary">
							{totalCount} 篇文档
						</p>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={onToggleViewMode}
						className="focus-ring min-h-10 min-w-10 inline-flex items-center justify-center rounded-xl border border-border bg-surface/90/80 text-text-secondary hover:bg-warm-200 transition-colors"
						aria-label={
							viewMode === "grid" ? "切换到列表视图" : "切换到卡片视图"
						}
						title={viewMode === "grid" ? "列表视图" : "卡片视图"}
					>
						{viewMode === "grid" ? (
							<LayoutList className="w-4 h-4" />
						) : (
							<LayoutGrid className="w-4 h-4" />
						)}
					</button>

					<button
						type="button"
						onClick={onToggleManaging}
						className={cn(
							"focus-ring min-h-10 px-3.5 inline-flex items-center justify-center rounded-2xl border text-sm font-medium transition-colors",
							isManaging
								? "bg-dark-muted text-white border-zinc-900"
								: "bg-surface/90/80 text-text-secondary dark:text-zinc-200 border-border hover:bg-warm-200",
						)}
					>
						{isManaging ? "完成" : "管理"}
					</button>

					<button
						type="button"
						onClick={() => void onCreateNew()}
						className="focus-ring min-h-10 px-4 inline-flex items-center gap-2 rounded-2xl bg-dark-bg text-white font-semibold text-sm hover:opacity-90 transition-opacity"
					>
						<Plus className="w-4 h-4" />
						新建
					</button>
				</div>
			</div>
		</header>
	);
}
