import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import type {
	CodingProjectThreadGroup,
} from '../../../lib/stores/codingThreadStore';
import type { CodingThread } from '../../../lib/stores/codingThreadTypes';
import { ThreadRow } from './ThreadRow';

interface ThreadGroupProps {
	group: CodingProjectThreadGroup;
	activeThreadId: string | null;
	searchActive: boolean;
	collapsed: boolean;
	expanded: boolean;
	editingId: string | null;
	editTitle: string;
	onToggleCollapse: () => void;
	onToggleExpanded: () => void;
	onSwitchThread: (thread: CodingThread) => void;
	onEditTitleChange: (value: string) => void;
	onCommitRename: () => void;
	onCancelRename: () => void;
	onOpenMenu: (threadId: string, position: { x: number; y: number }) => void;
}

const MAX_VISIBLE_THREADS = 3;

export function ThreadGroup({
	group,
	activeThreadId,
	searchActive,
	collapsed,
	expanded,
	editingId,
	editTitle,
	onToggleCollapse,
	onToggleExpanded,
	onSwitchThread,
	onEditTitleChange,
	onCommitRename,
	onCancelRename,
	onOpenMenu,
}: ThreadGroupProps) {
	const isCollapsed = searchActive ? false : collapsed;
	const visibleThreads = searchActive || expanded
		? group.threads
		: group.threads.slice(0, MAX_VISIBLE_THREADS);
	const hiddenCount = Math.max(0, group.threads.length - MAX_VISIBLE_THREADS);

	return (
		<section>
			<button
				onClick={onToggleCollapse}
				className="flex w-full items-center gap-2 px-2 py-2 text-left transition-colors hover:bg-white/40 dark:hover:bg-white/[0.04]"
			>
				<FolderOpen className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
				<div className="min-w-0 flex-1">
					<div className="truncate text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
						{group.projectName}
					</div>
				</div>
				{isCollapsed ? (
					<ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
				) : (
					<ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
				)}
			</button>

			{!isCollapsed && (
				<div className="space-y-0.5 pl-6">
					{group.threads.length === 0 ? (
						<div className="px-2 py-1.5 text-[13px] text-zinc-400">无线程</div>
					) : (
						<>
							{visibleThreads.map((thread) => (
								<ThreadRow
									key={thread.id}
									thread={thread}
									active={thread.id === activeThreadId}
									isEditing={editingId === thread.id}
									editTitle={editTitle}
									onEditTitleChange={onEditTitleChange}
									onEditTitleCommit={onCommitRename}
									onEditTitleCancel={onCancelRename}
									onActivate={() => onSwitchThread(thread)}
									onOpenMenu={(position) => {
										if (editingId !== thread.id) {
											onOpenMenu(thread.id, position);
										}
									}}
								/>
							))}

							{!searchActive && hiddenCount > 0 && (
								<button
									onClick={onToggleExpanded}
									className="ml-2 rounded-md px-2 py-1 text-[12px] text-zinc-400 transition-colors hover:bg-white/40 hover:text-zinc-600 dark:hover:bg-white/[0.04] dark:hover:text-zinc-300"
								>
									{expanded ? '收起' : `展开显示 (${hiddenCount})`}
								</button>
							)}
						</>
					)}
				</div>
			)}
		</section>
	);
}
