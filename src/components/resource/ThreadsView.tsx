/**
 * ThreadsView - 线程历史面板
 *
 * 设计：
 * - 数据来自 chatStore（实际对话记录），按文件夹（cwd）分组展示
 * - cwd 来源优先级：chatSession.cwd → 关联 AgentSession.cwd → "通用对话"
 * - 支持通过 "+" 新建线程（选目录后同时创建 AgentSession + ChatSession）
 */
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
	Plus,
	Search,
	ChevronDown,
	ChevronRight,
	MessageSquare,
	Folder,
	FolderOpen,
	X,
	MoreHorizontal,
	Pin,
	PinOff,
	Archive,
	ArchiveRestore,
	Trash2,
	Edit3,
	ExternalLink,
} from "lucide-react";
import { useChatStore, chatStore } from "../../lib/chat/store";
import type { ChatSession } from "../../lib/chat/types";
import {
	createThreadSessionForPath,
	DEFAULT_THREAD_MODEL,
} from "../../lib/chat/threadSessions";
import { sessionStore } from "../../lib/agent/sessionManager";
import { managedModeStore } from "../../lib/managedModeStore";
import {
	pickSystemDirectory,
	getActiveModel,
	revealFileSafe,
} from "../../lib/api";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { toast } from "../ui/Toast";
import { listAgentSessions } from "../../lib/agent/api";
import { buildBackendThreadMetadataMap } from "./threads/backendThreadMetadata";
import { useThreadProjectPins } from "./threads/threadProjectPins";
import {
	formatRelativeTime,
	getSessionPreview,
	groupThreadsByFolder,
	type BackendThreadMetadata,
	type ThreadFolderGroup,
} from "./threads/threadGrouping";
import {
	DEFAULT_VISIBLE_THREAD_COUNT,
	getVisibleSessionsForGroup,
	useThreadGroupVisibility,
} from "./threads/threadGroupVisibility";

interface ThreadsViewProps {
	onNavigateWorkbench?: () => void;
}

/** 解析 session 的有效 cwd（桥接 agentSessionId → AgentSession.cwd） */
function resolveCwd(
	session: ChatSession,
	backendMetadataBySessionId?: Map<string, BackendThreadMetadata>,
): string | undefined {
	// 优先使用 chatSession 自身的 cwd（useAgentHandler 写入的新数据）
	if (session.cwd) return session.cwd;

	if (session.agentSessionId) {
		const backendMetadata = backendMetadataBySessionId?.get(
			session.agentSessionId,
		);
		if (backendMetadata?.cwd) return backendMetadata.cwd;
	}

	// 降级：通过 agentSessionId 反查 sessionStore
	if (session.agentSessionId) {
		const agentSessions = sessionStore.getAllSessions();
		const agentSession = agentSessions.find(
			(s) => s.id === session.agentSessionId,
		);
		if (agentSession?.cwd) return agentSession.cwd;
	}

	return undefined;
}

