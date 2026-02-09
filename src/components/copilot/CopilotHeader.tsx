import {
	History,
	Loader2,
	MessageSquare,
	MoreHorizontal,
	Plus,
	Sparkles,
} from "lucide-react";

interface CopilotHeaderProps {
	isAgentExecuting: boolean;
	agentTaskType?: string;
	isMoreMenuOpen: boolean;
	onToggleMoreMenu: () => void;
	onCloseMoreMenu: () => void;
	onOpenPromptLibrary: () => void;
	onNewSession: () => void;
	onOpenHistory: () => void;
}

export function CopilotHeader({
	isAgentExecuting,
	agentTaskType,
	isMoreMenuOpen,
	onToggleMoreMenu,
	onCloseMoreMenu,
	onOpenPromptLibrary,
	onNewSession,
	onOpenHistory,
}: CopilotHeaderProps) {
	return (
		<div className="px-4 py-4 flex items-center justify-between shrink-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm z-10">
			<div className="flex items-center gap-3">
				<div className="w-8 h-8 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-950 dark:from-zinc-100 dark:to-zinc-300 flex items-center justify-center shadow-sm">
					<Sparkles className="w-4 h-4 text-white dark:text-zinc-900" />
				</div>
				<div>
					<h2 className="font-semibold text-sm text-zinc-800 dark:text-zinc-100 tracking-tight">
						AI 助手
					</h2>
					{isAgentExecuting ? (
						<span className="flex items-center gap-1 text-[10px] text-primary font-medium animate-pulse">
							<Loader2 className="w-2.5 h-2.5 animate-spin" />
							{agentTaskType === "research" ? "正在深度研究" : "Agent 执行中"}
						</span>
					) : null}
				</div>
			</div>
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={onNewSession}
					aria-label="新建对话"
					className="p-2 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all active:scale-95"
					title="新建对话"
				>
					<Plus className="w-4.5 h-4.5" />
				</button>
				<button
					type="button"
					onClick={onOpenHistory}
					aria-label="查看对话历史"
					className="p-2 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all active:scale-95"
					title="对话历史"
				>
					<History className="w-4.5 h-4.5" />
				</button>
				<div className="relative">
					<button
						type="button"
						onClick={onToggleMoreMenu}
						aria-label="更多操作"
						className="p-2 text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all active:scale-95"
						title="更多"
					>
						<MoreHorizontal className="w-4.5 h-4.5" />
					</button>
					{isMoreMenuOpen ? (
						<>
							<div className="fixed inset-0 z-40" onClick={onCloseMoreMenu} />
							<div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-zinc-800 rounded-xl shadow-lg border border-zinc-200 dark:border-zinc-700 py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
								<button
									type="button"
									onClick={onOpenPromptLibrary}
									className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
								>
									<MessageSquare className="w-4 h-4" />
									<span>提示词仓库</span>
								</button>
							</div>
						</>
					) : null}
				</div>
			</div>
		</div>
	);
}
