/**
 * SettingsSidebarCategory — 一级分类 + 其下二级 Tab 的组合渲染单元
 *
 * Phase 1 起 Sidebar 切换为两层手风琴结构，本组件负责渲染单个分类：
 *   - 分类标题（可点击 toggle）+ chevron
 *   - 展开时渲染 subtab 列表；折叠时用 `grid-template-rows + opacity` 做定向过渡
 *
 * 为保留历史文件名、减少 Phase 1 改动范围，这里同名文件导出新组件
 * `SettingsSidebarCategory`，并保留 `SettingsSidebarGroup` 作为 alias。
 */
import { ChevronDown } from "lucide-react";
import { cn } from "../../../lib/utils";
import {
	type SettingsNavCategory,
	type SettingsSubtab,
	type SettingsTabId,
} from "../settingsCatalog";
import { SettingsBadge } from "../ui/SettingsButtons";

interface SettingsSidebarCategoryProps {
	category: SettingsNavCategory;
	subtabs: SettingsSubtab[];
	activeTab: SettingsTabId;
	expanded: boolean;
	onToggle: () => void;
	onNavigate: (id: SettingsTabId) => void;
	onPrefetch?: (id: SettingsTabId) => void;
}

export function SettingsSidebarCategory({
	category,
	subtabs,
	activeTab,
	expanded,
	onToggle,
	onNavigate,
	onPrefetch,
}: SettingsSidebarCategoryProps) {
	const Icon = category.icon;

	return (
		<section className="space-y-1">
			{/* 分类标题 —— 可点击 toggle */}
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={expanded}
				aria-controls={`settings-category-panel-${category.id}`}
				className={cn(
					"group flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left",
					"min-h-[36px]",
					"text-text-secondary hover:bg-cream-200/60 dark:hover:bg-cream-700/40",
					"transition-[background-color,color] duration-150 ease-out",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
				)}
			>
				<Icon
					className="h-[15px] w-[15px] shrink-0 text-text-muted"
					strokeWidth={1.75}
				/>
				<span className="flex-1 truncate text-[13px] font-semibold tracking-[0.01em]">
					{category.label}
				</span>
				<ChevronDown
					className={cn(
						"h-3.5 w-3.5 shrink-0 text-text-muted",
						"transition-transform duration-200 ease-out",
						expanded ? "rotate-0" : "-rotate-90",
					)}
					strokeWidth={2}
				/>
			</button>

			{/* 子 Tab 区：使用 grid-template-rows + opacity 做定向过渡 */}
			<div
				id={`settings-category-panel-${category.id}`}
				className={cn(
					"grid transition-[grid-template-rows,opacity] duration-200 ease-out",
					expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
				)}
				aria-hidden={!expanded}
			>
				<div className="min-h-0 overflow-hidden">
					<div className="mt-1 space-y-0.5 pl-1">
						{subtabs.map((item) => {
							const SubIcon = item.icon;
							const isActive = activeTab === item.id;
							return (
								<button
									key={item.id}
									type="button"
									tabIndex={expanded ? 0 : -1}
									onClick={() => onNavigate(item.id)}
									onMouseEnter={() => onPrefetch?.(item.id)}
									onFocus={() => onPrefetch?.(item.id)}
									aria-current={isActive ? "page" : undefined}
									className={cn(
										"relative flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-left text-[13px] font-medium",
										"min-h-[36px]",
										"transition-[background-color,color] duration-150 ease-out",
										"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-400/40 focus-visible:ring-offset-1",
										isActive
											? "bg-cream-300 dark:bg-cream-700 text-text-primary"
											: "text-text-muted hover:bg-cream-200/60 dark:hover:bg-cream-700/60 hover:text-text-primary/80",
									)}
								>
									{isActive && (
										<span
											className="absolute -left-[14px] top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-cream-900 dark:bg-cream-100"
											aria-hidden="true"
										/>
									)}
									<SubIcon
										className={cn(
											"h-[15px] w-[15px] shrink-0",
											isActive ? "text-text-primary" : "text-text-muted",
										)}
										strokeWidth={1.5}
									/>
									<span className="min-w-0 flex-1 truncate">{item.label}</span>
									{item.badge && (
										<SettingsBadge tone={item.badge.tone} size="xs">
											{item.badge.text}
										</SettingsBadge>
									)}
								</button>
							);
						})}
					</div>
				</div>
			</div>
		</section>
	);
}

/** 历史文件名兼容别名 —— 下游如仍在 import SettingsSidebarGroup 也不会断。 */
export const SettingsSidebarGroup = SettingsSidebarCategory;
