import { Check, RefreshCcw, X } from "lucide-react";
import type {
	RemotePairingRecord,
	RemotePairingRequest,
} from "../../../../lib/api";
import { Button } from "../../../ui/Button";

function formatTs(ts?: number): string {
	if (!ts) return "—";
	const d = new Date(ts);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString();
}

export function PairingList(props: {
	pending: RemotePairingRequest[];
	records: RemotePairingRecord[];
	onApprove: (requestId: string) => void;
	onReject: (requestId: string) => void;
	onRevoke: (channelId: string, peerId: string) => void;
	busyRequestId?: string | null;
	busyRevokeKey?: string | null;
}) {
	return (
		<div className="space-y-6">
			{/* 待审批 */}
			<div>
				<div className="mb-3 flex items-center justify-between">
					<h5 className="text-sm font-medium text-text-primary">待审批配对</h5>
					<span
						className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
							props.pending.length > 0
								? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
								: "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
						}`}
					>
						<span
							className={`h-1.5 w-1.5 rounded-full ${
								props.pending.length > 0
									? "bg-amber-500 animate-pulse"
									: "bg-zinc-400"
							}`}
						/>
						{props.pending.length} 条
					</span>
				</div>
				{props.pending.length === 0 ? (
					<div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-text-muted dark:border-zinc-700">
						<p className="text-text-muted">暂无待审批请求</p>
					</div>
				) : (
					<div className="space-y-2">
						{props.pending.map((item) => {
							const isBusy = props.busyRequestId === item.request_id;
							return (
								<div
									key={item.request_id}
									className="group rounded-xl border border-zinc-200 bg-white p-3.5 text-xs transition-all duration-200 hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<div className="font-medium text-text-primary flex items-center gap-2">
												<span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
													{item.channel_id}
												</span>
												{item.peer_name || item.peer_id}
											</div>
											<div className="mt-1.5 text-text-muted flex items-center gap-2">
												<span className="font-mono text-[10px] bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
													{item.code}
												</span>
												<span>到期 {formatTs(item.expires_at)}</span>
											</div>
										</div>
										<div className="flex items-center gap-2">
											<Button
												size="sm"
												variant="outline"
												disabled={isBusy}
												onClick={() => props.onReject(item.request_id)}
											>
												<X className="h-3.5 w-3.5" />
												拒绝
											</Button>
											<Button
												size="sm"
												disabled={isBusy}
												onClick={() => props.onApprove(item.request_id)}
											>
												<Check className="h-3.5 w-3.5" />
												批准
											</Button>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			{/* 已授权 */}
			<div>
				<div className="mb-3 flex items-center justify-between">
					<h5 className="text-sm font-medium text-text-primary">已授权配对</h5>
					<span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
						{props.records.length} 条
					</span>
				</div>
				{props.records.length === 0 ? (
					<div className="rounded-xl border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-text-muted dark:border-zinc-700">
						<p className="text-text-muted">暂无已授权配对</p>
					</div>
				) : (
					<div className="space-y-2">
						{props.records.map((item) => {
							const key = `${item.channel_id}:${item.peer_id}`;
							const isBusy = props.busyRevokeKey === key;
							return (
								<div
									key={item.pairing_id}
									className="group rounded-xl border border-zinc-200 bg-white p-3.5 text-xs transition-all duration-200 hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<div className="font-medium text-text-primary flex items-center gap-2">
												<span className="inline-flex items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
													{item.channel_id}
												</span>
												{item.peer_name || item.peer_id}
											</div>
											<div className="mt-1.5 text-text-muted">
												批准于 {formatTs(item.approved_at)} · by{" "}
												{item.approved_by}
											</div>
										</div>
										<Button
											size="sm"
											variant="outline"
											disabled={isBusy || item.status !== "approved"}
											onClick={() =>
												props.onRevoke(item.channel_id, item.peer_id)
											}
										>
											<RefreshCcw className="h-3.5 w-3.5" />
											撤销
										</Button>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
