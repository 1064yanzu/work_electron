import { Image, Loader2, Palette } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	getImageGenConfig,
	setImageGenConfig,
	type ImageGenConfig,
} from "../../../lib/api";
import { useSettingsStore } from "../../../lib/settingsStore";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import Select from "../../ui/Select";
import {
	SettingsPageContainer,
	SettingsRow,
	SettingsSectionCard,
	SettingsSectionTitle,
} from "../ui/SettingsPrimitives";

// 比例预设（参考 Cherry Studio）
const ASPECT_RATIO_GROUPS = [
	{
		label: "方形",
		options: [{ label: "1:1", value: "1:1" }],
	},
	{
		label: "竖版",
		options: [
			{ label: "2:3", value: "2:3" },
			{ label: "3:4", value: "3:4" },
			{ label: "9:16", value: "9:16" },
		],
	},
	{
		label: "横版",
		options: [
			{ label: "3:2", value: "3:2" },
			{ label: "4:3", value: "4:3" },
			{ label: "16:9", value: "16:9" },
		],
	},
];

// 默认提示词模版（更专业）
const DEFAULT_PROMPT_TEMPLATE = `Create a high-quality, visually appealing illustration for the following content. Style: modern, professional, clean design with vibrant colors.

Content: {text}`;

export function ImageGenSettings() {
	const { providers } = useSettingsStore();
	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [config, setConfig] = useState<ImageGenConfig>({
		providerId: "",
		model: "",
		defaultSize: "1:1",
		promptTemplate: DEFAULT_PROMPT_TEMPLATE,
		negativePrompt: "",
		quality: "standard",
		style: "natural",
	});

	// 获取所有已启用且有 API Key 的提供商
	const enabledProviders = providers.filter((p) => p.isEnabled && p.apiKey);

	// 当前选中的提供商
	const selectedProvider = useMemo(
		() => enabledProviders.find((p) => p.id === config.providerId),
		[enabledProviders, config.providerId],
	);

	// 该提供商的可用模型（筛选生图模型）
	const availableModels = useMemo(() => {
		if (!selectedProvider) return [];

		// 尝试匹配推荐的生图模型
		const providerModels = selectedProvider.models || [];
		const imageModels = providerModels.filter((m: string) => {
			const lower = m.toLowerCase();
			return (
				lower.includes("dall") ||
				lower.includes("flux") ||
				lower.includes("stable") ||
				lower.includes("sdxl") ||
				lower.includes("midjourney") ||
				lower.includes("imagen") ||
				lower.includes("kolors") ||
				lower.includes("playground") ||
				lower.includes("kandinsky") ||
				lower.includes("image")
			);
		});

		// 如果没找到生图模型，显示全部模型
		return imageModels.length > 0 ? imageModels : providerModels;
	}, [selectedProvider]);

	useEffect(() => {
		loadConfig();
	}, []);

	const loadConfig = async () => {
		setIsLoading(true);
		try {
			const savedConfig = await getImageGenConfig();
			if (savedConfig) {
				setConfig((prev) => ({ ...prev, ...savedConfig }));
			}
		} catch (error) {
			console.error("加载生图配置失败:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleChange = async <K extends keyof ImageGenConfig>(
		key: K,
		value: ImageGenConfig[K],
	) => {
		const newConfig = { ...config, [key]: value };

		// 切换提供商时清空模型选择
		if (key === "providerId" && value !== config.providerId) {
			newConfig.model = "";
		}

		setConfig(newConfig);

		// 自动保存
		setIsSaving(true);
		try {
			await setImageGenConfig(
				key === "providerId"
					? { providerId: value as string, model: "" }
					: { [key]: value },
			);
		} catch (error) {
			console.error("保存配置失败:", error);
		} finally {
			setIsSaving(false);
		}
	};

	if (isLoading) {
		return (
			<div className="flex-1 h-full bg-background p-8 flex items-center justify-center">
				<Loader2 className="w-6 h-6 animate-spin text-text-light" />
			</div>
		);
	}

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
			<SettingsPanelHeader
				icon={Image}
				title="AI 生图设置"
				description="配置生图模型与参数。"
				actions={
					isSaving ? (
						<span className="text-xs text-text-light flex items-center gap-1 ml-2">
							<Loader2 className="w-3 h-3 animate-spin" />
							保存中...
						</span>
					) : null
				}
			/>

			{/* 提供商与模型 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>提供商与模型</SettingsSectionTitle>
					<SettingsRow
						label="生图提供商"
						description="推荐使用 Silicon Flow、OpenAI 或其他支持 OpenAI 兼容生图 API 的服务。"
						action={
							<Select
								value={config.providerId}
								onChange={(e) => handleChange("providerId", e.target.value)}
								variant="inline"
								containerClassName="w-auto min-w-[180px]"
							>
								<option value="">选择提供商...</option>
								{enabledProviders.map((provider) => (
									<option key={provider.id} value={provider.id}>
										{provider.name}
									</option>
								))}
							</Select>
						}
					/>
					<SettingsRow
						label="生图模型"
						description={
							!config.providerId
								? "请先选择提供商"
								: config.providerId && availableModels.length === 0
									? "该提供商暂无预设模型，请手动输入支持的生图模型 ID。"
									: undefined
						}
						action={
							config.providerId && availableModels.length > 0 ? (
								<Select
									value={config.model}
									onChange={(e) => handleChange("model", e.target.value)}
									variant="inline"
									containerClassName="w-auto min-w-[200px]"
								>
									<option value="">选择模型...</option>
									{availableModels.map((model: string) => (
										<option key={model} value={model}>
											{model}
										</option>
									))}
								</Select>
							) : config.providerId ? (
								<input
									type="text"
									value={config.model}
									onChange={(e) => handleChange("model", e.target.value)}
									placeholder="如 dall-e-3"
									className="w-48 px-3 py-1.5 bg-warm-50 border border-border/80 rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
								/>
							) : (
								<span className="text-sm text-text-muted">—</span>
							)
						}
					/>
				</div>
			</SettingsSectionCard>

			{/* 图片比例 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>图片比例</SettingsSectionTitle>
					<div className="flex flex-wrap gap-3 pt-1">
						{ASPECT_RATIO_GROUPS.map((group) => (
							<div key={group.label} className="flex items-center gap-1.5">
								<span className="text-xs text-text-light mr-0.5">
									{group.label}:
								</span>
								{group.options.map((option) => (
									<button
										key={option.value}
										onClick={() => handleChange("defaultSize", option.value)}
										className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
											config.defaultSize === option.value
												? "bg-primary text-primary-foreground shadow-sm"
												: "bg-warm-200 text-text-secondary hover:bg-warm-300"
										}`}
									>
										{option.label}
									</button>
								))}
							</div>
						))}
					</div>
				</div>
			</SettingsSectionCard>

			{/* 提示词配置 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>提示词配置</SettingsSectionTitle>
					<div className="space-y-4">
						<div>
							<div className="flex items-center justify-between mb-2">
								<label className="text-[13.5px] font-medium text-text-primary flex items-center gap-1.5">
									<Palette className="w-3.5 h-3.5 text-text-muted" />
									提示词模板
								</label>
								<button
									onClick={() =>
										handleChange("promptTemplate", DEFAULT_PROMPT_TEMPLATE)
									}
									className="text-xs text-primary hover:underline"
								>
									恢复默认
								</button>
							</div>
							<textarea
								value={config.promptTemplate}
								onChange={(e) => handleChange("promptTemplate", e.target.value)}
								rows={4}
								placeholder="使用 {text} 作为选中文字的占位符"
								className="w-full px-4 py-3 bg-warm-50 border border-border/80 rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/50 transition-all resize-none font-mono"
							/>
							<p className="text-xs text-text-muted mt-1.5">
								<code className="px-1.5 py-0.5 bg-warm-200 rounded text-text-secondary">
									{"{text}"}
								</code>{" "}
								将替换为选中的文字
							</p>
						</div>
						<div>
							<label className="text-[13.5px] font-medium text-text-primary block mb-2">
								负向提示词（可选）
							</label>
							<textarea
								value={config.negativePrompt || ""}
								onChange={(e) => handleChange("negativePrompt", e.target.value)}
								rows={2}
								placeholder="low quality, blurry, distorted, watermark, text"
								className="w-full px-4 py-3 bg-warm-50 border border-border/80 rounded-xl text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary/50 transition-all resize-none"
							/>
							<p className="text-xs text-text-muted mt-1.5">
								指定不希望出现在图像中的元素。部分模型支持此参数。
							</p>
						</div>
					</div>
				</div>
			</SettingsSectionCard>

			{/* 高级选项 */}
			<SettingsSectionCard>
				<div className="p-5">
					<SettingsSectionTitle>高级选项</SettingsSectionTitle>
					<SettingsRow
						label="图片质量"
						action={
							<Select
								value={config.quality || "standard"}
								onChange={(e) => handleChange("quality", e.target.value)}
								variant="inline"
								containerClassName="w-auto min-w-[120px]"
							>
								<option value="standard">标准</option>
								<option value="hd">高清 (HD)</option>
							</Select>
						}
					/>
					<SettingsRow
						label="图片风格"
						action={
							<Select
								value={config.style || "natural"}
								onChange={(e) => handleChange("style", e.target.value)}
								variant="inline"
								containerClassName="w-auto min-w-[120px]"
							>
								<option value="natural">自然</option>
								<option value="vivid">鲜艳</option>
							</Select>
						}
					/>
				</div>
			</SettingsSectionCard>

			{/* 状态提示 */}
			{!config.providerId || !config.model ? (
				<div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl">
					<p className="text-sm text-amber-800 dark:text-amber-300">
						⚠️ 请配置提供商和模型后才能使用生图功能。
					</p>
				</div>
			) : (
				<div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl">
					<p className="text-sm text-emerald-800 dark:text-emerald-300">
						✅ 配置完成！在编辑器中选中文字，右键选择「AI 生成配图」即可使用。
					</p>
				</div>
			)}
		</SettingsPageContainer>
	);
}
