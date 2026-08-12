/**
 * SettingsSidebarCategory — 一级分类 + 其下二级 Tab 的组合渲染单元
 *
 * 结构：平铺分组列表（不是手风琴）
 *   - 分类标题是**不可点击的静态标签**，只负责视觉分组
 *   - 该分类下的二级 Tab 常驻渲染
 *
 * 为什么不再用手风琴：全站 24 个二级页分在 5 个分类里，手风琴同时只展开一个，
 * 一次只能看到 ~8 个目的地；从「数据 › 备份」去「通用 › 外观」要先折起再展开。
 * 平铺之后所有目的地常驻可见，任意两页之间一次点击直达——这是设置页最该有的
 * 「一眼看全地图」的性质。
 *
 * 为减少改动范围保留历史文件名，同名文件导出 `SettingsSidebarCategory`，
 * 并保留 `SettingsSidebarGroup` 作为 alias。
 */
import { cn } from "../../../lib/utils";
import type {
	SettingsNavCategory,
	SettingsSubtab,
	SettingsTabId,
} from "../settingsCatalog";
import { SettingsBadge } from "../ui/SettingsButtons";

interface SettingsSidebarCategoryProps {
	category: SettingsNavCategory;
	subtabs: SettingsSubtab[];
	activeTab: SettingsTabId;
	onNavigate: (id: SettingsTabId) => void;
	onPrefetch?: (id: SettingsTabId) => void;
}

export function SettingsSidebarCategory({
	category,
	subtabs,
	activeTab,
	onNavigate,
	onPrefetch,
}: SettingsSidebarCategoryProps) {
	return (
		<section
			className="space-y-px"
			aria-labelledby={`settings-cat-${category.id}`}
		>
			{/* 分类标题 —— 纯标签，不可点击、不可聚焦。
			    不用大写 + 字距：那套写法视觉重量重、字母间被撑开，
			    24 个条目上面顶 5 个这样的标签会显得比条目本身还吵。
			    常规字号的浅灰更像「一句轻声的分隔」，扫读时自然跳过。 */}
			<h3
				id={`settings-cat-${category.id}`}
				className="px-3 pb-1.5 pt-6 text-xs font-medium leading-none text-text-light first:pt-1"
			>
				{category.label}
			</h3>

			{subtabs.map((item) => {
				const SubIcon = item.icon;
				const isActive = activeTab === item.id;
				return (
					<button
						key={item.id}
						type="button"
						onClick={() => onNavigate(item.id)}
						onMouseEnter={() => onPrefetch?.(item.id)}
						onFocus={() => onPrefetch?.(item.id)}
						aria-current={isActive ? "page" : undefined}
						className={cn(
							"flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-left text-sm",
							"min-h-[34px]",
							"transition-[background-color,color] duration-150 ease-out",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
							isActive
								? "bg-cream-300 font-medium text-text-primary dark:bg-cream-700"
								: "text-text-secondary hover:bg-cream-200/70 hover:text-text-primary dark:hover:bg-cream-700/50",
						)}
					>
						<SubIcon
							className={cn(
								"h-4 w-4 shrink-0",
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
		</section>
	);
}

/** 历史文件名兼容别名 —— 下游如仍在 import SettingsSidebarGroup 也不会断。 */
export const SettingsSidebarGroup = SettingsSidebarCategory;
