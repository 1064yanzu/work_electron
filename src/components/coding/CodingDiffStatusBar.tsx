/**
 * CodingDiffStatusBar — 底部 Diff 统计条
 * 参考 Codex 桌面端：显示 "N 个文件已更改 +xxx -xxx" + "审核更改" 链接
 */
import { useMemo } from 'react';
import { FileCode, ExternalLink } from 'lucide-react';
import { useDiffSelector } from '../../lib/stores/diffStore';
import { codingWorkspaceStore } from '../../lib/stores/codingWorkspaceStore';
import { computeLineStats } from '../../lib/coding/diffUtils';

export function CodingDiffStatusBar() {
	const diffsMap = useDiffSelector((s) => s.diffs);
	const diffs = useMemo(() => Object.values(diffsMap), [diffsMap]);

	const stats = useMemo(() => {
		if (!diffs.length) return null;

		let additions = 0;
		let deletions = 0;
		let fileCount = 0;

		for (const diff of diffs) {
			if (diff.status === 'pending' || diff.status === 'accepted') {
				fileCount++;
				const lineStats = computeLineStats(diff.oldContent || '', diff.newContent || '');
				additions += lineStats.additions;
				deletions += lineStats.deletions;
			}
		}

		if (fileCount === 0) return null;
		return { fileCount, additions, deletions };
	}, [diffs]);

	if (!stats) return null;

	const handleReviewClick = () => {
		codingWorkspaceStore.setRightPanelTab('session-changes');
	};

	return (
		<div className="flex items-center justify-between px-4 py-1.5 bg-[#f5f5f4] dark:bg-[#1a1a1a] border-t border-black/[0.04] dark:border-white/[0.04]">
			<div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
				<FileCode className="h-3.5 w-3.5" />
				<span>{stats.fileCount} 个文件已更改</span>
				{stats.additions > 0 && (
					<span className="font-mono text-green-600 dark:text-green-400">
						+{stats.additions}
					</span>
				)}
				{stats.deletions > 0 && (
					<span className="font-mono text-red-500 dark:text-red-400">
						-{stats.deletions}
					</span>
				)}
			</div>
			<button
				onClick={handleReviewClick}
				className="flex items-center gap-1 text-xs text-[#D96C46] hover:text-[#c55c36] transition-colors"
			>
				审核更改
				<ExternalLink className="h-3 w-3" />
			</button>
		</div>
	);
}
