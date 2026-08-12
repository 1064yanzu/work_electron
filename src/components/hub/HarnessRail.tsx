/**
 * HarnessRail —— Hub 顶部的入口轨道，同时也是**拖拽接力的落点**。
 *
 * 交互核心：把左侧时间线上的任意一段会话拖到这里的某个入口上，松手即开始接力。
 * 这替代了原来「点接力 → 选目标 → 确认」的三步弹窗——目标就在眼前，
 * 拖过去是最短路径，也最容易理解「这段会话要去那边继续」。
 *
 * 每个入口如实展示三件事：可不可用、有多少段会话、是不是正处于限额中。
 * 限额是自动检测出来的，鼠标悬停能看到判定依据的原文，用户可以自己否决。
 *
 * 此外，正在运行的入口会带一个实时状态点（在跑 / 出错 / 无响应）。
 * 数据来自运行态监测，与「运行」面板同一份订阅——不会出现面板说在跑、
 * 轨道上却是灰的这种自相矛盾。
 */
import { AlertTriangle, Globe, Sparkles, Terminal } from "lucide-react";
import { cn } from "../../lib/utils";
import type { HarnessRuntimeState } from "../../lib/api/harnessAutomation";
import { RUNTIME_STATE_META } from "./automation/automationUtils";
import type { HubEntry } from "./hubUtils";
import { SESSION_DRAG_MIME } from "./hubUtils";

function EntryIcon({ kind }: { kind: HubEntry["kind"] }) {
	if (kind === "cli")
		return <Terminal className="w-3.5 h-3.5" strokeWidth={1.6} />;
	if (kind === "web")
		return <Globe className="w-3.5 h-3.5" strokeWidth={1.6} />;
	return <Sparkles className="w-3.5 h-3.5" strokeWidth={1.6} />;
}

export function HarnessRail({
	entries,
	activeFilter,
	dropTargetId,
	runtimeStates,
	onFilter,
	onDropSession,
	onDragOverEntry,
	onDragLeaveRail,
}: {
	entries: HubEntry[];
	/** 当前时间线筛选的 harness（null = 全部） */
	activeFilter: string | null;
	/** 正被拖拽悬停的入口 id */
	dropTargetId: string | null;
	/** harness → 当前运行态；没有条目表示这个入口现在没在跑 */
	runtimeStates?: Map<string, HarnessRuntimeState>;
	onFilter: (harness: string | null) => void;
	onDropSession: (sessionId: string, entry: HubEntry) => void;
	onDragOverEntry: (entryId: string | null) => void;
	onDragLeaveRail: () => void;
}) {
	return (
		<div
			className="flex items-stretch gap-1.5 overflow-x-auto scrollbar-hide px-5 pb-3"
			onDragLeave={(event) => {
				// 只有真的离开整条轨道才清高亮，否则在子元素之间移动会不断闪烁
				if (!event.currentTarget.contains(event.relatedTarget as Node)) {
					onDragLeaveRail();
				}
			}}
		>
			<button
				type="button"
				onClick={() => onFilter(null)}
				className={cn(
					"shrink-0 px-3 py-2 rounded-xl border text-left transition duration-150",
					activeFilter === null
						? "border-terracotta/40 bg-terracotta/[0.07]"
						: "border-border/70 hover:border-border hover:bg-warm-200/40 dark:hover:bg-cream-800/30",
				)}
			>
				<div className="text-[11.5px] font-medium text-text-primary">全部</div>
				<div className="text-[11px] text-text-light mt-0.5">所有入口</div>
			</button>

			{entries.map((entry) => {
				const isDropTarget = dropTargetId === entry.id;
				const isActive = activeFilter === entry.harness;
				const canReceive = entry.available && !entry.blocked;
				const runtimeState = runtimeStates?.get(entry.harness);
				const runtimeMeta = runtimeState
					? RUNTIME_STATE_META[runtimeState]
					: null;

				return (
					<button
						key={entry.id}
						type="button"
						onClick={() => onFilter(isActive ? null : entry.harness)}
						onDragOver={(event) => {
							if (!canReceive) return;
							// 必须 preventDefault 才会触发 drop
							event.preventDefault();
							event.dataTransfer.dropEffect = "copy";
							onDragOverEntry(entry.id);
						}}
						onDrop={(event) => {
							event.preventDefault();
							onDragOverEntry(null);
							if (!canReceive) return;
							const sessionId = event.dataTransfer.getData(SESSION_DRAG_MIME);
							if (sessionId) onDropSession(sessionId, entry);
						}}
						title={
							runtimeMeta
								? `${entry.label} · ${runtimeMeta.label}`
								: entry.blocked && entry.blockedEvidence
									? `检测到限额提示：${entry.blockedEvidence}`
									: entry.available
										? `${entry.label} · ${entry.sessionCount} 段会话`
										: `${entry.label} 当前不可用`
						}
						className={cn(
							"group relative shrink-0 min-w-[112px] px-3 py-2 rounded-xl border text-left transition duration-150",
							isDropTarget
								? "border-terracotta bg-terracotta/[0.14] scale-[1.03] shadow-sm"
								: isActive
									? "border-terracotta/40 bg-terracotta/[0.07]"
									: "border-border/70 hover:border-border hover:bg-warm-200/40 dark:hover:bg-cream-800/30",
							!entry.available && "opacity-45",
						)}
					>
						<div className="flex items-center gap-1.5">
							<span
								className={cn(
									"text-text-light",
									(isActive || isDropTarget) && "text-terracotta",
								)}
							>
								<EntryIcon kind={entry.kind} />
							</span>
							<span className="text-[11.5px] font-medium text-text-primary truncate">
								{entry.label}
							</span>
							{/* 正在跑的入口带一个实时状态点。出错时它比限额三角更要紧，故排在前 */}
							{runtimeMeta && (
								<span
									className={cn(
										"w-1.5 h-1.5 rounded-full shrink-0",
										runtimeMeta.dot,
										runtimeState === "working" && "animate-pulse",
									)}
								/>
							)}
							{entry.blocked && (
								<AlertTriangle
									className="w-3 h-3 text-warning shrink-0"
									strokeWidth={1.8}
								/>
							)}
						</div>
						<div className="text-[11px] text-text-light mt-0.5 tabular-nums">
							{runtimeMeta
								? runtimeMeta.label
								: entry.blocked
									? "限额中"
									: entry.available
										? `${entry.sessionCount} 段`
										: entry.kind === "cli"
											? "未安装"
											: "未启用"}
						</div>

						{/* 拖拽悬停时的落点提示 */}
						{isDropTarget && (
							<div className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-terracotta" />
						)}
					</button>
				);
			})}
		</div>
	);
}
