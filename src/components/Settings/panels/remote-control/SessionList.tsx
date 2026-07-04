import { Square } from "lucide-react";
import type { RemoteSessionInfo } from "../../../../lib/api";
import { Button } from "../../../ui/Button";

function stateTone(state: string): {
	bg: string;
	text: string;
	dot: string;
	dotAnimate: boolean;
} {
	if (state === "running")
		return {
			bg: "bg-mint-500/10",
			text: "text-mint-600",
			dot: "bg-mint-500",
			dotAnimate: true,
		};
	if (state === "waiting_interaction")
		return {
			bg: "bg-peach-500/10",
			text: "text-peach-500",
			dot: "bg-peach-500",
			dotAnimate: true,
		};
	if (state === "error")
		return {
			bg: "bg-error/8",
			text: "text-error",
			dot: "bg-error",
			dotAnimate: false,
		};
	return {
		bg: "bg-warm-200",
		text: "text-text-secondary",
		dot: "bg-cream-500",
		dotAnimate: false,
	};
}

function formatTs(ts: number): string {
	const d = new Date(ts);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString();
}

export function SessionList(props: {
	sessions: RemoteSessionInfo[];
	busyRunId?: string | null;
	onStop: (runId: string) => void;
}) {
	if (props.sessions.length === 0) {
		return (
			<div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-text-muted">
				<p className="text-text-muted">暂无远程会话</p>
			</div>
		);
	}

	return (
		<div className="space-y-2">
			{props.sessions.map((item) => {
				const runId = item.run_id ?? "";
				const canStop =
					!!runId &&
					(item.state === "running" || item.state === "waiting_interaction");
				const isBusy = props.busyRunId === runId;
				const tone = stateTone(item.state);
				return (
					<div
						key={item.session_id}
						className="group rounded-xl border border-border bg-surface p-3.5 text-xs transition-[color,background-color,border-color,box-shadow] duration-200 ease-out hover:border-cream-400 hover:shadow-sm"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0 space-y-1.5">
								<div className="flex items-center gap-2">
									<span
										className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium ${tone.bg} ${tone.text}`}
										style={{ borderColor: "transparent" }}
									>
										<span
											className={`h-1.5 w-1.5 rounded-full ${tone.dot} ${tone.dotAnimate ? "animate-pulse" : ""}`}
										/>
										{item.state}
									</span>
									<span className="inline-flex items-center rounded-md bg-warm-200 px-1.5 py-0.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
										{item.channel_id}
									</span>
								</div>
								<div className="font-medium text-text-primary">
									{item.prompt_preview}
								</div>
								<div className="text-text-muted flex items-center gap-2">
									<span className="font-mono text-[10px] bg-warm-200 px-1.5 py-0.5 rounded">
										{runId || "—"}
									</span>
									<span>更新于 {formatTs(item.updated_at)}</span>
								</div>
							</div>
							<Button
								size="sm"
								variant="outline"
								disabled={!canStop || isBusy}
								onClick={() => {
									if (!runId) return;
									props.onStop(runId);
								}}
							>
								<Square className="h-3.5 w-3.5" />
								停止
							</Button>
						</div>
					</div>
				);
			})}
		</div>
	);
}
