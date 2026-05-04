// AI 审查模式渲染器 - 类似 Cursor 的行内 Diff 高亮

import { type Change, diffLines } from "diff";
import { Check, Undo2 } from "lucide-react";
import { useMemo } from "react";

interface InlineReviewRendererProps {
	originalContent: string;
	suggestedContent: string;
	onAccept: () => void;
	onReject: () => void;
	className?: string;
}

interface DiffLine {
	type: "unchanged" | "added" | "removed";
	content: string;
	lineNumber: number;
}

/**
 * 计算两个文本的行级 Diff
 */
function computeLineDiff(original: string, modified: string): DiffLine[] {
	const changes: Change[] = diffLines(original, modified);
	const result: DiffLine[] = [];
	let lineNum = 1;

	for (const change of changes) {
		const lines = change.value.split("\n").filter(
			(_, i, arr) =>
				// 过滤掉最后一个空行（split 产生的）
				i < arr.length - 1 || arr[i] !== "",
		);

		for (const line of lines) {
			if (change.added) {
				result.push({ type: "added", content: line, lineNumber: lineNum++ });
			} else if (change.removed) {
				result.push({ type: "removed", content: line, lineNumber: lineNum++ });
			} else {
				result.push({
					type: "unchanged",
					content: line,
					lineNumber: lineNum++,
				});
			}
		}
	}

	return result;
}

/**
 * AI 审查模式渲染器
 * 在编辑器位置显示绿色/红色高亮的 Diff 视图
 */
export default function InlineReviewRenderer({
	originalContent,
	suggestedContent,
	onAccept,
	onReject,
	className = "",
}: InlineReviewRendererProps) {
	const diffLines = useMemo(
		() => computeLineDiff(originalContent, suggestedContent),
		[originalContent, suggestedContent],
	);

	const stats = useMemo(() => {
		const added = diffLines.filter((l) => l.type === "added").length;
		const removed = diffLines.filter((l) => l.type === "removed").length;
		return { added, removed };
	}, [diffLines]);

	return (
		<div className={`flex flex-col h-full bg-surface ${className}`}>
			{/* 顶部操作栏 */}
			<div className="flex items-center justify-between px-4 py-3 bg-warm-200/60 border-b border-border">
				<div className="flex items-center gap-3">
					<div className="w-2.5 h-2.5 rounded-full bg-mint-500 animate-pulse" />
					<span className="text-sm font-semibold text-text-primary">
						AI 修改建议
					</span>
					<div className="flex items-center gap-2 text-xs">
						<span className="px-2 py-0.5 rounded-md bg-cream-200 text-text-primary font-medium tabular-nums">
							+{stats.added}
						</span>
						<span className="px-2 py-0.5 rounded-md bg-cream-200 text-text-primary font-medium tabular-nums">
							-{stats.removed}
						</span>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<button
						onClick={onReject}
						className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium text-text-secondary hover:bg-warm-200 transition-colors"
					>
						<Undo2 className="w-4 h-4" strokeWidth={1.5} />
						拒绝
					</button>
					<button
						onClick={onAccept}
						className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors active:scale-[0.98]"
					>
						<Check className="w-4 h-4" strokeWidth={1.5} />
						接受修改
					</button>
				</div>
			</div>

			{/* Diff 内容区域 */}
			<div className="flex-1 overflow-y-auto scrollbar-hide">
				<div className="font-mono text-sm leading-relaxed">
					{diffLines.map((line, idx) => (
						<div
							key={idx}
							className={`
                flex items-stretch border-l-4 transition-colors
                ${
									line.type === "added"
										? "bg-mint-500/[0.08] border-mint-500 text-text-primary"
										: line.type === "removed"
											? "bg-[#b53333]/[0.06] border-[#b53333] text-[#b53333] line-through opacity-70"
											: "bg-transparent border-transparent text-text-secondary"
								}
              `}
						>
							{/* 行号 */}
							<span className="w-12 shrink-0 px-2 py-1 text-right text-text-light select-none border-r border-border text-xs font-mono">
								{line.type === "added"
									? "+"
									: line.type === "removed"
										? "-"
										: line.lineNumber}
							</span>
							{/* 内容 */}
							<span className="flex-1 px-4 py-1 whitespace-pre-wrap break-words">
								{line.content || " "}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* 底部快捷键提示 */}
			<div className="px-4 py-2 bg-warm-200/60 border-t border-border">
				<p className="text-xs text-text-light text-center">
					<kbd className="px-1.5 py-0.5 bg-surface rounded border border-border font-mono text-[10px]">
						Tab
					</kbd>
					<span className="mx-1">接受</span>
					<kbd className="px-1.5 py-0.5 bg-surface rounded border border-border font-mono text-[10px] ml-3">
						Esc
					</kbd>
					<span className="mx-1">拒绝</span>
				</p>
			</div>
		</div>
	);
}
