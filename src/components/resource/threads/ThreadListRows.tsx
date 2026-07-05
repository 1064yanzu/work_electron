/**
 * ThreadsView 行组件（F5 渲染治理）：
 *
 * - ThreadGroupHeader / ThreadSessionItem / ThreadOverflowToggle：
 *   从 ThreadsView 原地抽出的行渲染（标记结构与样式保持逐字节一致），
 *   小列表（普通渲染路径）与大列表（虚拟化路径）共用，保证视觉零变化。
 * - VirtualizedThreadList：@tanstack/react-virtual 驱动的扁平化行渲染
 *   （标题行 / 会话行 / 展开更多行混排，按 kind 分发），动态行高用
 *   measureElement 实测。
 */
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	Archive,
	ChevronDown,
	Folder,
	FolderOpen,
	MessageSquare,
	MoreHorizontal,
	Pin,
	Plus,
} from "lucide-react";
import type { RefObject } from "react";
import type { ChatSession } from "../../../lib/chat/types";
import { ShinyText } from "../../ui/ShinyText";
import { DEFAULT_VISIBLE_THREAD_COUNT } from "./threadGroupVisibility";
import {
	formatRelativeTime,
	getSessionPreview,
	type ThreadFolderGroup,
} from "./threadGrouping";
import { isSessionStreaming, type ThreadRow } from "./threadListModel";

// ==================
// 分组标题行
// ==================

export interface ThreadGroupHeaderProps {
	group: ThreadFolderGroup;
	isCollapsed: boolean;
	groupHasActive: boolean;
	onToggleCollapse: (groupKey: string) => void;
	onGroupContextMenu: (e: React.MouseEvent, group: ThreadFolderGroup) => void;
	onCreateThreadInGroup: (group: ThreadFolderGroup) => void;
}

export function ThreadGroupHeader({
	group,
	isCollapsed,
	groupHasActive,
	onToggleCollapse,
	onGroupContextMenu,
	onCreateThreadInGroup,
}: ThreadGroupHeaderProps) {
	return (
		<div
			onContextMenu={(e) => {
				e.preventDefault();
				onGroupContextMenu(e, group);
			}}
			className="flex items-center gap-1.5 w-full px-2.5 py-2 group hover:bg-warm-200/35 dark:hover:bg-white/[0.035] rounded-lg transition-colors duration-150"
		>
			<button
				type="button"
				onClick={() => onToggleCollapse(group.key)}
				className="flex min-w-0 flex-1 items-center gap-2 text-left"
				aria-expanded={!isCollapsed}
				aria-label={`${group.folderName} 分组`}
			>
				{/* Caret hit-area 16x16 */}
				<div className="flex items-center justify-center w-4 h-4 shrink-0 text-text-light group-hover:text-text-secondary transition-colors">
					<ChevronDown
						className={`w-3.5 h-3.5 transition-transform duration-200 ${
							isCollapsed ? "-rotate-90" : ""
						}`}
						strokeWidth={2}
					/>
				</div>
				{/* Folder/Source icon */}
				<div
					className={`shrink-0 transition-colors ${
						groupHasActive
							? "text-terracotta"
							: "text-text-secondary group-hover:text-text-primary"
					}`}
				>
					{group.source === "archive" ? (
						<Archive className="w-4 h-4" strokeWidth={1.5} />
					) : group.source === "remote" ? (
						<MessageSquare className="w-4 h-4" strokeWidth={1.5} />
					) : isCollapsed ? (
						<Folder className="w-4 h-4" strokeWidth={1.5} />
					) : (
						<FolderOpen className="w-4 h-4" strokeWidth={1.5} />
					)}
				</div>
				<span
					className="text-[13.5px] font-semibold text-text-primary truncate flex-1"
					title={group.folderPath || undefined}
				>
					{group.folderName}
				</span>
			</button>
			{group.isPinned && (
				<Pin className="w-3 h-3 text-terracotta/60 shrink-0" strokeWidth={2} />
			)}
			{group.source === "local" && group.folderPath ? (
				<button
					type="button"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onCreateThreadInGroup(group);
					}}
					className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-6 h-6 rounded-md text-text-light hover:text-terracotta hover:bg-terracotta/10 dark:hover:bg-terracotta/15 transition-all focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/25 active:scale-95"
					aria-label={`在 ${group.folderName} 新建对话`}
					title="新建对话"
				>
					<Plus className="w-3.5 h-3.5" strokeWidth={1.75} />
				</button>
			) : null}
			<button
				type="button"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onGroupContextMenu(e, group);
				}}
				className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-6 h-6 rounded-md text-text-light hover:text-text-secondary hover:bg-black/5 dark:hover:bg-white/10 transition-all focus-visible:opacity-100 active:scale-95"
				aria-label={`${group.folderName} 更多操作`}
				title="更多操作"
			>
				<MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.75} />
			</button>
		</div>
	);
}

