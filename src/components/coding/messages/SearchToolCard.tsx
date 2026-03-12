/**
 * 搜索工具卡片 - Glob/Grep 搜索结果列表
 */
import { Search, FolderSearch, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { SessionToolCall } from '../../../lib/stores/codingSessionTypes';

interface SearchToolCardProps {
	toolCall: SessionToolCall;
}

export function SearchToolCard({ toolCall }: SearchToolCardProps) {
	const [expanded, setExpanded] = useState(false);
	const isGlob = toolCall.name === 'Glob';
	const pattern = (toolCall.input.pattern || toolCall.input.query || '') as string;
	const Icon = isGlob ? FolderSearch : Search;

	// 解析输出
	const output = typeof toolCall.output === 'string'
		? toolCall.output
		: toolCall.output != null
			? JSON.stringify(toolCall.output, null, 2)
			: '';

	const resultLines = output.split('\n').filter(Boolean);
	const resultCount = resultLines.length;

	return (
		<div className="rounded-lg border border-zinc-200 dark:border-zinc-700/50 overflow-hidden">
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
			>
				<Icon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
				<span className="text-xs text-zinc-500">{toolCall.name}</span>
				<code className="flex-1 text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
					{pattern}
				</code>
				{toolCall.status === 'completed' && (
					<span className="text-[10px] text-zinc-400 tabular-nums">
						{resultCount} 结果
					</span>
				)}
				{toolCall.status === 'running' && (
					<div className="w-2 h-2 rounded-full bg-[#D96C46] animate-pulse shrink-0" />
				)}
				<ChevronDown
					className={`w-3 h-3 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
				/>
			</button>

			{expanded && output && (
				<div className="border-t border-zinc-200 dark:border-zinc-700/50">
					<pre className="px-3 py-2 text-xs font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-900/5 dark:bg-black/20 max-h-48 overflow-y-auto whitespace-pre-wrap">
						{output.slice(0, 3000)}
					</pre>
				</div>
			)}
		</div>
	);
}
