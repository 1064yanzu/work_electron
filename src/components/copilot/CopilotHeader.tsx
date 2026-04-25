import {
	Loader2,
	MessageSquare,
	MoreHorizontal,
	Plus,
	MessagesSquare,
} from "lucide-react";
import { IconButton } from "../ui/Button";

interface CopilotHeaderProps {
	isAgentExecuting: boolean;
	agentTaskType?: string;
	isMoreMenuOpen: boolean;
	onToggleMoreMenu: () => void;
	onCloseMoreMenu: () => void;
	onOpenPromptLibrary: () => void;
	onNewSession: () => void;
}

export function CopilotHeader({
	isAgentExecuting,
	agentTaskType,
	isMoreMenuOpen,
	onToggleMoreMenu,
	onCloseMoreMenu,
	onOpenPromptLibrary,
	onNewSession,
}: CopilotHeaderProps) {
	return (
		<div className="px-4 py-4 flex items-center justify-between shrink-0 bg-surface/80/80 backdrop-blur-sm z-10">
			<div className="flex items-center gap-3">
				<div className="w-8 h-8 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-950 dark:from-zinc-100 dark:to-zinc-300 flex items-center justify-center shadow-sm">
					<MessagesSquare className="w-4 h-4 text-white" />
				</div>
				<div>
					<h2 className="font-semibold text-sm text-text-primary tracking-tight">
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
				<IconButton
					onClick={onNewSession}
					aria-label="新建对话"
					title="新建对话"
					variant="ghost"
					size="sm"
				>
					<Plus className="w-4.5 h-4.5" />
				</IconButton>
				<div className="relative">
					<IconButton
						onClick={onToggleMoreMenu}
						aria-label="更多操作"
						title="更多操作"
						variant="ghost"
						size="sm"
					>
						<MoreHorizontal className="w-4.5 h-4.5" />
					</IconButton>
					{isMoreMenuOpen ? (
						<>
							<div className="fixed inset-0 z-40" onClick={onCloseMoreMenu} />
							<div className="absolute right-0 top-full mt-1 w-48 bg-surface rounded-xl shadow-lg border border-border py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
								<button
									type="button"
									onClick={onOpenPromptLibrary}
									className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-secondary hover:bg-warm-50 dark:hover:bg-zinc-700/50 transition-colors cursor-pointer"
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
