import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import type { Provider as LLMProvider } from "../../constants";
import { Select } from "../../../ui/Select";
import { SettingsSwitch } from "../../ui/SettingsPrimitives";
import { SettingsTextArea } from "../../ui/SettingsFormControls";
import type { TTSSettings } from "../../../../lib/tts";

interface TTSPetPersonaSectionProps {
	settings: TTSSettings;
	llmProviders: LLMProvider[];
	isLoadingProviders: boolean;
	onPatch: (next: Partial<TTSSettings>) => void;
}

function uniqueModels(providers: LLMProvider[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const provider of providers) {
		for (const model of provider.models ?? []) {
			const id = model.trim();
			if (!id || seen.has(id)) continue;
			seen.add(id);
			result.push(id);
		}
	}
	return result;
}

export function TTSPetPersonaSection({
	settings,
	llmProviders,
	isLoadingProviders,
	onPatch,
}: TTSPetPersonaSectionProps) {
	const enabledProviders = useMemo(
		() => llmProviders.filter((provider) => provider.isEnabled),
		[llmProviders],
	);
	const selectedProvider =
		settings.scene_pet_persona_provider_id == null
			? null
			: llmProviders.find(
					(provider) => provider.id === settings.scene_pet_persona_provider_id,
				) || null;

	const providerOptions = useMemo(() => {
		const options = [
			{ value: "", label: "跟随默认 LLM Provider" },
			...enabledProviders.map((provider) => ({
				value: provider.id,
				label: provider.name,
			})),
		];
		const savedProviderId = settings.scene_pet_persona_provider_id;
		if (
			savedProviderId &&
			!options.some((option) => option.value === savedProviderId)
		) {
			options.push({
				value: savedProviderId,
				label: `已保存：${savedProviderId}`,
			});
		}
		return options;
	}, [enabledProviders, settings.scene_pet_persona_provider_id]);

	const modelValues = useMemo(() => {
		if (selectedProvider) return uniqueModels([selectedProvider]);
		return uniqueModels(enabledProviders);
	}, [enabledProviders, selectedProvider]);

	const modelOptions = useMemo(() => {
		const options = [
			{
				value: "",
				label: selectedProvider
					? "跟随 Provider 默认模型"
					: "跟随默认 LLM 模型",
			},
			...modelValues.map((model) => ({ value: model, label: model })),
		];
		const savedModel = settings.scene_pet_persona_model;
		if (savedModel && !options.some((option) => option.value === savedModel)) {
			options.push({ value: savedModel, label: `已保存：${savedModel}` });
		}
		return options;
	}, [modelValues, selectedProvider, settings.scene_pet_persona_model]);

	const handleProviderChange = (value: string) => {
		onPatch({
			scene_pet_persona_provider_id: value || null,
			scene_pet_persona_model: null,
		});
	};

	return (
		<div className="rounded-2xl border border-border bg-surface p-4">
			<div className="flex items-center justify-between gap-3">
				<div className="min-w-0">
					<div className="flex items-center gap-1.5 text-xs font-medium text-text-primary">
						<Sparkles
							className="h-3.5 w-3.5 text-[color:var(--t-text-muted,#9d9d98)]"
							strokeWidth={1.6}
						/>
						AI 个性化台词（实验）
					</div>
					<div className="mt-0.5 text-xs leading-relaxed text-text-muted">
						开启后桌宠会按你写的人设生成台词；当前版本回落到内置话术池，Provider
						与模型配置先保持为后续 LLM 接入入口。
					</div>
				</div>
				<SettingsSwitch
					checked={settings.scene_pet_persona_enabled}
					onChange={(v) => onPatch({ scene_pet_persona_enabled: v })}
				/>
			</div>

			<SettingsTextArea
				value={settings.scene_pet_persona_prompt ?? ""}
				onChange={(value) => onPatch({ scene_pet_persona_prompt: value })}
				rows={3}
				resize="none"
				minHeight={92}
				placeholder="人设 system prompt，例如：你是一只松弛可爱的小奶猫，说话简短、爱用俏皮的拟声词…"
				className="mt-3"
			/>

			<div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
				<Select
					value={settings.scene_pet_persona_provider_id ?? ""}
					onChange={(event) => handleProviderChange(event.target.value)}
					variant="inline"
					options={providerOptions}
					disabled={isLoadingProviders}
					placeholder={
						isLoadingProviders ? "正在加载 Provider…" : "选择 LLM Provider"
					}
					aria-label="桌宠 AI 台词 LLM Provider"
				/>
				<Select
					value={settings.scene_pet_persona_model ?? ""}
					onChange={(event) =>
						onPatch({
							scene_pet_persona_model: event.target.value || null,
						})
					}
					variant="inline"
					options={modelOptions}
					disabled={isLoadingProviders}
					placeholder={isLoadingProviders ? "正在加载模型…" : "选择模型"}
					aria-label="桌宠 AI 台词模型"
				/>
			</div>
		</div>
	);
}
