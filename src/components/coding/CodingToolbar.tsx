/**
 * 编程工作区顶部工具栏
 * 包含：返回按钮、线程标题、项目名、Git 分支、Code/Plan/Ask 模式切换、session 状态指示器、设置
 */
import {
	ArrowLeft,
	ChevronDown,
	FolderOpen,
	GitBranch,
	PanelLeft,
	PanelRight,
	Plus,
	Settings,
	Terminal,
	Circle,
	Loader2,
	ShieldAlert,
	AlertCircle,
	CheckCircle2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CodingModeSelector } from '../copilot/coding/CodingModeSelector';
import { CodingBackendSelector } from '../copilot/coding/CodingBackendSelector';
import {
	codingWorkspaceStore,
	useCodingWorkspaceSelector,
} from '../../lib/stores/codingWorkspaceStore';
import { useCodingSessionSelector } from '../../lib/stores/codingSessionStore';
import { codingThreadStore, useCodingThreadSelector } from '../../lib/stores/codingThreadStore';
import type { SessionStatus } from '../../lib/stores/codingSessionTypes';
import { DropdownPortal } from '../ui/DropdownPortal';
import type { SettingsTabId } from '../Settings/types';
import { useBackendCapabilities } from '../../hooks/useBackendCapabilities';

interface CodingToolbarProps {
	onBack: () => void;
	onOpenSettings?: (tab?: SettingsTabId) => void;
	onNewThread?: () => void;
}

/** 状态指示器配置 */
const STATUS_CONFIG: Record<SessionStatus, { icon: React.ElementType; label: string; color: string }> = {
	idle: { icon: Circle, label: '就绪', color: 'text-zinc-400' },
	running: { icon: Loader2, label: '运行中', color: 'text-[#D96C46]' },
	awaiting_permission: { icon: ShieldAlert, label: '等待审批', color: 'text-amber-500' },
	paused: { icon: Circle, label: '暂停', color: 'text-amber-500' },
	error: { icon: AlertCircle, label: '错误', color: 'text-red-500' },
	completed: { icon: CheckCircle2, label: '已完成', color: 'text-emerald-500' },
};

