// 聊天历史记录面板

import { Calendar, MessageSquare, Plus, Search, Trash2, X } from "lucide-react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { buildSessionContextMenu } from "../../lib/contextMenu/actions";
import type { ChatSession } from "../../lib/chat/types";
import { inputDialog } from "../ui/InputDialog";
import { ContextMenu } from "../ui/ContextMenu";

/** 虚拟列表行 — 要么是日期分组头，要么是会话条目 */
type Row =
	| { type: "header"; dateKey: string }
	| { type: "session"; session: ChatSession };

const ROW_HEIGHT = {
	header: 32, // 日期分组头
	session: 76, // 会话条目（含 padding）
} as const;

const VIRTUALIZE_THRESHOLD = 30; // 30 条以下不虚拟化，避免轻度场景的体感跳动

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

	// 把分组结构拍平成一维 Row[]，虚拟化模式直接喂给 useVirtualizer
	const flatRows = useMemo<Row[]>(() => {
		const rows: Row[] = [];
		for (const [dateKey, list] of sortedEntries) {
			rows.push({ type: "header", dateKey });
			for (const session of list) {
				rows.push({ type: "session", session });
			}
		}
		return rows;
	}, [sortedEntries]);

	const totalSessions = sessions.length;
	const shouldVirtualize = totalSessions > VIRTUALIZE_THRESHOLD;

	// 虚拟化滚动容器 ref
	const scrollParentRef = useRef<HTMLDivElement>(null);

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
			<div
				ref={scrollParentRef}
				className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-4"
			>
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
								className="mt-2 text-xs text-text-secondary hover:text-text-primary hover:underline"
							>
								清空搜索
							</button>
						)}
					</div>
				) : shouldVirtualize ? (
					<VirtualizedSessionList
						scrollParentRef={scrollParentRef}
						rows={flatRows}
						activeSessionId={activeSessionId}
						pinnedIds={pinnedIds}
						onSelectSession={onSelectSession}
						onDeleteSession={onDeleteSession}
						onContextMenu={(e, session) => {
							e.preventDefault();
							e.stopPropagation();
							setContextMenu({ x: e.clientX, y: e.clientY, session });
						}}
					/>
				) : (
					<div className="space-y-6 mt-2">
						{sortedEntries.map(([dateKey, dateSessions]) => (
							<div key={dateKey} className="space-y-2">
								<DateHeader dateKey={dateKey} />
								<div className="space-y-1">
									{dateSessions.map((session) => (
										<SessionItem
											key={session.id}
											session={session}
											active={activeSessionId === session.id}
											pinned={pinnedIds.includes(session.id)}
											onSelect={() => onSelectSession(session.id)}
											onDelete={() => onDeleteSession(session.id)}
											onContextMenu={(e) => {
												e.preventDefault();
												e.stopPropagation();
												setContextMenu({
													x: e.clientX,
													y: e.clientY,
													session,
												});
											}}
										/>
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

/* ============================================
   子组件 — DateHeader / SessionItem / VirtualizedSessionList
   ============================================ */

function DateHeader({ dateKey }: { dateKey: string }) {
	return (
		<div className="flex items-center gap-2 px-2">
			<Calendar className="w-3.5 h-3.5 text-text-light" />
			<div className="text-xs font-medium text-text-light uppercase tracking-wider">
				{dateKey}
			</div>
			<div className="h-px flex-1 bg-warm-200" />
		</div>
	);
}

interface SessionItemProps {
	session: ChatSession;
	active: boolean;
	pinned: boolean;
	onSelect: () => void;
	onDelete: () => void;
	onContextMenu: (e: React.MouseEvent) => void;
}

function SessionItem({
	session,
	active,
	pinned,
	onSelect,
	onDelete,
	onContextMenu,
}: SessionItemProps) {
	const lastMessage =
		session.messages[session.messages.length - 1]?.content.slice(0, 30) ||
		"无消息";

	return (
		<div
			onClick={onSelect}
			onContextMenu={onContextMenu}
			className={`
                        group relative flex items-start gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all duration-200
                        ${
													active
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
													active
														? "bg-surface dark:bg-cream-700 text-text-primary shadow-sm"
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
                          ${
														active
															? "text-text-primary"
															: "text-text-secondary group-hover:text-text-primary dark:group-hover:text-surface"
													}
                        `}
				>
					{session.title || "新对话"}
					{pinned ? (
						<span className="ml-2 text-[10px] text-text-secondary">置顶</span>
					) : null}
				</div>
				<div className="text-xs text-text-light truncate">{lastMessage}</div>
			</div>
			<button
				onClick={(e) => {
					e.stopPropagation();
					onDelete();
				}}
				aria-label={`删除对话 ${session.title || "新对话"}`}
				className="absolute right-2 top-2 p-1.5 opacity-0 group-hover:opacity-100 text-text-light hover:text-error hover:bg-[rgba(181,51,51,0.08)] rounded-lg transition-all duration-200"
				title="删除对话"
			>
				<Trash2 className="w-3.5 h-3.5" />
			</button>
		</div>
	);
}

interface VirtualizedListProps {
	scrollParentRef: React.RefObject<HTMLDivElement | null>;
	rows: Row[];
	activeSessionId: string | null;
	pinnedIds: string[];
	onSelectSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => void;
	onContextMenu: (e: React.MouseEvent, session: ChatSession) => void;
}

function VirtualizedSessionList({
	scrollParentRef,
	rows,
	activeSessionId,
	pinnedIds,
	onSelectSession,
	onDeleteSession,
	onContextMenu,
}: VirtualizedListProps) {
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollParentRef.current,
		estimateSize: (index) =>
			rows[index].type === "header" ? ROW_HEIGHT.header : ROW_HEIGHT.session,
		overscan: 8,
	});

	return (
		<div
			style={{
				height: `${virtualizer.getTotalSize()}px`,
				width: "100%",
				position: "relative",
			}}
			className="mt-2"
		>
			{virtualizer.getVirtualItems().map((virtualRow) => {
				const row = rows[virtualRow.index];
				return (
					<div
						key={virtualRow.key}
						data-index={virtualRow.index}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: "100%",
							transform: `translateY(${virtualRow.start}px)`,
						}}
					>
						{row.type === "header" ? (
							<div className="pb-2">
								<DateHeader dateKey={row.dateKey} />
							</div>
						) : (
							<div className="pb-1">
								<SessionItem
									session={row.session}
									active={activeSessionId === row.session.id}
									pinned={pinnedIds.includes(row.session.id)}
									onSelect={() => onSelectSession(row.session.id)}
									onDelete={() => onDeleteSession(row.session.id)}
									onContextMenu={(e) => onContextMenu(e, row.session)}
								/>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
