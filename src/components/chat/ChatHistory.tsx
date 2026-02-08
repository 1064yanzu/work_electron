// 聊天历史记录面板

import { Calendar, MessageSquare, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { buildSessionContextMenu } from "../../lib/contextMenu/actions";
import type { ChatSession } from "../../lib/chat/types";
import { ContextMenu } from "../ui/ContextMenu";

interface ChatHistoryProps {
	sessions: ChatSession[];
	activeSessionId: string | null;
	onSelectSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => void;
	onRenameSession: (sessionId: string, title: string) => void;
	onNewSession: () => void;
	onClose: () => void;
}

export function ChatHistory({
	sessions,
	activeSessionId,
	onSelectSession,
	onDeleteSession,
	onRenameSession,
	onNewSession,
	onClose,
}: ChatHistoryProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [pinnedIds, setPinnedIds] = useState<string[]>([]);
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
		session: ChatSession;
	} | null>(null);

	const formatDate = (timestamp: number) => {
		const date = new Date(timestamp);
		const now = new Date();
		const diffDays = Math.floor(
			(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
		);

		if (diffDays === 0) return "今天";
		if (diffDays === 1) return "昨天";
		if (diffDays < 7) return `${diffDays} 天前`;
		return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
	};

	// 过滤和分组
	const { groupedSessions, hasResults } = useMemo(() => {
		const filtered = sessions.filter(
			(s) =>
				s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
				s.messages.some((m) =>
					m.content.toLowerCase().includes(searchQuery.toLowerCase()),
				),
		);

		const groups = filtered.reduce(
			(groups, session) => {
				const dateKey = formatDate(session.updatedAt);
				if (!groups[dateKey]) groups[dateKey] = [];
				groups[dateKey].push(session);
				return groups;
			},
			{} as Record<string, ChatSession[]>,
		);

		return { groupedSessions: groups, hasResults: filtered.length > 0 };
	}, [sessions, searchQuery]);

	const sortedEntries = useMemo(() => {
		return Object.entries(groupedSessions).map(([dateKey, dateSessions]) => {
			const sorted = [...dateSessions].sort((a, b) => {
				const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
				const bPinned = pinnedIds.includes(b.id) ? 1 : 0;
				if (aPinned !== bPinned) return bPinned - aPinned;
				return b.updatedAt - a.updatedAt;
			});
			return [dateKey, sorted] as [string, ChatSession[]];
		});
	}, [groupedSessions, pinnedIds]);

	const contextMenuItems = contextMenu
		? buildSessionContextMenu({
				onOpen: () => onSelectSession(contextMenu.session.id),
				onRename: () => {
					const nextTitle = window.prompt(
						"请输入新的会话标题",
						contextMenu.session.title || "新对话",
					);
					if (!nextTitle?.trim()) return;
					onRenameSession(contextMenu.session.id, nextTitle.trim());
				},
				onTogglePin: () => {
					setPinnedIds((prev) =>
						prev.includes(contextMenu.session.id)
							? prev.filter((id) => id !== contextMenu.session.id)
							: [...prev, contextMenu.session.id],
					);
				},
				onExport: () => {
					const lines = contextMenu.session.messages.map((msg) => {
						const role =
							msg.role === "assistant"
								? "Assistant"
								: msg.role === "user"
									? "User"
									: "System";
						return `## ${role}\n\n${msg.content}`;
					});
					const markdown = `# ${contextMenu.session.title || "新对话"}\n\n${lines.join("\n\n")}`;
					const blob = new Blob([markdown], { type: "text/markdown" });
					const url = URL.createObjectURL(blob);
					const a = document.createElement("a");
					a.href = url;
					a.download = `${(contextMenu.session.title || "会话").replace(/[\\\\/:*?\"<>|]/g, "-")}.md`;
					a.click();
					URL.revokeObjectURL(url);
				},
				onDelete: () => onDeleteSession(contextMenu.session.id),
				pinned: pinnedIds.includes(contextMenu.session.id),
			})
		: [];

	return (
		<div className="flex flex-col h-full bg-white dark:bg-zinc-900 animate-in slide-in-from-left-5 duration-200">
			{/* Header Area */}
			<div className="flex flex-col gap-4 p-4 pb-2">
				<div className="flex items-center justify-between">
					<h3 className="font-semibold text-lg text-zinc-900 dark:text-zinc-100 tracking-tight">
						对话历史
					</h3>
					<div className="flex items-center gap-2">
						<button
							onClick={onNewSession}
							className="p-2 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all active:scale-95"
							title="新建对话"
						>
							<Plus className="w-5 h-5" />
						</button>
						<button
							onClick={onClose}
							className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-all active:scale-95"
						>
							<X className="w-5 h-5" />
						</button>
					</div>
				</div>

				{/* Search Bar */}
				<div className="relative group">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-zinc-600 transition-colors" />
					<input
						type="text"
						placeholder="搜索对话..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border border-transparent focus:border-zinc-200 dark:focus:border-zinc-700 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
					/>
				</div>
			</div>

			{/* Session List */}
			<div className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-4">
				{!hasResults ? (
					<div className="flex flex-col items-center justify-center h-64 text-zinc-400 animate-in fade-in zoom-in-95 duration-300">
						<div className="w-16 h-16 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 flex items-center justify-center mb-4">
							{searchQuery ? (
								<Search className="w-8 h-8 opacity-40" />
							) : (
								<MessageSquare className="w-8 h-8 opacity-40" />
							)}
						</div>
						<p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
							{searchQuery ? "没有找到相关对话" : "暂无对话记录"}
						</p>
						{searchQuery && (
							<button
								onClick={() => setSearchQuery("")}
								className="mt-2 text-xs text-blue-500 hover:text-blue-600 hover:underline"
							>
								清空搜索
							</button>
						)}
					</div>
				) : (
					<div className="space-y-6 mt-2">
						{sortedEntries.map(([dateKey, dateSessions]) => (
							<div key={dateKey} className="space-y-2">
								<div className="flex items-center gap-2 px-2">
									<Calendar className="w-3.5 h-3.5 text-zinc-400" />
									<div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
										{dateKey}
									</div>
									<div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
								</div>

								<div className="space-y-1">
									{dateSessions.map((session) => (
										<div
											key={session.id}
											onClick={() => onSelectSession(session.id)}
											onContextMenu={(e) => {
												e.preventDefault();
												e.stopPropagation();
												setContextMenu({
													x: e.clientX,
													y: e.clientY,
													session,
												});
											}}
											className={`
                        group relative flex items-start gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all duration-200
                        ${
													activeSessionId === session.id
														? "bg-zinc-100 dark:bg-zinc-800 shadow-sm ring-1 ring-zinc-200/50 dark:ring-zinc-700/50"
														: "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 hover:shadow-sm"
												}
                      `}
										>
											<div
												className={`
                        w-8 h-8 mt-0.5 rounded-lg flex items-center justify-center shrink-0 transition-colors
                        ${
													activeSessionId === session.id
														? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
														: "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
												}
                      `}
											>
												<MessageSquare className="w-4 h-4" />
											</div>

											<div className="flex-1 min-w-0 pr-6">
												<div
													className={`
                          text-sm font-medium truncate transition-colors mb-0.5
                          ${activeSessionId === session.id ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100"}
                        `}
												>
													{session.title || "新对话"}
													{pinnedIds.includes(session.id) ? (
														<span className="ml-2 text-[10px] text-blue-500">
															置顶
														</span>
													) : null}
												</div>
												<div className="text-xs text-zinc-400 truncate">
													{session.messages[
														session.messages.length - 1
													]?.content.slice(0, 30) || "无消息"}
												</div>
											</div>

											<button
												onClick={(e) => {
													e.stopPropagation();
													onDeleteSession(session.id);
												}}
												className="absolute right-2 top-2 p-1.5 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
												title="删除对话"
											>
												<Trash2 className="w-3.5 h-3.5" />
											</button>
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
			{contextMenu && contextMenuItems.length > 0 ? (
				<ContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					items={contextMenuItems}
					onClose={() => setContextMenu(null)}
				/>
			) : null}
		</div>
	);
}