// ==================
// 会话行
// ==================

export interface ThreadSessionItemProps {
	session: ChatSession;
	isActive: boolean;
	onSelect: (session: ChatSession) => void;
	onSessionContextMenu: (e: React.MouseEvent, session: ChatSession) => void;
}

export function ThreadSessionItem({
	session,
	isActive,
	onSelect,
	onSessionContextMenu,
}: ThreadSessionItemProps) {
	const preview = getSessionPreview(session);
	return (
		<div
			onContextMenu={(e) => onSessionContextMenu(e, session)}
			className={`relative w-full flex items-start justify-between gap-2 pl-3 pr-1.5 py-2 rounded-lg transition-colors duration-150 text-left group ${
				isActive
					? "bg-terracotta/8 dark:bg-terracotta/[0.12]"
					: "hover:bg-warm-200/45 dark:hover:bg-white/[0.04]"
			}`}
		>
			{isActive && (
				<span
					aria-hidden="true"
					className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-terracotta"
				/>
			)}
			<button
				type="button"
				onClick={() => onSelect(session)}
				className="flex flex-col gap-0.5 min-w-0 flex-1 text-left"
			>
				{(() => {
					const streaming = isSessionStreaming(session);
					const titleText = session.title || "Untitled Chat";
					const titleClasses = `text-[13px] truncate transition-colors ${
						isActive
							? "text-terracotta dark:text-terracotta-light font-semibold"
							: "text-text-secondary font-medium group-hover:text-text-primary dark:group-hover:text-text-light"
					}`;

					if (streaming) {
						return (
							<ShinyText
								text={titleText}
								className={titleClasses}
								color="#D96C46"
								shineColor="#ffa07a"
								speed={1.2}
								delay={0.2}
								spread={130}
								direction="left"
							/>
						);
					}
					return <span className={titleClasses}>{titleText}</span>;
				})()}
				{preview && (
					<span className="text-[11px] leading-tight text-text-light truncate mt-0.5">
						{preview}
					</span>
				)}
			</button>
			<div className="flex items-center gap-1 shrink-0 pt-0.5">
				{session.isPinned && (
					<Pin
						className="w-[11px] h-[11px] text-terracotta/70"
						strokeWidth={2}
					/>
				)}
				<span
					className={`text-[10.5px] whitespace-nowrap transition-colors ${
						isActive
							? "text-terracotta/70 dark:text-terracotta-light/70"
							: "text-text-light"
					}`}
				>
					{formatRelativeTime(session.updatedAt)}
				</span>
				<button
					type="button"
					onClick={(e) => onSessionContextMenu(e, session)}
					className="flex items-center justify-center w-6 h-6 rounded-md text-text-light opacity-0 group-hover:opacity-100 hover:text-text-secondary hover:bg-black/5 dark:hover:bg-white/10 transition-all focus:opacity-100 active:scale-95"
					aria-label={`${session.title || "对话"} 更多操作`}
					title="更多操作"
				>
					<MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.75} />
				</button>
			</div>
		</div>
	);
}

// ==================
// 「展开其余 N 条」行
// ==================

export interface ThreadOverflowToggleProps {
	groupKey: string;
	expanded: boolean;
	hiddenCount: number;
	onToggleOverflow: (groupKey: string) => void;
}

