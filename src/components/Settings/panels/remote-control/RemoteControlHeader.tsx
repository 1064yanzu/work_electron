/**
 * RemoteControlHeader — 远程控制设置页的头部总控区域
 * 包含：启用/禁用开关、运行状态概览、模型信息
 */

import { Globe, Radio, Smartphone, Users, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getActiveModel, type RemoteRuntimeStatus } from "../../../../lib/api";
import { SettingsSwitch } from "../../ui/SettingsPrimitives";

type RemoteControlHeaderProps = {
	enabled: boolean;
	saving: boolean;
	runtimeStatus: RemoteRuntimeStatus | null;
	onToggle: (next: boolean) => void;
};

function StatusPill({
	icon: Icon,
	label,
	value,
	tone,
}: {
	icon: React.ElementType;
	label: string;
	value: string | number;
	tone: "emerald" | "amber" | "rose" | "zinc";
}) {
	const toneClasses = {
		emerald:
			"bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400",
		amber:
			"bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400",
		rose: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
		zinc: "bg-warm-500/10 text-text-secondary0/15",
	} as const;

	return (
		<div className="flex flex-col items-center gap-1.5 min-w-[72px]">
			<div
				className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses[tone]} transition-colors`}
			>
				<Icon className="h-4.5 w-4.5" />
			</div>
			<span className="text-[11px] font-medium text-text-secondary tracking-wide">
				{label}
			</span>
			<span className="text-sm font-semibold text-text-primary tabular-nums">
				{value}
			</span>
		</div>
	);
}

export function RemoteControlHeader({
	enabled,
	saving,
	runtimeStatus,
	onToggle,
}: RemoteControlHeaderProps) {
	const [currentModel, setCurrentModel] = useState<string>("");

	const fetchModel = useCallback(async () => {
		try {
			const model = await getActiveModel();
			setCurrentModel(model ?? "unknown");
		} catch {
			setCurrentModel("unknown");
		}
	}, []);

	useEffect(() => {
		void fetchModel();
	}, [fetchModel]);

	const connectedChannels =
		runtimeStatus?.channels.filter((ch) => ch.connected).length ?? 0;
	const totalChannels = runtimeStatus?.channels.length ?? 0;

	return (
		<div className="relative overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-[0_2px_8px_rgb(0,0,0,0.04)] ring-1 ring-black/[0.03] dark:ring-white/[0.02]">
			{/* 装饰性渐变背景 */}
			<div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-transparent to-violet-500/[0.02] dark:from-primary/[0.06] dark:to-violet-500/[0.04]" />
			<div className="absolute top-0 right-0 h-32 w-32 bg-gradient-to-bl from-primary/[0.05] to-transparent rounded-bl-full dark:from-primary/[0.08]" />

			<div className="relative p-6">
				{/* 头部行：标题 + 开关 */}
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-3">
						<div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-violet-500/20 shadow-sm dark:from-primary/30 dark:to-violet-500/30">
							<Smartphone className="h-5 w-5 text-primary" />
						</div>
						<div>
							<h3 className="text-base font-semibold text-text-primary">
								远程控制
							</h3>
							<p className="text-xs text-text-secondary mt-0.5">
								通过飞书、Telegram 等渠道远程操控 Agent
							</p>
						</div>
					</div>

					<div className="flex items-center gap-3">
						<span
							className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
								enabled
									? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
									: "bg-warm-500/10 text-text-muted0/15"
							}`}
						>
							<span
								className={`h-1.5 w-1.5 rounded-full ${
									enabled ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
								}`}
							/>
							{enabled ? "运行中" : "已关闭"}
						</span>
						<SettingsSwitch
							checked={enabled}
							onChange={onToggle}
							disabled={saving}
						/>
					</div>
				</div>

				{/* 状态仪表盘 */}
				<div className="flex items-center gap-6 rounded-xl border border-border bg-warm-50/50 px-5 py-4/30">
					<StatusPill
						icon={Radio}
						label="活跃渠道"
						value={`${connectedChannels}/${totalChannels}`}
						tone={connectedChannels > 0 ? "emerald" : "zinc"}
					/>
					<div className="h-10 w-px bg-warm-300 dark:bg-zinc-700" />
					<StatusPill
						icon={Zap}
						label="运行任务"
						value={runtimeStatus?.active_runs ?? 0}
						tone={(runtimeStatus?.active_runs ?? 0) > 0 ? "amber" : "zinc"}
					/>
					<div className="h-10 w-px bg-warm-300 dark:bg-zinc-700" />
					<StatusPill
						icon={Users}
						label="待审配对"
						value={runtimeStatus?.pending_pairings ?? 0}
						tone={(runtimeStatus?.pending_pairings ?? 0) > 0 ? "rose" : "zinc"}
					/>
					<div className="h-10 w-px bg-warm-300 dark:bg-zinc-700" />
					<StatusPill
						icon={Globe}
						label="当前模型"
						value={currentModel || "—"}
						tone="zinc"
					/>
				</div>
			</div>
		</div>
	);
}
