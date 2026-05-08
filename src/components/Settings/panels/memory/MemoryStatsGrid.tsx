import { BarChart3 } from "lucide-react";
import { MEMORY_CATEGORY_STYLES } from "./categoryConfig";
import { cn } from "../../../../lib/utils";

interface MemoryStatsGridProps {
	stats: {
		total: number;
		byCategory: Record<string, number>;
	};
}

/**
 * 顶部统计 — 总数大字 + 各分类小色块。
 *
 * 设计：左侧是醒目的 total，右侧网格化展示每个分类计数，
 * 每个分类有自己的 accent 颜色作为视觉锚点。
 */
export function MemoryStatsGrid({ stats }: MemoryStatsGridProps) {
	const entries = (
		Object.entries(MEMORY_CATEGORY_STYLES) as Array<
			[
				keyof typeof MEMORY_CATEGORY_STYLES,
				(typeof MEMORY_CATEGORY_STYLES)[keyof typeof MEMORY_CATEGORY_STYLES],
			]
		>
	)
		.map(([key, style]) => ({
			key,
			style,
			count: stats.byCategory[key] ?? 0,
		}))
		.filter((item) => item.count > 0);

	return (
		<div className="grid grid-cols-1 gap-3 lg:grid-cols-[200px_1fr]">
			<div className="rounded-2xl border border-border bg-surface px-4 py-4 shadow-bai-card">
				<div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-text-muted">
					<BarChart3 className="h-3 w-3" strokeWidth={1.6} />
					总记忆
				</div>
				<div className="mt-1 flex items-baseline gap-1">
					<span className="text-[28px] font-semibold leading-none tabular-nums text-text-primary">
						{stats.total}
					</span>
					<span className="text-[12px] text-text-muted">条</span>
				</div>
			</div>

			{entries.length === 0 ? (
				<div className="flex items-center justify-center rounded-2xl border border-dashed border-border bg-cream-50 px-4 py-4 text-[12px] text-text-muted">
					所有分类暂无记忆
				</div>
			) : (
				<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
					{entries.map(({ key, style, count }) => {
						const Icon = style.icon;
						return (
							<div
								key={key}
								className={cn(
									"flex items-center gap-2.5 rounded-xl border bg-surface px-3 py-2.5 transition-colors",
									style.accentBorder,
								)}
							>
								<span
									className={cn(
										"inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
										style.accentBg,
									)}
								>
									<Icon
										className={cn("h-3.5 w-3.5", style.accentText)}
										strokeWidth={1.8}
									/>
								</span>
								<div className="min-w-0">
									<div className="text-[11.5px] font-medium text-text-secondary">
										{style.label}
									</div>
									<div className="text-[15px] font-semibold leading-tight tabular-nums text-text-primary">
										{count}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
