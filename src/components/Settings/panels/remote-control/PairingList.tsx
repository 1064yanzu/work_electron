import { Check, RefreshCcw, X } from "lucide-react";
import type {
	RemotePairingRecord,
	RemotePairingRequest,
} from "../../../../lib/api";
import { Button } from "../../../ui/Button";
import { RemoteStatusBadge } from "./RemoteStatusBadge";

function formatTs(ts?: number): string {
	if (!ts) return "-";
	const d = new Date(ts);
	if (Number.isNaN(d.getTime())) return "-";
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
		<div className="space-y-5">
			<div>
				<div className="mb-2 flex items-center justify-between">
					<h5 className="text-sm font-medium text-text-primary">待审批配对</h5>
					<RemoteStatusBadge
						text={`${props.pending.length} 条`}
						tone={props.pending.length > 0 ? "amber" : "zinc"}
					/>
				</div>
				{props.pending.length === 0 ? (
					<p className="rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-xs text-text-muted dark:border-zinc-700">
						暂无待审批请求
					</p>
				) : (
					<div className="space-y-2">
						{props.pending.map((item) => {
							const isBusy = props.busyRequestId === item.request_id;
							return (
								<div
									key={item.request_id}
									className="rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<div className="font-medium text-text-primary">
												{item.channel_id} · {item.peer_name || item.peer_id}
											</div>
											<div className="mt-1 text-text-muted">
												code={item.code} · 到期 {formatTs(item.expires_at)}
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

			<div>
				<div className="mb-2 flex items-center justify-between">
					<h5 className="text-sm font-medium text-text-primary">已授权配对</h5>
					<RemoteStatusBadge text={`${props.records.length} 条`} tone="zinc" />
				</div>
				{props.records.length === 0 ? (
					<p className="rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-xs text-text-muted dark:border-zinc-700">
						暂无已授权配对
					</p>
				) : (
					<div className="space-y-2">
						{props.records.map((item) => {
							const key = `${item.channel_id}:${item.peer_id}`;
							const isBusy = props.busyRevokeKey === key;
							return (
								<div
									key={item.pairing_id}
									className="rounded-xl border border-zinc-200 bg-white p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900"
								>
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<div className="font-medium text-text-primary">
												{item.channel_id} · {item.peer_name || item.peer_id}
											</div>
											<div className="mt-1 text-text-muted">
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