export function CodingToolbar({ onBack, onOpenSettings, onNewThread }: CodingToolbarProps) {
	const projectName = useCodingWorkspaceSelector((s) => s.projectName);
	const isGitRepo = useCodingWorkspaceSelector((s) => s.isGitRepo);
	const gitStatus = useCodingWorkspaceSelector((s) => s.gitStatus);
	const gitBranches = useCodingWorkspaceSelector((s) => s.gitBranches);
	const leftPanelVisible = useCodingWorkspaceSelector((s) => s.layout.leftPanelVisible);
	const rightPanelVisible = useCodingWorkspaceSelector((s) => s.layout.rightPanelVisible);
	const terminalVisible = useCodingWorkspaceSelector((s) => s.layout.terminalVisible);

	const sessionStatus = useCodingSessionSelector((s) => s.status);
	const usage = useCodingSessionSelector((s) => s.usage);
	const { isCodex, version } = useBackendCapabilities();

	const activeThreadId = useCodingThreadSelector((s) => s.activeThreadId);
	const activeThread = activeThreadId
		? codingThreadStore.getThread(activeThreadId)
		: null;

	const [branchMenuOpen, setBranchMenuOpen] = useState(false);
	const [isEditingTitle, setIsEditingTitle] = useState(false);
	const [editTitle, setEditTitle] = useState('');
	const branchMenuRef = useRef<HTMLDivElement>(null);
	const titleInputRef = useRef<HTMLInputElement>(null);

	// 标题编辑自动聚焦
	useEffect(() => {
		if (isEditingTitle && titleInputRef.current) {
			titleInputRef.current.focus();
			titleInputRef.current.select();
		}
	}, [isEditingTitle]);

	const handleStartEditTitle = useCallback(() => {
		if (!activeThread) return;
		setEditTitle(activeThread.title);
		setIsEditingTitle(true);
	}, [activeThread]);

	const handleFinishEditTitle = useCallback(() => {
		if (activeThreadId && editTitle.trim()) {
			codingThreadStore.updateThread(activeThreadId, { title: editTitle.trim() });
		}
		setIsEditingTitle(false);
	}, [activeThreadId, editTitle]);

	const statusConfig = STATUS_CONFIG[sessionStatus];
	const StatusIcon = statusConfig.icon;

	return (
		<div className="h-12 shrink-0 flex items-center px-3 gap-2 bg-white/80 dark:bg-[#141414]/80 backdrop-blur-xl border-b border-black/[0.04] dark:border-white/[0.04]">
			{/* 返回按钮 */}
			<button
				onClick={onBack}
				className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-sm"
				title="返回 Dashboard"
			>
				<ArrowLeft className="w-4 h-4" />
				<span className="hidden sm:inline text-xs font-medium">返回</span>
			</button>

			{/* 分隔线 */}
			<div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />

			{/* 线程标题（可编辑） */}
			{activeThread && (
				<>
					{isEditingTitle ? (
						<input
							ref={titleInputRef}
							value={editTitle}
							onChange={(e) => setEditTitle(e.target.value)}
							onBlur={handleFinishEditTitle}
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleFinishEditTitle();
								if (e.key === 'Escape') setIsEditingTitle(false);
							}}
							className="px-2 py-1 text-sm font-medium text-zinc-800 dark:text-zinc-200 bg-transparent border-b border-[#D96C46] outline-none max-w-[180px]"
						/>
					) : (
						<button
							onClick={handleStartEditTitle}
							className="px-2 py-1 rounded-lg text-sm font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors max-w-[180px] truncate"
							title="点击编辑线程标题"
						>
							{activeThread.title}
						</button>
					)}
					<div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />
				</>
			)}

			{/* 项目名称 */}
			<div className="flex items-center gap-2 px-2 py-1 rounded-lg text-sm">
				<FolderOpen className="w-3.5 h-3.5 text-[#D96C46]" />
				<span className="font-medium text-zinc-800 dark:text-zinc-200 max-w-[200px] truncate">
					{projectName}
				</span>
			</div>

			{/* Git 分支选择 */}
			{isGitRepo && gitStatus && (
				<div className="relative" ref={branchMenuRef}>
					<button
						onClick={() => setBranchMenuOpen(!branchMenuOpen)}
						className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
					>
						<GitBranch className="w-3.5 h-3.5" />
						<span>{gitStatus.branch}</span>
						{(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
							<span className="text-[10px] text-zinc-400">
								{gitStatus.ahead > 0 && `↑${gitStatus.ahead}`}
								{gitStatus.behind > 0 && `↓${gitStatus.behind}`}
							</span>
						)}
						<ChevronDown className="w-3 h-3" />
					</button>

					<DropdownPortal
						anchorRef={branchMenuRef}
						open={branchMenuOpen && gitBranches.length > 0}
						onClose={() => setBranchMenuOpen(false)}
						placement="bottom-start"
						width={256}
						className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
					>
						<div className="max-h-80 overflow-y-auto py-1">
							{gitBranches.map((branch) => (
								<div
									key={branch.name}
									className={`flex items-center gap-2 px-3 py-2 text-xs font-mono cursor-default ${
										branch.current
											? 'bg-[#D96C46]/5 text-[#D96C46]'
											: 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
									}`}
								>
									<GitBranch className="w-3 h-3 shrink-0" />
									<span className="truncate">{branch.name}</span>
									{branch.current && (
										<span className="ml-auto text-[10px] bg-[#D96C46]/10 text-[#D96C46] px-1.5 py-0.5 rounded">
											当前
										</span>
									)}
								</div>
							))}
						</div>
					</DropdownPortal>
				</div>
			)}

			{/* Spacer */}
			<div className="flex-1" />

			{/* 后端选择器 */}
			<div className={sessionStatus === 'running' ? 'opacity-50 pointer-events-none' : ''}>
				<CodingBackendSelector />
			</div>

			{/* 后端版本标识 */}
			{version && (
				<span className="text-[10px] text-zinc-400 tabular-nums hidden sm:inline" title={`${isCodex ? 'Codex' : 'Claude Code'} ${version}`}>
					v{version}
				</span>
			)}

			{/* Token 用量 */}
			{(usage.inputTokens > 0 || usage.outputTokens > 0) && (
				<span className="text-[10px] text-zinc-400 tabular-nums hidden sm:inline">
					{formatTokenCount(usage.inputTokens + usage.outputTokens)} tokens
				</span>
			)}

			{/* 分隔线 */}
			<div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />

			{/* 新建线程按钮 */}
			{onNewThread && (
				<button
					onClick={onNewThread}
					className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-[#D96C46] hover:bg-[#D96C46]/10 transition-colors"
					title="新建线程"
				>
					<Plus className="w-3.5 h-3.5" />
					<span className="hidden sm:inline">新线程</span>
				</button>
			)}

			{/* Session 状态指示器 */}
			{sessionStatus !== 'idle' && (
				<div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${statusConfig.color}`}>
					<StatusIcon
						className={`w-3 h-3 ${sessionStatus === 'running' ? 'animate-spin' : ''}`}
					/>
					<span className="hidden sm:inline">{statusConfig.label}</span>
				</div>
			)}

			{/* Code / Plan / Ask 模式切换 */}
			<CodingModeSelector />

			{/* 分隔线 */}
			<div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700" />

			{/* 面板切换按钮 */}
			<button
				onClick={() => codingWorkspaceStore.toggleLeftPanel()}
				className={`p-1.5 rounded-lg transition-colors ${
					leftPanelVisible
						? 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
						: 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
				}`}
				title="切换文件面板 (⌘B)"
			>
				<PanelLeft className="w-4 h-4" />
			</button>
			<button
				onClick={() => codingWorkspaceStore.toggleTerminal()}
				className={`p-1.5 rounded-lg transition-colors ${
					terminalVisible
						? 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
						: 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
				}`}
				title="切换终端 (⌃`)"
			>
				<Terminal className="w-4 h-4" />
			</button>
			<button
				onClick={() => codingWorkspaceStore.toggleRightPanel()}
				className={`p-1.5 rounded-lg transition-colors ${
					rightPanelVisible
						? 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
						: 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
				}`}
				title="切换变更面板 (⌘J)"
			>
				<PanelRight className="w-4 h-4" />
			</button>

			{/* 设置 */}
			{onOpenSettings && (
					<button
						onClick={() => onOpenSettings('aiCoding')}
						className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
						title="设置"
					>
					<Settings className="w-4 h-4" />
				</button>
			)}
		</div>
	);
}

function formatTokenCount(count: number): string {
	if (count < 1000) return String(count);
	if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
	return `${(count / 1_000_000).toFixed(2)}M`;
}
