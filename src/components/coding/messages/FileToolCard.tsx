/**
 * 文件工具卡片 - Read/Edit/Write/Patch/MultiEdit
 * 折叠态：图标 + 动作 + 文件名 + 变更行数摘要
 * 展开态：Read 显示代码内容, Edit/Write 显示 unified diff
 */
import { FileCode, FilePen, FilePlus, FileSearch } from "lucide-react";
import { useMemo } from "react";
import type { SessionToolCall } from "../../../lib/stores/codingSessionTypes";
import { useDiffStoreSelector } from "../../../lib/stores/diffStore";
import { ToolCardShell } from "./shared/ToolCardShell";

interface FileToolCardProps {
	toolCall: SessionToolCall;
}

/** 计算简单行级 diff */
function computeLineDiff(oldContent: string, newContent: string) {
	const oldLines = oldContent.split("\n");
	const newLines = newContent.split("\n");
	const result: Array<{ type: "add" | "remove" | "context"; content: string }> =
		[];

	let added = 0;
	let removed = 0;

	// 使用简单的 LCS 近似算法生成diff
	const oldSet = new Set(oldLines);
	const newSet = new Set(newLines);

	// old 中有而 new 中没有的 → 删除
	for (const line of oldLines) {
		if (!newSet.has(line)) {
			result.push({ type: "remove", content: line });
			removed++;
		}
	}

	// new 中有而 old 中没有的 → 新增
	for (const line of newLines) {
		if (!oldSet.has(line)) {
			result.push({ type: "add", content: line });
			added++;
		}
	}

	return { lines: result, added, removed };
}

export function FileToolCard({ toolCall }: FileToolCardProps) {
	const filePath: string = String(
		toolCall.input.file_path || toolCall.input.path || "",
	);
	const fileName = filePath.split("/").pop() || filePath;
	const isRead = toolCall.name === "Read";
	const isEdit = toolCall.name === "Edit" || toolCall.name === "Patch" || toolCall.name === "MultiEdit";
	const isWrite = toolCall.name === "Write";

	const Icon = isRead ? FileCode : isEdit ? FilePen : isWrite ? FilePlus : FileSearch;
	const actionLabel = isRead
		? "读取"
		: isEdit
			? "编辑"
			: isWrite
				? "创建"
				: toolCall.name;

	// diff 关联
	const diffId = toolCall.diffId;
	const diff = useDiffStoreSelector((s) =>
		diffId ? s.diffs[diffId] : undefined,
	);

	// 计算变更摘要
	const diffInfo = useMemo(() => {
		if (!diff || !diff.oldContent || !diff.newContent) return null;
		return computeLineDiff(diff.oldContent, diff.newContent);
	}, [diff]);

	// 摘要文本
	const summary = useMemo(() => {
		if (toolCall.status !== "completed") return undefined;
		if (diffInfo) {
			const parts: string[] = [];
			if (diffInfo.added > 0) parts.push(`+${diffInfo.added}`);
			if (diffInfo.removed > 0) parts.push(`-${diffInfo.removed}`);
			return parts.join(" ") || undefined;
		}
		if (isRead && toolCall.output) {
			const content =
				typeof toolCall.output === "string"
					? toolCall.output
					: JSON.stringify(toolCall.output);
			const lineCount = content.split("\n").length;
			return `${lineCount} 行`;
		}
		return undefined;
	}, [toolCall.status, toolCall.output, diffInfo, isRead]);

	// 变更行数摘要的颜色标签
	const headerRight = diffInfo ? (
		<span className="flex items-center gap-1 text-[10px] tabular-nums">
			{diffInfo.added > 0 && (
				<span className="text-emerald-600 dark:text-emerald-400">
					+{diffInfo.added}
				</span>
			)}
			{diffInfo.removed > 0 && (
				<span className="text-red-500 dark:text-red-400">
					-{diffInfo.removed}
				</span>
			)}
		</span>
	) : undefined;

	return (
		<ToolCardShell
			icon={Icon}
			label={actionLabel}
			title={fileName}
			status={toolCall.status}
			isError={toolCall.isError}
			durationMs={toolCall.durationMs}
			summary={!diffInfo ? summary : undefined}
			headerRight={headerRight}
		>
			{/* 完整路径 */}
			<p className="mb-1.5 rounded-md bg-zinc-50 px-2.5 py-1 font-mono text-[10px] text-zinc-400 dark:bg-zinc-800/50">
				{filePath}
			</p>

			{/* Read 输出：代码块风格 */}
			{isRead && toolCall.output != null && (
				<div className="overflow-hidden rounded-lg border border-zinc-200/60 dark:border-zinc-700/40">
					<pre className="max-h-48 overflow-y-auto bg-zinc-50 px-3 py-2 font-mono text-[11px] leading-[1.6] text-zinc-600 scrollbar-thin dark:bg-zinc-900/50 dark:text-zinc-400">
						{(typeof toolCall.output === "string"
							? toolCall.output
							: JSON.stringify(toolCall.output, null, 2)
						).slice(0, 3000)}
						{((typeof toolCall.output === "string"
							? toolCall.output
							: JSON.stringify(toolCall.output, null, 2)
						).length > 3000) && "\n\n... (内容已截断)"}
					</pre>
				</div>
			)}

			{/* Edit/Write：Unified Diff 视图 */}
			{(isEdit || isWrite) && diff && (
				<div className="overflow-hidden rounded-lg border border-zinc-200/60 dark:border-zinc-700/40">
					{/* 写入且无旧内容 → 新文件 */}
					{isWrite && !diff.oldContent && diff.newContent && (
						<pre className="max-h-56 overflow-y-auto bg-emerald-50/50 px-3 py-2 font-mono text-[11px] leading-[1.6] text-emerald-700 scrollbar-thin dark:bg-emerald-900/10 dark:text-emerald-400">
							{diff.newContent.slice(0, 3000)}
						</pre>
					)}

					{/* 有旧有新 → 行级 diff */}
					{diff.oldContent && diff.newContent && diffInfo && (
						<div className="max-h-56 overflow-y-auto scrollbar-thin">
							{diffInfo.lines.map((line, i) => (
								<div
									key={`${line.type}-${i}`}
									className={`flex font-mono text-[11px] leading-[1.6] ${
										line.type === "add"
											? "bg-emerald-50/60 text-emerald-700 dark:bg-emerald-900/15 dark:text-emerald-400"
											: line.type === "remove"
												? "bg-red-50/60 text-red-600 dark:bg-red-900/15 dark:text-red-400"
												: "text-zinc-500 dark:text-zinc-400"
									}`}
								>
									<span className="w-6 shrink-0 select-none px-1 text-right text-[10px] text-zinc-400/60">
										{line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
									</span>
									<span className="flex-1 whitespace-pre-wrap break-all px-2 py-px">
										{line.content}
									</span>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* Edit/Write 但没有 diff 的情况 → 显示 raw output */}
			{(isEdit || isWrite) && !diff && toolCall.output != null && (
				<div className="overflow-hidden rounded-lg border border-zinc-200/60 dark:border-zinc-700/40">
					<pre className="max-h-40 overflow-y-auto bg-zinc-50 px-3 py-2 font-mono text-[11px] leading-[1.6] text-zinc-600 scrollbar-thin dark:bg-zinc-900/50 dark:text-zinc-400">
						{(typeof toolCall.output === "string"
							? toolCall.output
							: JSON.stringify(toolCall.output, null, 2)
						).slice(0, 2000)}
					</pre>
				</div>
			)}
		</ToolCardShell>
	);
}
