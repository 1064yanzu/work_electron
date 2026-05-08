/**
 * TTSGlobalSection — 全局默认朗读
 *
 * 重设计要点：
 *  - 顶部：默认 Provider + Voice 横向并列 + 一键试听
 *  - 底部：语速 / 音量 / 音调 三联 slider，统一卡片化
 *  - 不再使用 SettingsField horizontal（视觉太枯燥）
 */
import { useState } from "react";
import { Loader2, PlayCircle, Sparkles } from "lucide-react";
import { ttsTest } from "../../../../lib/api/tts";
import type { TTSProviderConfig, TTSSettings } from "../../../../lib/tts";
import { Select } from "../../../ui/Select";
import { toast } from "../../../ui/Toast";
import { VoicePicker } from "../../../tts/VoicePicker";
import {
	SettingsCardSection,
	SettingsSlider,
} from "../../ui/SettingsPrimitives";

interface TTSGlobalSectionProps {
	settings: TTSSettings;
	patch: (next: Partial<TTSSettings>) => void;
}

export function TTSGlobalSection({ settings, patch }: TTSGlobalSectionProps) {
	const enabledProviders = settings.providers.filter((p) => p.is_enabled);
	const defaultProvider: TTSProviderConfig | null =
		settings.providers.find((p) => p.id === settings.default_provider_id) ||
		null;
	const [testing, setTesting] = useState(false);

	const handleTest = async () => {
		if (!defaultProvider) return;
		setTesting(true);
		try {
			if (defaultProvider.type === "system") {
				if (typeof window !== "undefined" && "speechSynthesis" in window) {
					const utter = new SpeechSynthesisUtterance(
						"你好，这是当前音色的试听样本。",
					);
					utter.rate = settings.rate;
					utter.volume = settings.volume;
					utter.pitch = settings.pitch;
					window.speechSynthesis.speak(utter);
				}
			} else {
				const result = await ttsTest({ providerId: defaultProvider.id });
				if (result.ok && result.audioBase64) {
					const audio = new Audio(
						`data:audio/${result.format || "mpeg"};base64,${result.audioBase64}`,
					);
					await audio.play();
				} else {
					toast.error(result.error || "试听失败");
				}
			}
		} catch (e) {
			toast.error(`试听失败：${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setTesting(false);
		}
	};

	return (
		<SettingsCardSection
			title="默认朗读"
			description="未做场景级覆盖时使用的 Provider、音色与全局朗读参数。"
			headerAction={
				<button
					type="button"
					onClick={() => void handleTest()}
					disabled={!defaultProvider || testing}
					className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[11.5px] font-medium text-text-secondary transition hover:border-cream-500 hover:text-text-primary disabled:opacity-40"
				>
					{testing ? (
						<Loader2 className="h-3 w-3 animate-spin" />
					) : (
						<PlayCircle className="h-3 w-3" strokeWidth={1.8} />
					)}
					{testing ? "试听中…" : "试听当前默认"}
				</button>
			}
			bodyClassName="px-5 py-5 space-y-5"
		>
			<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
				<FieldCard
					label="默认 Provider"
					hint={
						defaultProvider
							? `已启用 ${enabledProviders.length} 个 Provider`
							: "未选择"
					}
				>
					<Select
						value={settings.default_provider_id || ""}
						onChange={(e) => {
							const id = e.target.value || null;
							patch({
								default_provider_id: id,
								default_voice_id: null,
							});
						}}
						variant="inline"
						placeholder="未选择"
						options={[
							{ value: "", label: "未选择" },
							...enabledProviders.map((p) => ({
								value: p.id,
								label: `${p.name}（${p.type}）`,
							})),
						]}
					/>
				</FieldCard>

				<FieldCard
					label="默认音色"
					hint={
						defaultProvider
							? `来自 ${defaultProvider.name}`
							: "请先选择 Provider"
					}
				>
					{defaultProvider ? (
						<VoicePicker
							providerId={defaultProvider.id}
							value={settings.default_voice_id}
							onChange={(id) => patch({ default_voice_id: id })}
						/>
					) : (
						<div className="rounded-lg border border-dashed border-border bg-cream-100 px-3 py-2 text-[12px] text-text-muted">
							请先选择全局默认 Provider
						</div>
					)}
				</FieldCard>
			</div>

			<div className="grid grid-cols-1 gap-5 rounded-2xl border border-border bg-cream-50 p-5 lg:grid-cols-3">
				<SettingsSlider
					label="语速"
					value={settings.rate}
					min={0.5}
					max={2.0}
					step={0.05}
					onChange={(v) => patch({ rate: Number(v.toFixed(2)) })}
					formatValue={(v) => `${v.toFixed(2)}×`}
					minLabel="慢"
					maxLabel="快"
				/>
				<SettingsSlider
					label="音量"
					value={settings.volume}
					min={0}
					max={1}
					step={0.05}
					onChange={(v) => patch({ volume: Number(v.toFixed(2)) })}
					formatValue={(v) => `${Math.round(v * 100)}%`}
					minLabel="静"
					maxLabel="满"
				/>
				<SettingsSlider
					label="音调"
					hint="仅系统语音 / 部分 provider 生效"
					value={settings.pitch}
					min={0.5}
					max={2.0}
					step={0.05}
					onChange={(v) => patch({ pitch: Number(v.toFixed(2)) })}
					formatValue={(v) => v.toFixed(2)}
					minLabel="低"
					maxLabel="高"
				/>
			</div>

			<div className="flex items-center gap-2 rounded-xl border border-dashed border-cream-500/60 bg-cream-50 px-3 py-2 text-[11.5px] text-text-muted">
				<Sparkles className="h-3 w-3 shrink-0" strokeWidth={1.6} />
				<span>场景级覆盖（阅读器 / 对话 / 桌宠）会优先于这里的默认值。</span>
			</div>
		</SettingsCardSection>
	);
}

function FieldCard({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2 rounded-2xl border border-border bg-cream-50 p-4">
			<div className="flex items-baseline justify-between gap-3">
				<div className="text-[12.5px] font-medium text-text-primary">
					{label}
				</div>
				{hint && (
					<div className="text-[10.5px] tabular-nums text-text-muted">
						{hint}
					</div>
				)}
			</div>
			{children}
		</div>
	);
}
