/**
 * 编程工作区 - 根布局组件
 * Toolbar + 三栏布局 (react-resizable-panels) + 终端面板
 * 通过 SessionManager 与 Claude Code / Codex CLI 子进程通信
 *
 * 线程化架构：
 * - projectPath 可选，优先从 codingThreadStore 获取
 * - 支持通过 threadId 直接导航到指定线程
 * - 线程切换时自动保存/恢复 session 快照
 */
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup } from 'react-resizable-panels';
import ResizeHandle from '../layout/ResizeHandle';
import {
	codingWorkspaceStore,
	useCodingWorkspaceSelector,
	type FileTreeNode,
} from '../../lib/stores/codingWorkspaceStore';
import { codingSessionStore, useCodingSessionSelector } from '../../lib/stores/codingSessionStore';
import { codingAgentStore } from '../../lib/stores/codingAgentStore';
import { codingThreadStore, useCodingThreadSelector } from '../../lib/stores/codingThreadStore';
import { diffStore } from '../../lib/stores/diffStore';
import {
	getOrCreateSessionManager,
	disposeSessionManager,
} from '../../lib/coding/sessionManagerFactory';
import { createThreadFromWorkspaceProfile, syncThreadWorkspaceProfile } from '../../lib/coding/threadFactory';
import { codingRuntimeStore } from '../../lib/stores/codingRuntimeStore';
import { startFileWatcher, stopFileWatcher } from '../../lib/coding/fileWatcherBridge';
import { CodingToolbar } from './CodingToolbar';
import { CodingFileExplorer } from './CodingFileExplorer';
import { CodingChatThread } from './CodingChatThread';
import { CodingChatInput } from './CodingChatInput';
import { CodingChangesPanel } from './CodingChangesPanel';
import { CodingThreadList } from './CodingThreadList';
import { CodingHome } from './CodingHome';
import { CenterPanelTabs } from './CenterPanelTabs';
import { CodeViewerPanel } from './codeViewer/CodeViewerPanel';
import { QuickFileSearchModal } from './QuickFileSearchModal';
import type { SettingsTabId } from '../Settings/types';

// 终端面板懒加载（复用已有组件）
const TerminalPanel = lazy(
	() => import('../Terminal/TerminalPanel'),
);

interface CodingWorkspaceProps {
	/** 项目路径（可选，线程化后由 threadStore 管理） */
	projectPath?: string;
	/** 直接导航到指定线程 */
	threadId?: string;
	onBack: () => void;
	onOpenSettings?: (tab?: SettingsTabId) => void;
}

/** 左侧面板 Tab */
type LeftPanelTab = 'files' | 'threads';

function PanelLoadingFallback() {
	return (
		<div className="h-full w-full flex items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
			正在加载...
		</div>
	);
}

