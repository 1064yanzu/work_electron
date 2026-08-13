/**
 * TTSSettings — 主语音朗读设置面板
 *
 * 重设计后结构：
 *  1. 全局默认（TTSGlobalSection）— 默认 Provider/Voice + 全局 rate/volume/pitch + 一键试听
 *  2. 场景列：阅读器 / 对话 / 桌宠（每个场景一张紧凑卡片，统一 icon + accent）
 *  3. Provider 卡片网格 — 新版 TTSProviderCard
 *
 * 数据流：
 *  - 加载：useTtsStore 的 settings；首屏触发 loadTtsSettings
 *  - 保存：updateTtsSettings → store 更新 → 组件 re-render
 */
import { Bot, BookOpen, Cat, Loader2, Plus, Volume2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusTrap } from "../../ui/FocusTrap";
import { Select } from "../../ui/Select";
import {
	loadTtsSettings,
	updateTtsSettings,
	useTtsStoreSelector,
} from "../../../lib/tts";
import { useSettingsStore } from "../../../lib/settingsStore";
import { invoke } from "../../../lib/tauriCompat";
import { toast } from "../../ui/Toast";
import type {
	TTSProviderConfig,
	TTSScenePetFilter,
	TTSSettings as TTSSettingsType,
} from "../../../lib/tts";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsCardSection,
	SettingsPageContainer,
	SettingsStat,
	SettingsSwitch,
} from "../ui/SettingsPrimitives";
import {
	TTS_PROVIDER_TEMPLATES,
	makeProviderFromTemplate,
} from "./tts/providerCatalog";
import { TTSGlobalSection } from "./tts/TTSGlobalSection";
import { TTSPetPersonaSection } from "./tts/TTSPetPersonaSection";
import { TTSProviderCard } from "./tts/TTSProviderCard";
import { TTSSceneSection } from "./tts/TTSSceneSection";

const PET_FILTER_OPTIONS: Array<{ value: TTSScenePetFilter; label: string }> = [
	{ value: "reminder", label: "日程提醒" },
	{ value: "approval", label: "审批待办" },
	{ value: "done", label: "任务完成" },
	{ value: "error", label: "错误警告" },
	{ value: "progress", label: "进度变更" },
	{ value: "task_start", label: "任务启动" },
	{ value: "thinking", label: "长时思考" },
];

