// FileDiffCard - 内联 Diff 卡片（侧边栏消息流中显示）
// 卡片式设计，显示文件变更的预览

import {
	Check,
	ChevronDown,
	ChevronRight,
	ExternalLink,
	FilePen,
	FilePlus,
	X,
} from "lucide-react";
import { memo, useMemo, useState } from "react";
import type { FileDiff } from "../../lib/stores/diffStore";
import { diffStore } from "../../lib/stores/diffStore";
import { acceptDiff, rejectDiff } from "../../lib/agent/diffActions";
import {
	formatFilePath,
	generateDiff,
	inferLanguage,
	parseDiffStats,
	truncateDiffForPreview,
} from "../../lib/utils/diffUtils";
import { cn } from "../../lib/utils";
import { EVENTS, events } from "../../lib/events";
import { HighlightedDiffLine } from "./HighlightedDiffLine";

interface FileDiffCardProps {
	diff: FileDiff;
	/** 用于计算相对路径的根路径 */
	rootPath?: string;
}

/**
 * 在侧边栏消息流中显示的文件 Diff 卡片
 * - 文件路径（显示相对路径，hover 显示完整路径）
 * - 增删行数统计
 * - 折叠/展开的简化 diff 预览
 * - "查看完整 diff" 按钮
 * - Accept / Reject 按钮
 */
function FileDiffCardInner({ diff, rootPath }: FileDiffCardProps) {
	const [expanded, setExpanded] = useState(false);

	// 计算 diff 行和统计
	const diffLines = useMemo(
		() => generateDiff(diff.oldContent, diff.newContent),
		[diff.oldContent, diff.newContent],
	);
	const stats = useMemo(() => parseDiffStats(diffLines), [diffLines]);

	// 截取预览（最多 10 行变更）
	const preview = useMemo(
		() => truncateDiffForPreview(diffLines, 10),
		[diffLines],
	);

	const displayPath = formatFilePath(diff.filePath, rootPath);
	const diffLanguage = useMemo(
		() => inferLanguage(diff.filePath),
		[diff.filePath],
	);
	const isCreate = !diff.oldContent;
	const isPending = diff.status === "pending";
	const isAccepted = diff.status === "accepted";
	const isRejected = diff.status === "rejected";

	// 在中间面板打开完整 diff
	const openFullDiff = () => {
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
				"my-2 rounded-xl ring-1 transition-all overflow-hidden",
				isPending && "ring-zinc-200 dark:ring-zinc-700/60 bg-surface",
				isAccepted &&
					"ring-emerald-200 dark:ring-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-950/10",
				isRejected &&
					"ring-red-200 dark:ring-red-800/40 bg-red-50/20 dark:bg-red-950/10 opacity-60",
			)}
		>
			{/* 头部：文件路径 + 统计 */}
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-warm-50/50/30 transition-colors"
			>
				{/* 折叠箭头 */}
				<span className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-text-light">
					{expanded ? (
						<ChevronDown className="w-3.5 h-3.5" />
					) : (
						<ChevronRight className="w-3.5 h-3.5" />
					)}
				</span>

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
					className="flex-1 text-left text-sm font-medium text-text-primary dark:text-zinc-200 truncate"
					title={diff.filePath}
				>
					{displayPath}
				</span>

				{/* 增删统计 */}
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

				{/* 状态标记 */}
				{isAccepted && (
					<span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
						<Check className="w-3 h-3" />
					</span>
				)}
				{isRejected && (
					<span className="flex items-center gap-1 text-[11px] text-red-500 dark:text-red-400 font-medium">
						<X className="w-3 h-3" />
					</span>
				)}
			</button>

			{/* 展开的 diff 预览 */}
			{expanded && (
				<div className="border-t border-border">
					{/* diff 行预览 */}
					<div className="max-h-[240px] overflow-y-auto text-[12px] font-mono leading-5">
						{preview.lines.map((line, idx) => (
							<div
								key={idx}
								className={cn(
									"flex",
									line.type === "added" &&
										"bg-emerald-50/70 dark:bg-emerald-950/20",
									line.type === "removed" && "bg-red-50/70 dark:bg-red-950/20",
								)}
							>
								{/* 行号 */}
								<span
									className={cn(
										"w-9 flex-shrink-0 text-right pr-2 select-none border-r",
										"text-text-light border-border",
									)}
								>
									{line.type === "added"
										? line.newLineNumber
										: line.type === "removed"
											? line.oldLineNumber
											: line.oldLineNumber}
								</span>
								{/* 符号 */}
								<span
									className={cn(
										"w-5 flex-shrink-0 text-center select-none",
										line.type === "added" &&
											"text-emerald-600 dark:text-emerald-400",
										line.type === "removed" && "text-red-500 dark:text-red-400",
										line.type === "unchanged" && "text-text-light",
									)}
								>
									{line.type === "added"
										? "+"
										: line.type === "removed"
											? "-"
											: " "}
								</span>
								{/* 内容 - Shiki 高亮 */}
								<HighlightedDiffLine
									content={line.content}
									language={diffLanguage}
									lineType={line.type}
								/>
							</div>
						))}
					</div>

					{/* 截断提示 */}
					{preview.truncated && (
						<div className="px-3 py-1.5 text-center text-[11px] text-text-light bg-warm-50/50/30 border-t border-border">
							还有 {preview.totalChangedLines - 10} 行变更未显示
						</div>
					)}

					{/* 操作栏 */}
					<div className="flex items-center justify-between px-3 py-2 border-t border-border bg-warm-50/50/20">
						{/* 查看完整 diff */}
						<button
							type="button"
							onClick={openFullDiff}
							className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary dark:hover:text-zinc-200 transition-colors"
						>
							<ExternalLink className="w-3 h-3" />
							查看完整 Diff
						</button>

						{/* Accept / Reject */}
						{isPending && (
							<div className="flex items-center gap-1.5">
								<button
									type="button"
									onClick={() => rejectDiff(diff.id)}
									className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-text-muted hover:bg-warm-300/60 dark:hover:bg-cream-700/60 transition-colors"
								>
									<X className="w-3 h-3" />
									拒绝
								</button>
								<button
									type="button"
									onClick={() => acceptDiff(diff.id)}
									className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-white bg-emerald-500 hover:bg-emerald-600 transition-colors"
								>
									<Check className="w-3 h-3" />
									接受
								</button>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

export const FileDiffCard = memo(FileDiffCardInner);
