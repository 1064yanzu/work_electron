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
import { Globe, Radio, RefreshCw, Users, Zap } from "lucide-react";
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

const TONE_CLASS: Record<StatusTileTone, { wrap: string; icon: string }> = {
	emerald: {
		wrap: "from-emerald-500/10 to-emerald-500/5 ring-emerald-500/15",
		icon: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/15",
	},
	amber: {
		wrap: "from-amber-500/10 to-amber-500/5 ring-amber-500/15",
		icon: "text-amber-600 dark:text-amber-400 bg-amber-500/15",
	},
	rose: {
		wrap: "from-rose-500/10 to-rose-500/5 ring-rose-500/15",
		icon: "text-rose-600 dark:text-rose-400 bg-rose-500/15",
	},
	sky: {
		wrap: "from-sky-500/10 to-sky-500/5 ring-sky-500/15",
		icon: "text-sky-600 dark:text-sky-400 bg-sky-500/15",
	},
	zinc: {
		wrap: "from-zinc-200/40 to-zinc-100/20 ring-zinc-200/60 dark:from-zinc-800/40 dark:to-zinc-900/20 dark:ring-zinc-800/70",
		icon: "text-zinc-500 bg-zinc-500/10 dark:text-zinc-400",
	},
};

function StatusTile({
	icon: Icon,
	label,
	value,
	hint,
	tone,
	pulse = false,
}: StatusTileProps) {
	const t = TONE_CLASS[tone];
	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-2xl bg-gradient-to-br p-4 ring-1 transition-transform duration-200 hover:-translate-y-[1px]",
				t.wrap,
			)}
		>
			<div className="flex items-start gap-3">
				<div
					className={cn(
						"relative flex h-10 w-10 items-center justify-center rounded-xl",
						t.icon,
					)}
				>
					<Icon className="h-4.5 w-4.5" strokeWidth={1.8} />
					{pulse ? (
						<span className="absolute -right-0.5 -top-0.5">
							<StatusDot tone={tone} pulse size="xs" />
						</span>
					) : null}
				</div>
				<div className="min-w-0 flex-1">
					<div className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
						{label}
					</div>
					<div className="mt-1 truncate text-[22px] font-semibold leading-none text-text-primary tabular-nums">
						{value}
					</div>
					{hint ? (
						<div className="mt-1 text-[11px] text-text-muted">{hint}</div>
					) : null}
				</div>
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
			<SettingsSectionCard className="relative overflow-hidden p-5">
				<div className="absolute inset-0 bg-gradient-to-br from-primary/[0.05] via-transparent to-violet-500/[0.03] dark:from-primary/[0.08]" />
				<div className="relative flex flex-wrap items-center justify-between gap-4">
					<div className="flex items-start gap-3">
						<div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 shadow-sm">
							<Radio className="h-5 w-5 text-primary" strokeWidth={1.8} />
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
										"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
										enabled
											? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
											: "bg-zinc-500/10 text-zinc-500",
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

			{/* 仪表盘 */}
			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
					icon={Zap}
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
