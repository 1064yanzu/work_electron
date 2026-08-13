import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ScrollText } from "lucide-react";
import { listRemoteEventLogs, type RemoteEventLog } from "../../../../lib/api";

const LEVEL_STYLES: Record<string, { text: string; badge: string }> = {
	info: {
		text: "text-text-secondary",
		badge: "bg-warm-200 text-text-muted",
	},
	warn: {
		text: "text-peach-500",
		badge: "bg-peach-500/10 text-peach-500",
	},
	error: {
		text: "text-error",
		badge: "bg-error/8 text-error",
	},
};

const LEVEL_LABELS: Record<string, string> = {
	info: "INFO",
	warn: "WARN",
	error: "ERR",
};

function formatTime(ts: number): string {
	const d = new Date(ts);
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	const ss = String(d.getSeconds()).padStart(2, "0");
	return `${hh}:${mm}:${ss}`;
}

export function EventLogPanel() {
	const [logs, setLogs] = useState<RemoteEventLog[]>([]);
	const [expanded, setExpanded] = useState(false);
	const [unsupportedHint, setUnsupportedHint] = useState<string | null>(null);
	const bottomRef = useRef<HTMLDivElement>(null);
	const stopPollingRef = useRef(false);

	const refresh = useCallback(async () => {
		if (stopPollingRef.current) return;
		try {
			const next = await listRemoteEventLogs(50);
			setLogs(next);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (
				message.includes(
					"No handler registered for 'list_remote_event_logs'",
				) ||
				message.includes("No handler registered")
			) {
				stopPollingRef.current = true;
				setUnsupportedHint(
					"当前主进程版本不支持活动日志接口（list_remote_event_logs）。",
				);
			}
		}
	}, []);

	useEffect(() => {
		// 折叠时不启动轮询，避免设置面板常驻 5s tick。
		if (!expanded) return;
		void refresh();
		let timer: number | null = window.setInterval(() => {
			// 标签页隐藏时跳过一次刷新（IPC 仍在主进程持续记录，重新可见后立即拉一次）。
			if (document.visibilityState !== "visible") return;
			void refresh();
		}, 5000);
		const onVisibility = () => {
			if (document.visibilityState === "visible") void refresh();
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			if (timer !== null) {
				clearInterval(timer);
				timer = null;
			}
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [expanded, refresh]);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [logs.length]);

	return (
		<div className="rounded-xl border border-border bg-warm-200/40 overflow-hidden">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
			>
				<ScrollText className="h-4 w-4" />
				<span>活动日志</span>
				<span className="ml-auto inline-flex items-center rounded-full bg-warm-300 px-2 py-0.5 text-2xs font-semibold tabular-nums">
					{logs.length}
				</span>
				<ChevronDown
					className={`h-4 w-4 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
				/>
			</button>
			{expanded && (
				<div className="max-h-52 overflow-y-auto border-t border-border font-mono text-xs">
					{unsupportedHint ? (
						<div className="px-4 py-3 text-xs text-peach-500 bg-peach-500/10 border-b border-peach-500/20">
							{unsupportedHint}
						</div>
					) : null}
					{logs.length === 0 ? (
						<div className="px-4 py-6 text-center text-text-muted">
							暂无日志
						</div>
					) : (
						<div>
							{logs.map((log, i) => {
								const style = LEVEL_STYLES[log.level] ?? LEVEL_STYLES.info;
								return (
									<div
										key={`${log.timestamp}-${i}`}
										className="flex gap-2.5 px-4 py-1.5 hover:bg-warm-200/60 transition-colors"
									>
										<span className="shrink-0 text-text-muted tabular-nums">
											{formatTime(log.timestamp)}
										</span>
										<span
											className={`shrink-0 inline-flex items-center justify-center w-9 rounded-lg px-1 py-0.5 text-2xs font-bold uppercase ${style.badge}`}
										>
											{LEVEL_LABELS[log.level] ?? log.level}
										</span>
										<span className="shrink-0 text-text-muted min-w-[56px]">
											{log.source}
										</span>
										<span className="text-text-primary break-all">
											{log.message}
										</span>
									</div>
								);
							})}
							<div ref={bottomRef} />
						</div>
					)}
				</div>
			)}
		</div>
	);
}
