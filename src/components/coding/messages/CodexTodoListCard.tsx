/**
 * Codex 待办列表卡片 - 展示 todo_list 事件的待办项
 */
import { ListChecks, ChevronDown, Check, Circle } from 'lucide-react';
import { useState } from 'react';
import type { SessionToolCall } from '../../../lib/stores/codingSessionTypes';

interface CodexTodoListCardProps {
	toolCall: SessionToolCall;
}

interface TodoItem {
	text: string;
	completed: boolean;
}

export function CodexTodoListCard({ toolCall }: CodexTodoListCardProps) {
	const [expanded, setExpanded] = useState(true);

	const output = toolCall.output as { items?: TodoItem[] } | undefined;
	const items: TodoItem[] = output?.items ?? [];
	const completedCount = items.filter((t) => t.completed).length;
	const totalCount = items.length;

	const summary = totalCount === 0
		? '待办列表'
		: `${completedCount}/${totalCount} 已完成`;

	return (
		<div className="rounded-lg border border-zinc-200 dark:border-zinc-700/50 overflow-hidden">
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
			>
				<ListChecks className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
				<span className="text-xs text-zinc-500">待办列表</span>
				<span className="flex-1 text-xs text-zinc-700 dark:text-zinc-300">
					{summary}
				</span>
				<StatusDot status={toolCall.status} />
				<ChevronDown
					className={`w-3 h-3 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
				/>
			</button>

			{expanded && items.length > 0 && (
				<div className="border-t border-zinc-200 dark:border-zinc-700/50 px-3 py-2 space-y-1">
					{items.map((item, i) => (
						<div
							key={i}
							className="flex items-start gap-2 py-0.5"
						>
							{item.completed ? (
								<Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
							) : (
								<Circle className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
							)}
							<span
								className={`text-xs ${
									item.completed
										? 'text-zinc-400 line-through'
										: 'text-zinc-700 dark:text-zinc-300'
								}`}
							>
								{item.text}
							</span>
						</div>
					))}

					{/* 进度条 */}
					{totalCount > 0 && (
						<div className="pt-1">
							<div className="h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
								<div
									className="h-full bg-emerald-500 rounded-full transition-all duration-300"
									style={{
										width: `${(completedCount / totalCount) * 100}%`,
									}}
								/>
							</div>
						</div>
					)}
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
