/**
 * Web 工具卡片 - WebSearch/WebFetch 结果
 */
import { Globe, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { SessionToolCall } from '../../../lib/stores/codingSessionTypes';

interface WebToolCardProps {
	toolCall: SessionToolCall;
}

export function WebToolCard({ toolCall }: WebToolCardProps) {
	const [expanded, setExpanded] = useState(false);
	const isSearch = toolCall.name === 'WebSearch';
	const query = (toolCall.input.query || toolCall.input.url || '') as string;

	const output = typeof toolCall.output === 'string'
		? toolCall.output
		: toolCall.output != null
			? JSON.stringify(toolCall.output, null, 2)
			: '';

	return (
		<div className="rounded-lg border border-zinc-200 dark:border-zinc-700/50 overflow-hidden">
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
			>
				<Globe className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
				<span className="text-xs text-zinc-500">{isSearch ? '搜索' : '获取'}</span>
				<span className="flex-1 text-xs text-zinc-700 dark:text-zinc-300 truncate">
					{query}
				</span>
				{toolCall.status === 'running' && (
					<div className="w-2 h-2 rounded-full bg-[#D96C46] animate-pulse shrink-0" />
				)}
				{toolCall.status === 'completed' && (
					<div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
				)}
				<ChevronDown
					className={`w-3 h-3 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
				/>
			</button>

			{expanded && output && (
				<div className="border-t border-zinc-200 dark:border-zinc-700/50">
					<pre className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-900/5 dark:bg-black/20 max-h-48 overflow-y-auto whitespace-pre-wrap">
						{output.slice(0, 3000)}
					</pre>
				</div>
			)}
		</div>
	);
}
