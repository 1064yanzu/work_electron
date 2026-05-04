/**
 * RemoteControlHeader — 远程控制设置页的头部总控区域
 * 包含：启用/禁用开关、运行状态概览、模型信息
 */

import { Activity, Globe, Radio, Smartphone, Users } from "lucide-react";
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
		emerald: "bg-mint-500/10 text-mint-600",
		amber: "bg-peach-500/10 text-peach-500",
		rose: "bg-[#b53333]/[0.08] text-[#b53333]",
		zinc: "bg-warm-200 text-text-secondary",
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
		<div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-bai-card">
			<div className="relative p-6">
				{/* 头部行：标题 + 开关 */}
				<div className="flex items-center justify-between mb-6">
					<div className="flex items-center gap-3">
						<div className="bai-icon-badge h-11 w-11">
							<Smartphone className="h-5 w-5 text-primary" strokeWidth={1.5} />
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
									? "bg-mint-500/10 text-mint-600"
									: "bg-warm-200 text-text-muted"
							}`}
						>
							<span
								className={`h-1.5 w-1.5 rounded-full ${
									enabled ? "bg-mint-500 animate-pulse" : "bg-cream-500"
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
				<div className="flex items-center gap-6 rounded-xl border border-border bg-warm-200/40 px-5 py-4">
					<StatusPill
						icon={Radio}
						label="活跃渠道"
						value={`${connectedChannels}/${totalChannels}`}
						tone={connectedChannels > 0 ? "emerald" : "zinc"}
					/>
					<div className="h-10 w-px bg-warm-300" />
					<StatusPill
						icon={Activity}
						label="运行任务"
						value={runtimeStatus?.active_runs ?? 0}
						tone={(runtimeStatus?.active_runs ?? 0) > 0 ? "amber" : "zinc"}
					/>
					<div className="h-10 w-px bg-warm-300" />
					<StatusPill
						icon={Users}
						label="待审配对"
						value={runtimeStatus?.pending_pairings ?? 0}
						tone={(runtimeStatus?.pending_pairings ?? 0) > 0 ? "rose" : "zinc"}
					/>
					<div className="h-10 w-px bg-warm-300" />
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
