import { MoreHorizontal } from "lucide-react";
import type { CodingThread } from "../../../lib/stores/codingThreadTypes";
import { ExternalThreadBadge } from "./ExternalThreadBadge";
import { formatRelativeTime, hasDiffStats } from "./threadListUtils";

interface ThreadRowProps {
	thread: CodingThread;
	active: boolean;
	isEditing: boolean;
	editTitle: string;
	onEditTitleChange: (value: string) => void;
	onEditTitleCommit: () => void;
	onEditTitleCancel: () => void;
	onActivate: () => void;
	onOpenMenu: (position: { x: number; y: number }) => void;
}

export function ThreadRow({
	thread,
	active,
	isEditing,
	editTitle,
	onEditTitleChange,
	onEditTitleCommit,
	onEditTitleCancel,
	onActivate,
	onOpenMenu,
}: ThreadRowProps) {
	const diffStats = thread.diffStats ?? { additions: 0, deletions: 0 };
	const showDiff = hasDiffStats(diffStats);
	const isRunning = thread.status === "running";
	const sourceBadge =
		thread.source && thread.source !== "local" ? thread.source : null;

	return (
		<div
			onClick={() => {
				if (!isEditing) onActivate();
			}}
			onContextMenu={(event) => {
				event.preventDefault();
				onOpenMenu({ x: event.clientX, y: event.clientY });
			}}
			className={`group flex cursor-pointer items-center gap-2 px-2 py-1.5 transition-colors ${
				active
					? "bg-white/70 text-zinc-900 dark:bg-white/[0.06] dark:text-zinc-100"
					: "text-zinc-700 hover:bg-white/40 dark:text-zinc-300 dark:hover:bg-white/[0.04]"
			}`}
		>
			<div className="flex w-2 shrink-0 justify-center">
				{isRunning && (
					<span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[#D96C46] animate-pulse" />
				)}
			</div>

			<div className="min-w-0 flex-1">
				{isEditing ? (
					<input
						autoFocus
						value={editTitle}
						onChange={(event) => onEditTitleChange(event.target.value)}
						onBlur={onEditTitleCommit}
						onKeyDown={(event) => {
							if (event.key === "Enter") onEditTitleCommit();
							if (event.key === "Escape") onEditTitleCancel();
						}}
						onClick={(event) => event.stopPropagation()}
						className="w-full border-b border-[#D96C46] bg-transparent text-[13px] font-medium outline-none"
					/>
				) : (
					<div className="flex items-center gap-1.5">
						{sourceBadge && <ExternalThreadBadge source={sourceBadge} />}
						<span className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
							{thread.title}
						</span>
					</div>
				)}
			</div>

			<div className="flex shrink-0 items-center gap-3 text-[11px] tabular-nums">
				{showDiff && (
					<div className="flex items-center gap-1 font-mono">
						{diffStats.additions > 0 && (
							<span className="text-emerald-600 dark:text-emerald-400">
								+{diffStats.additions}
							</span>
						)}
						{diffStats.deletions > 0 && (
							<span className="text-rose-500 dark:text-rose-400">
								-{diffStats.deletions}
							</span>
						)}
					</div>
				)}
				<span className="text-zinc-400">
					{formatRelativeTime(thread.updatedAt)}
				</span>
			</div>

			<button
				onClick={(event) => {
					event.stopPropagation();
					const rect = event.currentTarget.getBoundingClientRect();
					onOpenMenu({ x: rect.right - 8, y: rect.bottom + 6 });
				}}
				className="rounded-md p-1 text-zinc-400 opacity-0 transition-all hover:bg-zinc-200 hover:text-zinc-600 group-hover:opacity-100 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
				title="线程操作"
			>
				<MoreHorizontal className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}
