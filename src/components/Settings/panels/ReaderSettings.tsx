/**
 * ReaderSettings - 阅读器设置面板
 * 配置主题、字体、字号、行距、页边距、TTS、AI 上下文范围等。
 */
import { BookOpen, Eye, Sparkles, Volume2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
	readerGetSettings,
	readerUpdateSettings,
} from "../../../lib/api/reader";
import type { ReaderClientSettings } from "../../../lib/api/reader";
import {
	READER_FONT_FAMILIES,
	READER_THEMES,
} from "../../reader/themes/readerThemes";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsField,
	SettingsHeader,
	SettingsPageContainer,
	SettingsRow,
	SettingsSectionCard,
	SettingsSwitch,
	settingsInputClass,
} from "../ui/SettingsPrimitives";

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
				description="管理阅读器外观、排版、朗读和 AI 副驾驶的默认行为。"
			/>

			{/* 外观 */}
			<SettingsSectionCard>
				<SettingsHeader
					title="外观"
					description="选择阅读主题、字体族与默认字号。"
				/>
				<div className="px-5 pb-2">
					<SettingsField
						label="阅读主题"
						layout="vertical"
						hint="切换会立即在所有阅读器窗口生效。"
					>
						<div className="flex flex-wrap gap-2">
							{READER_THEMES.map((t) => (
								<button
									key={t.id}
									type="button"
									onClick={() => void patch({ theme: t.id })}
									className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] transition-colors ${
										settings.theme === t.id
											? "border-primary bg-primary/10 text-text-primary"
											: "border-border bg-surface text-text-secondary hover:border-primary/40"
									}`}
								>
									<span
										className="inline-block h-4 w-4 rounded-full border border-border"
										style={{ background: t.swatch }}
									/>
									{t.label}
								</button>
							))}
						</div>
					</SettingsField>

					<SettingsField label="字体族" layout="horizontal">
						<select
							value={settings.font_family}
							onChange={(e) => void patch({ font_family: e.target.value })}
							className={settingsInputClass}
							disabled={!loaded}
						>
							{READER_FONT_FAMILIES.map((f) => (
								<option key={f.id} value={f.id}>
									{f.label}
								</option>
							))}
						</select>
					</SettingsField>

					<SettingsField
						label={`字号（${settings.font_size}px）`}
						layout="horizontal"
					>
						<input
							type="range"
							min={12}
							max={28}
							step={1}
							value={settings.font_size}
							onChange={(e) =>
								void patch({ font_size: Number(e.target.value) })
							}
							className="flex-1"
						/>
					</SettingsField>

					<SettingsField
						label={`行距（${settings.line_height.toFixed(2)}）`}
						layout="horizontal"
					>
						<input
							type="range"
							min={1.3}
							max={2.2}
							step={0.05}
							value={settings.line_height}
							onChange={(e) =>
								void patch({ line_height: Number(e.target.value) })
							}
							className="flex-1"
						/>
					</SettingsField>

					<SettingsField
						label={`字间距（${settings.letter_spacing.toFixed(3)}em）`}
						layout="horizontal"
					>
						<input
							type="range"
							min={-0.02}
							max={0.08}
							step={0.005}
							value={settings.letter_spacing}
							onChange={(e) =>
								void patch({ letter_spacing: Number(e.target.value) })
							}
							className="flex-1"
						/>
					</SettingsField>

					<SettingsField
						label={`版面宽度（${settings.max_width_ch}ch）`}
						layout="horizontal"
					>
						<input
							type="range"
							min={50}
							max={100}
							step={1}
							value={settings.max_width_ch}
							onChange={(e) =>
								void patch({ max_width_ch: Number(e.target.value) })
							}
							className="flex-1"
						/>
					</SettingsField>

					<SettingsField label="分栏" layout="horizontal">
						<select
							value={settings.column_count}
							onChange={(e) =>
								void patch({
									column_count: Number(e.target.value) as 1 | 2,
								})
							}
							className={settingsInputClass}
						>
							<option value={1}>单栏</option>
							<option value={2}>双栏（实验）</option>
						</select>
					</SettingsField>
				</div>
			</SettingsSectionCard>

			{/* 沉浸 / 翻页 */}
			<SettingsSectionCard>
				<SettingsHeader
					title="阅读体验"
					description="翻页过渡、自动隐藏控件、勿扰模式。"
					action={<Eye className="h-4 w-4 text-text-muted" />}
				/>
				<div className="px-5 pb-2">
					<SettingsField label="翻页过渡" layout="horizontal">
						<select
							value={settings.page_transition}
							onChange={(e) =>
								void patch({
									page_transition: e.target
										.value as ReaderClientSettings["page_transition"],
								})
							}
							className={settingsInputClass}
						>
							<option value="slide">滑动</option>
							<option value="fade">淡入</option>
							<option value="instant">无</option>
						</select>
					</SettingsField>

					<SettingsField
						label={`沉浸模式自动隐藏顶栏（${settings.auto_hide_chrome_ms}ms）`}
						hint="为 0 表示不隐藏。鼠标移动会立即恢复。"
						layout="horizontal"
					>
						<input
							type="range"
							min={0}
							max={4000}
							step={100}
							value={settings.auto_hide_chrome_ms}
							onChange={(e) =>
								void patch({
									auto_hide_chrome_ms: Number(e.target.value),
								})
							}
							className="flex-1"
						/>
					</SettingsField>

					<SettingsField label="划词默认动作" layout="horizontal">
						<select
							value={settings.default_selection_action}
							onChange={(e) =>
								void patch({
									default_selection_action: e.target
										.value as ReaderClientSettings["default_selection_action"],
								})
							}
							className={settingsInputClass}
						>
							<option value="highlight">高亮</option>
							<option value="explain">解释</option>
							<option value="translate">翻译</option>
							<option value="ask">追问</option>
						</select>
					</SettingsField>

					<SettingsRow
						label="阅读时屏蔽通知"
						description="进入阅读器全屏时静音 Toast、通知中心提醒（系统级提醒不受影响）。"
						action={
							<SettingsSwitch
								checked={settings.disable_notifications_while_reading}
								onChange={(v) =>
									void patch({ disable_notifications_while_reading: v })
								}
							/>
						}
					/>
				</div>
			</SettingsSectionCard>

			{/* 朗读 */}
			<SettingsSectionCard>
				<SettingsHeader
					title="朗读 (TTS)"
					description="语音引擎与默认语速。"
					action={<Volume2 className="h-4 w-4 text-text-muted" />}
				/>
				<div className="px-5 pb-2">
					<SettingsField label="语音引擎" layout="horizontal">
						<select
							value={settings.tts_provider}
							onChange={(e) =>
								void patch({
									tts_provider: e.target
										.value as ReaderClientSettings["tts_provider"],
								})
							}
							className={settingsInputClass}
						>
							<option value="system">系统语音 (本地)</option>
							<option value="openai" disabled>
								OpenAI TTS（需在模型设置中配置）
							</option>
							<option value="azure" disabled>
								Azure TTS（占位）
							</option>
							<option value="volcano" disabled>
								火山 TTS（占位）
							</option>
						</select>
					</SettingsField>

					<SettingsField
						label={`语速（${settings.tts_rate.toFixed(2)}x）`}
						layout="horizontal"
					>
						<input
							type="range"
							min={0.5}
							max={2.5}
							step={0.05}
							value={settings.tts_rate}
							onChange={(e) => void patch({ tts_rate: Number(e.target.value) })}
							className="flex-1"
						/>
					</SettingsField>
				</div>
			</SettingsSectionCard>

			{/* AI 副驾驶 */}
			<SettingsSectionCard>
				<SettingsHeader
					title="AI 副驾驶"
					description="副驾驶上下文范围。整本书会用 KB 检索 + 聚合摘要。"
					action={<Sparkles className="h-4 w-4 text-text-muted" />}
				/>
				<div className="px-5 pb-2">
					<SettingsField label="上下文范围" layout="horizontal">
						<select
							value={settings.ai_context_scope}
							onChange={(e) =>
								void patch({
									ai_context_scope: e.target
										.value as ReaderClientSettings["ai_context_scope"],
								})
							}
							className={settingsInputClass}
						>
							<option value="chapter">当前章节（更快、更精）</option>
							<option value="book">整本书（FTS5 + 摘要）</option>
						</select>
					</SettingsField>
				</div>
			</SettingsSectionCard>
		</SettingsPageContainer>
	);
}
