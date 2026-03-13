import { Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExternalThreadMeta } from '../../../electron/shared/external-history-types';
import {
	codingThreadStore,
	useCodingThreadSelector,
} from '../../lib/stores/codingThreadStore';
import { useCodingWorkspaceSelector } from '../../lib/stores/codingWorkspaceStore';
import type { CodingThread } from '../../lib/stores/codingThreadTypes';
import {
	externalHistoryStore,
	useExternalHistorySelector,
} from '../../lib/stores/externalHistoryStore';
import { importExternalThread } from '../../lib/coding/historyImporter';
import { ContextMenuPortal } from '../ui/DropdownPortal';
import { ThreadGroup } from './threadList/ThreadGroup';

interface CodingThreadListProps {
	onSwitchThread?: (threadId: string) => void;
	onNewThread?: () => void;
}

export function CodingThreadList({ onSwitchThread, onNewThread }: CodingThreadListProps) {
	const activeThreadId = useCodingThreadSelector((s) => s.activeThreadId);
	const threads = useCodingThreadSelector((s) => s.threads);
	const recentProjects = useCodingWorkspaceSelector((s) => s.recentProjects);
	const syncStatus = useExternalHistorySelector((s) => s.syncStatus);
	const codexThreads = useExternalHistorySelector((s) => s.codexThreads);
	const claudeCodeThreads = useExternalHistorySelector((s) => s.claudeCodeThreads);
	const [searchQuery, setSearchQuery] = useState('');
	const [contextMenu, setContextMenu] = useState<{
		threadId: string;
		position: { x: number; y: number };
	} | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState('');
	const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
	const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
	const [importingId, setImportingId] = useState<string | null>(null);

	const isSyncing = syncStatus === 'syncing';

	// 首次挂载或距上次同步超过 30 秒时自动同步外部历史
	useEffect(() => {
		const { lastSyncAt, syncStatus: status } = externalHistoryStore.getState();
		if (status === 'syncing') return;
		const stale = !lastSyncAt || Date.now() - lastSyncAt > 30_000;
		if (stale) {
			void externalHistoryStore.checkAvailability().then(() => {
				void externalHistoryStore.syncAll({ limit: 30 });
			});
		}

		// 定时轮询外部历史（每 60 秒）
		const interval = setInterval(() => {
			const { syncStatus: currentStatus } = externalHistoryStore.getState();
			if (currentStatus !== 'syncing') {
				void externalHistoryStore.syncAll({ limit: 30 });
			}
		}, 60_000);
		return () => clearInterval(interval);
	}, []);

	/** 合并后的外部线程（按更新时间降序） */
	const allExternalThreads = useMemo(
		() => [...codexThreads, ...claudeCodeThreads].sort((a, b) => b.updatedAt - a.updatedAt),
		[codexThreads, claudeCodeThreads],
	);

	/** 统一的项目分组：本地线程 + CLI 历史混合 */
	const projectGroups = useMemo(
		() => codingThreadStore.getProjectGroups(recentProjects, searchQuery, allExternalThreads),
		[recentProjects, searchQuery, threads, allExternalThreads],
	);

	const handleSync = useCallback(() => {
		if (isSyncing) return;
		void externalHistoryStore.syncAll();
	}, [isSyncing]);

	const handleImportExternal = useCallback(
		async (meta: ExternalThreadMeta) => {
			if (importingId) return;
			setImportingId(meta.id);
			try {
				const thread = await importExternalThread(meta);
				if (thread) {
					codingThreadStore.switchThread(thread.id);
					onSwitchThread?.(thread.id);
				}
			} catch (err) {
				console.error('[CodingThreadList] 导入外部线程失败:', err);
			} finally {
				setImportingId(null);
			}
		},
		[importingId, onSwitchThread],
	);

	const handleSwitch = useCallback(
		(thread: CodingThread) => {
			if (thread.id === activeThreadId) return;
			codingThreadStore.switchThread(thread.id);
			onSwitchThread?.(thread.id);
		},
		[activeThreadId, onSwitchThread],
	);

	const handleDelete = useCallback((threadId: string) => {
		codingThreadStore.deleteThread(threadId);
		setContextMenu(null);
	}, []);

	const handleStartRename = useCallback((thread: CodingThread) => {
		setEditingId(thread.id);
		setEditTitle(thread.title);
		setContextMenu(null);
	}, []);

	const handleFinishRename = useCallback(() => {
		if (editingId && editTitle.trim()) {
			codingThreadStore.updateThread(editingId, { title: editTitle.trim() });
		}
		setEditingId(null);
		setEditTitle('');
	}, [editingId, editTitle]);

	const hasAnyContent = projectGroups.some(
		(g) => g.threads.length > 0 || g.externalThreads.length > 0,
	);

	return (
		<div className="flex h-full flex-col bg-[#f3f3f1] dark:bg-[#171717]">
			<div className="shrink-0 border-b border-black/[0.04] px-3 py-3 dark:border-white/[0.04]">
				<div className="flex items-center gap-2">
					<div className="relative flex-1">
						<Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
						<input
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.target.value)}
							placeholder="搜索会话或项目"
							className="h-9 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-[13px] text-zinc-800 outline-none transition-colors focus:border-[#D96C46]/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
						/>
					</div>
					<button
						type="button"
						onClick={handleSync}
						disabled={isSyncing}
						className="inline-flex h-9 min-w-[36px] items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-[#D96C46]/30 hover:text-[#D96C46] disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
						title={isSyncing ? '同步中...' : '同步 CLI 历史'}
					>
						<RefreshCw
							className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`}
						/>
					</button>
					{onNewThread && (
						<button
							type="button"
							onClick={onNewThread}
							className="inline-flex h-9 min-w-[36px] items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-[#D96C46]/30 hover:text-[#D96C46] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
							title="新建线程"
						>
							<Plus className="h-4 w-4" />
						</button>
					)}
				</div>
			</div>
			<div className="flex-1 overflow-y-auto px-2 py-3">
				{!hasAnyContent && projectGroups.length === 0 ? (
					<div className="px-2 py-2 text-[13px] text-zinc-400">无会话</div>
				) : (
					<div className="space-y-3">
						{projectGroups.map((group) => (
							<ThreadGroup
								key={group.projectPath}
								group={group}
								activeThreadId={activeThreadId}
								searchActive={Boolean(searchQuery.trim())}
								collapsed={Boolean(collapsedProjects[group.projectPath])}
								expanded={Boolean(expandedProjects[group.projectPath])}
								editingId={editingId}
								editTitle={editTitle}
								importingId={importingId}
								onToggleCollapse={() => {
									setCollapsedProjects((current) => ({
										...current,
										[group.projectPath]: !current[group.projectPath],
									}));
								}}
								onToggleExpanded={() => {
									setExpandedProjects((current) => ({
										...current,
										[group.projectPath]: !current[group.projectPath],
									}));
								}}
								onSwitchThread={handleSwitch}
								onImportExternal={handleImportExternal}
								onEditTitleChange={setEditTitle}
								onCommitRename={handleFinishRename}
								onCancelRename={() => {
									setEditingId(null);
									setEditTitle('');
								}}
								onOpenMenu={(threadId, position) => {
									setEditingId(null);
									setEditTitle('');
									setContextMenu({ threadId, position });
								}}
							/>
						))}
					</div>
				)}
			</div>

			<ContextMenuPortal
				position={contextMenu?.position ?? null}
				onClose={() => setContextMenu(null)}
				className="overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
			>
				<button
					onClick={() => {
						const thread = contextMenu ? codingThreadStore.getThread(contextMenu.threadId) : null;
						if (thread) handleStartRename(thread);
					}}
					className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-600 transition-colors hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
				>
					<Pencil className="h-3 w-3" />
					重命名
				</button>
				<button
					onClick={() => {
						if (contextMenu) handleDelete(contextMenu.threadId);
					}}
					className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
				>
					<Trash2 className="h-3 w-3" />
					删除
				</button>
			</ContextMenuPortal>
		</div>
	);
}
