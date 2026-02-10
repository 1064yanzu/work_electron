import { Square } from "lucide-react";
import type { RemoteSessionInfo } from "../../../../lib/api";
import { Button } from "../../../ui/Button";
import { RemoteStatusBadge } from "./RemoteStatusBadge";

function stateTone(state: string): "green" | "amber" | "red" | "zinc" {
	if (state === "running") return "green";
	if (state === "waiting_interaction") return "amber";
	if (state === "error") return "red";
	return "zinc";
}

function formatTs(ts: number): string {
	const d = new Date(ts);
	if (Number.isNaN(d.getTime())) return "-";
	return d.toLocaleString();
}

export function SessionList(props: {
	sessions: RemoteSessionInfo[];
	busyRunId?: string | null;
	onStop: (runId: string) => void;
}) {
	if (props.sessions.length === 0) {
		return (
			<p className="rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-xs text-text-muted dark:border-zinc-700">
				暂无远程会话
			</p>
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
				return (
					<div
						key={item.session_id}
						className="rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900"
					>
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0 space-y-1">
								<div className="flex items-center gap-2">
									<RemoteStatusBadge
										text={item.state}
										tone={stateTone(item.state)}
									/>
									<span className="text-text-muted">{item.channel_id}</span>
								</div>
								<div className="font-medium text-text-primary">
									{item.prompt_preview}
								</div>
								<div className="text-text-muted">
									runId={runId || "-"} · 更新于 {formatTs(item.updated_at)}
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
