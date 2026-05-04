// DiffViewer - 完整 Diff 视图（中间面板标签页）
// 基于 react-diff-viewer-continued 实现的全功能 diff 视图

import { Check, Columns2, FileText, Rows3, X } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import {
	type FileDiff,
	useDiffStoreSelector,
} from "../../lib/stores/diffStore";
import { acceptDiff, rejectDiff } from "../../lib/agent/diffActions";
import {
	formatFilePath,
	generateDiff,
	parseDiffStats,
} from "../../lib/utils/diffUtils";
import { cn } from "../../lib/utils";
import { useDiffHighlight } from "./useDiffHighlight";

type ViewMode = "split" | "unified";

interface DiffViewerProps {
	/** 要显示的 diff ID，为空则使用 store 中的 activeDiffId */
	diffId?: string;
	/** 根路径（用于计算相对路径） */
	rootPath?: string;
	/** 关闭回调 */
	onClose?: () => void;
}

// 自定义暗色主题样式
const darkStyles = {
	variables: {
		dark: {
			diffViewerBackground: "#18181b",
			diffViewerColor: "#d4d4d8",
			addedBackground: "rgba(16, 185, 129, 0.08)",
			addedColor: "#6ee7b7",
			removedBackground: "rgba(239, 68, 68, 0.08)",
			removedColor: "#fca5a5",
			wordAddedBackground: "rgba(16, 185, 129, 0.2)",
			wordRemovedBackground: "rgba(239, 68, 68, 0.2)",
			addedGutterBackground: "rgba(16, 185, 129, 0.12)",
			removedGutterBackground: "rgba(239, 68, 68, 0.12)",
			gutterBackground: "#18181b",
			gutterBackgroundDark: "#18181b",
			highlightBackground: "rgba(255, 255, 255, 0.05)",
			highlightGutterBackground: "rgba(255, 255, 255, 0.08)",
			codeFoldGutterBackground: "#27272a",
			codeFoldBackground: "#27272a",
			emptyLineBackground: "#18181b",
			gutterColor: "#52525b",
			addedGutterColor: "#6ee7b7",
			removedGutterColor: "#fca5a5",
			codeFoldContentColor: "#71717a",
		},
	},
	line: {
		padding: "2px 12px",
		fontSize: "12px",
		lineHeight: "20px",
	},
	gutter: {
		padding: "2px 8px",
		fontSize: "11px",
		minWidth: "36px",
	},
	contentText: {
		fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
	},
	codeFold: {
		fontSize: "11px",
		padding: "4px 12px",
	},
};

// 自定义亮色主题样式
const lightStyles = {
	variables: {
		light: {
			diffViewerBackground: "#ffffff",
			diffViewerColor: "#3f3f46",
			addedBackground: "rgba(16, 185, 129, 0.06)",
			addedColor: "#065f46",
			removedBackground: "rgba(239, 68, 68, 0.06)",
			removedColor: "#991b1b",
			wordAddedBackground: "rgba(16, 185, 129, 0.18)",
			wordRemovedBackground: "rgba(239, 68, 68, 0.18)",
			addedGutterBackground: "rgba(16, 185, 129, 0.1)",
			removedGutterBackground: "rgba(239, 68, 68, 0.1)",
			gutterBackground: "#fafafa",
			gutterBackgroundDark: "#f4f4f5",
			highlightBackground: "rgba(0, 0, 0, 0.03)",
			highlightGutterBackground: "rgba(0, 0, 0, 0.05)",
			codeFoldGutterBackground: "#f4f4f5",
			codeFoldBackground: "#f4f4f5",
			emptyLineBackground: "#ffffff",
			gutterColor: "#a1a1aa",
			addedGutterColor: "#065f46",
			removedGutterColor: "#991b1b",
			codeFoldContentColor: "#a1a1aa",
		},
	},
	line: {
		padding: "2px 12px",
		fontSize: "12px",
		lineHeight: "20px",
	},
	gutter: {
		padding: "2px 8px",
		fontSize: "11px",
		minWidth: "36px",
	},
	contentText: {
		fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
	},
	codeFold: {
		fontSize: "11px",
		padding: "4px 12px",
	},
};

