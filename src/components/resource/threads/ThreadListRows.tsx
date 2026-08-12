/**
 * 对话列表行组件（原 ThreadsView 行渲染，F5 渲染治理）：
 *
 * 视觉基线（2026-08 第二版，对齐 Codex 侧栏的"少即是多"）：
 * - 条目只留一行标题：不显示时间戳、不显示消息预览、不显示分组计数，
 *   信息全部让位给标题本身；相对时间与预览退到原生 tooltip 里。
 * - 标题为自动占位（"xxx - 新对话" / "未命名对话"）时改用首条用户消息，
 *   避免整屏同名条目无法区分。
 * - 条目左侧留出 30px 状态列：与分组头的文件夹图标同一竖线，
 *   流式呼吸点 / 置顶图钉落在这里，标题因此与组名精确对齐。
 * - 选中态是中性灰块（不是品牌橙），品牌色只留给"正在流式"这一个动态状态。
 *
 * 结构：
 * - ThreadGroupHeader / ThreadSessionItem / ThreadOverflowToggle 由小列表
 *   （普通渲染路径）与大列表（虚拟化路径）共用，两条路径共享 THREAD_ROW_PAD。
 * - VirtualizedThreadList：@tanstack/react-virtual 驱动的扁平化行渲染
 *   （标题行 / 会话行 / 展开更多行混排），动态行高用 measureElement 实测。
 */
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	Archive,
	ChevronDown,
	Folder,
	MessagesSquare,
	MoreHorizontal,
	Pin,
	Plus,
} from "lucide-react";
import type { RefObject } from "react";
import type { ChatSession } from "../../../lib/chat/types";
import { ShinyText } from "../../ui/ShinyText";
import {
	formatAbsoluteTime,
	formatRelativeTime,
	getSessionDisplayTitle,
	getSessionPreview,
	isEmptyDraftSession,
	type ThreadFolderGroup,
} from "./threadGrouping";
import { isSessionStreaming, type ThreadRow } from "./threadListModel";

/** 组内行的水平内边距（两条渲染路径共用，保证像素一致） */
export const THREAD_ROW_PAD = "px-0";
/** 组之间的呼吸间距 */
export const THREAD_GROUP_GAP = "pb-3";

/**
 * 条目文字的左缩进 = 分组头的 padding(8) + 图标(14) + gap(8)。
 * 让"组名"和"对话标题"落在同一条竖线上，同时把图标那一列腾给
 * 流式呼吸点 / 置顶图钉。
 */
