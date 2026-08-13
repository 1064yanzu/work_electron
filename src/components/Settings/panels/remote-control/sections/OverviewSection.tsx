/**
 * OverviewSection — 远程控制「概览」Tab
 *
 * 结构：
 *   1. 统一仪表盘 StatusTileGrid（活跃渠道 / 会话 / 配对 / 模型）
 *   2. 能力矩阵（ChannelCapabilityMatrix）
 *   3. 事件日志面板（EventLogPanel）
 *
 * 只负责展示与回调转发，数据由父级传入。
 */

import type { LucideIcon } from "lucide-react";
import { Activity, Globe, Radio, RefreshCw, Users } from "lucide-react";
import { useEffect, useState } from "react";
import {
	getActiveModel,
	type RemoteRuntimeStatus,
} from "../../../../../lib/api";
import { cn } from "../../../../../lib/utils";
import { Button } from "../../../../ui/Button";
import {
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsSwitch,
} from "../../../ui/SettingsPrimitives";
import { ChannelCapabilityMatrix } from "../ChannelCapabilityMatrix";
import { EventLogPanel } from "../EventLogPanel";
import { StatusDot } from "../StatusDot";

type StatusTileTone = "emerald" | "amber" | "rose" | "sky" | "zinc";

type StatusTileProps = {
	icon: LucideIcon;
	label: string;
	value: string | number;
	hint?: string;
	tone: StatusTileTone;
	pulse?: boolean;
};

const TONE_ICON_CLASS: Record<StatusTileTone, string> = {
	emerald: "text-success bg-success-muted",
	amber: "text-warning bg-warning-muted",
	rose: "text-error bg-error/8",
	sky: "text-violetx-500 bg-violetx-500/10",
	zinc: "text-text-muted bg-warm-200",
};

// 键值行:图标 + 标签/提示左,数值右;外层用 divide-y 列表卡包裹
function StatusTile({
	icon: Icon,
	label,
	value,
	hint,
	tone,
	pulse = false,
}: StatusTileProps) {
	const iconCls = TONE_ICON_CLASS[tone];
	return (
		<div className="flex items-center gap-3 py-2.5">
			<div
				className={cn(
					"relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
					iconCls,
				)}
			>
				<Icon className="h-4 w-4" strokeWidth={1.5} />
				{pulse ? (
					<span className="absolute -right-0.5 -top-0.5">
						<StatusDot tone={tone} pulse size="xs" />
					</span>
				) : null}
			</div>
			<div className="min-w-0 flex-1">
				<div className="text-xs font-medium text-text-secondary">{label}</div>
				{hint ? (
					<div className="mt-0.5 truncate text-2xs text-text-muted">{hint}</div>
				) : null}
			</div>
			<div
				className="max-w-[45%] truncate tabular-nums text-sm font-medium text-text-primary"
				title={String(value)}
			>
				{value}
			</div>
		</div>
	);
}

export function OverviewSection({
	enabled,
	saving,
	runtime,
	onToggleEnabled,
	onRefresh,
	refreshing,
}: {
	enabled: boolean;
	saving: boolean;
	runtime: RemoteRuntimeStatus | null;
	onToggleEnabled: (next: boolean) => void;
	onRefresh: () => void;
	refreshing: boolean;
}) {
	const [activeModel, setActiveModel] = useState<string>("");

	useEffect(() => {
		(async () => {
			try {
				const model = await getActiveModel();
				setActiveModel(model ?? "—");
			} catch {
				setActiveModel("—");
			}
		})();
	}, []);

	const connectedChannels =
		runtime?.channels.filter((ch) => ch.connected).length ?? 0;
	const totalChannels = runtime?.channels.length ?? 0;
	const activeRuns = runtime?.active_runs ?? 0;
	const pendingPairings = runtime?.pending_pairings ?? 0;

	return (
		<div className="space-y-6">
			{/* 全局开关卡 */}
			<SettingsSectionCard className="p-5">
				<div className="flex flex-wrap items-center justify-between gap-4">
					<div className="flex items-start gap-3">
						<div className="bai-icon-badge h-10 w-10">
							<Radio className="h-5 w-5 text-primary" strokeWidth={1.5} />
							{enabled ? (
								<span className="absolute -right-1 -top-1">
									<StatusDot tone="emerald" pulse size="xs" />
								</span>
							) : null}
						</div>
						<div>
							<div className="flex items-center gap-2">
								<SettingsSectionTitle className="mb-0 text-base">
									远程控制总开关
								</SettingsSectionTitle>
								<span
									className={cn(
										"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
										enabled
											? "bg-success-muted text-success"
											: "bg-warm-200 text-text-muted",
									)}
								>
									<StatusDot
										tone={enabled ? "emerald" : "zinc"}
										size="xs"
										pulse={enabled}
									/>
									{enabled ? "运行中" : "已关闭"}
								</span>
							</div>
							<p className="mt-1 text-xs text-text-secondary">
								关闭后将停止所有远程通道。配对、会话等能力均不会响应。
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={onRefresh}
							loading={refreshing}
						>
							<RefreshCw className="h-3.5 w-3.5" />
							刷新状态
						</Button>
						<SettingsSwitch
							checked={enabled}
							onChange={onToggleEnabled}
							disabled={saving}
						/>
					</div>
				</div>
			</SettingsSectionCard>

			{/* 仪表盘 — 键值行列表卡 */}
			<div className="rounded-2xl border border-border bg-surface px-4 divide-y divide-border/60">
				<StatusTile
					icon={Radio}
					label="活跃渠道"
					value={`${connectedChannels}/${totalChannels}`}
					hint={
						connectedChannels > 0
							? `${connectedChannels} 个通道正在响应`
							: "所有通道离线"
					}
					tone={connectedChannels > 0 ? "emerald" : "zinc"}
					pulse={connectedChannels > 0}
				/>
				<StatusTile
					icon={Activity}
					label="运行任务"
					value={activeRuns}
					hint={activeRuns > 0 ? "有正在进行的远程会话" : "当前没有任务"}
					tone={activeRuns > 0 ? "amber" : "zinc"}
					pulse={activeRuns > 0}
				/>
				<StatusTile
					icon={Users}
					label="待审配对"
					value={pendingPairings}
					hint={pendingPairings > 0 ? "需要你尽快处理" : "无等待审批"}
					tone={pendingPairings > 0 ? "rose" : "zinc"}
					pulse={pendingPairings > 0}
				/>
				<StatusTile
					icon={Globe}
					label="当前模型"
					value={activeModel || "—"}
					hint="用于响应远程请求"
					tone="sky"
				/>
			</div>

			{/* 能力矩阵 */}
			{enabled ? <ChannelCapabilityMatrix /> : null}

			{/* 活动日志 */}
			{enabled ? <EventLogPanel /> : null}
		</div>
	);
}
