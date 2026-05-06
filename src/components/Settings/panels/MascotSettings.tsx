import { useCallback, useEffect, useState } from "react";
import { Download, ExternalLink, Sparkles } from "lucide-react";
import {
	useMascot,
	type CustomMascotMeta,
	type MascotId,
	type MascotSelection,
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
import { CustomMascotEditor } from "../../Mascot/CustomMascotEditor";
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

const FALLBACK_ACCENT = "#D96C46";

export function MascotSettings() {
	const { id, setId, getMergedMeta, getAllMascotIds } = useMascot();
	const previewId: MascotId = id === "off" ? "efficiency" : id;
	const meta = getMergedMeta(previewId);
	const accentColor = meta?.accentColor ?? FALLBACK_ACCENT;

	const [editingMascot, setEditingMascot] = useState<CustomMascotMeta | null>(
		null,
	);

	// 桌面宠物窗口设置
	const [petEnabled, setPetEnabled] = useState(true);
	const [petThroughClicks, setPetThroughClicks] = useState(false);
	const [sizePreset, setSizePreset] = useState<"sm" | "md" | "lg" | "xl">("lg");
	const [dwellPreset, setDwellPreset] = useState<"short" | "normal" | "long">(
		"normal",
	);
	const [dndStart, setDndStart] = useState<string>("");
	const [dndEnd, setDndEnd] = useState<string>("");
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
			.catch(() => {
				setPetSettingsLoaded(true);
			});
	}, []);

	const handlePetEnabledChange = useCallback((next: boolean) => {
		setPetEnabled(next);
		void invoke("pet_window_set_enabled", { enabled: next });
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

	const handleThroughClicksChange = useCallback((next: boolean) => {
		setPetThroughClicks(next);
		void invoke("pet_window_set_through_clicks", { enabled: next });
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

			<SettingsSectionCard className="px-7 py-7">
				<SettingsSectionTitle>选择桌面宠物</SettingsSectionTitle>
				<MascotPicker
					value={id}
					onChange={(next) => setId(next as MascotSelection, "main")}
					onEditCustom={handleEditCustom}
				/>
				<div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-warm-50 px-4 py-3">
					<Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
					<div className="flex-1 min-w-0 text-[12px] text-text-secondary leading-relaxed">
						<span className="font-medium">支持三种来源：</span>
						自家 zip 包（pet.json + 17 个 PNG）、{" "}
						<code className={codeClass}>~/.codex/pets/&lt;id&gt;/</code>{" "}
						目录、或{" "}
						<code className={codeClass}>hatch-pet/runs/&lt;id&gt;/</code>{" "}
						目录。缺失的 hero / 主色会自动从 spritesheet 派生。
					</div>
					<a
						href="https://github.com/anthropics/claude-code/blob/main/docs/custom-mascot-pack.md"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 rounded-lg bg-surface border border-border px-3 py-1.5 text-[11.5px] font-medium text-text-secondary hover:border-primary/40 hover:text-primary transition"
					>
						<ExternalLink className="h-3 w-3" />
						查看打包规范
					</a>
					<button
						type="button"
						onClick={() => void downloadTemplate()}
						className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground hover:opacity-90 transition"
					>
						<Download className="h-3 w-3" />
						下载 pet.json 模版
					</button>
				</div>
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
							<SettingsRow
								label="宠物大小"
								description="决定桌面悬浮窗的视觉大小，立即生效。"
								value={
									<SizePresetChips
										value={sizePreset}
										onChange={handleSizePresetChange}
										accentColor={accentColor}
									/>
								}
							/>
							<SettingsRow
								label="通知停留时长"
								description="完成 / 错误 / 提醒等气泡的停留时长，影响节奏感。"
								value={
									<DwellPresetChips
										value={dwellPreset}
										onChange={handleDwellPresetChange}
										accentColor={accentColor}
									/>
								}
							/>
							<SettingsRow
								label="勿扰时段"
								description="该时段内 done / progress 静默，仅 reminder / error 出气泡。留空则不启用。"
								value={
									<DndTimeInputs
										start={dndStart}
										end={dndEnd}
										onChange={handleDndChange}
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

			{id !== "off" && meta && (
				<SettingsSectionCard className="px-7 py-7">
					<SettingsSectionTitle>当前形象 · {meta.label}</SettingsSectionTitle>

					<SettingsRow
						label={meta.label}
						description={meta.personality}
						value={
							<span
								className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
								style={{
									backgroundColor: `${accentColor}1A`,
									color: accentColor,
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
							{PREVIEW_SLOTS.map(({ slot, label }) => {
								const src = getMascotAsset(previewId, slot);
								return (
									<div
										key={slot}
										className="flex flex-col items-center gap-1.5 rounded-xl border border-border/70 bg-surface px-2 py-3 transition hover:border-primary/30 hover:shadow-bai-card"
									>
										<div
											className="flex h-16 w-16 items-center justify-center rounded-full"
											style={{ backgroundColor: `${accentColor}10` }}
										>
											{src ? (
												<img
													src={src}
													alt={label}
													draggable={false}
													className="h-full w-full object-contain p-0.5"
												/>
											) : (
												<span className="text-[10px] text-text-light">
													缺位
												</span>
											)}
										</div>
										<span className="text-[11px] text-text-secondary">
											{label}
										</span>
									</div>
								);
							})}
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
									borderColor: `${accentColor}33`,
								}}
							>
								<div
									className="flex h-20 w-20 items-center justify-center rounded-full overflow-hidden shrink-0"
									style={{ backgroundColor: `${accentColor}10` }}
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
												backgroundColor: `${accentColor}10`,
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
						{getAllMascotIds().map((mid) => {
							const m = getMergedMeta(mid);
							if (!m) return null;
							const src = getMascotAsset(mid, "hero");
							return (
								<div
									key={mid}
									className="flex flex-col items-center gap-2 rounded-xl bg-warm-50 p-4"
								>
									<div
										className="flex h-20 w-20 items-center justify-center rounded-full"
										style={{ backgroundColor: `${m.accentColor}14` }}
									>
										{src ? (
											<img
												src={src}
												alt={m.label}
												draggable={false}
												className="h-full w-full object-contain p-0.5"
											/>
										) : (
											<span className="text-[12px] text-text-light">
												{m.label.slice(0, 2)}
											</span>
										)}
									</div>
									<div className="text-[12.5px] font-semibold text-text-primary line-clamp-1">
										{m.label}
									</div>
									<div className="text-[11px] text-text-light text-center leading-snug line-clamp-2">
										{m.tagline}
									</div>
									{!m.isBuiltin && (
										<span className="text-[10px] text-text-light bg-warm-100 px-1.5 py-0.5 rounded-full">
											自定义
										</span>
									)}
								</div>
							);
						})}
					</div>
				</SettingsSectionCard>
			)}

			<CustomMascotEditor
				mascot={editingMascot}
				onClose={() => setEditingMascot(null)}
			/>
		</SettingsPageContainer>
	);
}

const codeClass = "px-1 py-0.5 rounded bg-warm-100 text-[10.5px] font-mono";

/**
 * 下载 pet.json 模版
 *
 * 用浏览器下载 API 直接拉本地静态文件，避免要求用户读 markdown 后再手敲。
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

const SIZE_PRESETS: {
	value: "sm" | "md" | "lg" | "xl";
	label: string;
	px: number;
}[] = [
	{ value: "sm", label: "小", px: 120 },
	{ value: "md", label: "中", px: 160 },
	{ value: "lg", label: "大", px: 180 },
	{ value: "xl", label: "特大", px: 220 },
];

function SizePresetChips({
	value,
	onChange,
	accentColor,
}: {
	value: "sm" | "md" | "lg" | "xl";
	onChange: (next: "sm" | "md" | "lg" | "xl") => void;
	accentColor: string;
}) {
	return (
		<div className="flex items-center gap-1.5">
			{SIZE_PRESETS.map((p) => {
				const active = p.value === value;
				return (
					<button
						key={p.value}
						type="button"
						onClick={() => onChange(p.value)}
						className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium leading-none transition-colors"
						style={{
							borderColor: active ? accentColor : "var(--t-border, #e8e3d8)",
							backgroundColor: active ? `${accentColor}1F` : "transparent",
							color: active ? accentColor : "var(--t-text-secondary, #6b6b68)",
						}}
					>
						<span>{p.label}</span>
						<span className="text-[10px] tabular-nums opacity-70">{p.px}</span>
					</button>
				);
			})}
		</div>
	);
}

const DWELL_PRESETS: {
	value: "short" | "normal" | "long";
	label: string;
	hint: string;
}[] = [
	{ value: "short", label: "较短", hint: "× 0.7" },
	{ value: "normal", label: "默认", hint: "× 1" },
	{ value: "long", label: "较长", hint: "× 1.5" },
];

function DwellPresetChips({
	value,
	onChange,
	accentColor,
}: {
	value: "short" | "normal" | "long";
	onChange: (next: "short" | "normal" | "long") => void;
	accentColor: string;
}) {
	return (
		<div className="flex items-center gap-1.5">
			{DWELL_PRESETS.map((p) => {
				const active = p.value === value;
				return (
					<button
						key={p.value}
						type="button"
						onClick={() => onChange(p.value)}
						className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium leading-none transition-colors"
						style={{
							borderColor: active ? accentColor : "var(--t-border, #e8e3d8)",
							backgroundColor: active ? `${accentColor}1F` : "transparent",
							color: active ? accentColor : "var(--t-text-secondary, #6b6b68)",
						}}
					>
						<span>{p.label}</span>
						<span className="text-[10px] tabular-nums opacity-70">
							{p.hint}
						</span>
					</button>
				);
			})}
		</div>
	);
}

function DndTimeInputs({
	start,
	end,
	onChange,
}: {
	start: string;
	end: string;
	onChange: (nextStart: string, nextEnd: string) => void;
}) {
	const inputClass =
		"h-7 w-[88px] rounded-md border border-border bg-surface px-2 text-[12px] text-text-primary outline-none focus:border-primary/50";
	return (
		<div className="flex items-center gap-1.5">
			<input
				type="time"
				value={start}
				onChange={(e) => onChange(e.target.value, end)}
				className={inputClass}
				aria-label="勿扰开始时间"
			/>
			<span className="text-[12px] text-text-light">至</span>
			<input
				type="time"
				value={end}
				onChange={(e) => onChange(start, e.target.value)}
				className={inputClass}
				aria-label="勿扰结束时间"
			/>
			{(start || end) && (
				<button
					type="button"
					onClick={() => onChange("", "")}
					className="ml-1 text-[11px] text-text-light hover:text-text-secondary transition-colors"
				>
					清除
				</button>
			)}
		</div>
	);
}
