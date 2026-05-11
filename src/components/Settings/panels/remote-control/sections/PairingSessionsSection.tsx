/**
 * PairingSessionsSection — 合并「配对管理」与「远程会话」
 *
 * 使用内部小 segment 切换，避免两块内容纵向堆叠，提升视觉密度与聚焦。
 */

import { Clock, History, Users } from "lucide-react";
import { useState } from "react";
import type {
	RemotePairingRecord,
	RemotePairingRequest,
	RemoteSessionInfo,
} from "../../../../../lib/api";
import { cn } from "../../../../../lib/utils";
import {
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../../../ui/SettingsPrimitives";
import { PairingList } from "../PairingList";
import { SessionList } from "../SessionList";
import { EmptyState } from "../EmptyState";

type Segment = "pairing" | "sessions";

type Props = {
	pendingPairings: RemotePairingRequest[];
	pairingRecords: RemotePairingRecord[];
	sessions: RemoteSessionInfo[];
	busyRequestId?: string | null;
	busyRevokeKey?: string | null;
	busyRunId?: string | null;
	onApprove: (requestId: string) => void;
	onReject: (requestId: string) => void;
	onRevoke: (channelId: string, peerId: string) => void;
	onStop: (runId: string) => void;
};

export function PairingSessionsSection(props: Props) {
	const [segment, setSegment] = useState<Segment>(() =>
		props.pendingPairings.length > 0 ? "pairing" : "sessions",
	);

	return (
		<div className="space-y-6">
			{/* Segment 切换 */}
			<div className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
				<SegmentButton
					active={segment === "pairing"}
					onClick={() => setSegment("pairing")}
					icon={<Users className="h-3.5 w-3.5" />}
					label="配对管理"
					count={props.pendingPairings.length}
					countTone="amber"
				/>
				<SegmentButton
					active={segment === "sessions"}
					onClick={() => setSegment("sessions")}
					icon={<History className="h-3.5 w-3.5" />}
					label="远程会话"
					count={
						props.sessions.filter(
							(s) => s.state === "running" || s.state === "waiting_interaction",
						).length
					}
					countTone="emerald"
				/>
			</div>

			{segment === "pairing" ? (
				<SettingsSectionCard className="p-5 space-y-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<SettingsSectionTitle className="mb-1">
								配对管理
							</SettingsSectionTitle>
							<p className="text-sm text-text-secondary leading-relaxed">
								首次连接的用户会进入待审批队列，经你批准后才能远程控制。
								<br />
								已授权的用户可以随时撤销；撤销后该用户将立即失去远控权限。
							</p>
						</div>
						<Clock className="h-5 w-5 flex-shrink-0 text-text-muted mt-1" />
					</div>
					<PairingList
						pending={props.pendingPairings}
						records={props.pairingRecords}
						onApprove={props.onApprove}
						onReject={props.onReject}
						onRevoke={props.onRevoke}
						busyRequestId={props.busyRequestId}
						busyRevokeKey={props.busyRevokeKey}
					/>
				</SettingsSectionCard>
			) : (
				<SettingsSectionCard className="p-5 space-y-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<SettingsSectionTitle className="mb-1">
								远程会话
							</SettingsSectionTitle>
							<p className="text-sm text-text-secondary leading-relaxed">
								查看最近远程任务，并可主动中断运行中的会话。
							</p>
						</div>
						<History className="h-5 w-5 flex-shrink-0 text-text-muted mt-1" />
					</div>
					{props.sessions.length === 0 ? (
						<EmptyState
							icon={History}
							title="暂无远程会话"
							description="当有人通过远程通道发起 Agent 任务时，会在此列出最近的 20 条。"
						/>
					) : (
						<SessionList
							sessions={props.sessions}
							onStop={props.onStop}
							busyRunId={props.busyRunId}
						/>
					)}
				</SettingsSectionCard>
			)}
		</div>
	);
}

function SegmentButton({
	active,
	onClick,
	icon,
	label,
	count,
	countTone = "zinc",
}: {
	active: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
	count?: number;
	countTone?: "amber" | "emerald" | "zinc";
}) {
	const countClass =
		count && count > 0
			? countTone === "amber"
				? "bg-peach-500/15 text-peach-500"
				: countTone === "emerald"
					? "bg-mint-500/15 text-mint-600"
					: "bg-warm-300 text-text-secondary"
			: "bg-warm-300 text-text-muted";
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-200 ease-out",
				active
					? "bg-warm-200 text-text-primary"
					: "text-text-muted hover:text-text-secondary",
			)}
		>
			{icon}
			<span>{label}</span>
			{typeof count === "number" ? (
				<span
					className={cn(
						"inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold leading-4 tabular-nums",
						countClass,
					)}
				>
					{count > 99 ? "99+" : count}
				</span>
			) : null}
		</button>
	);
}
