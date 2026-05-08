import {
	Clock,
	Shield,
	ShieldAlert,
	ShieldCheck,
	type LucideIcon,
} from "lucide-react";
import {
	type PermissionMode,
	type ToolRiskLevel,
	type ToolType,
	TOOL_NAMES,
} from "../../../../lib/agent/types";
import { Select } from "../../../ui/Select";
import {
	SettingsCardSection,
	SettingsNumberInput,
} from "../../ui/SettingsPrimitives";
import { cn } from "../../../../lib/utils";

const RISK_LEVEL_CONFIG: Record<
	ToolRiskLevel,
	{
		label: string;
		icon: LucideIcon;
		accent: string;
		accentBg: string;
		accentBorder: string;
		hint: string;
	}
> = {
	L0: {
		label: "低风险",
		icon: ShieldCheck,
		accent: "text-mint-600",
		accentBg: "bg-mint-300/40",
		accentBorder: "border-mint-300/60",
		hint: "纯读取操作，可以放心自动执行",
	},
	L1: {
		label: "中风险",
		icon: Shield,
		accent: "text-peach-500",
		accentBg: "bg-peach-100/70",
		accentBorder: "border-peach-200/70",
		hint: "网络请求或外部交互，建议每次确认",
	},
	L2: {
		label: "高风险",
		icon: ShieldAlert,
		accent: "text-error",
		accentBg: "bg-[rgba(181,51,51,0.08)]",
		accentBorder: "border-[rgba(181,51,51,0.28)]",
		hint: "可能修改系统状态，默认拒绝最稳妥",
	},
};

const PERMISSION_MODE_OPTIONS: Array<{
	value: PermissionMode;
	label: string;
}> = [
	{ value: "auto_approve", label: "自动批准" },
	{ value: "ask", label: "每次询问" },
	{ value: "deny", label: "默认拒绝" },
];

interface PermissionPolicySectionProps {
	levelPolicies: Record<ToolRiskLevel, PermissionMode>;
	onLevelPolicyChange: (level: ToolRiskLevel, mode: PermissionMode) => void;
	timeoutSeconds: number;
	onTimeoutChange: (seconds: number) => void;
	toolRiskLevels: Record<ToolType, ToolRiskLevel>;
	onToolRiskLevelChange: (toolType: ToolType, riskLevel: ToolRiskLevel) => void;
}

/**
 * 工具权限策略 — 三段：
 *  1. 各风险等级的默认 permission mode（卡片化，每张卡有自己的 accent）
 *  2. 权限请求超时
 *  3. 各内置工具的风险等级配置（列表化，可滚动）
 */
export function PermissionPolicySection({
	levelPolicies,
	onLevelPolicyChange,
	timeoutSeconds,
	onTimeoutChange,
	toolRiskLevels,
	onToolRiskLevelChange,
}: PermissionPolicySectionProps) {
	return (
		<SettingsCardSection
			title="工具权限策略"
			description="按风险等级控制 Agent 调用工具时的默认行为；细粒度可在下方按工具调整。"
			bodyClassName="px-5 py-5 space-y-5"
		>
			{/* 三个风险等级卡片 */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				{(["L0", "L1", "L2"] as ToolRiskLevel[]).map((level) => {
					const cfg = RISK_LEVEL_CONFIG[level];
					const Icon = cfg.icon;
					return (
						<div
							key={level}
							className={cn(
								"rounded-2xl border bg-surface p-4 shadow-bai-card",
								cfg.accentBorder,
							)}
						>
							<div className="flex items-center gap-2">
								<span
									className={cn(
										"inline-flex h-8 w-8 items-center justify-center rounded-xl",
										cfg.accentBg,
									)}
								>
									<Icon
										className={cn("h-4 w-4", cfg.accent)}
										strokeWidth={1.6}
									/>
								</span>
								<div>
									<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
										{level}
									</div>
									<div className="text-[13px] font-semibold text-text-primary">
										{cfg.label}
									</div>
								</div>
							</div>
							<p className="mt-2 text-[11.5px] leading-relaxed text-text-muted">
								{cfg.hint}
							</p>
							<div className="mt-3">
								<Select
									value={levelPolicies[level]}
									onChange={(e) =>
										onLevelPolicyChange(level, e.target.value as PermissionMode)
									}
									variant="compact"
									options={PERMISSION_MODE_OPTIONS}
								/>
							</div>
						</div>
					);
				})}
			</div>

			{/* 超时 */}
			<div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-cream-50 px-4 py-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5 text-[13px] font-medium text-text-primary">
						<Clock className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.8} />
						权限请求超时
					</div>
					<div className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
						超时后自动按「默认拒绝」处理；范围 5–120 秒。
					</div>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<SettingsNumberInput
						value={timeoutSeconds}
						min={5}
						max={120}
						width="104px"
						suffix="秒"
						onChange={(value) => onTimeoutChange(value)}
					/>
				</div>
			</div>

			{/* 内置工具风险等级 */}
			<div>
				<div className="mb-3 flex items-baseline justify-between">
					<h5 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-text-muted">
						内置工具风险等级
					</h5>
					<span className="text-[10.5px] text-text-light">
						共 {Object.keys(TOOL_NAMES).length} 个工具
					</span>
				</div>
				<div className="overflow-hidden rounded-xl border border-border">
					<div className="grid grid-cols-[1fr_140px_140px] bg-cream-50 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-text-muted">
						<div>工具</div>
						<div>风险等级</div>
						<div>当前策略</div>
					</div>
					<div className="max-h-[360px] overflow-y-auto divide-y divide-border/60">
						{(Object.keys(TOOL_NAMES) as ToolType[]).map((toolType) => {
							const riskLevel = toolRiskLevels[toolType] || "L0";
							const cfg = RISK_LEVEL_CONFIG[riskLevel];
							const Icon = cfg.icon;
							const currentMode = levelPolicies[riskLevel];
							const modeLabel = PERMISSION_MODE_OPTIONS.find(
								(o) => o.value === currentMode,
							)?.label;
							return (
								<div
									key={toolType}
									className="grid grid-cols-[1fr_140px_140px] items-center bg-surface px-4 py-2 text-[12.5px] transition-colors hover:bg-cream-50"
								>
									<div className="text-text-primary">
										{TOOL_NAMES[toolType]}
									</div>
									<div>
										<Select
											value={riskLevel}
											onChange={(e) =>
												onToolRiskLevelChange(
													toolType,
													e.target.value as ToolRiskLevel,
												)
											}
											variant="compact"
											options={(["L0", "L1", "L2"] as ToolRiskLevel[]).map(
												(l) => ({
													value: l,
													label: `${l} · ${RISK_LEVEL_CONFIG[l].label}`,
												}),
											)}
										/>
									</div>
									<div className="flex items-center gap-1.5">
										<Icon
											className={cn("h-3 w-3", cfg.accent)}
											strokeWidth={1.8}
										/>
										<span className="text-text-secondary">{modeLabel}</span>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</SettingsCardSection>
	);
}
