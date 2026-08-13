/**
 * SettingsSidebar — 平铺分组导航
 *
 * 结构：返回按钮 + 搜索框 + 5 个分组（分组标题为静态标签）下挂全部二级 Tab。
 *
 * 两个位置选择的理由：
 * - **搜索框在侧栏顶部**：内容区顶部要完整留给页面 H1，
 *   而搜索属于「导航」而非「当前页内容」，紧贴导航列表才符合它的语义。
 * - **返回按钮也在侧栏顶部**：以前是一个浮在内容区右上角的 X，
 *   它压在标题行上方，逼得每个页面标题都要留一段 `pr-12` 净空。
 *   挪到侧栏后内容区顶部彻底干净，H1 能用满整行宽。
 */
import { ArrowLeft } from "lucide-react";
import type { RefObject } from "react";
import { SettingsSearch } from "./components/SettingsSearch";
import { SettingsSidebarCategory } from "./components/SettingsSidebarGroup";
import {
	SETTINGS_CATEGORIES,
	getSubtabsByCategory,
	type SettingsTabId,
} from "./settingsCatalog";

interface SettingsSidebarProps {
	activeTab: SettingsTabId;
	onNavigate: (id: SettingsTabId, anchorId?: string) => void;
	onPrefetch?: (id: SettingsTabId) => void;
	/** 关闭设置面板（返回应用）。 */
	onClose: () => void;
	/** 供外壳 FocusTrap 设定初始焦点。 */
	backButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function SettingsSidebar({
	activeTab,
	onNavigate,
	onPrefetch,
	onClose,
	backButtonRef,
}: SettingsSidebarProps) {
	return (
		<aside
			// bg（比内容区的 surface 暗一档）+ 极淡描边：分栏主要靠明暗，
			// 描边只是收个边。一条实边框配同色底会显得像用尺子划开的，很硬。
			className="flex w-[248px] shrink-0 flex-col border-r border-border/60 bg-background transition-colors duration-250"
			aria-label="设置"
		>
			<div className="shrink-0 space-y-3 px-3 pb-2 pt-4">
				<button
					ref={backButtonRef}
					type="button"
					onClick={onClose}
					className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-secondary transition-[background-color,color] duration-150 ease-out hover:bg-warm-200/70 hover:text-text-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--t-primary-muted)]"
					aria-label="关闭设置，返回应用"
				>
					<ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={1.5} />
					返回应用
				</button>

				<SettingsSearch onResultClick={onNavigate} />
			</div>

			<nav
				className="min-h-0 flex-1 overflow-y-auto px-3 pb-6"
				aria-label="设置导航"
			>
				{SETTINGS_CATEGORIES.map((category) => (
					<SettingsSidebarCategory
						key={category.id}
						category={category}
						subtabs={getSubtabsByCategory(category.id)}
						activeTab={activeTab}
						onNavigate={onNavigate}
						onPrefetch={onPrefetch}
					/>
				))}
			</nav>
		</aside>
	);
}
