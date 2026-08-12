import {
	Loader2,
	MessageSquare,
	MoreHorizontal,
	PanelRightClose,
	Plus,
} from "lucide-react";
import { shortcut } from "../../lib/platform";
import { workspaceStore } from "../../lib/workspaceStore";
import { IconButton } from "../ui/Button";
import { CopilotTtsToggle } from "./CopilotTtsToggle";

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
		<div className="px-4 py-3.5 flex items-center justify-between shrink-0 bg-cream-50/80 dark:bg-cream-900/80 z-10 border-b border-cream-300/60 dark:border-cream-500/60">
			<div className="flex items-center gap-3">
				<div
					data-copilot-celebrate-anchor
					className="w-8 h-8 rounded-full bai-avatar-glow shrink-0"
				/>
				<div>
					<h2 className="font-semibold text-[13px] text-text-primary tracking-[-0.01em]">
						AI 助手
					</h2>
					{isAgentExecuting ? (
						<span className="flex items-center gap-1 text-[10px] text-text-secondary font-medium animate-pulse">
							<Loader2 className="w-2.5 h-2.5 animate-spin" strokeWidth={1.5} />
							{agentTaskType === "research" ? "正在深度研究" : "Agent 执行中"}
						</span>
					) : null}
				</div>
			</div>
			<div className="flex items-center gap-1">
				<CopilotTtsToggle />
				<IconButton
					onClick={onNewSession}
					aria-label="新建对话"
					title="新建对话"
					variant="ghost"
					size="sm"
				>
					<Plus className="w-4.5 h-4.5" strokeWidth={1.5} />
				</IconButton>
				<div className="relative">
					<IconButton
						onClick={onToggleMoreMenu}
						aria-label="更多操作"
						title="更多操作"
						variant="ghost"
						size="sm"
					>
						<MoreHorizontal className="w-4.5 h-4.5" strokeWidth={1.5} />
					</IconButton>
					{isMoreMenuOpen ? (
						<>
							<div className="fixed inset-0 z-40" onClick={onCloseMoreMenu} />
							<div className="absolute right-0 top-full mt-1 w-48 bg-cream-50 dark:bg-cream-900 rounded-2xl shadow-bai-pop border border-cream-400 dark:border-cream-500 py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
								<button
									type="button"
									onClick={onOpenPromptLibrary}
									className="w-full flex items-center gap-3 px-3 py-2 text-[13px] text-text-secondary hover:bg-cream-100 dark:hover:bg-cream-800 transition-colors cursor-pointer"
								>
									<MessageSquare className="w-4 h-4" strokeWidth={1.5} />
									<span>提示词仓库</span>
								</button>
							</div>
						</>
					) : null}
				</div>
				{/* 收起右栏：与左栏 SidebarRail 的折叠按钮对称。
				    此前只能靠 ⌘L 或把分隔条拖到吸附阈值以内收起，而收起之后反倒有
				    悬浮按钮能唤回来——展开态缺一个出口。 */}
				<IconButton
					onClick={() => workspaceStore.setRightSidebarVisible(false)}
					aria-label="收起 AI 对话栏"
					title={`收起 AI 对话栏 (${shortcut("L")})`}
					variant="ghost"
					size="sm"
				>
					<PanelRightClose className="w-4.5 h-4.5" strokeWidth={1.5} />
				</IconButton>
			</div>
		</div>
	);
}
