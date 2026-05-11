/**
 * SettingsSidebar — Phase 1 两层手风琴导航
 *
 * 结构：5 个一级分类 + 每个分类下若干二级 Tab
 *   - 同时只展开一个分类（手风琴模式）
 *   - 点击已展开分类 → 仅折起，`activeTab` 不变
 *   - 点击未展开分类 → 切换展开 + 激活该分类首个 subtab
 *   - 点击 subtab → 走 `onNavigate(subtabId)`
 */
import { useEffect, useState } from "react";
import {
	SETTINGS_CATEGORIES,
	getCategoryOf,
	getFirstSubtabOf,
	getSubtabsByCategory,
	type SettingsNavCategoryId,
	type SettingsTabId,
} from "./settingsCatalog";
import { SettingsSidebarCategory } from "./components/SettingsSidebarGroup";

interface SettingsSidebarProps {
	activeTab: SettingsTabId;
	onNavigate: (id: SettingsTabId) => void;
	onPrefetch?: (id: SettingsTabId) => void;
}

export function SettingsSidebar({
	activeTab,
	onNavigate,
	onPrefetch,
}: SettingsSidebarProps) {
	// 初始展开：当前激活 Tab 所属分类；允许 null 表达"全部折起"
	const [expandedCategory, setExpandedCategory] =
		useState<SettingsNavCategoryId | null>(
			() => getCategoryOf(activeTab) ?? "ai",
		);

	// activeTab 外部变化（legacy id 归一、搜索跳转等）→ 自动展开所属分类
	useEffect(() => {
		const cat = getCategoryOf(activeTab);
		if (cat && cat !== expandedCategory) {
			setExpandedCategory(cat);
		}
		// 有意不把 expandedCategory 放进依赖，避免用户手动折起后被反复展开
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeTab]);

	const handleToggle = (id: SettingsNavCategoryId) => {
		if (id === expandedCategory) {
			// 已展开 → 折起，但不改 activeTab
			setExpandedCategory(null);
			return;
		}
		// 未展开 → 切换展开 + 激活该分类首个 subtab
		setExpandedCategory(id);
		const first = getFirstSubtabOf(id);
		onNavigate(first);
	};

	return (
		<aside
			className="w-[248px] shrink-0 border-r border-border bg-background px-4 py-6 backdrop-blur-sm transition-colors duration-300"
			aria-label="设置"
		>
			<div className="mb-6 px-2 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-text-muted">
				设置
			</div>

			<nav
				className="flex-1 space-y-2 overflow-y-auto pr-1"
				aria-label="设置导航"
			>
				{SETTINGS_CATEGORIES.map((category) => (
					<SettingsSidebarCategory
						key={category.id}
						category={category}
						subtabs={getSubtabsByCategory(category.id)}
						activeTab={activeTab}
						expanded={expandedCategory === category.id}
						onToggle={() => handleToggle(category.id)}
						onNavigate={onNavigate}
						onPrefetch={onPrefetch}
					/>
				))}
			</nav>
		</aside>
	);
}
