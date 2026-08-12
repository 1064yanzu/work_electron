/**
 * SessionDetail —— Hub 右侧的会话详情面板。
 *
 * 展示一段会话的转录，并给出两组动作：
 * - **接力到某个入口**（与拖拽等价的键盘可达路径——拖拽好用但不该是唯一入口）
 * - **导出为交换文件**（把上下文变成一个可以到处搬的文件）
 *
 * 转录只拉尾部若干条：Hub 是总览，要读全文有左栏的转录覆盖层。
 */
import { useEffect, useState } from "react";
import { ArrowUpRight, Loader2, MessageSquare } from "lucide-react";
import {
	getHarnessSession,
	type HarnessMessageRow,
	type HarnessSessionRow,
} from "../../lib/api";
import { cn } from "../../lib/utils";
import {
	formatRelativeTime,
	sessionTitle,
	shortCwd,
	type HubEntry,
} from "./hubUtils";

/** 详情里最多展示的消息数（要读全文去左栏的转录覆盖层）。 */
const DETAIL_LIMIT = 60;

export function SessionDetail({
	session,
	labelOf,
	entries,
	onHandoff,
}: {
	session: HarnessSessionRow | null;
	labelOf: (harness: string) => string;
	entries: HubEntry[];
	onHandoff: (target: HubEntry) => void;
}) {
	const [messages, setMessages] = useState<HarnessMessageRow[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!session) {
			setMessages([]);
			return;
		}
		let cancelled = false;
		setLoading(true);
		setError(null);
		void getHarnessSession(session.id, { limit: DETAIL_LIMIT })
			.then((result) => {
				if (cancelled) return;
				setMessages(result.messages);
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				setError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [session]);

	if (!session) {
		return (
			<div className="flex flex-col items-center justify-center h-full px-8 text-center">
				<div className="w-11 h-11 rounded-2xl bg-terracotta/[0.07] flex items-center justify-center mb-3">
					<MessageSquare
						className="w-5 h-5 text-terracotta/60"
						strokeWidth={1.5}
					/>
				</div>
				<p className="text-xs text-text-secondary">从左侧选一段会话</p>
				<p className="text-[11px] text-text-light mt-1.5 leading-relaxed max-w-[260px]">
					或者直接把它拖到顶部的任意入口上——那是接力最快的路径
				</p>
			</div>
		);
	}

	const targets = entries.filter((e) => e.available && !e.blocked);

	return (
		<div className="flex flex-col h-full min-h-0">
			{/* 概要 */}
			<div className="px-5 pt-4 pb-3 shrink-0 border-b border-border/50">
				<div className="text-[11px] font-medium tracking-wide text-text-light uppercase">
					{labelOf(session.harness)}
				</div>
				<h3 className="text-sm text-text-primary mt-1 leading-snug">
					{sessionTitle(session)}
				</h3>
				<div className="flex items-center gap-1.5 text-[11px] text-text-light mt-1">
					<span className="tabular-nums">{session.message_count} 条消息</span>
					{session.cwd && (
						<>
							<span className="text-text-light/50">·</span>
							<span className="truncate" title={session.cwd}>
								{shortCwd(session.cwd)}
							</span>
						</>
					)}
					<span className="text-text-light/50">·</span>
					<span>{formatRelativeTime(session.updated_at)}</span>
				</div>

				{/* 接力目标（拖拽的键盘可达等价物） */}
				<div className="mt-3">
					<div className="text-[11px] font-medium tracking-wide text-text-light uppercase mb-1.5">
						接力到
					</div>
					<div className="flex flex-wrap gap-1">
						{targets.map((target) => (
							<button
								key={target.id}
								type="button"
								onClick={() => onHandoff(target)}
								className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border/70 text-xs text-text-muted hover:text-text-primary hover:border-terracotta/40 hover:bg-terracotta/[0.06] transition duration-150"
							>
								{target.label}
								<ArrowUpRight className="w-2.5 h-2.5" />
							</button>
						))}
						{targets.length === 0 && (
							<span className="text-[11px] text-text-light">
								当前没有可用入口
							</span>
						)}
					</div>
				</div>
			</div>

			{/* 转录 */}
			<div className="flex-1 overflow-y-auto scrollbar-hide px-5 py-3 space-y-2.5">
				{loading && (
					<div className="flex items-center justify-center gap-2 py-10 text-xs text-text-light">
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
						正在加载转录…
					</div>
				)}
				{error && (
					<div className="px-3 py-2 rounded-lg bg-error/8 border border-error/20 text-xs text-error">
						{error}
					</div>
				)}
				{!loading &&
					messages.map((message) => (
						<div key={message.id} className="min-w-0">
							<div
								className={cn(
									"text-[11px] font-medium tracking-wide uppercase mb-0.5",
									message.role === "user"
										? "text-terracotta/80"
										: "text-text-light",
								)}
							>
								{message.role === "user"
									? "用户"
									: message.role === "assistant"
										? "助手"
										: "系统"}
							</div>
							<p className="text-xs leading-relaxed text-text-secondary whitespace-pre-wrap break-words">
								{message.content.length > 900
									? `${message.content.slice(0, 900)}…`
									: message.content}
							</p>
						</div>
					))}
				{!loading && !error && messages.length === 0 && (
					<p className="text-xs text-text-light text-center py-10">
						这段会话没有可读转录
					</p>
				)}
				{!loading && session.message_count > messages.length && (
					<p className="text-[11px] text-text-light/80 text-center pt-2">
						共 {session.message_count} 条，此处只显示最早 {messages.length} 条
					</p>
				)}
			</div>
		</div>
	);
}
