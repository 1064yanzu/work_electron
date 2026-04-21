import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
	Plus,
	Search,
	ChevronDown,
	ChevronRight,
	MessageSquare,
	Folder,
	FolderOpen,
} from "lucide-react";
import { sessionStore, AgentSession } from "../../lib/agent/sessionManager";
import { managedModeStore } from "../../lib/managedModeStore";
import { pickSystemDirectory, getActiveModel } from "../../lib/api";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { buildSessionContextMenu } from "../../lib/contextMenu/actions";
import { toast } from "../ui/Toast";

interface ThreadsViewProps {
	onNavigateWorkbench?: () => void;
}

export function ThreadsView({ onNavigateWorkbench }: ThreadsViewProps) {
	const [sessions, setSessions] = useState<AgentSession[]>([]);
	const [searchQuery] = useState("");
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
		new Set(),
	);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	const hasInitializedRef = useRef(false);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		session: AgentSession;
	} | null>(null);

	// 初始加载和状态订阅
	useEffect(() => {
		const loadSessions = () => setSessions(sessionStore.getAllSessions());
		loadSessions();
		const currentSession = sessionStore.getCurrentSession();
		setActiveSessionId(currentSession?.id || null);

		const unsubscribe = sessionStore.subscribe(() => {
			loadSessions();
			setActiveSessionId(sessionStore.getCurrentSession()?.id || null);
		});
		return unsubscribe;
	}, []);

	// 处理搜索与分组
	const groupedSessions = useMemo(() => {
		const groups: Record<string, AgentSession[]> = {};

		const sortedSessions = [...sessions].sort(
			(a, b) => b.lastActiveAt - a.lastActiveAt,
		);

		for (const session of sortedSessions) {
			const query = searchQuery.trim().toLowerCase();
			if (query) {
				const titleMatch = (session.title || "").toLowerCase().includes(query);
				const idMatch = session.id.toLowerCase().includes(query);
				if (!titleMatch && !idMatch) continue;
			}

			// 提取 CWD 最后一级作为 Project 文件夹名称
			let folderName = "Uncategorized";
			if (session.cwd) {
				const parts = session.cwd.split(/[/\\]/);
				const lastPart = parts.pop();
				folderName = lastPart || "Root";
			}

			if (!groups[folderName]) {
				groups[folderName] = [];
			}
			groups[folderName].push(session);
		}
		return groups;
	}, [sessions, searchQuery]);

	// 首次加载自动展开所有包含会话的文件夹
	useEffect(() => {
		if (!hasInitializedRef.current && Object.keys(groupedSessions).length > 0) {
			setExpandedFolders(new Set(Object.keys(groupedSessions)));
			hasInitializedRef.current = true;
		}
	}, [groupedSessions]);

	const toggleFolder = (folderName: string) => {
		setExpandedFolders((prev) => {
			const next = new Set(prev);
			if (next.has(folderName)) next.delete(folderName);
			else next.add(folderName);
			return next;
		});
	};

	const formatRelativeTime = (timestamp: number) => {
		const diffMs = Date.now() - timestamp;
		const diffMins = Math.floor(diffMs / 60000);
		if (diffMins < 60) return `${diffMins} mins ago`;
		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours} hours ago`;
		const diffDays = Math.floor(diffHours / 24);
		if (diffDays === 1) return `1 day ago`;
		if (diffDays < 30) return `${diffDays} days ago`;
		const diffMonths = Math.floor(diffDays / 30);
		return `${diffMonths} mons ago`;
	};

	const handleCreateThread = async () => {
		try {
			const { path } = await pickSystemDirectory("选择新线程工作目录");
			if (!path) return;

			const model = (await getActiveModel()) || "claude-3-5-sonnet-20241022";
			const newSession = sessionStore.createSession({
				model,
				cwd: path,
			});

			sessionStore.setCurrentSession(newSession.id);
			managedModeStore.enableManagedMode();
			onNavigateWorkbench?.();
		} catch (error) {
			console.error("创建线程失败:", error);
		}
	};

	const handleSelectSession = (id: string) => {
		// 通知应用恢复此 session
		sessionStore.setCurrentSession(id);
		// 确保进入沙盒托管模式
		managedModeStore.enableManagedMode();
		// 切换到工作区
		onNavigateWorkbench?.();
	};

	const handleSessionContextMenu = useCallback(
		(e: React.MouseEvent, session: AgentSession) => {
			e.preventDefault();
			e.stopPropagation();
			setContextMenu({ x: e.clientX, y: e.clientY, session });
		},
		[],
	);

	const contextMenuItems: ContextMenuItem[] = useMemo(() => {
		if (!contextMenu) return [];
		const session = contextMenu.session;
		return buildSessionContextMenu({
			onOpen: () => handleSelectSession(session.id),
			onRename: () => {
				const newTitle = window.prompt(
					"请输入新的线程标题",
					session.title || "Untitled Chat",
				);
				if (newTitle?.trim()) {
					sessionStore.updateSession(session.id, {
						title: newTitle.trim(),
					});
					toast.success("已重命名");
				}
			},
			onTogglePin: () => {
				toast.info("置顶功能即将支持");
			},
			onExport: () => {
				toast.info("导出功能即将支持");
			},
			onDelete: () => {
				if (
					window.confirm(`确定要删除线程「${session.title || "Untitled"}」吗？`)
				) {
					sessionStore.deleteSession(session.id);
					toast.success("已删除线程");
				}
			},
		});
	}, [contextMenu]);

	return (
		<div className="flex flex-col h-full bg-transparent">
			{/* Header */}
			<div className="px-6 py-5 flex items-center justify-between shrink-0 mb-2 border-b border-zinc-100 dark:border-white/[0.05]">
				<h2 className="font-semibold text-[13px] text-zinc-500 uppercase tracking-widest">
					Threads
				</h2>
				<div className="flex items-center gap-1">
					<button
						onClick={handleCreateThread}
						className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
						title="New Thread"
					>
						<Plus className="w-4 h-4" />
					</button>
					<button
						className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors"
						title="Search"
					>
						<Search className="w-4 h-4" />
					</button>
				</div>
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-6">
				{Object.entries(groupedSessions).map(([folderName, sessionList]) => {
					const isExpanded = expandedFolders.has(folderName);
					return (
						<div key={folderName} className="mb-4">
							<button
								onClick={() => toggleFolder(folderName)}
								className="flex items-center gap-2 w-full px-2 py-1.5 mb-1 group hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors"
							>
								<div className="text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
									{isExpanded ? (
										<ChevronDown className="w-3.5 h-3.5" />
									) : (
										<ChevronRight className="w-3.5 h-3.5" />
									)}
								</div>
								<div className="text-[#D96C46]/80 flex-shrink-0">
									{isExpanded ? (
										<FolderOpen className="w-4 h-4" />
									) : (
										<Folder className="w-4 h-4" />
									)}
								</div>
								<span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-300 truncate">
									{folderName}
								</span>
							</button>

							{isExpanded && (
								<div className="pl-6 pr-2 space-y-0.5">
									{sessionList.map((session) => {
										const isActive = session.id === activeSessionId;
										return (
											<button
												key={session.id}
												onClick={() => handleSelectSession(session.id)}
												onContextMenu={(e) =>
													handleSessionContextMenu(e, session)
												}
												className={`w-full flex items-center justify-between pl-4 pr-3 py-1.5 rounded-lg transition-all duration-200 text-left group ${
													isActive
														? "bg-transparent relative"
														: "hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
												}`}
											>
												{isActive && (
													<div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-sm bg-[#D96C46]" />
												)}
												<span
													className={`text-[12px] truncate pr-3 ${
														isActive
															? "text-[#D96C46] dark:text-[#E07B52] font-semibold"
															: "text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-300"
													}`}
												>
													{session.title || "Untitled Chat"}
												</span>
												<span
													className={`text-[10px] whitespace-nowrap shrink-0 ${
														isActive
															? "text-[#D96C46]/70 dark:text-[#E07B52]/70"
															: "text-zinc-400 dark:text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity"
													}`}
												>
													{formatRelativeTime(session.lastActiveAt)}
												</span>
											</button>
										);
									})}
								</div>
							)}
						</div>
					);
				})}

				{Object.keys(groupedSessions).length === 0 && (
					<div className="text-center py-10 mt-10">
						<div className="w-12 h-12 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl flex items-center justify-center mx-auto mb-3">
							<MessageSquare className="w-5 h-5 text-zinc-300 dark:text-zinc-600" />
						</div>
						<p className="text-sm text-zinc-500 font-medium">无活跃线程</p>
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
