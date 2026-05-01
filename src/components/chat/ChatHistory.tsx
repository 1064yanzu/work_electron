// 聊天历史记录面板

import { Calendar, MessageSquare, Plus, Search, Trash2, X } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { buildSessionContextMenu } from "../../lib/contextMenu/actions";
import type { ChatSession } from "../../lib/chat/types";
import { inputDialog } from "../ui/InputDialog";
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
	const deferredSearchQuery = useDeferredValue(searchQuery);
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
		const normalizedQuery = deferredSearchQuery.trim().toLowerCase();
		const filtered = sessions.filter(
			(s) =>
				s.title.toLowerCase().includes(normalizedQuery) ||
				s.messages.some((m) =>
					m.content.toLowerCase().includes(normalizedQuery),
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
	}, [sessions, deferredSearchQuery]);

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
					void (async () => {
						const nextTitle = await inputDialog.show({
							title: "重命名会话",
							message: "请输入新的会话标题",
							defaultValue: contextMenu.session.title || "新对话",
							confirmText: "保存",
							cancelText: "取消",
							validate: (value) => {
								if (!value.trim()) return "标题不能为空";
								return null;
							},
						});
						if (!nextTitle?.trim()) return;
						onRenameSession(contextMenu.session.id, nextTitle.trim());
					})();
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
					// a.click() 在部分 Electron 渠道是异步触发下载的，立即 revoke 可能让大文件下载失败；
					// 推到下一帧再释放，让浏览器先把 url 取走。
					setTimeout(() => URL.revokeObjectURL(url), 0);
				},
				onDelete: () => onDeleteSession(contextMenu.session.id),
				pinned: pinnedIds.includes(contextMenu.session.id),
			})
		: [];

	return (
		<div className="flex flex-col h-full bg-surface animate-in slide-in-from-left-5 duration-200">
			{/* Header Area */}
			<div className="flex flex-col gap-4 p-4 pb-2">
				<div className="flex items-center justify-between">
					<h3 className="font-semibold text-lg text-text-primary tracking-tight">
						对话历史
					</h3>
					<div className="flex items-center gap-2">
						<button
							onClick={onNewSession}
							aria-label="新建对话"
							className="p-2 text-text-muted hover:text-text-primary hover:bg-warm-200 rounded-xl transition-all active:scale-95"
							title="新建对话"
						>
							<Plus className="w-5 h-5" />
						</button>
						<button
							onClick={onClose}
							aria-label="关闭历史记录"
							className="p-2 text-text-light hover:text-text-secondary dark:hover:text-text-light hover:bg-warm-200 rounded-xl transition-all active:scale-95"
						>
							<X className="w-5 h-5" />
						</button>
					</div>
				</div>

				{/* Search Bar */}
				<div className="relative group">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light group-focus-within:text-text-secondary transition-colors" />
					<input
						type="text"
						placeholder="搜索对话..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full pl-9 pr-4 py-2.5 bg-warm-50/50 border border-transparent focus:border-border dark:focus:border-dark-border rounded-xl text-sm text-text-primary placeholder:text-text-light focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
					/>
				</div>
			</div>

			{/* Session List */}
			<div className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-4">
				{!hasResults ? (
					<div className="flex flex-col items-center justify-center h-64 text-text-light animate-in fade-in zoom-in-95 duration-300">
						<div className="w-16 h-16 rounded-2xl bg-warm-50/50 flex items-center justify-center mb-4">
							{searchQuery ? (
								<Search className="w-8 h-8 opacity-40" />
							) : (
								<MessageSquare className="w-8 h-8 opacity-40" />
							)}
						</div>
						<p className="text-sm font-medium text-text-muted">
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
									<Calendar className="w-3.5 h-3.5 text-text-light" />
									<div className="text-xs font-medium text-text-light uppercase tracking-wider">
										{dateKey}
									</div>
									<div className="h-px flex-1 bg-warm-200" />
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
														? "bg-warm-200 shadow-sm ring-1 ring-zinc-200/50 dark:ring-zinc-700/50"
														: "hover:bg-warm-50/50 hover:shadow-sm"
												}
                      `}
											style={{
												contentVisibility: "auto",
												containIntrinsicSize: "88px",
											}}
										>
											<div
												className={`
                        w-8 h-8 mt-0.5 rounded-lg flex items-center justify-center shrink-0 transition-colors
                        ${
													activeSessionId === session.id
														? "bg-surface dark:bg-zinc-700 text-text-primary shadow-sm"
														: "bg-warm-200 text-text-light group-hover:text-text-secondary dark:group-hover:text-text-light"
												}
                      `}
											>
												<MessageSquare className="w-4 h-4" />
											</div>

											<div className="flex-1 min-w-0 pr-6">
												<div
													className={`
                          text-sm font-medium truncate transition-colors mb-0.5
                          ${activeSessionId === session.id ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary dark:group-hover:text-surface"}
                        `}
												>
													{session.title || "新对话"}
													{pinnedIds.includes(session.id) ? (
														<span className="ml-2 text-[10px] text-blue-500">
															置顶
														</span>
													) : null}
												</div>
												<div className="text-xs text-text-light truncate">
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
												aria-label={`删除对话 ${session.title || "新对话"}`}
												className="absolute right-2 top-2 p-1.5 opacity-0 group-hover:opacity-100 text-text-light hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
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
