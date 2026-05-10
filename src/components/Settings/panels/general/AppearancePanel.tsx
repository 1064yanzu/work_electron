/**
 * AppearancePanel — 通用 · 外观与主题
 *
 * Phase 6 拆分自 `panels/GeneralSettings.tsx`。相比原面板：
 *   - 移除「设置详细程度」Select（Experience Mode 在 Phase 7 整体废弃）；
 *   - 保留色彩主题（ThemeColorPicker）、动效偏好、语言三块；
 *   - 每个字段容器挂 `id` + `data-settings-anchor`，供顶部 SettingsSearch 跳转定位。
 */
import { Palette } from "lucide-react";
import { useEffect, useState } from "react";
import { Select } from "../../../ui/Select";
import {
	getConfig,
	getMotionPreference,
	setConfig,
	setMotionPreference,
} from "../../../../lib/config";
import type { MotionPreference } from "../../../../lib/interaction/motionPreference";
import { type ThemeMode, themeManager } from "../../../../lib/theme";
import { toast } from "../../../ui/Toast";
import { SettingsPanelHeader } from "../../components/SettingsPanelHeader";
import { ThemeColorPicker } from "../../components/ThemeColorPicker";
import {
	SettingsPageContainer,
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../../ui/SettingsPrimitives";

/** 锚点 id 常量：与 fields.ts 的 FieldDescriptor 对齐，也是 data-settings-anchor 属性值 */
const ANCHOR = {
	theme: "general.appearance.theme",
	motion: "general.appearance.motion",
	language: "general.appearance.language",
} as const;

export function AppearancePanel() {
	const [theme, setTheme] = useState<ThemeMode>(themeManager.getTheme());
	const [colorThemeId, setColorThemeId] = useState<string>(
		themeManager.getColorThemeId(),
	);
	const [language, setLanguage] = useState<string>("zh-CN");
	const [motionPreference, setMotionPreferenceState] =
		useState<MotionPreference>("system");

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [lang, motionPref] = await Promise.all([
					getConfig("language"),
					getMotionPreference(),
				]);
				if (cancelled) return;
				if (typeof lang === "string" && lang.trim()) setLanguage(lang);
				setMotionPreferenceState(motionPref);
			} catch (error) {
				console.error("[AppearancePanel] 加载设置失败:", error);
			}
		})();

		const unsubscribe = themeManager.subscribe(() => {
			setTheme(themeManager.getTheme());
			setColorThemeId(themeManager.getColorThemeId());
		});
		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, []);

	const handleThemeChange = async (nextTheme: ThemeMode) => {
		themeManager.setTheme(nextTheme);
		try {
			await setConfig("theme", nextTheme);
		} catch (error) {
			console.error("[AppearancePanel] 保存主题失败:", error);
			toast.error("保存外观模式失败");
		}
	};

	const handleColorThemeChange = async (id: string) => {
		themeManager.setColorTheme(id);
		try {
			await setConfig("colorTheme", id);
		} catch (error) {
			console.error("[AppearancePanel] 保存色彩主题失败:", error);
			toast.error("保存色彩主题失败");
		}
	};

	const handleLanguageChange = async (nextLang: string) => {
		const prev = language;
		setLanguage(nextLang);
		try {
			await setConfig("language", nextLang);
		} catch (error) {
			console.error("[AppearancePanel] 保存语言失败:", error);
			setLanguage(prev);
			toast.error("保存语言失败");
		}
	};

	const handleMotionPreferenceChange = async (value: MotionPreference) => {
		const prev = motionPreference;
		setMotionPreferenceState(value);
		try {
			await setMotionPreference(value);
		} catch (error) {
			console.error("[AppearancePanel] 保存动效偏好失败:", error);
			setMotionPreferenceState(prev);
			toast.error("保存动效偏好失败");
		}
	};

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
			<SettingsPanelHeader
				icon={Palette}
				title="外观与主题"
				description="配置色彩主题、亮/暗模式、动效偏好与界面语言。"
			/>

			{/* 色彩主题 + 亮/暗模式 */}
			<SettingsSectionCard>
				<div
					className="p-5"
					id={ANCHOR.theme}
					data-settings-anchor={ANCHOR.theme}
				>
					<SettingsSectionTitle>界面外观</SettingsSectionTitle>
					<ThemeColorPicker
						currentColorThemeId={colorThemeId}
						currentMode={theme}
						onColorThemeChange={handleColorThemeChange}
						onModeChange={handleThemeChange}
					/>
				</div>
			</SettingsSectionCard>

			{/* 动效与语言 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>动效与语言</SettingsSectionTitle>
					<div
						id={ANCHOR.motion}
						data-settings-anchor={ANCHOR.motion}
					>
						<SettingsRow
							label="动效偏好"
							description="减少动效会显著缩短过渡与动画时长，适合对动态效果敏感的场景。"
							action={
								<Select
									value={motionPreference}
									onChange={(e) =>
										handleMotionPreferenceChange(
											e.target.value as MotionPreference,
										)
									}
									variant="inline"
									containerClassName="w-auto min-w-[160px]"
									options={[
										{ value: "system", label: "跟随系统（默认）" },
										{ value: "standard", label: "标准动效" },
										{ value: "reduced", label: "减少动效" },
									]}
								/>
							}
						/>
					</div>
					<div
						id={ANCHOR.language}
						data-settings-anchor={ANCHOR.language}
					>
						<SettingsRow
							label="语言"
							description="切换界面语言需要重启应用后完全生效。"
							action={
								<Select
									value={language}
									onChange={(e) => handleLanguageChange(e.target.value)}
									variant="inline"
									containerClassName="w-auto min-w-[120px]"
									options={[
										{ value: "zh-CN", label: "简体中文" },
										{ value: "en-US", label: "English" },
									]}
								/>
							}
						/>
					</div>
				</div>
			</SettingsSectionCard>
		</SettingsPageContainer>
	);
}
