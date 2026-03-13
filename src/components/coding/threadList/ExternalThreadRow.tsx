/**
 * 外部 CLI 历史会话行组件
 * 在统一的线程列表中显示来自 CLI 的历史会话
 */
import type { ExternalThreadMeta } from '../../../../electron/shared/external-history-types';
import { ExternalThreadBadge } from './ExternalThreadBadge';
import { formatRelativeTime } from './threadListUtils';

interface ExternalThreadRowProps {
	thread: ExternalThreadMeta;
	isImporting?: boolean;
	onClick: () => void;
}

export function ExternalThreadRow({ thread, isImporting, onClick }: ExternalThreadRowProps) {
	return (
		<div
			onClick={isImporting ? undefined : onClick}
			className={`group flex cursor-pointer items-center gap-2 px-2 py-1.5 transition-colors text-zinc-700 hover:bg-white/40 dark:text-zinc-300 dark:hover:bg-white/[0.04] ${
				isImporting ? 'opacity-50 pointer-events-none' : ''
			}`}
		>
			<div className="flex w-2 shrink-0" />
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<ExternalThreadBadge source={thread.source} />
					<span className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
						{thread.title}
					</span>
				</div>
			</div>
			<div className="flex shrink-0 items-center text-[11px] tabular-nums text-zinc-400">
				{isImporting ? '导入中...' : formatRelativeTime(thread.updatedAt)}
			</div>
		</div>
	);
}
