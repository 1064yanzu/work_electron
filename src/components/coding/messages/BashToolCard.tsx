/**
 * Bash 工具卡片 - 命令 + 输出，可折叠
 */
import { Terminal, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { SessionToolCall } from '../../../lib/stores/codingSessionTypes';

interface BashToolCardProps {
	toolCall: SessionToolCall;
}

export function BashToolCard({ toolCall }: BashToolCardProps) {
	const [expanded, setExpanded] = useState(false);
	const command = (toolCall.input.command as string) || '';
	const output = typeof toolCall.output === 'string'
		? toolCall.output
		: toolCall.output != null
			? JSON.stringify(toolCall.output, null, 2)
			: '';

	return (
		<div className="rounded-lg border border-zinc-200 dark:border-zinc-700/50 overflow-hidden">
			{/* 头部：命令 */}
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
			>
				<Terminal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
				<code className="flex-1 text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
					{command}
				</code>
				<StatusDot status={toolCall.status} />
				<ChevronDown
					className={`w-3 h-3 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
				/>
			</button>

			{/* 输出 */}
			{expanded && output && (
				<div className="border-t border-zinc-200 dark:border-zinc-700/50">
					<pre className="px-3 py-2 text-xs font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-900/5 dark:bg-black/20 max-h-60 overflow-y-auto whitespace-pre-wrap">
						{output}
					</pre>
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
