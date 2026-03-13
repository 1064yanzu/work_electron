/**
 * 搜索工具卡片 - Glob/Grep 结构化结果展示
 * 折叠态：模式 + 结果数
 * 展开态：结构化文件列表
 */
import { Search, FolderSearch, FileText } from "lucide-react";
import { useMemo } from "react";
import type { SessionToolCall } from "../../../lib/stores/codingSessionTypes";
import { ToolCardShell } from "./shared/ToolCardShell";

interface SearchToolCardProps {
	toolCall: SessionToolCall;
}

interface ParsedSearchResult {
	filePath: string;
	fileName: string;
	directory: string;
	/** Grep 时的匹配行 */
	matchLines?: string[];
}

/** 解析搜索结果为结构化数据 */
function parseSearchOutput(output: string, isGlob: boolean): ParsedSearchResult[] {
	if (!output.trim()) return [];
	const lines = output.split("\n").filter(Boolean);

	if (isGlob) {
		// Glob: 每行一个文件路径
		return lines.slice(0, 100).map((line) => {
			const trimmed = line.trim();
			const parts = trimmed.split("/");
			return {
				filePath: trimmed,
				fileName: parts[parts.length - 1] || trimmed,
				directory: parts.slice(0, -1).join("/"),
			};
		});
	}

	// Grep: 尝试解析 file:line:content 格式
	const fileMap = new Map<string, string[]>();
	for (const line of lines.slice(0, 200)) {
		const match = line.match(/^(.+?):(\d+:)?(.*)$/);
		if (match) {
			const fp = match[1];
			const content = match[3] || "";
			if (!fileMap.has(fp)) fileMap.set(fp, []);
			fileMap.get(fp)?.push(content.trim());
		} else {
			// 非标准输出，直接当文件路径
			fileMap.set(line.trim(), []);
		}
	}

	return Array.from(fileMap.entries()).map(([fp, matchLines]) => {
		const parts = fp.split("/");
		return {
			filePath: fp,
			fileName: parts[parts.length - 1] || fp,
			directory: parts.slice(0, -1).join("/"),
			matchLines: matchLines.length > 0 ? matchLines.slice(0, 3) : undefined,
		};
	});
}

export function SearchToolCard({ toolCall }: SearchToolCardProps) {
	const isGlob = toolCall.name === "Glob";
	const pattern = (toolCall.input.pattern || toolCall.input.query || "") as string;
	const Icon = isGlob ? FolderSearch : Search;

	const output = useMemo(() => {
		if (typeof toolCall.output === "string") return toolCall.output;
		if (toolCall.output != null)
			return JSON.stringify(toolCall.output, null, 2);
		return "";
	}, [toolCall.output]);

	const results = useMemo(
		() => parseSearchOutput(output, isGlob),
		[output, isGlob],
	);

	const summary =
		toolCall.status === "completed" ? `${results.length} 个结果` : undefined;

	return (
		<ToolCardShell
			icon={Icon}
			label={isGlob ? "文件搜索" : "内容搜索"}
			title={pattern}
			status={toolCall.status}
			isError={toolCall.isError}
			durationMs={toolCall.durationMs}
			summary={summary}
		>
			{results.length > 0 ? (
				<div className="max-h-56 overflow-y-auto rounded-lg border border-zinc-200/60 scrollbar-thin dark:border-zinc-700/40">
					{results.map((result, i) => (
						<div
							key={`${result.filePath}-${i}`}
							className="group/item flex items-start gap-2 border-b border-zinc-100 px-2.5 py-1.5 last:border-b-0 hover:bg-zinc-50/80 dark:border-zinc-800/40 dark:hover:bg-zinc-800/30"
						>
							<FileText className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" />
							<div className="min-w-0 flex-1">
								<div className="flex items-baseline gap-1">
									<span className="font-mono text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
										{result.fileName}
									</span>
									{result.directory && (
										<span className="truncate font-mono text-[10px] text-zinc-400">
											{result.directory}
										</span>
									)}
								</div>
								{/* Grep 匹配行预览 */}
								{result.matchLines && result.matchLines.length > 0 && (
									<div className="mt-0.5 space-y-px">
										{result.matchLines.map((line, j) => (
											<p
												key={j}
												className="truncate font-mono text-[10px] text-zinc-500 dark:text-zinc-400"
											>
												{line.slice(0, 120)}
											</p>
										))}
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			) : (
				output && (
					<div className="overflow-hidden rounded-lg border border-zinc-200/60 dark:border-zinc-700/40">
						<pre className="max-h-40 overflow-y-auto bg-zinc-50 px-3 py-2 font-mono text-[11px] leading-[1.6] text-zinc-600 scrollbar-thin dark:bg-zinc-900/50 dark:text-zinc-400">
							{output.slice(0, 3000)}
						</pre>
					</div>
				)
			)}
		</ToolCardShell>
	);
}
