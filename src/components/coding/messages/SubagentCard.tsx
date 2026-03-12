/**
 * 子代理活动卡片
 * 显示 spawn 的子代理：类型 + 状态指示 + summary 摘要
 */
import { Bot, ChevronDown, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { SubagentActivity } from '../../../lib/stores/codingSessionTypes';

interface SubagentCardProps {
	subagent: SubagentActivity;
}

const STATUS_MAP = {
	running: {
		icon: Loader2,
		label: '运行中',
		color: 'text-[#D96C46]',
		bg: 'bg-[#D96C46]/5',
		border: 'border-[#D96C46]/20',
		animate: true,
	},
	completed: {
		icon: CheckCircle2,
		label: '已完成',
		color: 'text-emerald-500',
		bg: 'bg-emerald-50 dark:bg-emerald-900/10',
		border: 'border-emerald-200/50 dark:border-emerald-700/30',
		animate: false,
	},
	stopped: {
		icon: XCircle,
		label: '已停止',
		color: 'text-zinc-400',
		bg: 'bg-zinc-50 dark:bg-zinc-800/50',
		border: 'border-zinc-200/50 dark:border-zinc-700/30',
		animate: false,
	},
} as const;

export function SubagentCard({ subagent }: SubagentCardProps) {
	const [expanded, setExpanded] = useState(false);
	const cfg = STATUS_MAP[subagent.status];
	const StatusIcon = cfg.icon;

	return (
		<div className={`rounded-lg border ${cfg.border} ${cfg.bg} overflow-hidden`}>
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
			>
				<Bot className={`w-3.5 h-3.5 ${cfg.color} shrink-0`} />
				<span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
					子代理
				</span>
				{subagent.agentType && (
					<span className="text-[10px] font-mono text-zinc-500 bg-zinc-100 dark:bg-zinc-700/50 px-1.5 py-0.5 rounded">
						{subagent.agentType}
					</span>
				)}
				<div className="flex-1" />
				<StatusIcon
					className={`w-3 h-3 ${cfg.color} shrink-0 ${cfg.animate ? 'animate-spin' : ''}`}
				/>
				<span className={`text-[10px] ${cfg.color}`}>{cfg.label}</span>
				{(subagent.summary || subagent.transcriptPath) && (
					<ChevronDown
						className={`w-3 h-3 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
					/>
				)}
			</button>

			{expanded && (subagent.summary || subagent.transcriptPath) && (
				<div className="border-t border-zinc-200/50 dark:border-zinc-700/30 px-3 py-2 space-y-1">
					{subagent.summary && (
						<p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
							{subagent.summary}
						</p>
					)}
					{subagent.transcriptPath && (
						<p className="text-[10px] text-zinc-400 font-mono truncate">
							日志: {subagent.transcriptPath}
						</p>
					)}
				</div>
			)}
		</div>
	);
}
