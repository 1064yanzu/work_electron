/**
 * HubTimeline —— 跨入口的统一会话时间线。
 *
 * 全部入口的会话混在一条流里按时间倒序排。这是 Hub 的立论：用户的 AI 工作
 * 本来就是一条连续的线，被工具切成了几段而已。分栏展示会强化割裂感，
 * 混排才还原真实。
 *
 * 每一行都是**拖拽源**：拖到顶部任意入口上即完成接力。
 */
import { ArrowUpRight, FileUp, Loader2, RotateCcw, Trash2 } from "lucide-react";
import type { HarnessSessionRow } from "../../lib/api";
import { cn } from "../../lib/utils";
import {
	SESSION_DRAG_MIME,
	formatRelativeTime,
	sessionTitle,
	shortCwd,
} from "./hubUtils";

export function HubTimeline({
	sessions,
	loading,
	labelOf,
	activeSessionId,
	resumableIds,
	onSelect,
	onResume,
	onExport,
	onDelete,
	onDragStart,
	onDragEnd,
}: {
	sessions: HarnessSessionRow[];
	loading: boolean;
	labelOf: (harness: string) => string;
	activeSessionId: string | null;
	/** 支持原生续接（无损）的会话 id 集合 */
	resumableIds: Set<string>;
	onSelect: (session: HarnessSessionRow) => void;
	onResume: (session: HarnessSessionRow) => void;
	onExport: (session: HarnessSessionRow) => void;
	onDelete: (session: HarnessSessionRow) => void;
	onDragStart: (session: HarnessSessionRow) => void;
	onDragEnd: () => void;
}) {
	if (loading && sessions.length === 0) {
		return (
			<div className="flex items-center justify-center gap-2 py-20 text-xs text-text-light">
				<Loader2 className="w-3.5 h-3.5 animate-spin" />
				正在加载会话…
			</div>
		);
	}

	if (sessions.length === 0) {
		return (
			<div className="px-6 py-20 text-center">
				<p className="text-xs text-text-secondary">这里还没有会话</p>
				<p className="text-xs text-text-light mt-2 leading-relaxed">
					用顶部的「摄取」从本机 Claude Code / Codex 拉取，
					<br />
					或用「导入」读一个 ChatGPT 导出包
				</p>
			</div>
		);
	}

	return (
		<ul className="px-2 pb-8">
			{sessions.map((session) => {
				const isActive = activeSessionId === session.id;
				const resumable = resumableIds.has(session.id);
				return (
					<li key={session.id}>
						{/* 整行可拖：拖到顶部入口上即接力 */}
						<div
							role="button"
							tabIndex={0}
							draggable
							onDragStart={(event) => {
								event.dataTransfer.effectAllowed = "copy";
								event.dataTransfer.setData(SESSION_DRAG_MIME, session.id);
								// 部分平台要求同时设置 text/plain 才会启动拖拽
								event.dataTransfer.setData("text/plain", sessionTitle(session));
								onDragStart(session);
							}}
							onDragEnd={onDragEnd}
							onClick={() => onSelect(session)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									onSelect(session);
								}
							}}
							className={cn(
								"group relative w-full text-left px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing transition duration-150",
								isActive
									? "bg-terracotta/[0.07]"
									: "hover:bg-warm-200/50 dark:hover:bg-cream-800/30",
							)}
						>
							{/* 左侧入口色标：一眼看出这段来自哪儿 */}
							<div
								className={cn(
									"absolute left-0 top-3 bottom-3 w-[2px] rounded-full transition duration-150",
									isActive
										? "bg-terracotta"
										: "bg-border group-hover:bg-text-light/50",
								)}
							/>

							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-1.5">
										<span className="text-[11px] font-medium tracking-wide text-text-light uppercase shrink-0">
											{labelOf(session.harness)}
										</span>
										{resumable && (
											<span
												className="text-[11px] px-1 py-px rounded bg-success/10 text-success shrink-0"
												title="该会话可原生续接：直接载入原会话，上下文无损"
											>
												可无损续接
											</span>
										)}
									</div>
									<div className="text-xs text-text-primary truncate mt-0.5">
										{sessionTitle(session)}
									</div>
									<div className="flex items-center gap-1.5 text-[11px] text-text-light mt-0.5">
										<span className="tabular-nums">
											{session.message_count} 条
										</span>
										{session.cwd && (
											<>
												<span className="text-text-light/50">·</span>
												<span className="truncate">
													{shortCwd(session.cwd)}
												</span>
											</>
										)}
										<span className="text-text-light/50">·</span>
										<span className="shrink-0">
											{formatRelativeTime(session.updated_at)}
										</span>
									</div>
								</div>

								{/* 悬停操作：续接 / 导出 / 删除 */}
								<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition duration-150 shrink-0">
									{resumable && (
										<IconAction
											label="原生续接"
											onClick={() => onResume(session)}
										>
											<RotateCcw className="w-3 h-3" />
										</IconAction>
									)}
									<IconAction
										label="导出为交换文件"
										onClick={() => onExport(session)}
									>
										<FileUp className="w-3 h-3" />
									</IconAction>
									<IconAction
										label="移除本地记录"
										danger
										onClick={() => onDelete(session)}
									>
										<Trash2 className="w-3 h-3" />
									</IconAction>
								</div>
							</div>

							{/* 拖拽引导：只在悬停时轻声提示一次，不做常驻噪音 */}
							<div className="pointer-events-none absolute right-3 bottom-1 text-[11px] text-text-light/0 group-hover:text-text-light/60 transition duration-150 flex items-center gap-0.5">
								<ArrowUpRight className="w-2.5 h-2.5" />
								拖到上方入口即接力
							</div>
						</div>
					</li>
				);
			})}
		</ul>
	);
}

function IconAction({
	children,
	label,
	danger,
	onClick,
}: {
	children: React.ReactNode;
	label: string;
	danger?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			title={label}
			onClick={(event) => {
				event.stopPropagation();
				onClick();
			}}
			className={cn(
				"p-1.5 rounded-lg transition duration-150",
				danger
					? "text-text-light hover:text-error hover:bg-error/8"
					: "text-text-light hover:text-text-secondary hover:bg-warm-200/70 dark:hover:bg-cream-800/40",
			)}
		>
			{children}
		</button>
	);
}
