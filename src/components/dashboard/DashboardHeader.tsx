import { LayoutGrid, List as ListIcon, Search } from "lucide-react";
import { commandPaletteStore } from "../../lib/stores/commandPaletteStore";
import { Mascot } from "../Mascot/Mascot";

type ViewMode = "grid" | "list";

interface DashboardHeaderProps {
	greeting: string;
	username: string;
	viewMode: ViewMode;
	onChangeViewMode: (mode: ViewMode) => void;
	onOpenSearch: () => void;
}

export function DashboardHeader({
	greeting,
	username,
	viewMode,
	onChangeViewMode,
	onOpenSearch,
}: DashboardHeaderProps) {
	return (
		<header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
			<div className="flex items-end gap-5">
				<Mascot
					slot="state-greet"
					size="lg"
					float
					wrapperClassName="hidden md:inline-flex shrink-0 -mb-1"
				/>
				<div>
					<h1 className="text-[2rem] md:text-[2.25rem] font-semibold leading-[1.18] tracking-[-0.02em] mb-2 text-text-primary">
						{username ? `${greeting}, ${username}` : greeting}
					</h1>
					<p className="text-text-secondary text-[13.5px] leading-relaxed">
						准备好开始创作了吗？
					</p>
				</div>
			</div>

			{/* 视图切换 — 胶囊化分段控件 */}
			<div className="flex items-center gap-0.5 p-1 bg-warm-200 rounded-full">
				<button
					onClick={() => onChangeViewMode("grid")}
					aria-label="网格视图"
					className={`px-2.5 h-8 min-w-[36px] flex items-center justify-center rounded-full cursor-pointer transition-all duration-150 ${viewMode === "grid" ? "text-text-primary bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-text-muted hover:text-text-primary"}`}
				>
					<LayoutGrid className="w-3.5 h-3.5" strokeWidth={1.5} />
				</button>
				<button
					onClick={() => onChangeViewMode("list")}
					aria-label="列表视图"
					className={`px-2.5 h-8 min-w-[36px] flex items-center justify-center rounded-full cursor-pointer transition-all duration-150 ${viewMode === "list" ? "text-text-primary bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-text-muted hover:text-text-primary"}`}
				>
					<ListIcon className="w-3.5 h-3.5" strokeWidth={1.5} />
				</button>
				<div className="w-px h-4 bg-warm-300 mx-0.5" />
				<button
					aria-label="搜索项目"
					className="px-2.5 h-8 min-w-[36px] flex items-center justify-center rounded-full text-text-muted hover:text-text-primary cursor-pointer transition-all duration-150 active:scale-95"
					onClick={onOpenSearch}
				>
					<Search className="w-3.5 h-3.5" strokeWidth={1.5} />
				</button>
				<button
					aria-label="打开命令面板（⌘K）"
					title="命令面板（⌘K）"
					className="ml-1 px-2.5 h-8 flex items-center gap-1.5 rounded-full text-text-muted hover:text-text-primary cursor-pointer transition-all duration-150 active:scale-95"
					onClick={() => commandPaletteStore.open()}
				>
					<kbd className="text-[10px] font-medium px-1.5 py-0.5 bg-warm-300 rounded">
						⌘K
					</kbd>
				</button>
			</div>
		</header>
	);
}
