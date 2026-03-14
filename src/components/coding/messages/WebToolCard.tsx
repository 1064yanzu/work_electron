/**
 * Web 工具卡片 - WebSearch/WebFetch 紧凑内联展示
 * 折叠态：Globe icon + 搜索/获取 + URL/query
 */
import { Globe, ExternalLink } from "lucide-react";
import { useMemo } from "react";
import type { SessionToolCall } from "../../../lib/stores/codingSessionTypes";
import { ToolCardShell } from "./shared/ToolCardShell";
import { MarkdownRenderer } from "../../ui/MarkdownRenderer";

interface WebToolCardProps {
	toolCall: SessionToolCall;
}

export function WebToolCard({ toolCall }: WebToolCardProps) {
	const isSearch = toolCall.name === "WebSearch";
	const query = (toolCall.input.query || toolCall.input.url || "") as string;
	const prompt = (toolCall.input.prompt as string) || "";

	const output = useMemo(() => {
		if (typeof toolCall.output === "string") return toolCall.output;
		if (toolCall.output != null)
			return JSON.stringify(toolCall.output, null, 2);
		return "";
	}, [toolCall.output]);

	const label = isSearch ? "WebSearch" : "WebFetch";

	const isUrl = !isSearch && query.startsWith("http");

	const headerRight = isUrl ? (
		<a
			href={query}
			target="_blank"
			rel="noopener noreferrer"
			onClick={(e) => e.stopPropagation()}
			className="inline-flex items-center gap-0.5 text-[10px] text-zinc-400 transition-colors hover:text-[#D96C46]"
		>
			<ExternalLink className="h-2.5 w-2.5" />
		</a>
	) : undefined;

	return (
		<ToolCardShell
			icon={Globe}
			label={label}
			title={query}
			status={toolCall.status}
			isError={toolCall.isError}
			headerRight={headerRight}
			iconColor="text-blue-500"
		>
			{prompt && (
				<p className="mb-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
					{prompt}
				</p>
			)}

			{output && (
				<div className="max-h-64 overflow-y-auto rounded-md border border-zinc-200/60 bg-white/50 px-3 py-2 scrollbar-thin dark:border-zinc-700/40 dark:bg-zinc-900/30">
					<div className="prose prose-sm prose-zinc max-w-none dark:prose-invert">
						<MarkdownRenderer
							content={output.slice(0, 4000)}
							className="text-[11px] leading-relaxed"
						/>
					</div>
				</div>
			)}
		</ToolCardShell>
	);
}
