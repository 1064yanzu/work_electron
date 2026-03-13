import {
	ArrowDown,
	ArrowUp,
	GitBranch,
	Loader2,
	RefreshCcw,
	ShieldAlert,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import type {
	GitBranchInfo,
	GitStatusInfo,
} from "../../../lib/stores/codingWorkspaceStore";
import type { GitSummaryStats } from "./gitPanelUtils";
import { getVisibleBranches } from "./gitPanelUtils";

interface GitOverviewHeaderProps {
	status: GitStatusInfo;
	branches: GitBranchInfo[];
	summary: GitSummaryStats;
	refreshing: boolean;
	onRefresh: () => void;
}

const METRIC_CARDS: Array<{
	key: keyof Pick<
		GitSummaryStats,
		"totalChangedFiles" | "stagedCount" | "unstagedCount" | "untrackedCount"
	>;
	label: string;
	tone: string;
}> = [
	{
		key: "totalChangedFiles",
		label: "总变更",
		tone: "text-zinc-700 dark:text-zinc-200",
	},
	{
		key: "stagedCount",
		label: "已暂存",
		tone: "text-emerald-600 dark:text-emerald-400",
	},
	{
		key: "unstagedCount",
		label: "未暂存",
		tone: "text-amber-600 dark:text-amber-400",
	},
	{
		key: "untrackedCount",
		label: "未跟踪",
		tone: "text-zinc-600 dark:text-zinc-300",
	},
];

export function GitOverviewHeader({
	status,
	branches,
	summary,
	refreshing,
	onRefresh,
}: GitOverviewHeaderProps) {
	const visibleBranches = getVisibleBranches(branches);

	return (
		<div className="border-b border-black/[0.05] px-3 py-3 dark:border-white/[0.05]">
			<div className="rounded-2xl border border-black/[0.06] bg-white/80 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-white/[0.06] dark:bg-white/[0.03]">
				<div className="flex items-start gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#D96C46]/10 text-[#D96C46]">
						<GitBranch className="h-4 w-4" />
					</div>

					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<div className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
								{status.branch}
							</div>
							<span
								className={cn(
									"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
									summary.isClean
										? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
										: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
								)}
							>
								{summary.isClean ? "工作区干净" : "存在未提交改动"}
							</span>
							{summary.conflictedCount > 0 && (
								<span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-600 dark:text-orange-300">
									<ShieldAlert className="h-3 w-3" />
									{summary.conflictedCount} 个冲突
								</span>
							)}
						</div>

						<div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
							<span>{summary.syncLabel}</span>
							<span className="inline-flex items-center gap-1">
								<ArrowUp className="h-3 w-3" />
								{status.ahead}
							</span>
							<span className="inline-flex items-center gap-1">
								<ArrowDown className="h-3 w-3" />
								{status.behind}
							</span>
							<span>{summary.localBranchCount} 个本地分支</span>
							<span>{summary.recentCommitCount} 条最近提交</span>
						</div>
					</div>

					<button
						type="button"
						onClick={onRefresh}
						className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-black/[0.06] bg-white text-zinc-500 transition hover:border-[#D96C46]/30 hover:text-[#D96C46] dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-300"
						title="刷新 Git 状态"
					>
						{refreshing ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<RefreshCcw className="h-3.5 w-3.5" />
						)}
					</button>
				</div>

				<div className="mt-3 grid grid-cols-2 gap-2">
					{METRIC_CARDS.map((card) => (
						<div
							key={card.key}
							className="rounded-xl border border-black/[0.05] bg-zinc-50/80 px-3 py-2 dark:border-white/[0.05] dark:bg-white/[0.03]"
						>
							<div className="text-[10px] text-zinc-500 dark:text-zinc-400">
								{card.label}
							</div>
							<div className={cn("mt-1 text-base font-semibold", card.tone)}>
								{summary[card.key]}
							</div>
						</div>
					))}
				</div>

				{visibleBranches.length > 0 && (
					<div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
						{visibleBranches.map((branch) => (
							<div
								key={branch.name}
								className={cn(
									"inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px]",
									branch.current
										? "border-[#D96C46]/30 bg-[#D96C46]/10 text-[#D96C46]"
										: "border-black/[0.06] bg-white/70 text-zinc-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-300",
								)}
							>
								<GitBranch className="h-3 w-3" />
								<span className="max-w-[120px] truncate">{branch.name}</span>
								{branch.lastCommit && (
									<span className="font-mono opacity-70">{branch.lastCommit}</span>
								)}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
