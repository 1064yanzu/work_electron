/**
 * ThreadsView - 「对话」面板（内部标识沿用 thread，UI 文案统一为"对话"）
 *
 * 设计：
 * - 数据来自 chatStore（实际对话记录），按工作目录（cwd）分组展示
 * - cwd 来源优先级：chatSession.cwd → 关联 AgentSession.cwd → "通用对话"
 * - 支持通过 "+" 新建对话（选目录后同时创建 AgentSession + ChatSession）
 *
 * 视觉（2026-08 重设计）：
 * - 分组头降权为区块标签（11px 字距 muted），组内条目左侧加导轨竖线表达从属
 * - 条目时间戳与「更多」按钮同位互换，标题拿回整行宽度
 * - 选中态：中性浅底 + 赤陶导轨，全面板只保留这一处品牌色强调
 *
 * 渲染治理（F5）：
 * - 订阅收窄：不再整店订阅 chatStore，改用 useThreadSessionsSnapshot 的
 *   签名缓存窄订阅——Agent 流式期间（仅活跃会话消息内容变化）列表零重渲染
 * - 分组/排序基于稳定引用 useMemo，输入不变不重算
 * - 大列表走 @tanstack/react-virtual 虚拟化（分组标题行/会话行扁平化混排）；
 *   小列表保留原生渲染路径（折叠动画等交互细节不变）
 * - 搜索：标题走内存元数据；全文走 chat_history_search IPC（防抖 250ms），
 *   sqlite 后端不可用时回落内存兜底
 */
import {
	useState,
	useMemo,
	useCallback,
	useRef,
	useEffect,
	useSyncExternalStore,
	useDeferredValue,
} from "react";
import {
	Plus,
	Search,
	MessageSquare,
	X,
	Pin,
	PinOff,
	Archive,
	ArchiveRestore,
	Trash2,
	Edit3,
	ExternalLink,
} from "lucide-react";
import { chatStore, useChatStoreSelector } from "../../lib/chat/store";
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
	groupThreadsByFolder,
	type BackendThreadMetadata,
	type ThreadFolderGroup,
} from "./threads/threadGrouping";
import {
	DEFAULT_VISIBLE_THREAD_COUNT,
	getVisibleSessionsForGroup,
	useThreadGroupVisibility,
} from "./threads/threadGroupVisibility";
import {
	buildThreadRows,
	filterAndSortVisibleSessions,
	isListableSession,
	useThreadFullTextSearch,
	useThreadSessionsSnapshot,
} from "./threads/threadListModel";
import {
	ThreadGroupHeader,
	ThreadOverflowToggle,
	ThreadSessionItem,
	THREAD_GROUP_GAP,
	THREAD_ROW_PAD,
	VirtualizedThreadList,
} from "./threads/ThreadListRows";
import { workspaceStore } from "../../lib/workspaceStore";
import { useRegisterShortcuts } from "../../lib/shortcuts";

