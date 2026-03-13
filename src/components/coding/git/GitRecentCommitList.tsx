import { Clock3, History, UserRound } from "lucide-react";
import type { GitCommitInfo } from "../../../lib/stores/codingWorkspaceStore";
import { formatRelativeTime } from "./gitPanelUtils";

interface GitRecentCommitListProps {
	commits: GitCommitInfo[];
}

export function GitRecentCommitList({ commits }: GitRecentCommitListProps) {
	return (
		<div className="px-3 py-3">
			<div className="mb-2 flex items-center gap-2">
				<History className="h-4 w-4 text-zinc-400" />
				<h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
					最近提交
				</h3>
			</div>

			{commits.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-black/[0.08] px-4 py-6 text-center text-xs text-zinc-400 dark:border-white/[0.08]">
					当前仓库还没有可展示的提交记录。
				</div>
			) : (
				<div className="space-y-2">
					{commits.map((commit) => (
						<div
							key={commit.hash}
							className="rounded-2xl border border-black/[0.06] bg-white/70 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]"
						>
							<div className="flex items-start gap-3">
								<div className="mt-0.5 h-8 w-8 shrink-0 rounded-2xl bg-zinc-100 text-zinc-500 dark:bg-white/[0.05] dark:text-zinc-300 flex items-center justify-center">
									<History className="h-3.5 w-3.5" />
								</div>

								<div className="min-w-0 flex-1">
									<div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-100">
										{commit.subject}
									</div>
									<div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-zinc-500 dark:text-zinc-400">
										<span className="inline-flex items-center gap-1">
											<UserRound className="h-3 w-3" />
											{commit.authorName}
										</span>
										<span className="inline-flex items-center gap-1 font-mono">
											#{commit.shortHash}
										</span>
										<span className="inline-flex items-center gap-1">
											<Clock3 className="h-3 w-3" />
											{formatRelativeTime(commit.timestamp)}
										</span>
									</div>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
