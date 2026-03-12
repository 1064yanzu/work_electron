/**
 * 任务通知/系统通知小卡片
 * 显示任务状态变更、团队合并、委派降级等通知信息
 */
import { Bell, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { TaskNotification } from '../../../lib/stores/codingSessionTypes';

interface NotificationCardProps {
	notification: TaskNotification;
}

function getNotificationStyle(notification: TaskNotification) {
	const title = notification.title ?? '';
	if (title.includes('合并')) {
		return { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/10', border: 'border-emerald-200/50 dark:border-emerald-700/30' };
	}
	if (title.includes('降级') || title.includes('失败')) {
		return { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/10', border: 'border-amber-200/50 dark:border-amber-700/30' };
	}
	if (notification.status === 'completed') {
		return { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/10', border: 'border-emerald-200/50 dark:border-emerald-700/30' };
	}
	if (notification.status === 'failed' || notification.status === 'stopped') {
		return { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-900/10', border: 'border-red-200/50 dark:border-red-700/30' };
	}
	return { icon: Bell, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/10', border: 'border-blue-200/50 dark:border-blue-700/30' };
}

export function NotificationCard({ notification }: NotificationCardProps) {
	const style = getNotificationStyle(notification);
	const Icon = style.icon;

	return (
		<div className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${style.border} ${style.bg}`}>
			<Icon className={`w-3.5 h-3.5 ${style.color} shrink-0 mt-0.5`} />
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					{notification.title && (
						<span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
							{notification.title}
						</span>
					)}
					{notification.taskId && (
						<span className="text-[10px] font-mono text-zinc-400">
							#{notification.taskId}
						</span>
					)}
					{notification.status && (
						<span className={`text-[10px] px-1.5 py-0.5 rounded ${style.bg} ${style.color}`}>
							{notification.status}
						</span>
					)}
				</div>
				{notification.message && (
					<p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
						{notification.message}
					</p>
				)}
				{notification.summary && (
					<p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-relaxed">
						{notification.summary}
					</p>
				)}
			</div>
			<span className="text-[9px] text-zinc-400 shrink-0 tabular-nums">
				{new Date(notification.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
			</span>
		</div>
	);
}
