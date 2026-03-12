/**
 * 团队协作面板
 * 显示 leader + teammates 列表，每个成员状态 + 任务摘要
 */
import { Users, User, Loader2, Clock, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import type { TeamActivity, TeammateInfo } from '../../../lib/stores/codingSessionTypes';

interface TeamPanelProps {
	team: TeamActivity;
}

const TEAMMATE_STATUS = {
	running: {
		icon: Loader2,
		label: '工作中',
		color: 'text-[#D96C46]',
		dot: 'bg-[#D96C46]',
		animate: true,
	},
	idle: {
		icon: Clock,
		label: '空闲',
		color: 'text-amber-500',
		dot: 'bg-amber-500',
		animate: false,
	},
	completed: {
		icon: CheckCircle2,
		label: '已完成',
		color: 'text-emerald-500',
		dot: 'bg-emerald-500',
		animate: false,
	},
} as const;

export function TeamPanel({ team }: TeamPanelProps) {
	const [expanded, setExpanded] = useState(true);

	const runningCount = team.teammates.filter((t) => t.status === 'running').length;
	const completedCount = team.teammates.filter((t) => t.status === 'completed').length;

	return (
		<div className="rounded-lg border border-purple-200/50 dark:border-purple-700/30 bg-purple-50/50 dark:bg-purple-900/5 overflow-hidden mb-3">
			{/* 头部 */}
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-purple-50/80 dark:hover:bg-purple-900/10 transition-colors"
			>
				<Users className="w-3.5 h-3.5 text-purple-500 shrink-0" />
				<span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
					团队协作
				</span>
				{team.teamName && (
					<span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-800/30 px-1.5 py-0.5 rounded">
						{team.teamName}
					</span>
				)}
				<div className="flex-1" />
				<div className="flex items-center gap-2 text-[10px] text-zinc-400">
					{runningCount > 0 && (
						<span className="flex items-center gap-1">
							<span className="w-1.5 h-1.5 rounded-full bg-[#D96C46] animate-pulse" />
							{runningCount} 工作中
						</span>
					)}
					{completedCount > 0 && (
						<span className="flex items-center gap-1">
							<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
							{completedCount} 已完成
						</span>
					)}
					<span>{team.teammates.length} 成员</span>
				</div>
			</button>

			{/* 成员列表 */}
			{expanded && team.teammates.length > 0 && (
				<div className="border-t border-purple-200/30 dark:border-purple-700/20">
					{team.teammates.map((teammate) => (
						<TeammateRow key={teammate.name} teammate={teammate} />
					))}
				</div>
			)}

			{/* 模式信息 */}
			{expanded && (team.delegationMode || team.teammateMode) && (
				<div className="border-t border-purple-200/30 dark:border-purple-700/20 px-3 py-1.5 flex gap-3">
					{team.delegationMode && (
						<span className="text-[10px] text-zinc-400">
							委派: <span className="text-zinc-500">{team.delegationMode}</span>
						</span>
					)}
					{team.teammateMode && (
						<span className="text-[10px] text-zinc-400">
							成员模式: <span className="text-zinc-500">{team.teammateMode}</span>
						</span>
					)}
				</div>
			)}
		</div>
	);
}

function TeammateRow({ teammate }: { teammate: TeammateInfo }) {
	const cfg = TEAMMATE_STATUS[teammate.status];
	const StatusIcon = cfg.icon;

	return (
		<div className="flex items-center gap-2 px-3 py-1.5 hover:bg-purple-50/50 dark:hover:bg-purple-900/5 transition-colors">
			<User className="w-3 h-3 text-zinc-400 shrink-0" />
			<span className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
				{teammate.name}
			</span>
			<div className="flex-1 min-w-0">
				{teammate.taskSummary && (
					<span className="text-[10px] text-zinc-400 truncate block">
						{teammate.taskSummary}
					</span>
				)}
			</div>
			<StatusIcon
				className={`w-3 h-3 ${cfg.color} shrink-0 ${cfg.animate ? 'animate-spin' : ''}`}
			/>
			<span className={`text-[10px] ${cfg.color} shrink-0`}>{cfg.label}</span>
		</div>
	);
}