function DiffViewerInner({ diffId, rootPath, onClose }: DiffViewerProps) {
	const [viewMode, setViewMode] = useState<ViewMode>("split");
	const activeDiffId = useDiffStoreSelector((s) => s.activeDiffId);
	const diffs = useDiffStoreSelector((s) => s.diffs);

	const resolvedId = diffId || activeDiffId;
	const diff: FileDiff | undefined = resolvedId ? diffs[resolvedId] : undefined;

	// 检测是否暗色主题
	const isDark = useMemo(() => {
		if (typeof document === "undefined") return false;
		return document.documentElement.classList.contains("dark");
	}, []);

	// 计算统计
	const stats = useMemo(() => {
		if (!diff) return { additions: 0, deletions: 0, changes: 0 };
		const lines = generateDiff(diff.oldContent, diff.newContent);
		return parseDiffStats(lines);
	}, [diff]);

	const handleAccept = useCallback(() => {
		if (resolvedId) acceptDiff(resolvedId);
	}, [resolvedId]);

	const handleReject = useCallback(() => {
		if (resolvedId) rejectDiff(resolvedId);
	}, [resolvedId]);

	// Shiki 语法高亮 renderContent
	const { renderContent } = useDiffHighlight(
		diff?.oldContent ?? "",
		diff?.newContent ?? "",
		diff?.filePath ?? "",
		isDark,
	);

	if (!diff) {
		return (
			<div className="flex-1 flex items-center justify-center text-text-light text-sm">
				<div className="text-center">
					<FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
					<p>选择一个文件变更查看 Diff</p>
				</div>
			</div>
		);
	}

	const displayPath = formatFilePath(diff.filePath, rootPath);
	const isPending = diff.status === "pending";

	return (
		<div className="flex flex-col h-full bg-surface overflow-hidden">
			{/* 顶部工具栏 */}
			<div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-warm-50/50 flex-shrink-0">
				{/* 左侧：文件路径 + 统计 */}
				<div className="flex items-center gap-3 min-w-0 flex-1">
					<FileText className="w-4 h-4 text-text-light flex-shrink-0" />
					<span
						className="text-sm font-medium text-text-secondary truncate"
						title={diff.filePath}
					>
						{displayPath}
					</span>
					<div className="flex items-center gap-2 flex-shrink-0">
						{stats.additions > 0 && (
							<span className="text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">
								+{stats.additions}
							</span>
						)}
						{stats.deletions > 0 && (
							<span className="text-[11px] font-mono font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded">
								-{stats.deletions}
							</span>
						)}
					</div>
				</div>

				{/* 右侧：视图切换 + 操作按钮 */}
				<div className="flex items-center gap-2 flex-shrink-0">
					{/* 视图模式切换 */}
					<div className="flex items-center rounded-lg bg-warm-200 p-0.5">
						<button
							type="button"
							onClick={() => setViewMode("split")}
							className={cn(
								"flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
								viewMode === "split"
									? "bg-surface dark:bg-cream-700 text-text-primary dark:text-zinc-200 shadow-sm"
									: "text-text-muted hover:text-text-secondary dark:hover:text-text-light",
							)}
							title="左右对比"
						>
							<Columns2 className="w-3.5 h-3.5" />
							Split
						</button>
						<button
							type="button"
							onClick={() => setViewMode("unified")}
							className={cn(
								"flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
								viewMode === "unified"
									? "bg-surface dark:bg-cream-700 text-text-primary dark:text-zinc-200 shadow-sm"
									: "text-text-muted hover:text-text-secondary dark:hover:text-text-light",
							)}
							title="行内对比"
						>
							<Rows3 className="w-3.5 h-3.5" />
							Unified
						</button>
					</div>

					{/* Accept / Reject */}
					{isPending && (
						<div className="flex items-center gap-1.5 ml-2">
							<button
								type="button"
								onClick={handleReject}
								className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:bg-warm-300/60 dark:hover:bg-cream-700/60 transition-colors"
							>
								<X className="w-3.5 h-3.5" />
								拒绝
							</button>
							<button
								type="button"
								onClick={handleAccept}
								className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-500 hover:bg-emerald-600 transition-colors shadow-sm"
							>
								<Check className="w-3.5 h-3.5" />
								接受
							</button>
						</div>
					)}

					{/* 已操作状态 */}
					{!isPending && (
						<span
							className={cn(
								"text-xs font-medium px-2.5 py-1 rounded-lg",
								diff.status === "accepted" &&
									"text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
								diff.status === "rejected" &&
									"text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
							)}
						>
							{diff.status === "accepted" ? "已接受" : "已拒绝"}
						</span>
					)}

					{/* 关闭按钮 */}
					{onClose && (
						<button
							type="button"
							onClick={onClose}
							className="ml-1 p-1 rounded-md text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 transition-colors"
						>
							<X className="w-4 h-4" />
						</button>
					)}
				</div>
			</div>

			{/* Diff 内容 */}
			<div className="flex-1 overflow-auto">
				<ReactDiffViewer
					oldValue={diff.oldContent}
					newValue={diff.newContent}
					splitView={viewMode === "split"}
					useDarkTheme={isDark}
					compareMethod={DiffMethod.LINES}
					styles={isDark ? darkStyles : lightStyles}
					hideLineNumbers={false}
					showDiffOnly={true}
					extraLinesSurroundingDiff={3}
					leftTitle="原始内容"
					rightTitle="修改后"
					renderContent={renderContent}
				/>
			</div>
		</div>
	);
}

export const DiffViewer = memo(DiffViewerInner);
