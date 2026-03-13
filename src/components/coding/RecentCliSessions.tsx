/**
 * CodingHome 页面的 CLI 历史会话区域
 * 展示从 Codex CLI / Claude Code CLI 同步来的最近会话
 */
import { Terminal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExternalThreadMeta } from '../../../electron/shared/external-history-types';
import {
	externalHistoryStore,
	useExternalHistorySelector,
} from '../../lib/stores/externalHistoryStore';
import { importExternalThread } from '../../lib/coding/historyImporter';
import { codingThreadStore } from '../../lib/stores/codingThreadStore';
import { ExternalThreadBadge } from './threadList/ExternalThreadBadge';
import { formatRelativeTime } from './threadList/threadListUtils';

interface RecentCliSessionsProps {
	onOpenThread?: (threadId: string) => void;
}

const MAX_DISPLAY = 4;

export function RecentCliSessions({ onOpenThread }: RecentCliSessionsProps) {
	const availability = useExternalHistorySelector((s) => s.availability);
	const codexThreads = useExternalHistorySelector((s) => s.codexThreads);
	const claudeCodeThreads = useExternalHistorySelector((s) => s.claudeCodeThreads);
	const [importingId, setImportingId] = useState<string | null>(null);

	const hasAnyBackend = availability.codex || availability.claudeCode;

	// 首次渲染时检查可用性并同步
	useEffect(() => {
		void externalHistoryStore.checkAvailability().then((result) => {
			if (result.codex || result.claudeCode) {
				void externalHistoryStore.syncAll({ limit: 10 });
			}
		});
	}, []);

	const recentSessions = useMemo(() => {
		const all = [...codexThreads, ...claudeCodeThreads];
		return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_DISPLAY);
	}, [codexThreads, claudeCodeThreads]);

	const handleImport = useCallback(
		async (meta: ExternalThreadMeta) => {
			if (importingId) return;
			setImportingId(meta.id);
			try {
				const thread = await importExternalThread(meta);
				if (thread) {
					codingThreadStore.switchThread(thread.id);
					onOpenThread?.(thread.id);
				}
			} catch (err) {
				console.error('[RecentCliSessions] 导入外部线程失败:', err);
			} finally {
				setImportingId(null);
			}
		},
		[importingId, onOpenThread],
	);

	// 没有可用后端或没有数据时不渲染
	if (!hasAnyBackend || recentSessions.length === 0) return null;

	return (
		<div className="mx-auto mt-4 w-full max-w-3xl px-6 pb-6">
			<div className="mb-2 flex items-center gap-2 px-1">
				<Terminal className="h-3.5 w-3.5 text-zinc-400" />
				<span className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
					最近 CLI 会话
				</span>
			</div>
			<div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-900/70">
				{recentSessions.map((session) => (
					<div
						key={`${session.source}-${session.id}`}
						onClick={() => void handleImport(session)}
						className={`group flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/70 ${
							importingId === session.id ? 'opacity-60 pointer-events-none' : ''
						}`}
					>
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
							<Terminal className="h-4 w-4" />
						</div>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1.5">
								<ExternalThreadBadge source={session.source} />
								<span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
									{session.title}
								</span>
							</div>
							<div className="mt-0.5 truncate text-[11px] text-zinc-400">
								{session.projectName}
							</div>
						</div>
						<div className="shrink-0 text-[11px] tabular-nums text-zinc-400">
							{formatRelativeTime(session.updatedAt)}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
