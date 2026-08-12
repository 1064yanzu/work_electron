import { cn } from "../../../../lib/utils";
import type {
	MemoryFileToken,
	MemoryStats,
} from "../../../../lib/agent/memoryStore";
import { MEMORY_FILE_STYLES } from "./categoryConfig";

/**
 * 三个核心文件的容量卡片网格 —— SOUL / USER / MEMORY 各占一格。
 * SDK 自动加载的 CLAUDE.md / AGENTS.md 不在这里展示，因为它们没有字符上限。
 */
interface MemoryStatsGridProps {
	stats: MemoryStats;
}

const ENTRY_TOKENS: Array<{
	token: Extract<MemoryFileToken, "soul" | "user" | "memory">;
	getEntries: (s: MemoryStats) => number | null;
}> = [
	{ token: "soul", getEntries: () => null },
	{ token: "user", getEntries: (s) => s.user.entries },
	{ token: "memory", getEntries: (s) => s.memory.entries },
];

export function MemoryStatsGrid({ stats }: MemoryStatsGridProps) {
	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
			{ENTRY_TOKENS.map(({ token, getEntries }) => {
				const meta = (
					{
						soul: stats.soul,
						user: stats.user,
						memory: stats.memory,
					} as const
				)[token];
				const style = MEMORY_FILE_STYLES[token];
				const Icon = style.icon;
				const ratio = meta.limit > 0 ? meta.chars / meta.limit : 0;
				const pct = Math.min(100, Math.round(ratio * 100));
				const entries = getEntries(stats);
				const isWarning = ratio >= 0.85;
				return (
					<div
						key={token}
						className={cn(
							"rounded-2xl border bg-surface px-4 py-4 shadow-bai-card transition-colors",
							style.accentBorder,
						)}
					>
						<div className="flex items-center justify-between gap-2">
							<div className="flex items-center gap-2.5 min-w-0">
								<span
									className={cn(
										"inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
										style.accentBg,
									)}
								>
									<Icon
										className={cn("h-4 w-4", style.accentText)}
										strokeWidth={1.8}
									/>
								</span>
								<div className="min-w-0">
									<div className="text-sm font-semibold text-text-primary truncate">
										{style.label}
									</div>
									<div className="text-[11px] uppercase tracking-[0.14em] text-text-muted">
										{entries != null ? `${entries} 条` : "整段"}
									</div>
								</div>
							</div>
							<div className="text-right">
								<div
									className={cn(
										"text-[18px] font-semibold tabular-nums leading-none",
										isWarning ? "text-error" : "text-text-primary",
									)}
								>
									{meta.chars}
								</div>
								<div className="text-[11px] text-text-muted tabular-nums">
									/ {meta.limit}
								</div>
							</div>
						</div>
						<div className="mt-3 h-1.5 w-full rounded-full bg-cream-100 overflow-hidden">
							<div
								className={cn(
									"h-full rounded-full transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-250",
									isWarning ? "bg-error" : "bg-primary",
								)}
								style={{
									width: `${pct}%`,
									backgroundColor: !isWarning ? style.accent : undefined,
								}}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}
