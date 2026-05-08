/**
 * MascotSettings — 桌面宠物设置（重设计后的主入口）
 *
 * 结构：
 *   1. SettingsPanelHeader 标题
 *   2. MascotHeroBanner   — 当前形象英雄卡
 *   3. MascotWindowControls — 桌面悬浮窗的 5 项卡片化控件
 *   4. 选择器卡 (含 MascotPicker + MascotPackagingFooter)
 *   5. EmotionGallery + LoadingPreview + MotionGallery — 资源画廊
 *
 * 状态：仅持久化 pet_window_* 一组；mascot 选择由 useMascot 接管。
 */
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
	useMascot,
	type CustomMascotMeta,
	type MascotId,
	type MascotSelection,
} from "../../../lib/mascotStore";
import { invoke } from "../../../lib/tauriCompat";
import { MascotPicker } from "../../Mascot/MascotPicker";
import { CustomMascotEditor } from "../../Mascot/CustomMascotEditor";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsCardSection,
	SettingsPageContainer,
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../ui/SettingsPrimitives";
import { MascotHeroBanner } from "./mascot/MascotHeroBanner";
import { MascotWindowControls } from "./mascot/MascotWindowControls";
import { MascotEmotionGallery } from "./mascot/MascotEmotionGallery";
import { MascotMotionGallery } from "./mascot/MascotMotionGallery";
import { MascotLoadingPreview } from "./mascot/MascotLoadingPreview";
import { MascotPackagingFooter } from "./mascot/MascotPackagingFooter";
import { getMascotAtlas } from "../../../lib/mascot/manifest";

const FALLBACK_ACCENT = "#D96C46";

export function MascotSettings() {
	const { id, setId, getMergedMeta } = useMascot();
	const previewId: MascotId = id === "off" ? "efficiency" : id;
	const meta = getMergedMeta(previewId);
	const accentColor = meta?.accentColor ?? FALLBACK_ACCENT;

	const [editingMascot, setEditingMascot] = useState<CustomMascotMeta | null>(
		null,
	);

	const [petEnabled, setPetEnabled] = useState(true);
	const [petThroughClicks, setPetThroughClicks] = useState(false);
	const [sizePreset, setSizePreset] = useState<"sm" | "md" | "lg" | "xl">("lg");
	const [dwellPreset, setDwellPreset] = useState<"short" | "normal" | "long">(
		"normal",
	);
	const [dndStart, setDndStart] = useState("");
	const [dndEnd, setDndEnd] = useState("");
	const [petSettingsLoaded, setPetSettingsLoaded] = useState(false);

	useEffect(() => {
		void invoke<{
			enabled: boolean;
			throughClicks: boolean;
			sizePreset: "sm" | "md" | "lg" | "xl";
			dwellPreset: "short" | "normal" | "long";
			dndStart: string | null;
			dndEnd: string | null;
		}>("pet_window_get_state")
			.then((state) => {
				setPetEnabled(state.enabled);
				setPetThroughClicks(state.throughClicks);
				if (state.sizePreset) setSizePreset(state.sizePreset);
				if (state.dwellPreset) setDwellPreset(state.dwellPreset);
				setDndStart(state.dndStart ?? "");
				setDndEnd(state.dndEnd ?? "");
				setPetSettingsLoaded(true);
			})
			.catch(() => setPetSettingsLoaded(true));
	}, []);

	const handlePetEnabledChange = useCallback((next: boolean) => {
		setPetEnabled(next);
		void invoke("pet_window_set_enabled", { enabled: next });
	}, []);
	const handleThroughClicksChange = useCallback((next: boolean) => {
		setPetThroughClicks(next);
		void invoke("pet_window_set_through_clicks", { enabled: next });
	}, []);
	const handleSizePresetChange = useCallback(
		(preset: "sm" | "md" | "lg" | "xl") => {
			setSizePreset(preset);
			void invoke("pet_window_set_size_preset", { preset });
		},
		[],
	);
	const handleDwellPresetChange = useCallback(
		(preset: "short" | "normal" | "long") => {
			setDwellPreset(preset);
			void invoke("pet_window_set_dwell_preset", { preset });
		},
		[],
	);
	const handleDndChange = useCallback((nextStart: string, nextEnd: string) => {
		setDndStart(nextStart);
		setDndEnd(nextEnd);
		void invoke("pet_window_set_dnd", {
			start: nextStart || null,
			end: nextEnd || null,
		});
	}, []);

	const handleEditCustom = useCallback((mascot: CustomMascotMeta) => {
		setEditingMascot(mascot);
	}, []);

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={Sparkles}
				title="桌面宠物"
				description="为 IPO Workbench 选一位陪伴你的桌面宠物——墨鱼君。可在内置形象和你上传的自定义桌宠之间切换。"
			/>

			{id !== "off" && meta && (
				<MascotHeroBanner
					id={previewId}
					meta={meta}
					windowEnabled={petEnabled && petSettingsLoaded}
				/>
			)}

			{id !== "off" && petSettingsLoaded && (
				<SettingsCardSection
					title="桌面悬浮窗"
					description="独立的桌面陪伴窗口；启用后可拖拽定位、右键打开主窗口。"
				>
					<MascotWindowControls
						enabled={petEnabled}
						onEnabledChange={handlePetEnabledChange}
						throughClicks={petThroughClicks}
						onThroughClicksChange={handleThroughClicksChange}
						sizePreset={sizePreset}
						onSizePresetChange={handleSizePresetChange}
						dwellPreset={dwellPreset}
						onDwellPresetChange={handleDwellPresetChange}
						dndStart={dndStart}
						dndEnd={dndEnd}
						onDndChange={handleDndChange}
						accentColor={accentColor}
					/>
				</SettingsCardSection>
			)}

			<SettingsSectionCard className="px-6 py-6">
				<SettingsSectionTitle>选择形象</SettingsSectionTitle>
				<MascotPicker
					value={id}
					onChange={(next) => setId(next as MascotSelection, "main")}
					onEditCustom={handleEditCustom}
				/>
				<div className="mt-5">
					<MascotPackagingFooter onDownloadTemplate={downloadTemplate} />
				</div>
			</SettingsSectionCard>

			{id !== "off" && meta && (
				<SettingsCardSection
					title={`资源预览 · ${meta.label}`}
					description="表情、状态、思考动画与 spritesheet — 数据均来自当前 IP 的真实资产。"
				>
					<div className="space-y-5">
						<MascotEmotionGallery id={previewId} accentColor={accentColor} />
						<MascotLoadingPreview id={previewId} accentColor={accentColor} />
						{getMascotAtlas(previewId) && (
							<MascotMotionGallery accentColor={accentColor} />
						)}
					</div>
				</SettingsCardSection>
			)}

			<CustomMascotEditor
				mascot={editingMascot}
				onClose={() => setEditingMascot(null)}
			/>
		</SettingsPageContainer>
	);
}

/**
 * 下载 pet.json 模版（保留旧实现）。
 */
async function downloadTemplate(): Promise<void> {
	const template = {
		schemaVersion: 1,
		id: "my-mascot",
		label: "我的桌宠",
		tagline: "一句话标语",
		personality: "一段对它形象/性格的简短描述。",
		accentColor: "#D96C46",
		hasAtlas: false,
		hasLoading: false,
	};
	const blob = new Blob([JSON.stringify(template, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "pet.json";
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
