/**
 * Codex Web 搜索卡片 - 展示 web_search 事件的搜索查询
 */
import { Globe, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { SessionToolCall } from '../../../lib/stores/codingSessionTypes';

interface CodexWebSearchCardProps {
	toolCall: SessionToolCall;
}

export function CodexWebSearchCard({ toolCall }: CodexWebSearchCardProps) {
	const [expanded, setExpanded] = useState(false);

	const output = toolCall.output as { query?: string } | undefined;
	const query = output?.query ?? (toolCall.input.query as string) ?? '';

	return (
		<div className="rounded-lg border border-zinc-200 dark:border-zinc-700/50 overflow-hidden">
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
			>
				<Globe className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
				<span className="text-xs text-zinc-500">Web 搜索</span>
				<span className="flex-1 text-xs text-zinc-700 dark:text-zinc-300 truncate">
					{query || '搜索中...'}
				</span>
				<StatusDot status={toolCall.status} />
				<ChevronDown
					className={`w-3 h-3 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
				/>
			</button>

			{expanded && query && (
				<div className="border-t border-zinc-200 dark:border-zinc-700/50 px-3 py-2">
					<div className="text-[10px] text-zinc-400 mb-1">搜索查询</div>
					<p className="text-xs text-zinc-600 dark:text-zinc-400">
						{query}
					</p>
				</div>
			)}
		</div>
	);
}

function StatusDot({ status }: { status: SessionToolCall['status'] }) {
	if (status === 'running') {
		return <div className="w-2 h-2 rounded-full bg-[#D96C46] animate-pulse shrink-0" />;
	}
	if (status === 'completed') {
		return <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />;
	}
	if (status === 'error') {
		return <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />;
	}
	return <div className="w-2 h-2 rounded-full bg-zinc-300 shrink-0" />;
}