export function ThreadsView({ onNavigateWorkbench }: ThreadsViewProps) {
	const {
		sessions,
		activeSessionId,
		setActiveSession,
		deleteSessionWithUndo,
		undoDeleteSession,
		updateSessionTitle,
		setSessionPinned,
		setSessionArchived,
	} = useChatStore();
	const { pinnedProjectKeys, toggleProjectPin } = useThreadProjectPins();
	const { expandedGroupKeys, toggleExpandedGroup } = useThreadGroupVisibility();

	// 订阅 sessionStore 以在 AgentSession 变化时刷新（桥接旧数据 cwd）
	const [agentSessionTick, setAgentSessionTick] = useState(0);
	useEffect(() => {
		return sessionStore.subscribe(() => setAgentSessionTick((t) => t + 1));
	}, []);

	const [searchQuery, setSearchQuery] = useState("");
	const [searchVisible, setSearchVisible] = useState(false);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);
	const [backendMetadataBySessionId, setBackendMetadataBySessionId] = useState<
		Map<string, BackendThreadMetadata>
	>(() => new Map());
	const hasInitializedRef = useRef(false);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		target:
			| { type: "session"; session: ChatSession }
			| { type: "group"; group: ThreadFolderGroup };
	} | null>(null);

	useEffect(() => {
		let cancelled = false;
		listAgentSessions()
			.then((agentSessions) => {
				if (cancelled) return;
				setBackendMetadataBySessionId(
					buildBackendThreadMetadataMap(agentSessions),
				);
			})
			.catch((error) => {
				console.warn("[ThreadsView] 加载后端会话元数据失败:", error);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// 隐藏完全没有归属的临时空白会话；已有 cwd/来源/agent 绑定的空线程要立即显示。
	const visibleSessions = useMemo(() => {
		let filtered = sessions.filter((session) => {
			if (session.messages.length > 0) return true;
			return Boolean(
				session.cwd || session.agentSessionId || session.threadSource?.type,
			);
		}) as ChatSession[];

		if (searchQuery.trim()) {
			const q = searchQuery.trim().toLowerCase();
			filtered = filtered.filter(
				(s) =>
					s.title.toLowerCase().includes(q) ||
					s.messages.some((m) => m.content.toLowerCase().includes(q)),
			);
		}

		return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
	}, [sessions, searchQuery]);

	const folderGroups = useMemo(
		() =>
			groupThreadsByFolder(visibleSessions, {
				runtimeSessions: sessionStore.getAllSessions(),
				backendMetadataBySessionId,
				pinnedProjectKeys,
			}),
		[
			visibleSessions,
			backendMetadataBySessionId,
			agentSessionTick,
			pinnedProjectKeys,
		],
	);

	useEffect(() => {
		for (const session of visibleSessions) {
			if (!session.agentSessionId) continue;
			const metadata = backendMetadataBySessionId.get(session.agentSessionId);
			if (!session.cwd && metadata?.cwd) {
				chatStore.setSessionCwd(session.id, metadata.cwd);
			}
			if (
				session.threadSource?.type !== "remote" &&
				metadata?.source === "remote"
			) {
				chatStore.setSessionThreadSource(session.id, {
					type: "remote",
					remoteSessionId: metadata.remoteSessionId,
					channelId: metadata.channelId,
					peerName: metadata.peerName,
					peerId: metadata.peerId,
				});
			}
		}
	}, [visibleSessions, backendMetadataBySessionId]);

	// 首次有数据时自动展开所有组
	useEffect(() => {
		if (!hasInitializedRef.current && folderGroups.length > 0) {
			hasInitializedRef.current = true;
			// 所有组默认展开（不添加到 collapsedGroups）
		}
	}, [folderGroups]);

	const toggleGroup = (key: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const createThreadForPath = useCallback(
		async (path: string) => {
			const model = (await getActiveModel()) || DEFAULT_THREAD_MODEL;
			createThreadSessionForPath(path, model);
			managedModeStore.enableManagedMode();
			onNavigateWorkbench?.();
		},
		[onNavigateWorkbench],
	);

	/** 点击"+"新建线程：选目录 → 创建 AgentSession + ChatSession */
	const handleCreateThread = async () => {
		try {
			const { path } = await pickSystemDirectory("选择新线程工作目录");
			if (!path) return;
			await createThreadForPath(path);
		} catch (error) {
			console.error("创建线程失败:", error);
			toast.error("创建线程失败");
		}
	};

	const handleSelectSession = useCallback(
		(session: ChatSession) => {
			setActiveSession(session.id);

			// 如果对话有关联 cwd，同步到 sessionStore 的当前会话
			const cwd = resolveCwd(session, backendMetadataBySessionId);
			if (cwd) {
				// 优先找已有的 agentSession 关联
				if (session.agentSessionId) {
					const agentSessions = sessionStore.getAllSessions();
					const matched = agentSessions.find(
						(s) => s.id === session.agentSessionId,
					);
					if (matched) {
						sessionStore.setCurrentSession(matched.id);
					}
				} else {
					// 找同 cwd 的最近 agentSession
					const agentSessions = sessionStore.getAllSessions();
					const matched = agentSessions
						.filter((s) => s.cwd === cwd)
						.sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0];
					if (matched) {
						sessionStore.setCurrentSession(matched.id);
					}
				}
				managedModeStore.enableManagedMode();
			}

			onNavigateWorkbench?.();
		},
		[setActiveSession, onNavigateWorkbench, backendMetadataBySessionId],
	);

	const handleSessionContextMenu = useCallback(
		(e: React.MouseEvent, session: ChatSession) => {
			e.preventDefault();
			e.stopPropagation();
			setContextMenu({
				x: e.clientX,
				y: e.clientY,
				target: { type: "session", session },
			});
		},
		[],
	);

	const handleCreateThreadInGroup = useCallback(
		(group: ThreadFolderGroup) => {
			if (group.source !== "local" || !group.folderPath) return;
			void createThreadForPath(group.folderPath);
		},
		[createThreadForPath],
	);

	const contextMenuItems: ContextMenuItem[] = useMemo(() => {
		if (!contextMenu) return [];
		if (contextMenu.target.type === "group") {
			const group = contextMenu.target.group;
			const canCreateInGroup =
				group.source === "local" && Boolean(group.folderPath);
			const canReveal = group.source === "local" && Boolean(group.folderPath);
			return [
				{
					label: "新建对话",
					icon: <Plus className="w-4 h-4" />,
					disabled: !canCreateInGroup,
					onClick: () => {
						if (!group.folderPath) return;
						void createThreadForPath(group.folderPath);
					},
				},
				{
					label: group.isPinned ? "取消固定项目" : "固定项目",
					icon: group.isPinned ? (
						<PinOff className="w-4 h-4" />
					) : (
						<Pin className="w-4 h-4" />
					),
					disabled: group.source !== "local",
					onClick: () => {
						toggleProjectPin(group.key);
						toast.success(group.isPinned ? "已取消固定项目" : "已固定项目");
					},
				},
				{
					label: "在访达中打开",
					icon: <ExternalLink className="w-4 h-4" />,
					disabled: !canReveal,
					onClick: async () => {
						if (!group.folderPath) return;
						try {
							await revealFileSafe(group.folderPath);
						} catch (error) {
							console.error("打开项目目录失败:", error);
							toast.error("打开项目目录失败");
						}
					},
				},
			];
		}

		const session = contextMenu.target.session;
		return [
			{
				label: "打开对话",
				icon: <MessageSquare className="w-4 h-4" />,
				onClick: () => handleSelectSession(session),
			},
			{
				label: "重命名对话",
				icon: <Edit3 className="w-4 h-4" />,
				onClick: () => {
					const newTitle = window.prompt(
						"请输入新的线程标题",
						session.title || "Untitled Chat",
					);
					if (newTitle?.trim()) {
						updateSessionTitle(session.id, newTitle.trim());
						toast.success("已重命名");
					}
				},
			},
			{
				label: session.isPinned ? "取消置顶" : "置顶对话",
				icon: session.isPinned ? (
					<PinOff className="w-4 h-4" />
				) : (
					<Pin className="w-4 h-4" />
				),
				onClick: () => {
					setSessionPinned(session.id, !session.isPinned);
					toast.success(session.isPinned ? "已取消置顶" : "已置顶");
				},
			},
			{
				label: session.isArchived ? "取消归档" : "归档对话",
				icon: session.isArchived ? (
					<ArchiveRestore className="w-4 h-4" />
				) : (
					<Archive className="w-4 h-4" />
				),
				onClick: () => {
					const nextArchived = !session.isArchived;
					setSessionArchived(session.id, nextArchived);
					toast.show(nextArchived ? "已归档对话" : "已取消归档", {
						type: "success",
						duration: 5000,
						actionLabel: "撤销",
						onAction: () => {
							setSessionArchived(session.id, !nextArchived);
						},
					});
				},
			},
			{ separator: true, label: "", onClick: () => {} },
			{
				label: "删除对话",
				icon: <Trash2 className="w-4 h-4" />,
				danger: true,
				onClick: () => {
					const result = deleteSessionWithUndo(session.id);
					if (result) {
						toast.show("已删除线程", {
							type: "success",
							duration: 5000,
							actionLabel: "撤销",
							onAction: () => {
								if (undoDeleteSession(session.id)) {
									toast.success("已恢复线程");
								}
							},
						});
					}
				},
			},
		];
	}, [
		contextMenu,
		handleSelectSession,
		updateSessionTitle,
		setSessionPinned,
		setSessionArchived,
		deleteSessionWithUndo,
		undoDeleteSession,
		createThreadForPath,
		toggleProjectPin,
	]);

	return (
		<div className="flex flex-col h-full bg-transparent">
			{/* Header */}
			<div className="px-6 py-5 flex items-center justify-between shrink-0 mb-2 border-b border-border dark:border-white/[0.05]">
				<h2 className="font-semibold text-[13px] text-text-muted uppercase tracking-widest">
					项目
				</h2>
				<div className="flex items-center gap-1">
					<button
						onClick={() => setSearchVisible((v) => !v)}
						className={`p-1.5 rounded-lg transition-colors ${
							searchVisible
								? "text-[#D96C46] bg-[#D96C46]/10"
								: "text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-black/5 dark:hover:bg-surface/10"
						}`}
						title="搜索"
					>
						<Search className="w-4 h-4" />
					</button>
					<button
						onClick={handleCreateThread}
						className="p-1.5 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-black/5 dark:hover:bg-surface/10 rounded-lg transition-colors"
						title="新建线程（选择项目目录）"
					>
						<Plus className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* Search Bar */}
			{searchVisible && (
				<div className="px-4 pb-3">
					<div className="relative">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-light" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="搜索对话…"
							className="w-full pl-8 pr-8 py-1.5 text-[12px] rounded-lg border border-border dark:border-white/10 bg-surface-inset dark:bg-white/5 text-text-primary placeholder:text-text-light focus:outline-none focus:ring-1 focus:ring-[#D96C46]/30 transition-all"
							autoFocus
						/>
						{searchQuery && (
							<button
								onClick={() => setSearchQuery("")}
								className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-text-light hover:text-text-secondary rounded transition-colors"
							>
								<X className="w-3 h-3" />
							</button>
						)}
					</div>
				</div>
			)}

			{/* Folder Groups */}
			<div className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-6">
				{folderGroups.map((group) => {
					const isCollapsed = collapsedGroups.has(group.key);
					const isOverflowExpanded = expandedGroupKeys.has(group.key);
					const visibleGroupSessions = getVisibleSessionsForGroup({
						sessions: group.sessions,
						activeSessionId: activeSessionId || undefined,
						expanded: isOverflowExpanded,
						searching: Boolean(searchQuery.trim()),
					});
					const hiddenSessionCount =
						group.sessions.length - visibleGroupSessions.length;
					const canToggleOverflow =
						!searchQuery.trim() &&
						group.sessions.length > DEFAULT_VISIBLE_THREAD_COUNT;
					return (
						<div key={group.key} className="mb-4">
							{/* Folder Header */}
							<div
								onContextMenu={(e) => {
									e.preventDefault();
									setContextMenu({
										x: e.clientX,
										y: e.clientY,
										target: { type: "group", group },
									});
								}}
								className="flex items-center gap-1 w-full px-2 py-1.5 mb-1 group hover:bg-warm-200/50 dark:hover:bg-white/5 rounded-md transition-colors"
							>
								<button
									type="button"
									onClick={() => toggleGroup(group.key)}
									className="flex min-w-0 flex-1 items-center gap-2 text-left"
									aria-expanded={!isCollapsed}
									aria-label={`${group.folderName} 分组`}
								>
									<div className="text-text-light group-hover:text-text-secondary dark:group-hover:text-text-light transition-colors">
										{isCollapsed ? (
											<ChevronRight className="w-3.5 h-3.5" />
										) : (
											<ChevronDown className="w-3.5 h-3.5" />
										)}
									</div>
									<div className="text-[#D96C46]/80 flex-shrink-0">
										{group.source === "archive" ? (
											<Archive className="w-4 h-4" />
										) : group.source === "remote" ? (
											<MessageSquare className="w-4 h-4" />
										) : isCollapsed ? (
											<Folder className="w-4 h-4" />
										) : (
											<FolderOpen className="w-4 h-4" />
										)}
									</div>
									<span
										className="text-[13px] font-medium text-text-primary truncate flex-1"
										title={group.folderPath || undefined}
									>
										{group.folderName}
									</span>
								</button>
								{group.isPinned && (
									<Pin className="w-3.5 h-3.5 text-[#D96C46]/70" />
								)}
								{group.source === "local" && group.folderPath ? (
									<button
										type="button"
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											handleCreateThreadInGroup(group);
										}}
										className="rounded-md p-1 text-text-light hover:text-[#D96C46] hover:bg-[#D96C46]/10 dark:hover:bg-[#D96C46]/15 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D96C46]/25"
										aria-label={`在 ${group.folderName} 新建对话`}
										title="新建对话"
									>
										<Plus className="w-3.5 h-3.5" />
									</button>
								) : null}
								<button
									type="button"
									onClick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										setContextMenu({
											x: e.clientX,
											y: e.clientY,
											target: { type: "group", group },
										});
									}}
									className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-text-light hover:text-text-secondary hover:bg-black/5 dark:hover:bg-white/10 transition-all"
									aria-label={`${group.folderName} 更多操作`}
									title="更多操作"
								>
									<MoreHorizontal className="w-3.5 h-3.5" />
								</button>
							</div>

							{/* Sessions List */}
							{!isCollapsed && (
								<div className="pl-6 pr-2 space-y-0.5">
									{visibleGroupSessions.map((session) => {
										const isActive = session.id === activeSessionId;
										const preview = getSessionPreview(session);
										return (
											<div
												key={session.id}
												onContextMenu={(e) =>
													handleSessionContextMenu(e, session)
												}
												className={`w-full flex items-center justify-between pl-4 pr-1.5 py-1 rounded-lg transition-all duration-200 text-left group ${
													isActive
														? "bg-transparent relative"
														: "hover:bg-warm-200/50 dark:hover:bg-white/5"
												}`}
											>
												{isActive && (
													<div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-sm bg-[#D96C46]" />
												)}
												<button
													type="button"
													onClick={() => handleSelectSession(session)}
													className="flex flex-col gap-0.5 min-w-0 flex-1 pr-2 py-0.5 text-left"
												>
													<span
														className={`text-[12px] truncate ${
															isActive
																? "text-[#D96C46] dark:text-[#E07B52] font-semibold"
																: "text-text-secondary group-hover:text-text-primary dark:group-hover:text-text-light"
														}`}
													>
														{session.title || "Untitled Chat"}
													</span>
													{preview && (
														<span className="text-[10px] text-text-light/60 truncate">
															{preview}
														</span>
													)}
												</button>
												<div className="flex items-center gap-1 shrink-0">
													{session.isPinned && (
														<Pin className="w-3 h-3 text-[#D96C46]/70" />
													)}
													<span
														className={`text-[10px] whitespace-nowrap ${
															isActive
																? "text-[#D96C46]/70 dark:text-[#E07B52]/70"
																: "text-text-light opacity-0 group-hover:opacity-100 transition-opacity"
														}`}
													>
														{formatRelativeTime(session.updatedAt)}
													</span>
													<button
														type="button"
														onClick={(e) =>
															handleSessionContextMenu(e, session)
														}
														className="p-1 rounded-md text-text-light opacity-0 group-hover:opacity-100 hover:text-text-secondary hover:bg-black/5 dark:hover:bg-white/10 transition-all focus:opacity-100"
														aria-label={`${session.title || "对话"} 更多操作`}
														title="更多操作"
													>
														<MoreHorizontal className="w-3.5 h-3.5" />
													</button>
												</div>
											</div>
										);
									})}
									{canToggleOverflow ? (
										<button
											type="button"
											onClick={() => toggleExpandedGroup(group.key)}
											className="ml-4 mt-1 inline-flex items-center rounded-md px-2 py-1 text-[11px] font-medium text-text-light hover:text-[#D96C46] hover:bg-[#D96C46]/8 dark:hover:bg-[#D96C46]/12 transition-colors"
										>
											{isOverflowExpanded
												? `收起，仅显示最近 ${DEFAULT_VISIBLE_THREAD_COUNT} 条`
												: `展开其余 ${hiddenSessionCount} 条`}
										</button>
									) : null}
								</div>
							)}
						</div>
					);
				})}

				{/* Empty State */}
				{folderGroups.length === 0 && (
					<div className="text-center py-10 mt-10">
						<div className="w-12 h-12 bg-warm-50/50 dark:bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-3">
							<MessageSquare className="w-5 h-5 text-text-light" />
						</div>
						<p className="text-sm text-text-muted font-medium">
							{searchQuery ? "没有找到匹配的对话" : "暂无对话记录"}
						</p>
						{!searchQuery && (
							<p className="text-xs text-text-light mt-1.5">
								在右侧输入框开始对话，或点击 + 创建新线程
							</p>
						)}
					</div>
				)}
			</div>

			{/* 右键菜单 */}
			{contextMenu && contextMenuItems.length > 0 && (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={contextMenuItems}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</div>
	);
}
