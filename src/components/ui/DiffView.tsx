import * as Diff from "diff";
import { Check, RotateCcw, X } from "lucide-react";
import { useMemo } from "react";

interface DiffViewProps {
	original: string;
	modified: string;
	onAccept: () => void;
	onReject: () => void;
	title?: string;
}

interface DiffLine {
	type: "unchanged" | "added" | "removed";
	content: string;
	lineNumber?: number;
}

export function DiffView({
	original,
	modified,
	onAccept,
	onReject,
	title,
}: DiffViewProps) {
	const diffLines = useMemo(() => {
		const changes = Diff.diffLines(original, modified);
		const lines: DiffLine[] = [];
		let lineNumber = 1;

		changes.forEach((change) => {
			const content = change.value;
			const subLines = content.split("\n").filter(
				(line, idx, arr) =>
					// 保留非空行，或者是最后一个空行之前的行
					line !== "" || idx < arr.length - 1,
			);

			subLines.forEach((line) => {
				if (change.added) {
					lines.push({ type: "added", content: line });
				} else if (change.removed) {
					lines.push({
						type: "removed",
						content: line,
						lineNumber: lineNumber++,
					});
				} else {
					lines.push({
						type: "unchanged",
						content: line,
						lineNumber: lineNumber++,
					});
				}
			});
		});

		return lines;
	}, [original, modified]);

	const stats = useMemo(() => {
		const added = diffLines.filter((l) => l.type === "added").length;
		const removed = diffLines.filter((l) => l.type === "removed").length;
		return { added, removed };
	}, [diffLines]);

	return (
		<div className="flex flex-col h-full bg-cream-50 dark:bg-cream-900 rounded-2xl border border-cream-400 dark:border-cream-500 overflow-hidden shadow-bai-card">
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 bg-warm-50/50 border-b border-border">
				<div className="flex items-center gap-3">
					<span className="text-sm font-medium text-text-secondary">
						{title || "AI 建议的更改"}
					</span>
					<div className="flex items-center gap-2 text-xs">
						<span className="flex items-center gap-1 text-green-600 dark:text-green-400">
							<span className="w-2 h-2 rounded-full bg-green-500" />+
							{stats.added}
						</span>
						<span className="flex items-center gap-1 text-error dark:text-error">
							<span className="w-2 h-2 rounded-full bg-error" />-
							{stats.removed}
						</span>
					</div>
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={onReject}
						className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-error dark:hover:text-error hover:bg-[rgba(181,51,51,0.08)] dark:hover:bg-red-900/20 rounded-lg transition-colors"
					>
						<X className="w-3.5 h-3.5" />
						拒绝
					</button>
					<button
						onClick={onAccept}
						className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
					>
						<Check className="w-3.5 h-3.5" />
						采用
					</button>
				</div>
			</div>

			{/* Diff Content */}
			<div className="flex-1 overflow-auto font-mono text-sm">
				{diffLines.map((line, idx) => (
					<div
						key={idx}
						className={`
              flex items-stretch border-b border-border/50 last:border-0
              ${
								line.type === "added"
									? "bg-green-50 dark:bg-green-900/20"
									: line.type === "removed"
										? "bg-[rgba(181,51,51,0.08)] dark:bg-red-900/20"
										: "bg-transparent"
							}
            `}
					>
						{/* Line indicator */}
						<div
							className={`
              w-8 shrink-0 flex items-center justify-center text-xs
              ${
								line.type === "added"
									? "text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40"
									: line.type === "removed"
										? "text-error dark:text-error bg-[rgba(181,51,51,0.16)] dark:bg-red-900/40"
										: "text-text-light bg-warm-50/30"
							}
            `}
						>
							{line.type === "added" ? "+" : line.type === "removed" ? "-" : ""}
						</div>

						{/* Content */}
						<div
							className={`
              flex-1 px-4 py-1.5 whitespace-pre-wrap break-all
              ${
								line.type === "added"
									? "text-green-800 dark:text-green-200"
									: line.type === "removed"
										? "text-error dark:text-error line-through opacity-70"
										: "text-text-secondary"
							}
            `}
						>
							{line.content || " "}
						</div>
					</div>
				))}
			</div>

			{/* Footer hint */}
			<div className="px-4 py-2 bg-warm-50/50 border-t border-border text-xs text-text-muted flex items-center gap-2">
				<RotateCcw className="w-3 h-3" />
				<span>绿色表示新增内容，红色表示将被删除的内容</span>
			</div>
		</div>
	);
}

// 简化版 Diff 预览（用于消息气泡中）
interface InlineDiffProps {
	original: string;
	modified: string;
}

export function InlineDiff({ original, modified }: InlineDiffProps) {
	const changes = useMemo(() => {
		return Diff.diffWords(original, modified);
	}, [original, modified]);

	return (
		<span className="font-mono text-sm">
			{changes.map((change, idx) => {
				if (change.added) {
					return (
						<span
							key={idx}
							className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 px-0.5 rounded"
						>
							{change.value}
						</span>
					);
				}
				if (change.removed) {
					return (
						<span
							key={idx}
							className="bg-[rgba(181,51,51,0.16)] dark:bg-red-900/40 text-error dark:text-error line-through opacity-70 px-0.5 rounded"
						>
							{change.value}
						</span>
					);
				}
				return <span key={idx}>{change.value}</span>;
			})}
		</span>
	);
}
