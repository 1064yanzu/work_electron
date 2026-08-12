import { Check, RefreshCcw, X } from "lucide-react";
import type {
	RemotePairingRecord,
	RemotePairingRequest,
} from "../../../../lib/api";
import { Button } from "../../../ui/Button";
import { EmptyState } from "../../../ui/EmptyState";

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
								? "border-peach-500/30 bg-peach-500/10 text-peach-500"
								: "border-border bg-warm-200 text-text-muted"
						}`}
					>
						<span
							className={`h-1.5 w-1.5 rounded-full ${
								props.pending.length > 0
									? "bg-peach-500 animate-pulse"
									: "bg-cream-500"
							}`}
						/>
						{props.pending.length} 条
					</span>
				</div>
				{props.pending.length === 0 ? (
					<div className="rounded-xl border border-dashed border-border px-4 py-6">
						<EmptyState size="sm" title="暂无待审批请求" className="py-2" />
					</div>
				) : (
					<div className="space-y-2">
						{props.pending.map((item) => {
							const isBusy = props.busyRequestId === item.request_id;
							return (
								<div
									key={item.request_id}
									className="group rounded-xl border border-border bg-surface p-3.5 text-xs transition-[color,background-color,border-color,box-shadow] duration-150 ease-out hover:border-cream-400 hover:shadow-sm"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<div className="font-medium text-text-primary flex items-center gap-2">
												<span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary uppercase tracking-wider">
													{item.channel_id}
												</span>
												{item.peer_name || item.peer_id}
											</div>
											<div className="mt-1.5 text-text-muted flex items-center gap-2">
												<span className="font-mono text-[11px] bg-warm-200 px-1.5 py-0.5 rounded">
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
					<span className="inline-flex items-center rounded-full border border-border bg-warm-50 px-2.5 py-0.5 text-xs font-medium text-text-muted">
						{props.records.length} 条
					</span>
				</div>
				{props.records.length === 0 ? (
					<div className="rounded-xl border border-dashed border-border px-4 py-6">
						<EmptyState size="sm" title="暂无已授权配对" className="py-2" />
					</div>
				) : (
					<div className="space-y-2">
						{props.records.map((item) => {
							const key = `${item.channel_id}:${item.peer_id}`;
							const isBusy = props.busyRevokeKey === key;
							return (
								<div
									key={item.pairing_id}
									className="group rounded-xl border border-border bg-surface p-3.5 text-xs transition-[color,background-color,border-color,box-shadow] duration-150 ease-out hover:border-cream-400 hover:shadow-sm"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<div className="font-medium text-text-primary flex items-center gap-2">
												<span className="inline-flex items-center rounded-md bg-mint-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-mint-600 uppercase tracking-wider">
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
