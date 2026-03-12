/**
 * Agent 工具专用卡片
 * 当 Claude Code 调用 Agent 工具（spawn 子代理）时展示
 * 显示子代理的名称、描述、类型、提示内容和运行状态
 */
import { Bot, ChevronDown, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { SessionToolCall } from '../../../lib/stores/codingSessionTypes';

interface AgentToolCardProps {
	toolCall: SessionToolCall;
}

export function AgentToolCard({ toolCall }: AgentToolCardProps) {
	const [expanded, setExpanded] = useState(false);
	const input = toolCall.input;

	const agentName = (input.name as string) || '子代理';
	const description = (input.description as string) || '';
	const prompt = (input.prompt as string) || '';
	const subagentType = (input.subagent_type as string) || '';

	const isRunning = toolCall.status === 'running';
	const isError = toolCall.status === 'error';
	const isCompleted = toolCall.status === 'completed';

	const statusIcon = isRunning
		? Loader2
		: isCompleted
			? CheckCircle2
			: isError
				? XCircle
				: Loader2;
	const StatusIcon = statusIcon;

	const statusColor = isRunning
		? 'text-[#D96C46]'
		: isCompleted
			? 'text-emerald-500'
			: isError
				? 'text-red-500'
				: 'text-zinc-400';

	const borderColor = isRunning
		? 'border-[#D96C46]/20'
		: isCompleted
			? 'border-emerald-200/50 dark:border-emerald-700/30'
			: isError
				? 'border-red-200/50 dark:border-red-700/30'
				: 'border-zinc-200 dark:border-zinc-700/50';

	const bgColor = isRunning
		? 'bg-[#D96C46]/[0.03]'
		: isCompleted
			? 'bg-emerald-50/50 dark:bg-emerald-900/5'
			: isError
				? 'bg-red-50/50 dark:bg-red-900/5'
				: 'bg-zinc-50 dark:bg-zinc-800/50';

	return (
		<div className={`rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}>
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
			>
				<Bot className={`w-3.5 h-3.5 ${statusColor} shrink-0`} />
				<span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
					Agent
				</span>
				<span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
					{agentName}
				</span>
				{subagentType && (
					<span className="text-[10px] font-mono text-zinc-400 bg-zinc-100 dark:bg-zinc-700/50 px-1.5 py-0.5 rounded shrink-0">
						{subagentType}
					</span>
				)}
				<div className="flex-1" />
				<StatusIcon
					className={`w-3 h-3 ${statusColor} shrink-0 ${isRunning ? 'animate-spin' : ''}`}
				/>
				{toolCall.durationMs != null && (
					<span className="text-[10px] text-zinc-400 tabular-nums shrink-0">
						{(toolCall.durationMs / 1000).toFixed(1)}s
					</span>
				)}
				<ChevronDown
					className={`w-3 h-3 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
				/>
			</button>

			{expanded && (
				<div className="border-t border-zinc-200/50 dark:border-zinc-700/30 px-3 py-2 space-y-2">
					{description && (
						<div>
							<div className="text-[10px] text-zinc-400 mb-0.5">描述</div>
							<p className="text-xs text-zinc-600 dark:text-zinc-400">
								{description}
							</p>
						</div>
					)}
					{prompt && (
						<div>
							<div className="text-[10px] text-zinc-400 mb-0.5">提示</div>
							<pre className="text-xs font-mono text-zinc-600 dark:text-zinc-400 max-h-32 overflow-y-auto whitespace-pre-wrap bg-zinc-100/50 dark:bg-zinc-800/30 rounded px-2 py-1.5">
								{prompt.length > 500 ? `${prompt.slice(0, 500)}...` : prompt}
							</pre>
						</div>
					)}
					{toolCall.output != null && (
						<div>
							<div className="text-[10px] text-zinc-400 mb-0.5">结果</div>
							<pre className="text-xs font-mono text-zinc-600 dark:text-zinc-400 max-h-24 overflow-y-auto whitespace-pre-wrap">
								{(typeof toolCall.output === 'string'
									? toolCall.output
									: JSON.stringify(toolCall.output, null, 2)
								).slice(0, 800)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
