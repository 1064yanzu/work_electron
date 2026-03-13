/**
 * CLI 历史线程分组
 * 展示从外部 CLI 同步来的线程列表
 */
import { ChevronDown, ChevronRight, Terminal } from 'lucide-react';
import { useState } from 'react';
import type { ExternalThreadMeta } from '../../../../electron/shared/external-history-types';
import { ExternalThreadRow } from './ExternalThreadRow';

interface ExternalThreadGroupProps {
	threads: ExternalThreadMeta[];
	onImportThread: (thread: ExternalThreadMeta) => void;
}

const MAX_VISIBLE = 5;

export function ExternalThreadGroup({
	threads,
	onImportThread,
}: ExternalThreadGroupProps) {
	const [collapsed, setCollapsed] = useState(false);
	const [expanded, setExpanded] = useState(false);

	if (threads.length === 0) return null;

	const visibleThreads = expanded ? threads : threads.slice(0, MAX_VISIBLE);
	const hiddenCount = Math.max(0, threads.length - MAX_VISIBLE);

	return (
		<section>
			<button
				onClick={() => setCollapsed((c) => !c)}
				className="flex w-full items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-white/40 dark:hover:bg-white/[0.04]"
			>
				<Terminal className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
				<div className="min-w-0 flex-1">
					<div className="truncate text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
						CLI 历史
					</div>
				</div>
				<span className="mr-1 text-[11px] text-zinc-400">{threads.length}</span>
				{collapsed ? (
					<ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
				) : (
					<ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
				)}
			</button>

			{!collapsed && (
				<div className="space-y-0.5 pl-6">
					{visibleThreads.map((thread) => (
						<ExternalThreadRow
							key={`${thread.source}-${thread.id}`}
							thread={thread}
							onClick={() => onImportThread(thread)}
						/>
					))}

					{hiddenCount > 0 && (
						<button
							onClick={() => setExpanded((e) => !e)}
							className="ml-2 rounded-md px-2 py-1 text-[12px] text-zinc-400 transition-colors hover:bg-white/40 hover:text-zinc-600 dark:hover:bg-white/[0.04] dark:hover:text-zinc-300"
						>
							{expanded ? '收起' : `展开显示 (${hiddenCount})`}
						</button>
					)}
				</div>
			)}
		</section>
	);
}
