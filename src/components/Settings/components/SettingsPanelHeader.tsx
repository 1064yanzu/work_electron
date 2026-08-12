/**
 * SettingsPanelHeader — 二级设置页的页面标题（H1）
 *
 * 层级约定（三级，逐级收敛）：
 *   1. 本组件               —— 页面标题，28px semibold，纯文字
 *   2. SettingsSectionTitle —— 分节标题，15px semibold，在卡片外
 *   3. SettingsRow / SettingsField —— 行内 label(14) + 描述(12.5)
 *
 * 这里刻意不放图标：设置页的图标已经在左侧导航里承担了识别职责，
 * 内容区再放一次渐变图标方块只是重复 + 噪音，还会把标题字号压小。
 * `icon` 参数保留是为了兼容既有 21 处调用，运行时不渲染。
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../lib/utils";

interface SettingsPanelHeaderProps {
	/** @deprecated 不再渲染 —— 识别职责交给左侧导航，保留仅为兼容既有调用。 */
	icon?: LucideIcon;
	title: string;
	description?: string;
	actions?: ReactNode;
	className?: string;
}

export function SettingsPanelHeader({
	title,
	description,
	actions,
	className,
}: SettingsPanelHeaderProps) {
	return (
		// mb-11：标题与第一块内容之间要有一段明显空白，页面才「起得来」。
		<div className={cn("mb-11", className)}>
			<div className="flex items-start justify-between gap-6">
				<div className="min-w-0">
					<h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-text-primary">
						{title}
					</h1>
					{description && (
						<p className="mt-2.5 max-w-[56ch] text-[13.5px] leading-relaxed text-text-muted">
							{description}
						</p>
					)}
				</div>
				{actions && (
					<div className="mt-1.5 flex shrink-0 items-center gap-2">
						{actions}
					</div>
				)}
			</div>
		</div>
	);
}
