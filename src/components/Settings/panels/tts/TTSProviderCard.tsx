/**
 * TTSProviderCard — 单个 Provider 的卡片
 *
 * 重设计要点：
 *  - Header 包含 provider 类型徽章（首字母 + accent 色）+ 名称 + 启用开关 + 删除
 *  - Body 用 grid 布局表单 + 内嵌「连通测试」状态条
 *  - 音色管理改成可折叠区段：打开后才出现 voice 卡片网格
 */
import {
	CheckCircle2,
	ChevronDown,
	ExternalLink,
	Plus,
	Trash2,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { ttsTest } from "../../../../lib/api/tts";
import type { TTSProviderConfig } from "../../../../lib/tts";
import { useTTSVoices } from "../../../../lib/tts";
import { toast } from "../../../ui/Toast";
import { confirmDialog } from "../../../ui/ConfirmDialog";
import {
	SettingsBadge,
	SettingsButton,
	SettingsPasswordInput,
	SettingsSectionCard,
	SettingsSwitch,
	SettingsTextArea,
	SettingsTextInput,
} from "../../ui/SettingsPrimitives";
import { VoiceCloneModal } from "../../../tts/VoiceCloneModal";
import {
	findTemplateByType,
	normalizeApiBase,
	type TTSApiBasePreset,
} from "./providerCatalog";
import { TTSVoiceList } from "./TTSVoiceList";
import { cn } from "../../../../lib/utils";

interface TTSProviderCardProps {
	provider: TTSProviderConfig;
	onPatch: (patch: Partial<TTSProviderConfig>) => void;
	onDelete: () => void;
	/** 该 provider 是否是当前全局默认 provider；默认音色高亮依赖此条件 */
	isDefaultProvider?: boolean;
	/** 全局默认音色 id；当 isDefaultProvider=true 时用来高亮卡片 */
	defaultVoiceId?: string | null;
	/** 把该 provider 下的某个音色设为「全局默认音色 + 默认 Provider」 */
	onSelectAsDefault?: (voiceId: string) => void;
}

const PROVIDER_ACCENTS: Record<string, string> = {
	system: "#6FBF99",
	openai_compatible: "#8B7FD9",
	elevenlabs: "#E89A75",
	volcano: "#D96C46",
	mimo: "#F5A623",
};

export function TTSProviderCard({
	provider,
	onPatch,
	onDelete,
	isDefaultProvider,
	defaultVoiceId,
	onSelectAsDefault,
}: TTSProviderCardProps) {
	const template = findTemplateByType(provider.type);
	const isSystem = provider.type === "system";
	const [testing, setTesting] = useState(false);
	const [testResult, setTestResult] = useState<{
		ok: boolean;
		message: string;
	} | null>(null);
	const [showCloneModal, setShowCloneModal] = useState(false);
	const [voicesOpen, setVoicesOpen] = useState(true);
	const voicesState = useTTSVoices(provider.id);
	const accent = PROVIDER_ACCENTS[provider.type] ?? "var(--t-primary)";

	const handleTest = async () => {
		setTesting(true);
		setTestResult(null);
		try {
			if (isSystem) {
				if (typeof window !== "undefined" && "speechSynthesis" in window) {
					const utter = new SpeechSynthesisUtterance(
						"你好，这是当前音色的试听样本。",
					);
					window.speechSynthesis.speak(utter);
					setTestResult({ ok: true, message: "系统语音可用" });
				} else {
					setTestResult({ ok: false, message: "当前环境不支持系统语音" });
				}
				return;
			}
			const result = await ttsTest({ providerId: provider.id });
			if (result.ok && result.audioBase64) {
				const audio = new Audio(
					`data:audio/${result.format || "mpeg"};base64,${result.audioBase64}`,
				);
				await audio.play();
				setTestResult({ ok: true, message: "连通成功" });
			} else {
				setTestResult({ ok: false, message: result.error || "连通失败" });
			}
		} catch (e) {
			setTestResult({
				ok: false,
				message: e instanceof Error ? e.message : String(e),
			});
		} finally {
			setTesting(false);
		}
	};

	const cloneCount = voicesState.voices.filter((v) => v.is_cloned).length;

	return (
		<SettingsSectionCard
			className={cn(
				"transition-colors",
				provider.is_enabled ? "" : "opacity-70",
			)}
		>
			{/* Header */}
			<div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
				<div className="flex min-w-0 items-start gap-3">
					<span
						className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[13px] font-bold uppercase"
						style={{
							backgroundColor: `${accent}14`,
							borderColor: `${accent}33`,
							color: accent,
						}}
					>
						{provider.type === "openai_compatible"
							? "AI"
							: provider.type === "elevenlabs"
								? "11"
								: provider.type === "volcano"
									? "VE"
									: provider.type === "mimo"
										? "Mi"
										: "Sys"}
					</span>
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<h3 className="text-[14px] font-semibold leading-snug text-text-primary">
								{provider.name || template?.defaultName || provider.type}
							</h3>
							<span
								className={cn(
									"inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
									provider.is_enabled
										? "bg-mint-500/10 text-mint-600"
										: "bg-cream-200 text-text-muted",
								)}
							>
								<span
									className={cn(
										"h-1 w-1 rounded-full",
										provider.is_enabled ? "bg-mint-500" : "bg-text-muted/60",
									)}
								/>
								{provider.is_enabled ? "已启用" : "已停用"}
							</span>
						</div>
						<p className="mt-0.5 text-[11.5px] leading-relaxed text-text-muted">
							{template?.description || provider.type}
						</p>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					{template?.helpUrl && (
						<a
							href={template.helpUrl}
							target="_blank"
							rel="noreferrer"
							className="rounded-md p-1.5 text-text-muted transition hover:bg-cream-200 hover:text-text-primary"
							title="查看文档"
						>
							<ExternalLink className="h-3.5 w-3.5" strokeWidth={1.6} />
						</a>
					)}
					<SettingsSwitch
						checked={provider.is_enabled}
						onChange={(v) => onPatch({ is_enabled: v })}
					/>
					{!isSystem && (
						<button
							type="button"
							onClick={() => {
								void confirmDialog
									.danger(
										`确认删除 provider "${provider.name}"？`,
										"删除 Provider",
									)
									.then((confirmed) => {
										if (confirmed) onDelete();
									});
							}}
							className="rounded-md p-1.5 text-text-muted transition hover:bg-error/10 hover:text-error"
							title="删除该 provider"
						>
							<Trash2 className="h-3.5 w-3.5" strokeWidth={1.6} />
						</button>
					)}
				</div>
			</div>

			{/* Form */}
			<div className="grid grid-cols-1 gap-3 px-5 py-4 lg:grid-cols-2">
				<FormField label="名称">
					<SettingsTextInput
						value={provider.name}
						onChange={(value) => onPatch({ name: value })}
						placeholder={template?.defaultName}
					/>
				</FormField>
				{template?.supportsApiKey && (
					<FormField
						label="API Key"
						hint={
							provider.type === "volcano"
								? "格式 access_token；app_id 在下方"
								: undefined
						}
					>
						<SettingsPasswordInput
							value={provider.api_key || ""}
							onChange={(value) => onPatch({ api_key: value })}
							placeholder="sk-..."
						/>
					</FormField>
				)}
				{template?.supportsApiBase && (
					<div
						className={
							template.apiBasePresets && template.apiBasePresets.length > 0
								? "lg:col-span-2"
								: ""
						}
					>
						<FormField
							label="API Base"
							hint={
								template.apiBasePresets && template.apiBasePresets.length > 0
									? "支持自由编辑，下方为常用接入预设"
									: "支持自由编辑"
							}
						>
							<SettingsTextInput
								value={provider.api_base || ""}
								onChange={(value) => onPatch({ api_base: value })}
								placeholder={template.defaultApiBase}
								mono
							/>
							{template.apiBasePresets &&
								template.apiBasePresets.length > 0 && (
									<ApiBasePresetChips
										accent={accent}
										current={provider.api_base}
										presets={template.apiBasePresets}
										onPick={(value) => onPatch({ api_base: value })}
									/>
								)}
						</FormField>
					</div>
				)}
				{template?.supportsModel && (
					<FormField label="模型">
						<SettingsTextInput
							value={provider.model || ""}
							onChange={(value) => onPatch({ model: value })}
							placeholder={template.defaultModel}
						/>
					</FormField>
				)}
				{provider.type === "volcano" && (
					<FormField label="App ID" hint="火山引擎控制台的 app_id">
						<SettingsTextInput
							value={(provider.metadata?.app_id as string) || ""}
							onChange={(value) =>
								onPatch({
									metadata: {
										...provider.metadata,
										app_id: value,
									},
								})
							}
							autoComplete="off"
						/>
					</FormField>
				)}
				{provider.type === "mimo" && (
					<div className="lg:col-span-2">
						<FormField
							label="风格指令"
							hint={
								provider.model?.includes("voicedesign")
									? "voicedesign 模型必填：用自然语言描述音色"
									: "可选：自然语言描述朗读风格 / 情绪 / 语速"
							}
						>
							<SettingsTextArea
								value={(provider.metadata?.style_prompt as string) || ""}
								onChange={(value) =>
									onPatch({
										metadata: {
											...provider.metadata,
											style_prompt: value,
										},
									})
								}
								rows={3}
								minHeight={72}
								placeholder="例：用轻快上扬的语调，语速稍快，带着压抑不住的激动；或留空使用默认风格"
							/>
						</FormField>
					</div>
				)}
			</div>

			{/* 连通测试 */}
			<div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
				<SettingsButton
					variant="primary"
					onClick={() => void handleTest()}
					loading={testing}
				>
					{testing ? "测试中…" : "测试连通"}
				</SettingsButton>
				{testResult && (
					<SettingsBadge
						tone={testResult.ok ? "success" : "error"}
						icon={testResult.ok ? CheckCircle2 : XCircle}
					>
						{testResult.message}
					</SettingsBadge>
				)}
			</div>

			{/* 音色管理（仅非 system） */}
			{!isSystem && (
				<div className="border-t border-border">
					<div className="flex w-full items-center justify-between gap-3 px-5 py-3 transition hover:bg-cream-50">
						<button
							type="button"
							onClick={() => setVoicesOpen((v) => !v)}
							className="flex flex-1 items-center gap-2.5 text-left"
							aria-expanded={voicesOpen}
						>
							<span
								className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums"
								style={{
									backgroundColor: `${accent}14`,
									color: accent,
								}}
							>
								{voicesState.voices.length}
							</span>
							<span className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-text-muted">
								音色管理
							</span>
							{cloneCount > 0 && (
								<span className="rounded-full bg-violetx-500/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-violetx-600">
									{cloneCount} 克隆
								</span>
							)}
						</button>
						<div className="flex items-center gap-2">
							{template?.supportsClone &&
								voicesState.capabilities?.cloneVoice && (
									<button
										type="button"
										onClick={() => setShowCloneModal(true)}
										disabled={!provider.is_enabled || !provider.api_key}
										className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary transition hover:border-cream-500 hover:text-text-primary disabled:opacity-40"
									>
										<Plus className="h-3 w-3" strokeWidth={1.8} />
										克隆音色
									</button>
								)}
							<button
								type="button"
								onClick={() => setVoicesOpen((v) => !v)}
								className="rounded-md p-1 text-text-muted transition hover:text-text-primary"
								aria-label={voicesOpen ? "收起音色列表" : "展开音色列表"}
							>
								<ChevronDown
									className={cn(
										"h-3.5 w-3.5 transition-transform",
										voicesOpen ? "rotate-180" : "",
									)}
								/>
							</button>
						</div>
					</div>
					{voicesOpen && (
						<div className="border-t border-border bg-cream-50 px-5 py-4">
							<TTSVoiceList
								providerId={provider.id}
								state={voicesState}
								allowDelete={!!voicesState.capabilities?.deleteVoice}
								selectedVoiceId={defaultVoiceId}
								isDefaultProvider={isDefaultProvider}
								onSelectAsDefault={onSelectAsDefault}
								accentColor={accent}
							/>
						</div>
					)}
				</div>
			)}

			{showCloneModal && (
				<VoiceCloneModal
					providerId={provider.id}
					open={showCloneModal}
					onClose={() => setShowCloneModal(false)}
					onCreated={() => {
						setShowCloneModal(false);
						toast.success("克隆完成，已加入音色列表");
						void voicesState.refresh();
					}}
				/>
			)}
		</SettingsSectionCard>
	);
}

function FormField({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<div className="flex items-baseline justify-between gap-2">
				<label className="text-[12px] font-medium text-text-primary">
					{label}
				</label>
				{hint && <span className="text-[10.5px] text-text-muted">{hint}</span>}
			</div>
			{children}
		</div>
	);
}

/**
 * API Base 预设 chip：用于在多套接入域名间一键切换（如 MiMo 普通 API ↔ Token Plan）。
 * - 当 provider.api_base 命中预设时，对应 chip 高亮；
 * - 都不命中（用户自定义）时，没有 chip 高亮，并在右侧标注「自定义」。
 * - chip 只是把对应 base url 写入输入框，输入框依然允许手动覆盖。
 */
function ApiBasePresetChips({
	accent,
	current,
	presets,
	onPick,
}: {
	accent: string;
	current: string | undefined;
	presets: TTSApiBasePreset[];
	onPick: (value: string) => void;
}) {
	const normalizedCurrent = normalizeApiBase(current);
	const matched = presets.find(
		(p) => normalizeApiBase(p.value) === normalizedCurrent,
	);
	const isCustom = !matched && (current || "").trim().length > 0;
	return (
		<div className="flex flex-wrap items-center gap-1.5 pt-0.5">
			<span className="text-[10.5px] uppercase tracking-[0.12em] text-text-light">
				常用接入
			</span>
			{presets.map((preset) => {
				const active = matched?.value === preset.value;
				return (
					<button
						key={preset.value}
						type="button"
						onClick={() => onPick(preset.value)}
						aria-pressed={active}
						title={preset.value}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
							active
								? "shadow-[0_0_0_1px_currentColor_inset]"
								: "border-border bg-surface text-text-secondary hover:border-cream-500 hover:text-text-primary",
						)}
						style={
							active
								? {
										backgroundColor: `${accent}14`,
										borderColor: `${accent}66`,
										color: accent,
									}
								: undefined
						}
					>
						<span>{preset.label}</span>
						{preset.hint && (
							<span
								className={cn(
									"rounded-full px-1.5 py-px text-[9.5px] uppercase tracking-wider",
									active ? "opacity-80" : "bg-cream-200 text-text-muted",
								)}
								style={
									active
										? {
												backgroundColor: `${accent}1f`,
											}
										: undefined
								}
							>
								{preset.hint}
							</span>
						)}
					</button>
				);
			})}
			{isCustom && (
				<span className="rounded-full border border-dashed border-border px-2 py-0.5 text-[10.5px] text-text-muted">
					自定义
				</span>
			)}
		</div>
	);
}
