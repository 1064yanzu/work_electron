/**
 * ReaderSettings — 阅读器设置（重设计后的主入口）
 *
 * 结构：
 *   1. 实时样张预览（ReaderPreviewSample）
 *   2. 主题画廊（ReaderThemePicker）
 *   3. 排版控件（ReaderTypographyControls）
 *   4. 沉浸 / AI 副驾驶（ReaderImmersionControls）
 *   5. 朗读引导（指向 TTS 面板）
 *
 * 状态：通过 readerGetSettings / readerUpdateSettings 持久化。
 */
import { BookOpen, Volume2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	readerGetSettings,
	readerUpdateSettings,
	type ReaderClientSettings,
} from "../../../lib/api/reader";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsCardSection,
	SettingsPageContainer,
	SettingsSectionCard,
} from "../ui/SettingsPrimitives";
import { ReaderImmersionControls } from "./reader/ReaderImmersionControls";
import { ReaderPreviewSample } from "./reader/ReaderPreviewSample";
import { ReaderThemePicker } from "./reader/ReaderThemePicker";
import { ReaderTypographyControls } from "./reader/ReaderTypographyControls";

const DEFAULT_SETTINGS: ReaderClientSettings = {
	theme: "paperwhite",
	font_family: "serif-cn",
	font_size: 17,
	line_height: 1.75,
	letter_spacing: 0.01,
	column_count: 1,
	max_width_ch: 70,
	page_transition: "slide",
	auto_hide_chrome_ms: 1200,
	default_selection_action: "highlight",
	tts_provider: "system",
	tts_rate: 1.0,
	ai_context_scope: "chapter",
	disable_notifications_while_reading: false,
	card_gen_model: "",
	card_default_count_selection: 5,
	card_default_count_chapter: 8,
	card_srs_enabled: true,
	card_daily_new_limit: 20,
};

export function ReaderSettings() {
	const [settings, setSettings] =
		useState<ReaderClientSettings>(DEFAULT_SETTINGS);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		(async () => {
			try {
				const data = await readerGetSettings();
				setSettings({ ...DEFAULT_SETTINGS, ...data });
			} catch (e) {
				console.warn("[reader-settings] load failed:", e);
			} finally {
				setLoaded(true);
			}
		})();
	}, []);

	const patch = useCallback(async (next: Partial<ReaderClientSettings>) => {
		setSettings((prev) => ({ ...prev, ...next }));
		try {
			await readerUpdateSettings(next);
		} catch (e) {
			console.warn("[reader-settings] save failed:", e);
		}
	}, []);

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={BookOpen}
				title="阅读器"
				description="管理阅读器外观、排版、朗读和 AI 副驾驶的默认行为。改动会即时同步到所有阅读器窗口。"
			/>

			<ReaderPreviewSample settings={settings} />

			<SettingsCardSection
				title="主题"
				description="主题决定背景、字色与高亮 accent；切换不会丢失阅读进度。"
			>
				<ReaderThemePicker
					value={settings.theme}
					onChange={(id) => void patch({ theme: id })}
				/>
			</SettingsCardSection>

			<SettingsCardSection
				title="排版"
				description="字体族、字号、行距、字间距与版心宽度——找到最舒适的呼吸节奏。"
				bodyClassName="px-5 py-5"
			>
				<ReaderTypographyControls
					settings={settings}
					patch={(n) => void patch(n)}
				/>
			</SettingsCardSection>

			<SettingsCardSection
				title="阅读体验"
				description="翻页过渡、划词动作、沉浸模式、AI 副驾驶上下文。"
				bodyClassName="px-5 py-5"
			>
				<ReaderImmersionControls
					settings={settings}
					patch={(n) => void patch(n)}
				/>
			</SettingsCardSection>

			<SettingsSectionCard className="px-5 py-5">
				<div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-dashed border-cream-500/60 bg-cream-50 p-4">
					<div className="flex items-start gap-3">
						<span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-surface text-text-secondary">
							<Volume2 className="h-4 w-4" strokeWidth={1.6} />
						</span>
						<div className="min-w-0">
							<div className="text-[13px] font-semibold text-text-primary">
								朗读由「语音朗读」面板统一管理
							</div>
							<p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
								Provider、音色、语速、声音克隆等都在那里。请在左侧切换到「语音朗读」并开启「阅读器朗读」场景。
							</p>
						</div>
					</div>
				</div>
			</SettingsSectionCard>

			{!loaded && (
				<p className="text-[11px] text-text-light">正在载入阅读器设置…</p>
			)}
		</SettingsPageContainer>
	);
}
