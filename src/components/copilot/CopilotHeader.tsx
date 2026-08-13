import {
	Loader2,
	MessageSquare,
	MoreHorizontal,
	PanelRightClose,
	Plus,
} from "lucide-react";
import { useEffect } from "react";
import { isTopOverlay, popOverlay, pushOverlay } from "../../lib/overlayStack";
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
	// 「更多」菜单接入全局 overlay 栈：Esc 可关且只关栈顶（此前键盘关不掉）
	useEffect(() => {
		if (!isMoreMenuOpen) return;
		const overlayId = pushOverlay();
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || e.defaultPrevented) return;
			if (!isTopOverlay(overlayId)) return;
			e.preventDefault();
			onCloseMoreMenu();
		};
		document.addEventListener("keydown", onKey);
		return () => {
			popOverlay(overlayId);
			document.removeEventListener("keydown", onKey);
		};
	}, [isMoreMenuOpen, onCloseMoreMenu]);

	return (
		// h-header：与左栏/中栏头部共用 --header-h，三栏第一条分隔线落在同一基线
		<div className="h-header px-4 flex items-center justify-between shrink-0 bg-surface/80 z-10 border-b border-border/60">
			<div className="flex items-center gap-2.5 min-w-0">
				<div
					data-copilot-celebrate-anchor
					className="w-6 h-6 rounded-full bai-avatar-glow shrink-0"
				/>
				<h2 className="font-semibold text-sm text-text-primary tracking-[-0.01em] truncate">
					AI 助手
				</h2>
				{isAgentExecuting ? (
					<span className="flex items-center gap-1 text-2xs text-text-secondary font-medium animate-pulse shrink-0">
						<Loader2 className="w-2.5 h-2.5 animate-spin" strokeWidth={1.5} />
						{agentTaskType === "research" ? "正在深度研究" : "Agent 执行中"}
					</span>
				) : null}
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
							<div className="absolute right-0 top-full mt-1 w-48 bg-surface rounded-2xl shadow-bai-pop border border-border py-1 z-50 animate-in fade-in zoom-in-95 duration-150">
								<button
									type="button"
									onClick={onOpenPromptLibrary}
									className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-secondary hover:bg-warm-200 transition-colors cursor-pointer"
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
