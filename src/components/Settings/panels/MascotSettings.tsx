import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
	useMascot,
	MASCOT_IDS,
	MASCOT_META,
	type MascotId,
} from "../../../lib/mascotStore";
import {
	getMascotAsset,
	getMascotAnimation,
	getMascotAtlas,
	type MascotSlot,
	type MascotMotion,
} from "../../../lib/mascot/manifest";
import { invoke } from "../../../lib/tauriCompat";
import { MascotPicker } from "../../Mascot/MascotPicker";
import { MascotSprite } from "../../Mascot/MascotSprite";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsPageContainer,
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
	SettingsSwitch,
} from "../ui/SettingsPrimitives";

const PREVIEW_SLOTS: { slot: MascotSlot; label: string }[] = [
	{ slot: "emotion-happy", label: "开心" },
	{ slot: "emotion-thinking", label: "思考" },
	{ slot: "emotion-focus", label: "专注" },
	{ slot: "emotion-surprise", label: "惊讶" },
	{ slot: "emotion-sad", label: "委屈" },
	{ slot: "emotion-sleepy", label: "困倦" },
	{ slot: "state-greet", label: "打招呼" },
	{ slot: "state-organize", label: "整理" },
	{ slot: "state-remind", label: "提醒" },
	{ slot: "state-done", label: "完成" },
];

const MOTION_PREVIEWS: { motion: MascotMotion; label: string; hint: string }[] =
	[
		{ motion: "idle", label: "Idle 待机", hint: "欢迎页 / 默认呼吸" },
		{
			motion: "thinking",
			label: "Thinking 思考",
			hint: "Agent 等待 / 文档生成",
		},
		{ motion: "greet", label: "Greet 打招呼", hint: "首屏 / 上线问候" },
		{ motion: "done", label: "Done 完成", hint: "任务结束 / 庆祝" },
		{ motion: "sad", label: "Sad 委屈", hint: "错误态 / 空数据" },
		{ motion: "sleepy", label: "Sleepy 困倦", hint: "长时间无操作" },
	];

