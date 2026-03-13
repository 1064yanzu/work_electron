import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import type { ExternalThreadMeta } from '../../../../electron/shared/external-history-types';
import type {
	CodingProjectThreadGroup,
} from '../../../lib/stores/codingThreadStore';
import type { CodingThread } from '../../../lib/stores/codingThreadTypes';
import { ThreadRow } from './ThreadRow';
import { ExternalThreadRow } from './ExternalThreadRow';

interface ThreadGroupProps {
	group: CodingProjectThreadGroup;
	activeThreadId: string | null;
	searchActive: boolean;
	collapsed: boolean;
	expanded: boolean;
	editingId: string | null;
	editTitle: string;
	importingId: string | null;
	onToggleCollapse: () => void;
	onToggleExpanded: () => void;
	onSwitchThread: (thread: CodingThread) => void;
	onImportExternal: (meta: ExternalThreadMeta) => void;
	onEditTitleChange: (value: string) => void;
	onCommitRename: () => void;
	onCancelRename: () => void;
	onOpenMenu: (threadId: string, position: { x: number; y: number }) => void;
}

/** 统一的显示条目（本地线程和外部 CLI 历史混合排序） */
type DisplayItem =
	| { kind: 'local'; thread: CodingThread }
	| { kind: 'external'; meta: ExternalThreadMeta };

const MAX_VISIBLE = 5;

export function ThreadGroup({
	group,
	activeThreadId,
	searchActive,
	collapsed,
	expanded,
	editingId,
	editTitle,
	importingId,
	onToggleCollapse,
	onToggleExpanded,
	onSwitchThread,
	onImportExternal,
	onEditTitleChange,
	onCommitRename,
	onCancelRename,
	onOpenMenu,
}: ThreadGroupProps) {
	const isCollapsed = searchActive ? false : collapsed;

	// 统一排序：本地线程 + 外部线程按时间混合
	const allItems: DisplayItem[] = [
		...group.threads.map((t) => ({ kind: 'local' as const, thread: t })),
		...group.externalThreads.map((m) => ({ kind: 'external' as const, meta: m })),
	].sort((a, b) => {
		const aTime = a.kind === 'local' ? a.thread.updatedAt : a.meta.updatedAt;
		const bTime = b.kind === 'local' ? b.thread.updatedAt : b.meta.updatedAt;
		return bTime - aTime;
	});

	const visibleItems = searchActive || expanded
		? allItems
		: allItems.slice(0, MAX_VISIBLE);
	const hiddenCount = Math.max(0, allItems.length - MAX_VISIBLE);
	const totalCount = allItems.length;

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
				<span className="mr-1 text-[11px] text-zinc-400">{totalCount}</span>
				{isCollapsed ? (
					<ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
				) : (
					<ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
				)}
			</button>

			{!isCollapsed && (
				<div className="space-y-0.5 pl-6">
					{allItems.length === 0 ? (
						<div className="px-2 py-1.5 text-[13px] text-zinc-400">无会话</div>
					) : (
						<>
							{visibleItems.map((item) =>
								item.kind === 'local' ? (
									<ThreadRow
										key={item.thread.id}
										thread={item.thread}
										active={item.thread.id === activeThreadId}
										isEditing={editingId === item.thread.id}
										editTitle={editTitle}
										onEditTitleChange={onEditTitleChange}
										onEditTitleCommit={onCommitRename}
										onEditTitleCancel={onCancelRename}
										onActivate={() => onSwitchThread(item.thread)}
										onOpenMenu={(position) => {
											if (editingId !== item.thread.id) {
												onOpenMenu(item.thread.id, position);
											}
										}}
									/>
								) : (
									<ExternalThreadRow
										key={`${item.meta.source}-${item.meta.id}`}
										thread={item.meta}
										isImporting={importingId === item.meta.id}
										onClick={() => onImportExternal(item.meta)}
									/>
								),
							)}

							{!searchActive && hiddenCount > 0 && (
								<button
									onClick={onToggleExpanded}
									className="ml-2 rounded-md px-2 py-1 text-[12px] text-zinc-400 transition-colors hover:bg-white/40 hover:text-zinc-600 dark:hover:bg-white/[0.04] dark:hover:text-zinc-300"
								>
									{expanded ? '收起' : `展开更多 (${hiddenCount})`}
								</button>
							)}
						</>
					)}
				</div>
			)}
		</section>
	);
}
