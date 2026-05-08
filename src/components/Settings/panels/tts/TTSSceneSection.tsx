/**
 * TTSSceneSection — 场景级朗读卡片
 *
 * 重设计要点：
 *  - 大图标 + 大开关，让"启用/未启用"一眼可见
 *  - 启用后才出现的场景音色 + 场景定制选项，使用 inline 卡片化容器
 *  - 通过 children 注入额外字段（自动播报 / 详略 / 类型过滤）
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { TTSProviderConfig } from "../../../../lib/tts";
import { VoicePicker } from "../../../tts/VoicePicker";
import {
	SettingsSectionCard,
	SettingsSwitch,
} from "../../ui/SettingsPrimitives";
import { cn } from "../../../../lib/utils";

interface TTSSceneSectionProps {
	icon: LucideIcon;
	accentColor?: string;
	title: string;
	description: string;
	enabled: boolean;
	onEnabledChange: (next: boolean) => void;
	defaultProviderId: string | null;
	voiceId: string | null;
	onVoiceChange: (id: string | null) => void;
	provider: TTSProviderConfig | null;
	children?: ReactNode;
}

export function TTSSceneSection({
	icon: Icon,
	accentColor = "var(--t-primary, #1A1A19)",
	title,
	description,
	enabled,
	onEnabledChange,
	defaultProviderId,
	voiceId,
	onVoiceChange,
	provider,
	children,
}: TTSSceneSectionProps) {
	const providerId = defaultProviderId || provider?.id || null;
	return (
		<SettingsSectionCard
			className={cn(
				"transition-colors",
				enabled ? "border-border" : "border-border bg-cream-50",
			)}
		>
			<div className="flex items-start justify-between gap-3 px-5 py-4">
				<div className="flex items-start gap-3">
					<span
						className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border"
						style={{
							backgroundColor: enabled
								? `${accentColor}14`
								: "var(--t-bg-surface, #FFFFFF)",
							color: enabled ? accentColor : "var(--t-text-muted, #9D9D98)",
						}}
					>
						<Icon className="h-4 w-4" strokeWidth={1.6} />
					</span>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<h3 className="text-[14px] font-semibold leading-snug text-text-primary">
								{title}
							</h3>
							{enabled && (
								<span
									className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
									style={{
										backgroundColor: `${accentColor}1F`,
										color: accentColor,
									}}
								>
									<span
										className="h-1 w-1 rounded-full"
										style={{ backgroundColor: accentColor }}
									/>
									已启用
								</span>
							)}
						</div>
						<p className="mt-1 text-[12px] leading-relaxed text-text-muted">
							{description}
						</p>
					</div>
				</div>
				<SettingsSwitch checked={enabled} onChange={onEnabledChange} />
			</div>

			{enabled && (
				<div className="space-y-3 border-t border-border px-5 py-4">
					<div className="rounded-2xl border border-border bg-cream-50 p-4">
						<div className="mb-2 flex items-baseline justify-between">
							<span className="text-[12.5px] font-medium text-text-primary">
								场景音色
							</span>
							<span className="text-[10.5px] text-text-muted">
								不选则跟随全局默认
							</span>
						</div>
						{providerId ? (
							<VoicePicker
								providerId={providerId}
								value={voiceId}
								onChange={onVoiceChange}
								allowInherit
							/>
						) : (
							<div className="rounded-lg border border-dashed border-border bg-surface px-3 py-2 text-[12px] text-text-muted">
								请先选择全局默认 Provider
							</div>
						)}
					</div>
					{children}
				</div>
			)}
		</SettingsSectionCard>
	);
}