export default function CodingWorkspace({
	projectPath,
	threadId,
	onBack,
	onOpenSettings,
}: CodingWorkspaceProps) {
	const leftPanelVisible = useCodingWorkspaceSelector(
		(s) => s.layout.leftPanelVisible,
	);
	const rightPanelVisible = useCodingWorkspaceSelector(
		(s) => s.layout.rightPanelVisible,
	);
	const terminalVisible = useCodingWorkspaceSelector(
		(s) => s.layout.terminalVisible,
	);
	const sessionStatus = useCodingSessionSelector((s) => s.status);
	const sdkSessionId = useCodingSessionSelector((s) => s.sdkSessionId);
	const activeThreadId = useCodingThreadSelector((s) => s.activeThreadId);
	const centerPanelMode = useCodingWorkspaceSelector((s) => s.layout.centerPanelMode);
	const centerPanelTabs = useCodingWorkspaceSelector((s) => s.centerPanelTabs);
	const activeCenterTabId = useCodingWorkspaceSelector((s) => s.activeCenterTabId);
	const [leftTab, setLeftTab] = useState<LeftPanelTab>('files');
	const [quickSearchOpen, setQuickSearchOpen] = useState(false);

	// 面板 DOM 引用（用于 Cmd+1/2/3 聚焦）
	const leftPanelRef = useRef<HTMLDivElement>(null);
	const centerPanelRef = useRef<HTMLDivElement>(null);
	const rightPanelRef = useRef<HTMLDivElement>(null);

	// 当前活跃线程
	const activeThread = codingThreadStore.getActiveThread();
	// 中间面板当前激活的文件 Tab
	const activeFileTab = centerPanelTabs.find((t) => t.id === activeCenterTabId) ?? null;
	// 实际使用的项目路径：线程优先 > prop 传入
	const effectiveProjectPath = activeThread?.projectPath || projectPath || '';

	// === 初始化：处理 threadId / projectPath ===
	useEffect(() => {
		const initialize = async () => {
			if (threadId) {
				// 通过 threadId 直接导航
				const thread = codingThreadStore.getThread(threadId);
				if (thread) {
					codingThreadStore.switchThread(threadId);
					codingSessionStore.switchToThread(activeThreadId, threadId);
					codingWorkspaceStore.openProject(thread.projectPath);
					void codingRuntimeStore.loadProject(thread.projectPath);
					void syncThreadWorkspaceProfile(threadId, thread.projectPath);
					void loadFileTree(thread.projectPath);
					void loadGitStatus(thread.projectPath);
					void loadGitBranches(thread.projectPath);
					// 启动文件系统监听
					void startFileWatcher(thread.projectPath);
					return;
				}
			}

			if (projectPath) {
				// 兼容旧的 projectPath 模式：自动创建线程
				const existingThread = codingThreadStore.getState().threads.find(
					(t) => t.projectPath === projectPath,
				);
				if (existingThread) {
					codingThreadStore.switchThread(existingThread.id);
					codingSessionStore.switchToThread(activeThreadId, existingThread.id);
					void syncThreadWorkspaceProfile(existingThread.id, projectPath);
				} else {
					const newThread = await createThreadFromWorkspaceProfile(projectPath);
					codingSessionStore.switchToThread(activeThreadId, newThread.id);
				}
				codingWorkspaceStore.openProject(projectPath);
				void codingRuntimeStore.loadProject(projectPath);
				void loadFileTree(projectPath);
				void loadGitStatus(projectPath);
				void loadGitBranches(projectPath);
				// 启动文件系统监听
				void startFileWatcher(projectPath);
			}
		};

		void initialize();

		// 组件卸载时保存线程快照并停止文件监听
		return () => {
			const currentId = codingThreadStore.getState().activeThreadId;
			if (currentId) {
				codingSessionStore.saveSnapshot(currentId);
			}
			void stopFileWatcher();
		};
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// === 线程切换处理 ===
	const handleSwitchThread = useCallback(
		(newThreadId: string) => {
			const thread = codingThreadStore.getThread(newThreadId);
			if (!thread) return;

			// 保存当前 → 加载目标
			codingSessionStore.switchToThread(activeThreadId, newThreadId);
			codingWorkspaceStore.openProject(thread.projectPath);
			void codingRuntimeStore.loadProject(thread.projectPath);
			void syncThreadWorkspaceProfile(newThreadId, thread.projectPath);
			diffStore.clearDiffs();

			// 同步编码模式和后端
			codingAgentStore.setCodingMode(thread.codingMode);
			codingAgentStore.setCodingBackend(thread.backend);

			void loadFileTree(thread.projectPath);
			void loadGitStatus(thread.projectPath);
			void loadGitBranches(thread.projectPath);
			// 切换文件监听到新项目
			void startFileWatcher(thread.projectPath);
		},
		[activeThreadId],
	);

	// === 新建线程 ===
	const handleNewThread = useCallback(async () => {
		try {
			const result = await window.electronAPI.invoke('coding_select_directory', {});
			if (result?.path) {
				const newThread = await createThreadFromWorkspaceProfile(result.path);
				handleSwitchThread(newThread.id);
			}
		} catch (error) {
			console.error('[CodingWorkspace] 选择目录失败:', error);
		}
	}, [handleSwitchThread]);

	// 快捷键
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const modKey = e.metaKey || e.ctrlKey;

			// Ctrl+` 切换终端
			if (e.ctrlKey && e.key === '`') {
				e.preventDefault();
				codingWorkspaceStore.toggleTerminal();
			}
			// Cmd+B 切换左面板
			if (modKey && e.key === 'b') {
				e.preventDefault();
				codingWorkspaceStore.toggleLeftPanel();
			}
			// Cmd+J 切换右面板
			if (modKey && e.key === 'j') {
				e.preventDefault();
				codingWorkspaceStore.toggleRightPanel();
			}
			// Cmd+P / Ctrl+P 快速文件搜索
			if (modKey && e.key === 'p') {
				e.preventDefault();
				setQuickSearchOpen((prev) => !prev);
			}
			// Cmd+1 聚焦左侧面板
			if (modKey && e.key === '1') {
				e.preventDefault();
				if (!leftPanelVisible) codingWorkspaceStore.toggleLeftPanel();
				leftPanelRef.current?.focus();
			}
			// Cmd+2 聚焦中间面板
			if (modKey && e.key === '2') {
				e.preventDefault();
				centerPanelRef.current?.focus();
			}
			// Cmd+3 聚焦右侧面板
			if (modKey && e.key === '3') {
				e.preventDefault();
				if (!rightPanelVisible) codingWorkspaceStore.toggleRightPanel();
				rightPanelRef.current?.focus();
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [leftPanelVisible, rightPanelVisible]);

	useEffect(() => {
		if (!activeThreadId) return;
		const updates =
			activeThread?.backend === 'codex'
				? { runtimeSessionId: sdkSessionId ?? undefined }
				: { sdkSessionId: sdkSessionId ?? undefined };
		codingThreadStore.updateThread(activeThreadId, updates);
	}, [activeThreadId, activeThread?.backend, sdkSessionId]);

	useEffect(() => {
		if (!activeThreadId) return;
		codingThreadStore.updateThread(activeThreadId, {
			status: sessionStatus,
			lastRunStatus: sessionStatus,
			lastRunAt: sessionStatus === 'idle' ? undefined : Date.now(),
		});
	}, [activeThreadId, sessionStatus]);

	// === 核心：发送消息 ===
	const handleSendMessage = useCallback(
		async (content: string) => {
			// 1. 记录用户消息
			codingSessionStore.addUserMessage(content);

			// 更新线程时间戳
			if (activeThreadId) {
				codingThreadStore.updateThread(activeThreadId, {
					lastRunAt: Date.now(),
					lastRunStatus: 'running',
				});
			}

			// 2. 获取/创建 session manager（按线程索引）
			const backend = activeThread?.backend || codingAgentStore.getState().codingBackend;
			const manager = getOrCreateSessionManager(activeThreadId || undefined, backend);
			const workspaceMemory = codingRuntimeStore.getState().workspaceMemory;

			try {
				// 3. 通过 manager 发送到 CLI 子进程
				await manager.send(content, {
					cwd: effectiveProjectPath,
					mode: activeThread?.codingMode || codingAgentStore.getState().codingMode,
					contextFiles: codingWorkspaceStore.getState().contextFiles,
					resumeSessionId: codingSessionStore.getState().sdkSessionId ?? undefined,
					model: activeThread?.model,
					approvalMode: activeThread?.approvalMode,
					workspaceContext: workspaceMemory?.mergedInstructions,
				});
				if (activeThreadId) {
					codingThreadStore.updateThread(activeThreadId, {
						sdkSessionId: manager.getSessionId() ?? undefined,
						lastRunAt: Date.now(),
						lastRunStatus: 'running',
					});
				}
			} catch (err) {
				codingSessionStore.setStatus('error');
				if (activeThreadId) {
					codingThreadStore.updateThread(activeThreadId, {
						lastRunAt: Date.now(),
						lastRunStatus: 'error',
						lastRunSummary: err instanceof Error ? err.message : String(err),
					});
				}
			}

			// 4. 刷新文件树和 Git 状态
			void loadFileTree(effectiveProjectPath);
			void loadGitStatus(effectiveProjectPath);
		},
		[effectiveProjectPath, activeThreadId, activeThread],
	);

	// === 中止运行 ===
	const handleAbort = useCallback(async () => {
		const backend = activeThread?.backend || codingAgentStore.getState().codingBackend;
		const manager = getOrCreateSessionManager(activeThreadId || undefined, backend);
		try {
			await manager.abort();
		} catch (err) {
			console.error('[CodingWorkspace] 中止失败:', err);
		}
	}, [activeThreadId, activeThread]);

	// === 权限审批 ===
	const handleResolvePermission = useCallback(
		async (requestId: string, allow: boolean) => {
			const backend = activeThread?.backend || codingAgentStore.getState().codingBackend;
			const manager = getOrCreateSessionManager(activeThreadId || undefined, backend);
			try {
				await manager.resolvePermission(requestId, allow);
			} catch (err) {
				console.error('[CodingWorkspace] 权限审批失败:', err);
			}
		},
		[activeThreadId, activeThread],
	);

	const handleBack = useCallback(() => {
		// 保存当前线程快照
		if (activeThreadId) {
			codingSessionStore.saveSnapshot(activeThreadId);
		}
		void stopFileWatcher();
		codingWorkspaceStore.closeProject();
		codingRuntimeStore.clear();
		codingSessionStore.clear();
		diffStore.clearDiffs();
		disposeSessionManager(activeThreadId || undefined);
		codingThreadStore.deactivateThread();
		onBack();
	}, [onBack, activeThreadId]);

	const isRunning = sessionStatus === 'running' || sessionStatus === 'awaiting_permission';
	const showHome = !activeThread && !projectPath;

	return (
		<div className="h-screen w-screen bg-[#F9F9F8] dark:bg-[#0a0a0a] text-zinc-800 dark:text-zinc-200 font-sans overflow-hidden flex flex-col selection:bg-primary/20 animate-in fade-in zoom-in-95 duration-300">
			{/* 顶部工具栏 */}
			<CodingToolbar
				onBack={handleBack}
				onOpenSettings={onOpenSettings}
				onNewThread={handleNewThread}
			/>

			{/* 快速文件搜索弹窗（Cmd+P 触发） */}
			{quickSearchOpen && (
				<QuickFileSearchModal
					projectPath={effectiveProjectPath}
					onClose={() => setQuickSearchOpen(false)}
				/>
			)}

			{/* 主内容区 */}
			<div className="flex-1 overflow-hidden p-1.5 pt-0">
				<PanelGroup direction="vertical" className="h-full">
					{/* 上部三栏 */}
					<Panel defaultSize={terminalVisible ? 65 : 100} minSize={30}>
						<PanelGroup
							direction="horizontal"
							className="h-full gap-1.5"
							autoSaveId="coding_workspace_horizontal"
						>
							{/* 左侧：文件浏览器 / 线程列表 */}
							{leftPanelVisible && (
								<>
									<Panel
										defaultSize={18}
										minSize={12}
										maxSize={35}
										className="overflow-hidden"
									>
										<div ref={leftPanelRef} tabIndex={-1} className="h-full rounded-xl border border-black/[0.04] dark:border-white/[0.04] overflow-hidden flex flex-col outline-none focus-within:ring-1 focus-within:ring-[#D96C46]/30">
											{/* Tab 切换 */}
											<div className="flex items-center border-b border-zinc-100 dark:border-zinc-800">
												<button
													onClick={() => setLeftTab('files')}
													className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
														leftTab === 'files'
															? 'text-[#D96C46] border-b-2 border-[#D96C46]'
															: 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
													}`}
												>
													文件
												</button>
												<button
													onClick={() => setLeftTab('threads')}
													className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
														leftTab === 'threads'
															? 'text-[#D96C46] border-b-2 border-[#D96C46]'
															: 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
													}`}
												>
													线程
												</button>
											</div>

												{/* Tab 内容 */}
												{leftTab === 'files' ? (
													<CodingFileExplorer
														onRefreshTree={() => {
															if (effectiveProjectPath) {
																void loadFileTree(effectiveProjectPath);
															}
														}}
													/>
												) : (
													<CodingThreadList
													onSwitchThread={handleSwitchThread}
													onNewThread={handleNewThread}
												/>
											)}
										</div>
									</Panel>
									<ResizeHandle />
								</>
							)}

							{/* 中间：对话视图 / 代码查看器 */}
							<Panel
								defaultSize={rightPanelVisible ? 55 : 82}
								minSize={30}
								className="overflow-hidden"
							>
								<div ref={centerPanelRef} tabIndex={-1} className="h-full rounded-xl border border-black/[0.04] dark:border-white/[0.04] bg-white dark:bg-[#141414] overflow-hidden flex flex-col outline-none focus-within:ring-1 focus-within:ring-[#D96C46]/30">
									{showHome ? (
										<CodingHome onOpenThread={handleSwitchThread} />
									) : (
										<>
											{/* Tab 栏（有文件 tab 时显示） */}
											<CenterPanelTabs />

											{/* 内容区：对话 or 代码查看器 */}
											{centerPanelMode === 'codeViewer' && activeFileTab ? (
												<div className="flex-1 overflow-hidden">
													<CodeViewerPanel tab={activeFileTab} />
												</div>
											) : (
												<>
													<CodingChatThread onResolvePermission={handleResolvePermission} />
													<CodingChatInput
														onSend={handleSendMessage}
														onAbort={handleAbort}
														isRunning={isRunning}
														onOpenSettings={onOpenSettings}
													/>
												</>
											)}
										</>
									)}
								</div>
							</Panel>

							{/* 右侧：变更/Git 面板 */}
							{rightPanelVisible && (
								<>
									<ResizeHandle />
									<Panel
										defaultSize={22}
										minSize={15}
										maxSize={40}
										className="overflow-hidden"
									>
										<div ref={rightPanelRef} tabIndex={-1} className="h-full rounded-xl border border-black/[0.04] dark:border-white/[0.04] overflow-hidden outline-none focus-within:ring-1 focus-within:ring-[#D96C46]/30">
											<CodingChangesPanel />
										</div>
									</Panel>
								</>
							)}
						</PanelGroup>
					</Panel>

					{/* 底部：终端面板 */}
					{terminalVisible && (
						<>
							<ResizeHandle direction="vertical" />
							<Panel
								defaultSize={35}
								minSize={10}
								maxSize={80}
								className="overflow-hidden"
							>
								<div className="h-full rounded-xl border border-black/[0.04] dark:border-white/[0.04] overflow-hidden">
									<Suspense fallback={<PanelLoadingFallback />}>
										<TerminalPanel />
									</Suspense>
								</div>
							</Panel>
						</>
					)}
				</PanelGroup>
			</div>
		</div>
	);
}

