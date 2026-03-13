/**
 * 外部 CLI 历史会话行组件
 * 在统一的线程列表中显示来自 CLI 的历史会话
 * 支持显示元信息、续接（Claude Code）和导入操作
 */
import { GitBranch, MessageCircle, Play } from "lucide-react";
import type { ExternalThreadMeta } from "../../../../electron/shared/external-history-types";
import { ExternalThreadBadge } from "./ExternalThreadBadge";
import { formatRelativeTime } from "./threadListUtils";

interface ExternalThreadRowProps {
	thread: ExternalThreadMeta;
	isImporting?: boolean;
	onClick: () => void;
	/** 续接会话回调（仅 Claude Code 支持） */
	onResume?: () => void;
}

export function ExternalThreadRow({
	thread,
	isImporting,
	onClick,
	onResume,
}: ExternalThreadRowProps) {
	const isClaude = thread.source === "claude-code-cli";

	return (
		<div
			className={`group rounded-md px-2 py-1.5 transition-colors hover:bg-white/40 dark:hover:bg-white/[0.04] ${
				isImporting ? "pointer-events-none opacity-50" : ""
			}`}
		>
			<div
				onClick={isImporting ? undefined : onClick}
				className="flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300"
			>
				<div className="flex w-2 shrink-0" />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						<ExternalThreadBadge source={thread.source} />
						<span className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
							{thread.title}
						</span>
					</div>
					{/* 元信息行 */}
					<div className="mt-0.5 flex items-center gap-2 pl-0.5 text-[10px] text-zinc-400">
						<span>{formatRelativeTime(thread.updatedAt)}</span>
						{thread.messageCount != null && thread.messageCount > 0 && (
							<span className="flex items-center gap-0.5">
								<MessageCircle className="h-2.5 w-2.5" />
								{thread.messageCount}
							</span>
						)}
						{thread.gitBranch && (
							<span className="flex items-center gap-0.5">
								<GitBranch className="h-2.5 w-2.5" />
								<span className="max-w-[60px] truncate">
									{thread.gitBranch}
								</span>
							</span>
						)}
						{thread.model && (
							<span className="max-w-[80px] truncate font-mono">
								{thread.model}
							</span>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					{isImporting && (
						<span className="text-[11px] text-zinc-400">导入中...</span>
					)}
					{/* 续接按钮（仅 Claude Code，悬停显示） */}
					{isClaude && onResume && !isImporting && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onResume();
							}}
							className="hidden items-center gap-0.5 rounded-md bg-[#D96C46] px-2 py-0.5 text-[10px] font-medium text-white transition-colors hover:bg-[#c05a38] group-hover:inline-flex"
							title="续接会话"
						>
							<Play className="h-2.5 w-2.5" />
							续接
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
