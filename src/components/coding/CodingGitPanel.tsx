/**
 * Git 状态面板
 * 提供更清晰的 Git 总览、分组文件状态与最近提交历史
 */
import { GitBranch, Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { refreshGitWorkspaceData } from "../../lib/coding/gitWorkspaceData";
import {
	useCodingWorkspaceSelector,
} from "../../lib/stores/codingWorkspaceStore";
import { useDiffStoreSelector } from "../../lib/stores/diffStore";
import { GitChangesSection } from "./git/GitChangesSection";
import { GitOverviewHeader } from "./git/GitOverviewHeader";
import { GitRecentCommitList } from "./git/GitRecentCommitList";
import {
	buildGitSections,
	buildGitSummaryStats,
	type GitSectionId,
} from "./git/gitPanelUtils";

export function CodingGitPanel() {
	const projectPath = useCodingWorkspaceSelector((s) => s.projectPath);
	const isGitRepo = useCodingWorkspaceSelector((s) => s.isGitRepo);
	const gitStatus = useCodingWorkspaceSelector((s) => s.gitStatus);
	const gitBranches = useCodingWorkspaceSelector((s) => s.gitBranches);
	const gitHistory = useCodingWorkspaceSelector((s) => s.gitHistory);
	const diffs = useDiffStoreSelector((s) => s.diffs);
	const [activeFilter, setActiveFilter] = useState<GitSectionId | "all">("all");
	const [refreshing, setRefreshing] = useState(false);

	const sections = useMemo(() => buildGitSections(gitStatus), [gitStatus]);
	const summary = useMemo(
		() =>
			buildGitSummaryStats({
				status: gitStatus,
				branches: gitBranches,
				commits: gitHistory,
			}),
		[gitBranches, gitHistory, gitStatus],
	);
	const pendingDiffPaths = useMemo(
		() =>
			new Set(
				Object.values(diffs)
					.filter((diff) => diff.status === "pending")
					.map((diff) => diff.filePath),
			),
		[diffs],
	);

	const handleRefresh = useCallback(async () => {
		if (!projectPath || refreshing) return;
		setRefreshing(true);
		try {
			await refreshGitWorkspaceData(projectPath);
		} finally {
			setRefreshing(false);
		}
	}, [projectPath, refreshing]);

	if (!isGitRepo) {
		return (
			<div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center">
				<div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
					<GitBranch className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
				</div>
				<p className="text-sm font-medium text-zinc-500 dark:text-zinc-300">
					当前目录不是 Git 仓库
				</p>
				<p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
					选择一个受 Git 管理的项目后，这里会展示分支、提交与文件状态。
				</p>
			</div>
		);
	}

	if (!gitStatus) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="flex items-center gap-2 rounded-full border border-black/[0.06] bg-white px-3 py-2 text-xs text-zinc-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-300">
					<Loader2 className="h-4 w-4 animate-spin text-[#D96C46]" />
					正在读取 Git 状态...
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col bg-[#FAFAFA] dark:bg-[#111111]">
			<GitOverviewHeader
				status={gitStatus}
				branches={gitBranches}
				summary={summary}
				refreshing={refreshing}
				onRefresh={handleRefresh}
			/>

			<div className="flex-1 overflow-y-auto scrollbar-thin">
				<GitChangesSection
					sections={sections}
					activeFilter={activeFilter}
					onFilterChange={setActiveFilter}
					pendingDiffPaths={pendingDiffPaths}
				/>
				<GitRecentCommitList commits={gitHistory} />
			</div>
		</div>
	);
}