// === 数据加载辅助函数 ===

async function loadFileTree(projectPath: string) {
	try {
		codingWorkspaceStore.setFileTreeLoading(true);
		const result = await window.electronAPI.invoke('coding_read_file_tree', {
			path: projectPath,
			maxDepth: 5,
		});
		codingWorkspaceStore.setFileTree(result.tree as FileTreeNode[], result.isGitRepo);
	} catch (error) {
		console.error('[CodingWorkspace] 加载文件树失败:', error);
		codingWorkspaceStore.setFileTreeLoading(false);
	}
}

async function loadGitStatus(projectPath: string) {
	try {
		const result = await window.electronAPI.invoke('coding_git_status', {
			path: projectPath,
		});
		if (result.isGitRepo && result.status) {
			codingWorkspaceStore.setGitStatus(result.status);
		}
	} catch (error) {
		console.error('[CodingWorkspace] 加载 Git 状态失败:', error);
	}
}

async function loadGitBranches(projectPath: string) {
	try {
		const result = await window.electronAPI.invoke('coding_git_branches', {
			path: projectPath,
		});
		if (result.isGitRepo) {
			codingWorkspaceStore.setGitBranches(result.branches);
		}
	} catch (error) {
		console.error('[CodingWorkspace] 加载 Git 分支失败:', error);
	}
}