export function TTSSettings() {
	const settings = useTtsStoreSelector((s) => s.settings);
	const isLoading = useTtsStoreSelector((s) => s.isLoadingSettings);
	const { providers: llmProviders, isLoading: isLoadingLlmProviders } =
		useSettingsStore();
	const [showAddMenu, setShowAddMenu] = useState(false);
	const closeAddMenu = useCallback(() => setShowAddMenu(false), []);
	const addMenuRef = useFocusTrap<HTMLDivElement>({
		active: showAddMenu,
		onEscape: closeAddMenu,
	});

	useEffect(() => {
		void loadTtsSettings();
	}, []);

	const patch = async (next: Partial<TTSSettingsType>) => {
		try {
			await updateTtsSettings(next);
		} catch (e) {
			console.warn("[tts-settings] save failed:", e);
		}
	};

	const handleAddProvider = (templateType: string) => {
		const template = TTS_PROVIDER_TEMPLATES.find(
			(t) => t.type === templateType,
		);
		if (!template || !settings) return;
		if (
			template.type === "system" &&
			settings.providers.some((p) => p.type === "system")
		) {
			setShowAddMenu(false);
			return;
		}
		const newProvider = makeProviderFromTemplate(template);
		void patch({ providers: [...settings.providers, newProvider] });
		setShowAddMenu(false);
	};

	const handlePatchProvider = (
		id: string,
		next: Partial<TTSProviderConfig>,
	) => {
		if (!settings) return;
		const updated = settings.providers.map((p) =>
			p.id === id ? { ...p, ...next } : p,
		);
		void patch({ providers: updated });
	};

	const handleDeleteProvider = (id: string) => {
		if (!settings) return;
		const updated = settings.providers.filter((p) => p.id !== id);
		const wasDefault = settings.default_provider_id === id;
		void patch({
			providers: updated,
			...(wasDefault
				? { default_provider_id: null, default_voice_id: null }
				: {}),
		});
	};

	/**
	 * 把某个 provider 下的某个音色一键设为全局默认；
	 * 若该 provider 不是当前默认 provider，会同时把它升为默认 provider，
	 * 避免「选了音色但 provider 没切换」的怪异中间态。
	 */
	const handleSelectDefaultVoice = (providerId: string, voiceId: string) => {
		if (!settings) return;
		const provider = settings.providers.find((p) => p.id === providerId);
		if (!provider) return;
		void patch({
			default_provider_id: providerId,
			default_voice_id: voiceId,
		});
	};

	const enabledScenes = useMemo(() => {
		if (!settings) return [];
		const scenes: string[] = [];
		if (settings.scene_reader_enabled) scenes.push("阅读器");
		if (settings.scene_chat_enabled) scenes.push("对话");
		if (settings.scene_pet_enabled) scenes.push("桌宠");
		return scenes;
	}, [
		settings?.scene_reader_enabled,
		settings?.scene_chat_enabled,
		settings?.scene_pet_enabled,
		settings,
	]);

	if (isLoading || !settings) {
		return (
			<SettingsPageContainer>
				<div className="flex h-40 items-center justify-center text-text-muted">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载语音配置…
				</div>
			</SettingsPageContainer>
		);
	}

	const defaultProvider =
		settings.providers.find((p) => p.id === settings.default_provider_id) ||
		null;

	return (
		<SettingsPageContainer>
			<div id="workshop.tts.global" data-settings-anchor="workshop.tts.global">
				<SettingsPanelHeader
					icon={Volume2}
					title="语音朗读"
					description="管理 TTS Provider、音色与各场景的朗读策略，支持系统语音、OpenAI 兼容、ElevenLabs 与火山引擎。"
				/>
			</div>

			{/* 概览统计 — 键值行列表卡 */}
			<div className="rounded-2xl border border-border bg-surface px-4 divide-y divide-border/60">
				<SettingsStat
					label="Provider"
					value={settings.providers.length}
					hint={`${settings.providers.filter((p) => p.is_enabled).length} 个启用`}
				/>
				<SettingsStat
					label="默认 Provider"
					value={
						<span className="block truncate text-xs">
							{defaultProvider?.name || "未设置"}
						</span>
					}
					hint={defaultProvider ? defaultProvider.type : "需要选择"}
				/>
				<SettingsStat
					label="启用场景"
					value={enabledScenes.length}
					hint={
						enabledScenes.length > 0 ? enabledScenes.join("、") : "全部关闭"
					}
				/>
				<SettingsStat
					label="语速"
					value={`${settings.rate.toFixed(2)}x`}
					hint={`音量 ${(settings.volume * 100).toFixed(0)}% · 音调 ${settings.pitch.toFixed(2)}`}
				/>
			</div>

			<TTSGlobalSection
				settings={settings}
				patch={(next) => void patch(next)}
			/>

			{/* 场景：阅读器 */}
			<TTSSceneSection
				icon={BookOpen}
				title="阅读器朗读"
				description="在阅读器中朗读章节内容，可通过快捷键或工具栏触发。"
				enabled={settings.scene_reader_enabled}
				onEnabledChange={(v) => void patch({ scene_reader_enabled: v })}
				defaultProviderId={settings.default_provider_id}
				voiceId={settings.scene_reader_voice_id}
				onVoiceChange={(id) => void patch({ scene_reader_voice_id: id })}
				provider={defaultProvider}
			/>

			{/* 场景：对话 */}
			<TTSSceneSection
				icon={Bot}
				title="对话朗读"
				description="在 AI 对话中朗读助手回复；可手动点按或开启自动播报。"
				enabled={settings.scene_chat_enabled}
				onEnabledChange={(v) => void patch({ scene_chat_enabled: v })}
				defaultProviderId={settings.default_provider_id}
				voiceId={settings.scene_chat_voice_id}
				onVoiceChange={(id) => void patch({ scene_chat_voice_id: id })}
				provider={defaultProvider}
			>
				<div className="rounded-2xl border border-border bg-surface p-4">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<div className="text-xs font-medium text-text-primary">
								自动播报
							</div>
							<div className="mt-0.5 text-xs leading-relaxed text-text-muted">
								助手消息流式结束后自动朗读，长消息会先截断到 600 字。
							</div>
						</div>
						<SettingsSwitch
							checked={settings.scene_chat_auto}
							onChange={(v) => void patch({ scene_chat_auto: v })}
						/>
					</div>
				</div>
			</TTSSceneSection>

			{/* 场景：桌宠 */}
			<TTSSceneSection
				icon={Cat}
				title="桌宠语音通知"
				description="桌宠收到通知/提醒时用语音播报，支持类型过滤与详略控制。"
				enabled={settings.scene_pet_enabled}
				onEnabledChange={(v) => void patch({ scene_pet_enabled: v })}
				defaultProviderId={settings.default_provider_id}
				voiceId={settings.scene_pet_voice_id}
				onVoiceChange={(id) => void patch({ scene_pet_voice_id: id })}
				provider={defaultProvider}
			>
				<div className="grid grid-cols-1 gap-3 lg:grid-cols-[180px_1fr]">
					<div className="rounded-2xl border border-border bg-surface p-4">
						<div className="mb-2 text-xs font-medium text-text-primary">
							播报内容
						</div>
						<Select
							value={settings.scene_pet_verbosity}
							onChange={(e) =>
								void patch({
									scene_pet_verbosity: e.target.value as "title" | "full",
								})
							}
							variant="inline"
							options={[
								{ value: "title", label: "仅标题（简短）" },
								{ value: "full", label: "完整内容" },
							]}
						/>
					</div>
					<div className="rounded-2xl border border-border bg-surface p-4">
						<div className="mb-2 flex items-baseline justify-between gap-2">
							<div className="text-xs font-medium text-text-primary">
								播报类型
							</div>
							<div className="text-2xs text-text-muted">选中的类型才会朗读</div>
						</div>
						<div className="flex flex-wrap gap-1.5">
							{PET_FILTER_OPTIONS.map((opt) => {
								const active = settings.scene_pet_filter.includes(opt.value);
								return (
									<button
										key={opt.value}
										type="button"
										onClick={() => {
											const next = active
												? settings.scene_pet_filter.filter(
														(f) => f !== opt.value,
													)
												: [...settings.scene_pet_filter, opt.value];
											void patch({ scene_pet_filter: next });
										}}
										className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
											active
												? "border-primary bg-primary/10 text-primary"
												: "border-border bg-surface text-text-muted hover:border-warm-500"
										}`}
									>
										{opt.label}
									</button>
								);
							})}
						</div>
					</div>
				</div>

				<TTSPetPersonaSection
					settings={settings}
					llmProviders={llmProviders}
					isLoadingProviders={isLoadingLlmProviders}
					onPatch={(next) => void patch(next)}
				/>

				{/* 主动让桌宠说一句话（试听 / 联调入口） */}
				<div className="rounded-2xl border border-border bg-surface p-4">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<div className="text-xs font-medium text-text-primary">
								让桌宠说一句
							</div>
							<div className="mt-0.5 text-xs leading-relaxed text-text-muted">
								通过 pet_speak IPC 让桌宠出现气泡 + 朗读；用于联调当前的音色 /
								人设。
							</div>
						</div>
						<button
							type="button"
							onClick={async () => {
								try {
									await invoke("pet_speak", {
										text: "这是桌宠的试讲，听到我说话了吗？",
										motion: "greet",
										bubble: "notification",
										notificationType: "done",
										force: true,
									});
								} catch (e) {
									toast.error(
										`触发失败：${e instanceof Error ? e.message : String(e)}`,
									);
								}
							}}
							className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition hover:border-primary hover:text-primary"
						>
							试讲一句
						</button>
					</div>
				</div>
			</TTSSceneSection>

			{/* Provider 列表 */}
			<SettingsCardSection
				title="Provider"
				description="新增、配置、删除 TTS 服务商。"
				headerAction={
					<div className="relative">
						<button
							type="button"
							onClick={() => setShowAddMenu((v) => !v)}
							className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
						>
							<Plus className="h-3 w-3" strokeWidth={1.8} />
							添加 Provider
						</button>
						{showAddMenu && (
							<>
								<div
									className="fixed inset-0 z-10"
									onClick={() => setShowAddMenu(false)}
								/>
								<div
									ref={addMenuRef}
									className="absolute right-0 top-full z-20 mt-1 w-[340px] overflow-hidden rounded-2xl border border-border bg-surface shadow-bai-pop animate-in fade-in zoom-in-95 duration-150"
								>
									{TTS_PROVIDER_TEMPLATES.map((tpl) => {
										const exists =
											tpl.type === "system" &&
											settings.providers.some((p) => p.type === "system");
										return (
											<button
												key={tpl.type}
												type="button"
												disabled={exists}
												onClick={() => handleAddProvider(tpl.type)}
												className="block w-full border-b border-border px-3.5 py-2.5 text-left transition hover:bg-warm-200/70 disabled:opacity-40 last:border-0"
											>
												<div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
													{tpl.label}
													{exists && (
														<span className="rounded-full bg-warm-200 px-1.5 py-0.5 text-2xs font-medium text-text-muted">
															已添加
														</span>
													)}
												</div>
												<div className="mt-1 text-xs leading-relaxed text-text-muted">
													{tpl.description}
												</div>
											</button>
										);
									})}
								</div>
							</>
						)}
					</div>
				}
				bodyClassName="px-5 py-5 space-y-4"
			>
				{settings.providers.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-10 text-center text-xs text-text-muted">
						暂未配置 Provider，点击右上角「添加 Provider」开始
					</div>
				) : (
					settings.providers.map((provider) => (
						<TTSProviderCard
							key={provider.id}
							provider={provider}
							onPatch={(next) => handlePatchProvider(provider.id, next)}
							onDelete={() => handleDeleteProvider(provider.id)}
							isDefaultProvider={settings.default_provider_id === provider.id}
							defaultVoiceId={settings.default_voice_id}
							onSelectAsDefault={(voiceId) =>
								handleSelectDefaultVoice(provider.id, voiceId)
							}
						/>
					))
				)}
			</SettingsCardSection>
		</SettingsPageContainer>
	);
}
