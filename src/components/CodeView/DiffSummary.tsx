// DiffSummary - Diff 汇总面板
// Agent 完成任务后，汇总展示所有文件变更

import {
	Check,
	ChevronDown,
	ChevronRight,
	FilePen,
	FilePlus,
	X,
} from "lucide-react";
import { memo, useMemo } from "react";
import {
	type FileDiff,
	diffStore,
	useDiffStoreSelector,
} from "../../lib/stores/diffStore";
import {
	acceptAllDiffs,
	acceptDiff,
	rejectAllDiffs,
	rejectDiff,
} from "../../lib/agent/diffActions";
import {
	formatFilePath,
	generateDiff,
	parseDiffStats,
} from "../../lib/utils/diffUtils";
import { cn } from "../../lib/utils";
import { EVENTS, events } from "../../lib/events";

interface DiffSummaryProps {
	/** 根路径（用于计算相对路径） */
	rootPath?: string;
}

// 单个文件条目
function DiffSummaryItem({
	diff,
	rootPath,
}: {
	diff: FileDiff;
	rootPath?: string;
}) {
	const stats = useMemo(() => {
		const lines = generateDiff(diff.oldContent, diff.newContent);
		return parseDiffStats(lines);
	}, [diff.oldContent, diff.newContent]);

	const displayPath = formatFilePath(diff.filePath, rootPath);
	const isCreate = !diff.oldContent;
	const isPending = diff.status === "pending";

	const openDiff = () => {
		diffStore.setActiveDiff(diff.id);
		events.emit(EVENTS.AGENT_FOCUS_TOOL_CALL, {
			toolCallId: diff.toolCallId,
			diffId: diff.id,
			type: "diff",
		});
	};

	return (
		<div
			className={cn(
				"flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer",
				"hover:bg-warm-50/40",
				diff.status === "rejected" && "opacity-50",
			)}
			onClick={openDiff}
		>
			{/* 文件图标 */}
			<span className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 bg-warm-200">
				{isCreate ? (
					<FilePlus className="w-3 h-3 text-emerald-500" />
				) : (
					<FilePen className="w-3 h-3 text-blue-500" />
				)}
			</span>

			{/* 文件路径 */}
			<span
				className="flex-1 text-sm text-text-secondary truncate"
				title={diff.filePath}
			>
				{displayPath}
			</span>

			{/* 统计 */}
			<div className="flex items-center gap-1.5 flex-shrink-0">
				{stats.additions > 0 && (
					<span className="text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
						+{stats.additions}
					</span>
				)}
				{stats.deletions > 0 && (
					<span className="text-[11px] font-mono font-medium text-red-500 dark:text-red-400">
						-{stats.deletions}
					</span>
				)}
			</div>

			{/* 状态/操作 */}
			{isPending ? (
				<div className="flex items-center gap-1 flex-shrink-0">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							rejectDiff(diff.id);
						}}
						className="p-1 rounded text-text-light hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
						title="拒绝"
					>
						<X className="w-3 h-3" />
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							acceptDiff(diff.id);
						}}
						className="p-1 rounded text-text-light hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
						title="接受"
					>
						<Check className="w-3 h-3" />
					</button>
				</div>
			) : (
				<span
					className={cn(
						"flex items-center w-5 h-5 rounded-full justify-center flex-shrink-0",
						diff.status === "accepted" &&
							"text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
						diff.status === "rejected" &&
							"text-red-400 bg-red-50 dark:bg-red-900/20",
					)}
				>
					{diff.status === "accepted" ? (
						<Check className="w-3 h-3" />
					) : (
						<X className="w-3 h-3" />
					)}
				</span>
			)}
		</div>
	);
}

function DiffSummaryInner({ rootPath }: DiffSummaryProps) {
	const diffs = useDiffStoreSelector((s) => s.diffs);
	const summaryExpanded = useDiffStoreSelector((s) => s.summaryExpanded);

	const diffList = useMemo(
		() => Object.values(diffs).sort((a, b) => a.timestamp - b.timestamp),
		[diffs],
	);

	const summaryStats = useMemo(() => {
		let totalAdditions = 0;
		let totalDeletions = 0;
		let pending = 0;
		let accepted = 0;
		let rejected = 0;

		for (const diff of diffList) {
			const lines = generateDiff(diff.oldContent, diff.newContent);
			const stats = parseDiffStats(lines);
			totalAdditions += stats.additions;
			totalDeletions += stats.deletions;
			if (diff.status === "pending") pending++;
			else if (diff.status === "accepted") accepted++;
			else if (diff.status === "rejected") rejected++;
		}

		return {
			totalAdditions,
			totalDeletions,
			pending,
			accepted,
			rejected,
			total: diffList.length,
		};
	}, [diffList]);

	if (diffList.length === 0) return null;

	return (
		<div className="my-3 rounded-xl ring-1 ring-zinc-200/60 dark:ring-zinc-700/60 bg-surface overflow-hidden">
			{/* 汇总头部 */}
			<button
				type="button"
				onClick={() => diffStore.toggleSummary()}
				className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-warm-50/50/30 transition-colors"
			>
				<div className="flex items-center gap-2.5 min-w-0">
					<span className="w-4 h-4 flex items-center justify-center text-text-light flex-shrink-0">
						{summaryExpanded ? (
							<ChevronDown className="w-3.5 h-3.5" />
						) : (
							<ChevronRight className="w-3.5 h-3.5" />
						)}
					</span>
					<span className="text-sm font-medium text-text-primary dark:text-zinc-200">
						文件变更汇总
					</span>
					<span className="text-xs text-text-muted">
						{summaryStats.total} 个文件
					</span>
				</div>

				<div className="flex items-center gap-2 flex-shrink-0">
					{summaryStats.totalAdditions > 0 && (
						<span className="text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
							+{summaryStats.totalAdditions}
						</span>
					)}
					{summaryStats.totalDeletions > 0 && (
						<span className="text-[11px] font-mono font-medium text-red-500 dark:text-red-400">
							-{summaryStats.totalDeletions}
						</span>
					)}
					{summaryStats.pending > 0 && (
						<span className="text-[10px] text-text-light">
							{summaryStats.pending} 待审
						</span>
					)}
				</div>
			</button>

			{/* 展开的列表 */}
			{summaryExpanded && (
				<div className="border-t border-border">
					{/* 文件列表 */}
					<div className="py-1">
						{diffList.map((diff) => (
							<DiffSummaryItem key={diff.id} diff={diff} rootPath={rootPath} />
						))}
					</div>

					{/* 批量操作 */}
					{summaryStats.pending > 0 && (
						<div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border bg-warm-50/50/20">
							<button
								type="button"
								onClick={() => rejectAllDiffs()}
								className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-muted hover:bg-warm-300/60 dark:hover:bg-zinc-700/60 transition-colors"
							>
								<X className="w-3 h-3" />
								全部拒绝
							</button>
							<button
								type="button"
								onClick={() => acceptAllDiffs()}
								className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-sm"
							>
								<Check className="w-3 h-3" />
								全部接受
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export const DiffSummary = memo(DiffSummaryInner);
