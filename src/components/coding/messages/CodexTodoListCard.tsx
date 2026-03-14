/**
 * Codex 待办列表卡片 - 使用统一 ToolCardShell（Zed 风格）
 */
import { ListChecks, Check, Circle } from 'lucide-react';
import type { SessionToolCall } from '../../../lib/stores/codingSessionTypes';
import { ToolCardShell } from './shared/ToolCardShell';

interface CodexTodoListCardProps {
	toolCall: SessionToolCall;
}

interface TodoItem {
	text: string;
	completed: boolean;
}

export function CodexTodoListCard({ toolCall }: CodexTodoListCardProps) {
	const output = toolCall.output as { items?: TodoItem[] } | undefined;
	const items: TodoItem[] = output?.items ?? [];
	const completedCount = items.filter((t) => t.completed).length;
	const totalCount = items.length;

	const summary = totalCount === 0
		? undefined
		: `${completedCount}/${totalCount}`;

	return (
		<ToolCardShell
			icon={ListChecks}
			label="待办列表"
			title={totalCount > 0 ? `${completedCount}/${totalCount} 已完成` : '待办列表'}
			status={toolCall.status}
			isError={toolCall.isError}
			durationMs={toolCall.durationMs}
			summary={summary}
			defaultExpanded={true}
		>
			{items.length > 0 && (
				<div className="space-y-1">
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
		</ToolCardShell>
	);
}