export function ThreadOverflowToggle({
	groupKey,
	expanded,
	hiddenCount,
	onToggleOverflow,
}: ThreadOverflowToggleProps) {
	return (
		<button
			type="button"
			onClick={() => onToggleOverflow(groupKey)}
			className="ml-3 mt-1 inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium text-text-light hover:text-terracotta hover:bg-terracotta/8 dark:hover:bg-terracotta/[0.12] transition-all"
		>
			<ChevronDown
				className={`w-3 h-3 transition-transform duration-200 ${
					expanded ? "" : "-rotate-90"
				}`}
				strokeWidth={2.25}
			/>
			{expanded
				? `收起，仅显示最近 ${DEFAULT_VISIBLE_THREAD_COUNT} 条`
				: `展开其余 ${hiddenCount} 条`}
		</button>
	);
}

// ==================
// 虚拟化列表（大列表路径）
// ==================

const ROW_ESTIMATE = {
	header: 36,
	session: 54,
	overflow: 34,
} as const;

export interface VirtualizedThreadListProps {
	scrollParentRef: RefObject<HTMLDivElement>;
	rows: ThreadRow[];
	activeSessionId: string | null;
	onToggleCollapse: (groupKey: string) => void;
	onGroupContextMenu: (e: React.MouseEvent, group: ThreadFolderGroup) => void;
	onCreateThreadInGroup: (group: ThreadFolderGroup) => void;
	onSelectSession: (session: ChatSession) => void;
	onSessionContextMenu: (e: React.MouseEvent, session: ChatSession) => void;
	onToggleOverflow: (groupKey: string) => void;
}

export function VirtualizedThreadList({
	scrollParentRef,
	rows,
	activeSessionId,
	onToggleCollapse,
	onGroupContextMenu,
	onCreateThreadInGroup,
	onSelectSession,
	onSessionContextMenu,
	onToggleOverflow,
}: VirtualizedThreadListProps) {
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollParentRef.current,
		estimateSize: (index) => {
			const row = rows[index];
			if (row.kind === "group-header") return ROW_ESTIMATE.header;
			if (row.kind === "overflow") return ROW_ESTIMATE.overflow;
			return ROW_ESTIMATE.session;
		},
		getItemKey: (index) => {
			const row = rows[index];
			if (row.kind === "group-header") return `header:${row.group.key}`;
			if (row.kind === "overflow") return `overflow:${row.group.key}`;
			return `session:${row.session.id}`;
		},
		overscan: 10,
	});

	return (
		<div
			style={{
				height: `${virtualizer.getTotalSize()}px`,
				width: "100%",
				position: "relative",
			}}
		>
			{virtualizer.getVirtualItems().map((virtualRow) => {
				const row = rows[virtualRow.index];
				return (
					<div
						key={virtualRow.key}
						data-index={virtualRow.index}
						ref={virtualizer.measureElement}
						style={{
							position: "absolute",
							top: 0,
							left: 0,
							width: "100%",
							transform: `translateY(${virtualRow.start}px)`,
						}}
					>
						{row.kind === "group-header" ? (
							<div className={row.isGroupEnd ? "pb-3" : ""}>
								<ThreadGroupHeader
									group={row.group}
									isCollapsed={row.isCollapsed}
									groupHasActive={row.groupHasActive}
									onToggleCollapse={onToggleCollapse}
									onGroupContextMenu={onGroupContextMenu}
									onCreateThreadInGroup={onCreateThreadInGroup}
								/>
							</div>
						) : row.kind === "session" ? (
							// pl-[18px] pr-1.5 与 pt-0.5 对齐普通路径的
							// "pl-[18px] pr-1.5 pt-0.5 space-y-0.5" 缩进与行距
							<div
								className={`pl-[18px] pr-1.5 pt-0.5 ${
									row.isGroupEnd ? "pb-3" : ""
								}`}
							>
								<ThreadSessionItem
									session={row.session}
									isActive={row.session.id === activeSessionId}
									onSelect={onSelectSession}
									onSessionContextMenu={onSessionContextMenu}
								/>
							</div>
						) : (
							<div className="pl-[18px] pr-1.5 pb-3">
								<ThreadOverflowToggle
									groupKey={row.group.key}
									expanded={row.expanded}
									hiddenCount={row.hiddenCount}
									onToggleOverflow={onToggleOverflow}
								/>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
