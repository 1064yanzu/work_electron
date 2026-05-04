/**
 * ChannelNav — 通道左侧选择器
 *
 * 每条通道展示：
 *   - 图标（通道品牌色）
 *   - 名称 + 副标题
 *   - 运行状态小圆点（emerald/pulse / zinc / rose）
 *   - 启用开关（无需进入详情即可开启）
 *
 * 选中态：暖色 ring + 左侧强调条。
 */

import type { LucideIcon } from "lucide-react";
import { Lock } from "lucide-react";
import { cn } from "../../../../lib/utils";
import { SettingsSwitch } from "../../ui/SettingsPrimitives";
import { StatusDot } from "./StatusDot";

export type ChannelNavItem = {
	id: string;
	label: string;
	description?: string;
	icon: LucideIcon;
	accent: string;
	iconBg: string;
	enabled: boolean;
	running?: boolean;
	connected?: boolean;
	hasError?: boolean;
	/** 实验特性等特殊标签 */
	badge?: { text: string; tone: "amber" | "sky" | "zinc" };
	/** 未启用前置条件（例如微信需勾选风险声明） */
	locked?: boolean;
	lockedHint?: string;
};

export function ChannelNav({
	items,
	activeId,
	onSelect,
	onToggleEnabled,
	saving,
	className,
}: {
	items: ChannelNavItem[];
	activeId: string;
	onSelect: (id: string) => void;
	onToggleEnabled: (id: string, next: boolean) => void;
	saving: boolean;
	className?: string;
}) {
	return (
		<nav
			className={cn(
				"flex flex-col gap-1.5 rounded-2xl border border-border/70 bg-surface/70 p-1.5 shadow-[0_1px_4px_rgba(0,0,0,0.03)]/50",
				className,
			)}
			aria-label="通道选择"
		>
			{items.map((item) => {
				const Icon = item.icon;
				const isActive = item.id === activeId;
				const tone = item.hasError
					? "rose"
					: item.connected && item.enabled
						? "emerald"
						: item.enabled
							? "amber"
							: "zinc";
				const pulse = item.enabled && item.connected;
				return (
					<div
						key={item.id}
						role="button"
						tabIndex={0}
						onClick={() => onSelect(item.id)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") onSelect(item.id);
						}}
						className={cn(
							"group relative flex w-full cursor-pointer items-center gap-3 rounded-xl p-2.5 text-left transition-all duration-200",
							isActive
								? "bg-surface ring-1 ring-primary/40 shadow-[0_1px_4px_rgba(217,108,70,0.10)] dark:ring-primary/50"
								: "hover:bg-warm-200/60",
						)}
					>
						{/* 左侧强调条 */}
						<span
							className={cn(
								"absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-200",
								isActive
									? "bg-primary opacity-100"
									: "bg-primary opacity-0 group-hover:opacity-40",
							)}
						/>

						{/* 图标 */}
						<span
							className={cn(
								"relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br",
								item.iconBg,
								!item.enabled ? "opacity-60 saturate-50" : "",
							)}
						>
							<Icon className={cn("h-4 w-4", item.accent)} strokeWidth={1.8} />
							<span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-surface">
								<StatusDot tone={tone} pulse={pulse} size="xs" />
							</span>
						</span>

						{/* 文案 */}
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-1.5">
								<span className="truncate text-sm font-medium text-text-primary">
									{item.label}
								</span>
								{item.badge ? (
									<span
										className={cn(
											"inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
											item.badge.tone === "amber"
												? "bg-peach-500/10 text-peach-500"
												: item.badge.tone === "sky"
													? "bg-violetx-500/10 text-violetx-500"
													: "bg-warm-200 text-text-muted",
										)}
									>
										{item.badge.text}
									</span>
								) : null}
							</div>
							{item.description ? (
								<div className="mt-0.5 truncate text-[11px] leading-relaxed text-text-muted">
									{item.description}
								</div>
							) : null}
						</div>

						{/* 右侧：锁定提示或开关 */}
						<div
							className="flex-shrink-0"
							onClick={(e) => e.stopPropagation()}
							onKeyDown={(e) => e.stopPropagation()}
							role="presentation"
						>
							{item.locked ? (
								<span
									className="inline-flex items-center gap-1 rounded-full bg-peach-500/10 px-1.5 py-0.5 text-[10px] text-peach-500"
									title={item.lockedHint}
								>
									<Lock className="h-3 w-3" />
									已锁定
								</span>
							) : (
								<SettingsSwitch
									checked={item.enabled}
									onChange={(next) => onToggleEnabled(item.id, next)}
									disabled={saving}
								/>
							)}
						</div>
					</div>
				);
			})}
		</nav>
	);
}
