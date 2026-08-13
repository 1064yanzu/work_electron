// DiffSummary - Agent 文件变更汇总
// Agent 的文件工具默认已经写入磁盘，这里提供 Codex 风格的变更清单与撤销入口。

import {
	ChevronDown,
	ExternalLink,
	FilePen,
	FilePlus,
	Undo2,
} from "lucide-react";
import { memo, useMemo } from "react";
import {
	type FileDiff,
	diffStore,
	useDiffStoreSelector,
} from "../../lib/stores/diffStore";
import { rejectAllDiffs, rejectDiff } from "../../lib/agent/diffActions";
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
	/** 只展示当前 Agent 任务产生的 diff，避免历史消息重复挂载最新汇总。 */
	taskId?: string;
}

function openDiff(diff: FileDiff) {
	diffStore.setActiveDiff(diff.id);
	events.emit(EVENTS.AGENT_FOCUS_TOOL_CALL, {
		toolCallId: diff.toolCallId,
		diffId: diff.id,
		type: "diff",
	});
}

function isCreateDiff(diff: FileDiff) {
	return diff.oldFileExisted === false;
}

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
	const isCreate = isCreateDiff(diff);
	const isReverted = diff.status === "rejected";

	return (
		<div
			className={cn(
				"grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-border/70 px-3 py-2.5 text-sm transition-colors",
				"hover:bg-warm-50/45 dark:hover:bg-cream-900/35",
				isReverted && "opacity-55",
			)}
		>
			<button
				type="button"
				onClick={() => openDiff(diff)}
				className="min-w-0 text-left"
				title={diff.filePath}
			>
				<span className="flex min-w-0 items-center gap-2.5">
					<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warm-100 text-text-muted ring-1 ring-border/70 dark:bg-cream-900 dark:text-cream-400">
						{isCreate ? (
							<FilePlus className="h-3.5 w-3.5" />
						) : (
							<FilePen className="h-3.5 w-3.5" />
						)}
					</span>
					<span className="min-w-0">
						<span className="block truncate font-medium text-text-primary dark:text-cream-200">
							{displayPath}
						</span>
						<span className="block truncate text-xs text-text-light">
							{isReverted ? "已撤销" : isCreate ? "已创建" : "已保存"}
						</span>
					</span>
				</span>
			</button>

			<div className="flex shrink-0 items-center gap-1.5 font-mono text-xs">
				{stats.additions > 0 && (
					<span className="text-success">+{stats.additions}</span>
				)}
				{stats.deletions > 0 && (
					<span className="text-error">-{stats.deletions}</span>
				)}
			</div>

			<button
				type="button"
				onClick={() => rejectDiff(diff.id)}
				disabled={isReverted}
				className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs text-text-muted transition-colors hover:bg-warm-200/70 hover:text-text-primary disabled:pointer-events-none disabled:opacity-0 dark:hover:bg-cream-800"
				title="撤销这个文件的修改"
			>
				<Undo2 className="h-3.5 w-3.5" />
				撤销
			</button>
		</div>
	);
}

function DiffSummaryInner({ rootPath, taskId }: DiffSummaryProps) {
	const diffs = useDiffStoreSelector((s) => s.diffs);
	const summaryExpanded = useDiffStoreSelector((s) => s.summaryExpanded);

	const diffList = useMemo(
		() =>
			Object.values(diffs)
				.filter((diff) => !taskId || diff.taskId === taskId)
				.sort((a, b) => a.timestamp - b.timestamp),
		[diffs, taskId],
	);

	const summaryStats = useMemo(() => {
		let totalAdditions = 0;
		let totalDeletions = 0;
		let reverted = 0;

		for (const diff of diffList) {
			const stats = parseDiffStats(
				generateDiff(diff.oldContent, diff.newContent),
			);
			totalAdditions += stats.additions;
			totalDeletions += stats.deletions;
			if (diff.status === "rejected") reverted++;
		}

		return {
			totalAdditions,
			totalDeletions,
			reverted,
			total: diffList.length,
			undoable: diffList.length - reverted,
		};
	}, [diffList]);

	if (diffList.length === 0) return null;

	const firstDiff = diffList[0];

	return (
		<div className="my-3 overflow-hidden rounded-xl bg-surface ring-1 ring-border/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-cream-900/70 dark:ring-cream-800">
			<div className="flex items-center justify-between gap-3 px-3 py-2.5">
				<div className="min-w-0 text-sm font-medium text-text-primary dark:text-cream-100">
					{summaryStats.total} files changed
					{summaryStats.reverted > 0 ? (
						<span className="ml-2 text-xs font-normal text-text-light">
							{summaryStats.reverted} 已撤销
						</span>
					) : null}
				</div>

				<div className="flex shrink-0 items-center gap-3">
					<div className="flex items-center gap-1.5 font-mono text-xs">
						{summaryStats.totalAdditions > 0 && (
							<span className="text-success">
								+{summaryStats.totalAdditions}
							</span>
						)}
						{summaryStats.totalDeletions > 0 && (
							<span className="text-error">-{summaryStats.totalDeletions}</span>
						)}
					</div>
					<button
						type="button"
						onClick={() => rejectAllDiffs(taskId)}
						disabled={summaryStats.undoable === 0}
						className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-warm-100 hover:text-text-primary disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-cream-800"
						title="撤销本轮所有文件修改"
					>
						Undo
						<Undo2 className="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onClick={() => firstDiff && openDiff(firstDiff)}
						className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-text-muted transition-colors hover:bg-warm-100 hover:text-text-primary dark:hover:bg-cream-800"
						title="查看变更详情"
					>
						Review
						<ExternalLink className="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onClick={() => diffStore.toggleSummary()}
						className="inline-flex h-7 w-7 items-center justify-center rounded-md text-text-light transition-colors hover:bg-warm-100 hover:text-text-secondary dark:hover:bg-cream-800"
						title={summaryExpanded ? "收起文件列表" : "展开文件列表"}
					>
						<ChevronDown
							className={cn(
								"h-4 w-4 transition-transform",
								!summaryExpanded && "-rotate-90",
							)}
						/>
					</button>
				</div>
			</div>

			{summaryExpanded ? (
				<div>
					{diffList.map((diff) => (
						<DiffSummaryItem key={diff.id} diff={diff} rootPath={rootPath} />
					))}
				</div>
			) : null}
		</div>
	);
}

export const DiffSummary = memo(DiffSummaryInner);
