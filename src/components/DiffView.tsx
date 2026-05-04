import { Check, X } from "lucide-react";
import { useMemo } from "react";

interface DiffLine {
	type: "unchanged" | "added" | "removed";
	content: string;
	lineNumber: number;
}

interface DiffViewProps {
	original: string;
	modified: string;
	onAccept: () => void;
	onReject: () => void;
	title?: string;
}

/**
 * 计算两个文本的 diff
 * 使用简单的行级别 diff 算法
 */
function computeDiff(original: string, modified: string): DiffLine[] {
	const originalLines = original.split("\n");
	const modifiedLines = modified.split("\n");
	const result: DiffLine[] = [];

	// 使用 LCS (Longest Common Subsequence) 简化版
	let i = 0,
		j = 0;
	let lineNum = 1;

	while (i < originalLines.length || j < modifiedLines.length) {
		if (i >= originalLines.length) {
			// 剩余的都是新增
			result.push({
				type: "added",
				content: modifiedLines[j],
				lineNumber: lineNum++,
			});
			j++;
		} else if (j >= modifiedLines.length) {
			// 剩余的都是删除
			result.push({
				type: "removed",
				content: originalLines[i],
				lineNumber: lineNum++,
			});
			i++;
		} else if (originalLines[i] === modifiedLines[j]) {
			// 相同行
			result.push({
				type: "unchanged",
				content: originalLines[i],
				lineNumber: lineNum++,
			});
			i++;
			j++;
		} else {
			// 不同，先显示删除再显示新增
			result.push({
				type: "removed",
				content: originalLines[i],
				lineNumber: lineNum++,
			});
			i++;
			result.push({
				type: "added",
				content: modifiedLines[j - 1 < 0 ? 0 : j],
				lineNumber: lineNum++,
			});
			if (
				j < modifiedLines.length &&
				originalLines[i - 1] !== modifiedLines[j]
			) {
				// 如果下一行也不同，继续
			}
			j++;
		}
	}

	return result;
}

/**
 * Cursor 风格的 Diff 视图组件
 * 支持行级别的差异显示，接受/拒绝操作
 */
export default function DiffView({
	original,
	modified,
	onAccept,
	onReject,
	title,
}: DiffViewProps) {
	const diffLines = useMemo(
		() => computeDiff(original, modified),
		[original, modified],
	);

	const stats = useMemo(() => {
		const added = diffLines.filter((l) => l.type === "added").length;
		const removed = diffLines.filter((l) => l.type === "removed").length;
		return { added, removed };
	}, [diffLines]);

	return (
		<div className="fixed inset-x-4 bottom-4 md:inset-x-auto md:right-8 md:bottom-8 md:max-w-2xl z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
			<div className="bg-surface rounded-2xl shadow-bai-pop border border-border overflow-hidden backdrop-blur-xl">
				{/* Header */}
				<div className="px-5 py-4 bg-warm-200/60 border-b border-border">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="w-2.5 h-2.5 rounded-full bg-mint-500 animate-pulse"></div>
							<span className="text-sm font-semibold text-text-primary">
								{title || "AI 修改建议"}
							</span>
						</div>
						<div className="flex items-center gap-3 text-xs">
							<span className="px-2 py-1 rounded-md bg-cream-200 text-text-primary font-medium tabular-nums">
								+{stats.added}
							</span>
							<span className="px-2 py-1 rounded-md bg-cream-200 text-text-primary font-medium tabular-nums">
								-{stats.removed}
							</span>
						</div>
					</div>
				</div>

				{/* Diff Content */}
				<div className="max-h-80 overflow-y-auto scrollbar-hide">
					<div className="font-mono text-sm">
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
								{/* Line Number */}
								<span className="w-12 shrink-0 px-2 py-1 text-right text-text-light select-none border-r border-border text-xs">
									{line.type === "added"
										? "+"
										: line.type === "removed"
											? "-"
											: line.lineNumber}
								</span>
								{/* Content */}
								<span className="flex-1 px-4 py-1 whitespace-pre-wrap break-all">
									{line.content || " "}
								</span>
							</div>
						))}
					</div>
				</div>

				{/* Actions */}
				<div className="px-5 py-4 bg-warm-200/60 border-t border-border flex items-center justify-between">
					<p className="text-xs text-text-light">
						<kbd className="px-1.5 py-0.5 bg-surface rounded border border-border font-mono text-[10px]">
							Tab
						</kbd>
						<span className="mx-1">接受</span>
						<kbd className="px-1.5 py-0.5 bg-surface rounded border border-border font-mono text-[10px] ml-2">
							Esc
						</kbd>
						<span className="mx-1">拒绝</span>
					</p>
					<div className="flex items-center gap-2">
						<button
							onClick={onReject}
							className="px-4 py-2 rounded-full text-sm font-medium text-text-secondary hover:bg-warm-200 transition-colors flex items-center gap-2"
						>
							<X className="w-4 h-4" strokeWidth={1.5} />
							拒绝
						</button>
						<button
							onClick={onAccept}
							className="px-4 py-2 rounded-full text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover transition-colors flex items-center gap-2 active:scale-[0.98]"
						>
							<Check className="w-4 h-4" strokeWidth={1.5} />
							接受修改
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

/**
 * Inline Diff 组件 - 用于编辑器内嵌显示
 */
export function InlineDiff({
	original,
	modified,
	onAccept,
	onReject,
}: {
	original: string;
	modified: string;
	onAccept: () => void;
	onReject: () => void;
}) {
	return (
		<div className="my-2 rounded-lg border border-emerald-200 dark:border-emerald-800/50 overflow-hidden bg-emerald-50/30 dark:bg-emerald-950/10">
			{/* 删除的内容 */}
			{original && (
				<div className="px-4 py-2 bg-red-50/50 dark:bg-red-950/20 border-l-4 border-red-400">
					<pre className="text-sm text-red-700 dark:text-red-400 line-through opacity-70 whitespace-pre-wrap font-mono">
						{original}
					</pre>
				</div>
			)}
			{/* 新增的内容 */}
			{modified && (
				<div className="px-4 py-2 bg-emerald-50/50 dark:bg-emerald-950/20 border-l-4 border-emerald-400">
					<pre className="text-sm text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap font-mono">
						{modified}
					</pre>
				</div>
			)}
			{/* 操作按钮 */}
			<div className="px-4 py-2 bg-warm-50/50 flex items-center justify-end gap-2 border-t border-border/50">
				<button
					onClick={onReject}
					className="p-1.5 rounded-lg text-text-muted hover:bg-warm-300 transition-colors"
					title="拒绝 (Esc)"
				>
					<X className="w-4 h-4" />
				</button>
				<button
					onClick={onAccept}
					className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
					title="接受 (Tab)"
				>
					<Check className="w-4 h-4" />
				</button>
			</div>
		</div>
	);
}