export function MascotSettings() {
	const { id, setId } = useMascot();
	const previewId: MascotId = id === "off" ? "efficiency" : id;
	const meta = MASCOT_META[previewId];

	// 桌面宠物窗口设置
	const [petEnabled, setPetEnabled] = useState(true);
	const [petThroughClicks, setPetThroughClicks] = useState(false);
	const [petSettingsLoaded, setPetSettingsLoaded] = useState(false);

	useEffect(() => {
		void invoke<{ enabled: boolean; throughClicks: boolean }>(
			"pet_window_get_state",
		)
			.then((state) => {
				setPetEnabled(state.enabled);
				setPetThroughClicks(state.throughClicks);
				setPetSettingsLoaded(true);
			})
			.catch(() => {
				setPetSettingsLoaded(true);
			});
	}, []);

	const handlePetEnabledChange = useCallback((next: boolean) => {
		setPetEnabled(next);
		void invoke("pet_window_set_enabled", { enabled: next });
	}, []);

	const handleThroughClicksChange = useCallback((next: boolean) => {
		setPetThroughClicks(next);
		void invoke("pet_window_set_through_clicks", { enabled: next });
	}, []);

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={Sparkles}
				title="桌面宠物"
				description="为 IPO Workbench 选一位陪伴你的桌面宠物——墨鱼君。可在三个人格之间切换,或关闭回到极简图标。"
			/>

			<SettingsSectionCard className="px-7 py-7">
				<SettingsSectionTitle>选择桌面宠物</SettingsSectionTitle>
				<MascotPicker value={id} onChange={setId} />
				<p className="mt-4 text-[12px] text-text-muted leading-relaxed">
					切换后立即生效,影响欢迎页、空状态、思考态、完成提示等位置。资产已离线打包内置,无需联网。
				</p>
			</SettingsSectionCard>

			{id !== "off" && petSettingsLoaded && (
				<SettingsSectionCard className="px-7 py-7">
					<SettingsSectionTitle>桌面宠物窗口</SettingsSectionTitle>
					<SettingsRow
						label="启用桌面宠物"
						description="在桌面上显示独立悬浮窗，宠物会在主窗口之外持续陪伴你。"
						value={
							<SettingsSwitch
								checked={petEnabled}
								onChange={handlePetEnabledChange}
							/>
						}
					/>
					{petEnabled && (
						<>
							<SettingsRow
								label="勿扰模式"
								description="鼠标事件穿透宠物窗口，不影响背后操作。"
								value={
									<SettingsSwitch
										checked={petThroughClicks}
										onChange={handleThroughClicksChange}
									/>
								}
							/>
							<p className="mt-3 text-[11px] text-text-light leading-relaxed">
								宠物窗口支持拖拽定位，松开后自动记忆位置。右键点击宠物可快速打开主窗口。
							</p>
						</>
					)}
				</SettingsSectionCard>
			)}

			{id !== "off" && (
				<SettingsSectionCard className="px-7 py-7">
					<SettingsSectionTitle>当前形象 · {meta.label}</SettingsSectionTitle>

					<SettingsRow
						label={meta.label}
						description={meta.personality}
						value={
							<span
								className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
								style={{
									backgroundColor: `${meta.accentColor}1A`,
									color: meta.accentColor,
								}}
							>
								{meta.tagline}
							</span>
						}
					/>

					<div className="mt-6">
						<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-3">
							表情与状态
						</div>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
							{PREVIEW_SLOTS.map(({ slot, label }) => (
								<div
									key={slot}
									className="flex flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-surface px-2 py-3 transition hover:border-primary/30 hover:shadow-bai-card"
								>
									<div
										className="flex h-16 w-16 items-center justify-center rounded-full"
										style={{ backgroundColor: `${meta.accentColor}10` }}
									>
										<img
											src={getMascotAsset(previewId, slot)}
											alt={label}
											draggable={false}
											className="h-full w-full object-contain p-0.5"
										/>
									</div>
									<span className="text-[11px] text-text-secondary">
										{label}
									</span>
								</div>
							))}
						</div>
					</div>

					{getMascotAnimation(previewId, "loading") && (
						<div className="mt-6">
							<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted mb-3">
								Loading 动画
							</div>
							<div
								className="flex items-center gap-4 rounded-xl border border-border/70 bg-surface px-4 py-4"
								style={{
									borderColor: `${meta.accentColor}33`,
								}}
							>
								<div
									className="flex h-20 w-20 items-center justify-center rounded-full overflow-hidden shrink-0"
									style={{ backgroundColor: `${meta.accentColor}10` }}
								>
									<video
										// 用 src 做 key，IP 切换时强制重建播放器
										key={getMascotAnimation(previewId, "loading") ?? "none"}
										src={getMascotAnimation(previewId, "loading") ?? undefined}
										autoPlay
										loop
										muted
										playsInline
										preload="auto"
										className="h-full w-full object-contain"
									/>
								</div>
								<div className="min-w-0">
									<div className="text-[12.5px] font-semibold text-text-primary">
										思考态视频动画
									</div>
									<div className="text-[11px] text-text-light leading-relaxed mt-1">
										在文档生成、Agent
										等待等长时间任务中替代静态图片，让等待更生动。仅当前 IP
										配置了视频时启用。
									</div>
								</div>
							</div>
						</div>
					)}

					{getMascotAtlas(previewId) && (
						<div className="mt-6">
							<div className="flex items-baseline justify-between mb-3">
								<div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
									Spritesheet 动效（试验）
								</div>
								<div className="text-[10.5px] text-text-light">
									来自 codex hatch-pet · 1536×1872 · 192×208 单格
								</div>
							</div>
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
								{MOTION_PREVIEWS.map(({ motion, label, hint }) => (
									<div
										key={motion}
										className="flex flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-surface px-2 py-3 transition hover:border-primary/30 hover:shadow-bai-card"
									>
										<div
											className="flex items-center justify-center rounded-2xl overflow-hidden"
											style={{
												backgroundColor: `${meta.accentColor}10`,
												width: "88px",
												height: `${(88 * 208) / 192}px`,
											}}
										>
											<MascotSprite motion={motion} size={84} />
										</div>
										<span className="text-[11.5px] font-medium text-text-secondary mt-1">
											{label}
										</span>
										<span className="text-[10px] text-text-light leading-snug text-center">
											{hint}
										</span>
									</div>
								))}
							</div>
							<p className="mt-3 text-[11px] text-text-light leading-relaxed">
								每帧时长不等（120–360ms），最后一帧延长以模拟"活物呼吸感"。
								<code className="px-1 py-0.5 rounded bg-warm-100 text-[10.5px]">
									prefers-reduced-motion
								</code>{" "}
								用户会自动停在第一帧。
							</p>
						</div>
					)}
				</SettingsSectionCard>
			)}

			{id !== "off" && (
				<SettingsSectionCard className="px-7 py-6">
					<SettingsSectionTitle>对比所有形象</SettingsSectionTitle>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
						{MASCOT_IDS.map((mid) => {
							const m = MASCOT_META[mid];
							return (
								<div
									key={mid}
									className="flex flex-col items-center gap-2 rounded-xl bg-warm-50 p-4"
								>
									<div
										className="flex h-20 w-20 items-center justify-center rounded-full"
										style={{ backgroundColor: `${m.accentColor}14` }}
									>
										<img
											src={getMascotAsset(mid, "hero")}
											alt={m.label}
											draggable={false}
											className="h-full w-full object-contain p-0.5"
										/>
									</div>
									<div className="text-[12.5px] font-semibold text-text-primary">
										{m.label}
									</div>
									<div className="text-[11px] text-text-light text-center leading-snug">
										{m.tagline}
									</div>
								</div>
							);
						})}
					</div>
				</SettingsSectionCard>
			)}
		</SettingsPageContainer>
	);
}