const TITLE_INDENT = "pl-[30px]";

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
	const GroupIcon =
		group.source === "archive"
			? Archive
			: group.source === "remote"
				? MessagesSquare
				: Folder;

	return (
		<div
			onContextMenu={(e) => {
				e.preventDefault();
				onGroupContextMenu(e, group);
			}}
			className="group flex h-8 w-full items-center gap-1 rounded-lg px-2 transition-colors duration-150 hover:bg-warm-200/40 dark:hover:bg-white/[0.03]"
		>
			<button
				type="button"
				onClick={() => onToggleCollapse(group.key)}
				className="flex min-w-0 flex-1 items-center gap-2 text-left"
				aria-expanded={!isCollapsed}
				aria-label={`${group.folderName} 分组`}
			>
				{/* 图标位：静止时是文件夹，hover 时原地换成折叠箭头 */}
				<span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
					<GroupIcon
						className="h-3.5 w-3.5 text-text-muted transition-opacity duration-150 group-hover:opacity-0"
						strokeWidth={1.5}
					/>
					<ChevronDown
						className={`absolute h-3.5 w-3.5 text-text-secondary opacity-0 transition-[opacity,transform] duration-150 group-hover:opacity-100 ${
							isCollapsed ? "-rotate-90" : ""
						}`}
						strokeWidth={2}
					/>
				</span>
				<span
					className={`truncate text-[13px] font-medium transition-colors ${
						groupHasActive ? "text-text-secondary" : "text-text-muted"
					}`}
					title={group.folderPath || group.folderName}
				>
					{group.folderName}
				</span>
				{/* 折叠后条目全部隐藏，这时才补一个计数 */}
				{isCollapsed && (
					<span className="shrink-0 text-[11px] tabular-nums text-text-light">
						{group.sessions.length}
					</span>
				)}
			</button>
			{group.isPinned && (
				<Pin
					className="h-3 w-3 shrink-0 text-text-light transition-opacity group-hover:opacity-0"
					strokeWidth={1.75}
				/>
			)}
			{group.source === "local" && group.folderPath ? (
				<button
					type="button"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onCreateThreadInGroup(group);
					}}
					className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-text-light opacity-0 transition-all hover:bg-black/[0.06] hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none active:scale-90 group-hover:opacity-100 dark:hover:bg-white/10"
					aria-label={`在 ${group.folderName} 新建对话`}
					title="在此目录新建对话"
				>
					<Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
				</button>
			) : null}
			<button
				type="button"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					onGroupContextMenu(e, group);
				}}
				className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-text-light opacity-0 transition-all hover:bg-black/[0.06] hover:text-text-primary focus-visible:opacity-100 active:scale-90 group-hover:opacity-100 dark:hover:bg-white/10"
				aria-label={`${group.folderName} 更多操作`}
				title="更多操作"
			>
				<MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
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
	const streaming = isSessionStreaming(session);
	const title = getSessionDisplayTitle(session);
	const preview = getSessionPreview(session);
	const isEmptyDraft = isEmptyDraftSession(session);
	// 时间与预览退到 tooltip：列表里一行只讲一件事
	const tooltip = [
		title,
		preview && preview !== title ? preview : "",
		`${formatRelativeTime(session.updatedAt)} · ${formatAbsoluteTime(
			session.updatedAt,
		)}`,
	]
		.filter(Boolean)
		.join("\n");

	return (
		<div
			onContextMenu={(e) => onSessionContextMenu(e, session)}
			className={`group relative w-full rounded-lg transition-colors duration-150 ${
				isActive
					? "bg-warm-200 dark:bg-white/[0.08]"
					: "hover:bg-warm-200/55 dark:hover:bg-white/[0.04]"
			}`}
		>
			{/* 状态列：与分组头的文件夹图标同一竖线 */}
			{streaming ? (
				<span
					aria-hidden="true"
					className="absolute left-[12px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 animate-pulse rounded-full bg-terracotta"
				/>
			) : session.isPinned ? (
				<Pin
					aria-hidden="true"
					className="absolute left-[10px] top-1/2 h-3 w-3 -translate-y-1/2 text-text-light"
					strokeWidth={1.75}
				/>
			) : null}
			<button
				type="button"
				onClick={() => onSelect(session)}
				title={tooltip}
				className={`block w-full ${TITLE_INDENT} py-[9px] pr-2.5 text-left transition-[padding] duration-150 group-hover:pr-9`}
			>
				{streaming ? (
					<ShinyText
						text={title}
						className="block truncate text-[14px] leading-5 text-text-primary"
						color="#D96C46"
						shineColor="#ffa07a"
						speed={1.2}
						delay={0.2}
						spread={130}
						direction="left"
					/>
				) : (
					<span
						className={`block overflow-hidden whitespace-nowrap text-[14px] leading-5 [mask-image:linear-gradient(to_right,#000_calc(100%-42px),transparent)] ${
							isEmptyDraft ? "text-text-muted" : "text-text-primary"
						} ${isActive ? "font-medium" : ""}`}
					>
						{title}
					</span>
				)}
			</button>
			<button
				type="button"
				onClick={(e) => onSessionContextMenu(e, session)}
				className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-[7px] text-text-light opacity-0 transition-all hover:bg-black/[0.06] hover:text-text-primary focus:opacity-100 active:scale-90 group-hover:opacity-100 dark:hover:bg-white/10"
				aria-label={`${title} 更多操作`}
				title="更多操作"
			>
				<MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.75} />
			</button>
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
			// pl-[10px] + 图标 14 + gap 6 = 30，文字与对话标题落在同一条竖线上
			className="flex w-full items-center gap-1.5 rounded-lg py-[6px] pl-[10px] pr-2.5 text-left text-[12.5px] text-text-light transition-colors hover:bg-warm-200/45 hover:text-text-secondary dark:hover:bg-white/[0.03]"
		>
			<ChevronDown
				className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
					expanded ? "" : "-rotate-90"
				}`}
				strokeWidth={2}
			/>
			{expanded ? "收起" : `其余 ${hiddenCount} 条`}
		</button>
	);
}

// ==================
// 虚拟化列表（大列表路径）
// ==================

const ROW_ESTIMATE = {
	header: 32,
	session: 38,
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
				const tailClass = row.isGroupEnd ? THREAD_GROUP_GAP : "";
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
							<div className={tailClass}>
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
							<div className={`${THREAD_ROW_PAD} ${tailClass}`}>
								<ThreadSessionItem
									session={row.session}
									isActive={row.session.id === activeSessionId}
									onSelect={onSelectSession}
									onSessionContextMenu={onSessionContextMenu}
								/>
							</div>
						) : (
							<div className={`${THREAD_ROW_PAD} ${tailClass}`}>
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