/** 行数超过该阈值才启用虚拟化；小列表保留普通渲染（折叠动画等体感不变） */
const VIRTUALIZE_ROW_THRESHOLD = 60;

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
	// 订阅收窄：sessions 走签名缓存快照（流式期间元数据不变 ⇒ 引用不变、零重渲染），
	// activeSessionId 单独窄订阅；actions 直接调 chatStore 单例（无需订阅）。
	const sessions = useThreadSessionsSnapshot();
	const activeSessionId = useChatStoreSelector(
		(state) => state.activeSessionId,
	);
	const { pinnedProjectKeys, toggleProjectPin } = useThreadProjectPins();
	const { expandedGroupKeys, toggleExpandedGroup } = useThreadGroupVisibility();

	// 订阅 sessionStore 以在 AgentSession 变化时刷新（桥接旧数据 cwd）
	// 用 useSyncExternalStore 替代 useState + subscribe + setState：
	// React 18 下自动 batch，避免高频 emit 触发多次 re-render；
	// snapshot 返回内部版本号（每次变更 +1），引用变化即视为更新。
	const agentSessionTick = useSyncExternalStore(
		useCallback((cb) => sessionStore.subscribe(cb), []),
		useCallback(() => sessionStore.getRevision?.() ?? 0, []),
	);

	const [searchQuery, setSearchQuery] = useState("");
	// useDeferredValue：输入框立即更新（用户感知不到延迟），过滤计算用旧值，
	// React 在空闲时再用新值重算。多字符快速输入时合并为一次过滤。
	const deferredSearchQuery = useDeferredValue(searchQuery);
	// 全文搜索：sqlite 后端走 chat_history_search（防抖 250ms）；
	// null = 不参与（空查询/后端不可用），过滤时保持内存兜底逻辑。
	const ftsMatchedIds = useThreadFullTextSearch(deferredSearchQuery);
	const searchInputRef = useRef<HTMLInputElement>(null);
	// ⌘F 聚焦搜索框——面板挂载时才注册（左栏切走即失效），不与其他视图抢键位
	useRegisterShortcuts(
		() => [
			{
				id: "threads.focus-search",
				keys: "mod+f",
				label: "搜索对话",
				description: "聚焦左栏对话列表的搜索框",
				group: "对话",
				allowInInput: true,
				handler: (e) => {
					e.preventDefault();
					searchInputRef.current?.focus();
					searchInputRef.current?.select();
				},
			},
		],
		[],
	);
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);
	const [backendMetadataBySessionId, setBackendMetadataBySessionId] = useState<
		Map<string, BackendThreadMetadata>
	>(() => new Map());
	const hasInitializedRef = useRef(false);
	const scrollParentRef = useRef<HTMLDivElement>(null);
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

	// 可见会话过滤 + 排序：输入是签名稳定的 sessions 快照，
	// 流式期间引用不变 ⇒ 不重算。
	const visibleSessions = useMemo(
		() =>
			filterAndSortVisibleSessions(
				sessions,
				deferredSearchQuery,
				ftsMatchedIds,
			),
		[sessions, deferredSearchQuery, ftsMatchedIds],
	);

	// 头部计数：不受搜索影响的"这台机器上一共多少条对话"
	const totalSessionCount = useMemo(
		() => sessions.reduce((n, s) => (isListableSession(s) ? n + 1 : n), 0),
		[sessions],
	);
	const isSearching = Boolean(searchQuery.trim());

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

	const toggleGroup = useCallback((key: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const createThreadForPath = useCallback(
		async (path: string) => {
			const model = (await getActiveModel()) || DEFAULT_THREAD_MODEL;
			createThreadSessionForPath(path, model);
			managedModeStore.enableManagedMode();
			onNavigateWorkbench?.();
		},
		[onNavigateWorkbench],
	);

	/** 点击"+"新建对话：选目录 → 创建 AgentSession + ChatSession */
	const handleCreateThread = async () => {
		try {
			const { path } = await pickSystemDirectory("选择对话的工作目录");
			if (!path) return;
			await createThreadForPath(path);
		} catch (error) {
			console.error("创建对话失败:", error);
			toast.error("创建对话失败");
		}
	};

	const handleSelectSession = useCallback(
		(session: ChatSession) => {
			chatStore.setActiveSession(session.id);

			// 如果对话有关联 cwd，同步到 sessionStore 的当前会话
			const cwd = resolveCwd(session, backendMetadataBySessionId);
			workspaceStore.setCurrentThreadScope(cwd || null, session.title);
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
		[onNavigateWorkbench, backendMetadataBySessionId],
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

	const handleGroupContextMenu = useCallback(
		(e: React.MouseEvent, group: ThreadFolderGroup) => {
			setContextMenu({
				x: e.clientX,
				y: e.clientY,
				target: { type: "group", group },
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
						"请输入新的对话标题",
						session.title || "未命名对话",
					);
					if (newTitle?.trim()) {
						chatStore.updateSessionTitle(session.id, newTitle.trim());
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
					chatStore.setSessionPinned(session.id, !session.isPinned);
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
					chatStore.setSessionArchived(session.id, nextArchived);
					toast.show(nextArchived ? "已归档对话" : "已取消归档", {
						type: "success",
						duration: 5000,
						actionLabel: "撤销",
						onAction: () => {
							chatStore.setSessionArchived(session.id, !nextArchived);
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
					const result = chatStore.deleteSessionWithUndo(session.id);
					if (result) {
						toast.show("已删除对话", {
							type: "success",
							duration: 5000,
							actionLabel: "撤销",
							onAction: () => {
								if (chatStore.undoDeleteSession(session.id)) {
									toast.success("已恢复对话");
								}
							},
						});
					}
				},
			},
		];
	}, [contextMenu, handleSelectSession, createThreadForPath, toggleProjectPin]);

	// 扁平化行（标题行/会话行/展开更多行混排），虚拟化路径直接消费；
	// 同时用行数决定是否启用虚拟化。
	const threadRows = useMemo(
		() =>
			buildThreadRows({
				groups: folderGroups,
				collapsedGroupKeys: collapsedGroups,
				expandedGroupKeys,
				activeSessionId,
				searching: Boolean(searchQuery.trim()),
			}),
		[
			folderGroups,
			collapsedGroups,
			expandedGroupKeys,
			activeSessionId,
			searchQuery,
		],
	);
	const shouldVirtualize = threadRows.length > VIRTUALIZE_ROW_THRESHOLD;

	return (
		<div className="flex flex-col h-full bg-transparent">
			{/* Header：一行搞定——左栏 rail 已经标着「对话」，这里不再重复大标题。
			    搜索框静止时是无填充的一行文字，hover/focus 才浮现浅底。 */}
			<div className="shrink-0 px-2 pt-3.5 pb-2">
				<div className="flex items-center gap-1">
					<div className="group/search relative flex-1">
						<Search
							className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-light"
							strokeWidth={1.75}
						/>
						<input
							ref={searchInputRef}
							type="text"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder={
								totalSessionCount > 0
									? `搜索 ${totalSessionCount} 条对话`
									: "搜索对话"
							}
							className="h-8 w-full rounded-lg bg-transparent pl-[30px] pr-7 text-[13px] text-text-primary transition-colors duration-150 placeholder:text-text-light hover:bg-warm-200/45 focus:bg-warm-200/70 focus:outline-none dark:hover:bg-white/[0.04] dark:focus:bg-white/[0.07]"
						/>
						{searchQuery && (
							<button
								type="button"
								onClick={() => setSearchQuery("")}
								className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-text-light transition-colors hover:bg-black/[0.06] hover:text-text-secondary dark:hover:bg-white/10"
								aria-label="清空搜索"
							>
								<X className="h-3 w-3" strokeWidth={2} />
							</button>
						)}
					</div>
					<button
						type="button"
						onClick={handleCreateThread}
						className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-light transition-colors duration-150 hover:bg-warm-200/70 hover:text-text-primary dark:hover:bg-white/[0.06]"
						title="新建对话（选择工作目录）"
						aria-label="新建对话"
					>
						<Plus className="h-4 w-4" strokeWidth={1.75} />
					</button>
				</div>

				{isSearching && (
					<p className="mt-1.5 pl-[30px] text-[12px] text-text-light">
						{visibleSessions.length > 0
							? `${visibleSessions.length} 条匹配`
							: "没有匹配的对话"}
					</p>
				)}
			</div>

			{/* Folder Groups */}
			<div ref={scrollParentRef} className="flex-1 overflow-y-auto px-2 pb-6">
				{shouldVirtualize ? (
					<VirtualizedThreadList
						scrollParentRef={scrollParentRef}
						rows={threadRows}
						activeSessionId={activeSessionId}
						onToggleCollapse={toggleGroup}
						onGroupContextMenu={handleGroupContextMenu}
						onCreateThreadInGroup={handleCreateThreadInGroup}
						onSelectSession={handleSelectSession}
						onSessionContextMenu={handleSessionContextMenu}
						onToggleOverflow={toggleExpandedGroup}
					/>
				) : (
					folderGroups.map((group) => {
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
						const groupHasActive = group.sessions.some(
							(s) => s.id === activeSessionId,
						);
						return (
							<div
								key={group.key}
								className={THREAD_GROUP_GAP}
								style={{
									// 浏览器原生延迟渲染：视口外的 folder section 跳过 layout/paint，
									// 视口内/即将进入视口时再渲染。contain-intrinsic-size 给出占位高度避免滚动跳变。
									contentVisibility: "auto",
									containIntrinsicSize: "auto 280px",
								}}
							>
								{/* Folder Header */}
								<ThreadGroupHeader
									group={group}
									isCollapsed={isCollapsed}
									groupHasActive={groupHasActive}
									onToggleCollapse={toggleGroup}
									onGroupContextMenu={handleGroupContextMenu}
									onCreateThreadInGroup={handleCreateThreadInGroup}
								/>

								{/* Sessions List — 用 grid-rows trick 做平滑折叠 */}
								<div
									className={`grid transition-[grid-template-rows] duration-200 ease-out ${
										isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
									}`}
								>
									<div className="overflow-hidden">
										<div className={THREAD_ROW_PAD}>
											{visibleGroupSessions.map((session) => (
												<ThreadSessionItem
													key={session.id}
													session={session}
													isActive={session.id === activeSessionId}
													onSelect={handleSelectSession}
													onSessionContextMenu={handleSessionContextMenu}
												/>
											))}
											{canToggleOverflow ? (
												<ThreadOverflowToggle
													groupKey={group.key}
													expanded={isOverflowExpanded}
													hiddenCount={hiddenSessionCount}
													onToggleOverflow={toggleExpandedGroup}
												/>
											) : null}
										</div>
									</div>
								</div>
							</div>
						);
					})
				)}

				{/* Empty State */}
				{folderGroups.length === 0 &&
					(isSearching ? (
						<div className="px-4 py-12 text-center">
							<p className="text-[12.5px] text-text-muted">
								没有找到「{searchQuery.trim()}」
							</p>
							<p className="mt-1.5 text-[11.5px] text-text-light">
								换个关键词，或搜索对话正文中的原句
							</p>
						</div>
					) : (
						<div className="px-4 py-14 text-center">
							<div className="mx-auto mb-3.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-warm-200/70 dark:bg-white/[0.05]">
								<MessageSquare
									className="h-[18px] w-[18px] text-text-light"
									strokeWidth={1.5}
								/>
							</div>
							<p className="text-[13px] font-medium text-text-secondary">
								还没有对话
							</p>
							<p className="mt-1.5 text-[11.5px] leading-relaxed text-text-light">
								在右侧开始提问，对话会按工作目录自动归档到这里
							</p>
							<button
								type="button"
								onClick={handleCreateThread}
								className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-text-secondary transition-colors hover:bg-warm-200/60 hover:text-text-primary"
							>
								<Plus className="h-3.5 w-3.5" strokeWidth={2} />
								新建对话
							</button>
						</div>
					))}
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
