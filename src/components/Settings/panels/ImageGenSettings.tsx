import { ChevronDown, Image, Loader2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	getImageGenConfig,
	setImageGenConfig,
	type ImageGenConfig,
} from "../../../lib/api";
import { useSettingsStore } from "../../../lib/settingsStore";

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
			<div className="flex-1 h-full bg-white p-8 flex items-center justify-center">
				<Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
			</div>
		);
	}

	return (
		<div className="flex-1 h-full bg-white p-8 overflow-y-auto">
			<div className="max-w-2xl space-y-8">
				{/* 标题 */}
				<div className="border-b border-border pb-4 mb-8">
					<h3 className="text-lg font-serif font-medium text-text-primary flex items-center gap-2">
						<Image className="w-5 h-5" />
						AI 生图设置
						{isSaving && (
							<span className="text-xs text-zinc-400 flex items-center gap-1 ml-2">
								<Loader2 className="w-3 h-3 animate-spin" />
								保存中...
							</span>
						)}
					</h3>
					<p className="text-sm text-text-secondary mt-1">
						配置 AI
						生成图像的模型和参数。设置后可在编辑器中选中文字右键「生成配图」。
					</p>
				</div>

				{/* 提供商选择 */}
				<div className="space-y-3">
					<h4 className="font-medium text-text-primary">生图提供商</h4>
					<div className="relative">
						<select
							value={config.providerId}
							onChange={(e) => handleChange("providerId", e.target.value)}
							className="w-full appearance-none px-4 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all cursor-pointer"
						>
							<option value="">选择提供商...</option>
							{enabledProviders.map((provider) => (
								<option key={provider.id} value={provider.id}>
									{provider.name}
								</option>
							))}
						</select>
						<ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
					</div>
					<p className="text-xs text-text-muted">
						推荐使用 Silicon Flow、OpenAI 或其他支持 OpenAI 兼容生图 API
						的服务。
					</p>
				</div>

				{/* 模型选择 - 下拉框 */}
				<div className="space-y-3">
					<h4 className="font-medium text-text-primary">生图模型</h4>
					{config.providerId && availableModels.length > 0 ? (
						<div className="relative">
							<select
								value={config.model}
								onChange={(e) => handleChange("model", e.target.value)}
								className="w-full appearance-none px-4 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all cursor-pointer"
							>
								<option value="">选择模型...</option>
								{availableModels.map((model: string) => (
									<option key={model} value={model}>
										{model}
									</option>
								))}
							</select>
							<ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
						</div>
					) : config.providerId ? (
						<>
							<input
								type="text"
								value={config.model}
								onChange={(e) => handleChange("model", e.target.value)}
								placeholder="输入生图模型 ID，如 dall-e-3, flux.1-schnell"
								className="w-full px-4 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
							/>
							<p className="text-xs text-text-muted">
								该提供商暂无预设模型，请手动输入支持的生图模型 ID。
							</p>
						</>
					) : (
						<div className="px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-500">
							请先选择提供商
						</div>
					)}
				</div>

				{/* 图片比例选择 */}
				<div className="space-y-3">
					<h4 className="font-medium text-text-primary">图片比例</h4>
					<div className="flex flex-wrap gap-2">
						{ASPECT_RATIO_GROUPS.map((group) => (
							<div key={group.label} className="flex items-center gap-1">
								<span className="text-xs text-zinc-400 mr-1">
									{group.label}:
								</span>
								{group.options.map((option) => (
									<button
										key={option.value}
										onClick={() => handleChange("defaultSize", option.value)}
										className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
											config.defaultSize === option.value
												? "bg-zinc-900 text-white"
												: "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
										}`}
									>
										{option.label}
									</button>
								))}
							</div>
						))}
					</div>
				</div>

				{/* 提示词模板 */}
				<div className="space-y-3">
					<h4 className="font-medium text-text-primary flex items-center gap-2">
						<Wand2 className="w-4 h-4" />
						提示词模板
					</h4>
					<textarea
						value={config.promptTemplate}
						onChange={(e) => handleChange("promptTemplate", e.target.value)}
						rows={4}
						placeholder="使用 {text} 作为选中文字的占位符"
						className="w-full px-4 py-3 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all resize-none font-mono"
					/>
					<div className="flex items-center justify-between">
						<p className="text-xs text-text-muted">
							<code className="px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600">
								{"{text}"}
							</code>{" "}
							将替换为选中的文字
						</p>
						<button
							onClick={() =>
								handleChange("promptTemplate", DEFAULT_PROMPT_TEMPLATE)
							}
							className="text-xs text-primary hover:underline"
						>
							恢复默认
						</button>
					</div>
				</div>

				{/* 负向提示词 */}
				<div className="space-y-3">
					<h4 className="font-medium text-text-primary">负向提示词（可选）</h4>
					<textarea
						value={config.negativePrompt || ""}
						onChange={(e) => handleChange("negativePrompt", e.target.value)}
						rows={2}
						placeholder="low quality, blurry, distorted, watermark, text"
						className="w-full px-4 py-3 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all resize-none"
					/>
					<p className="text-xs text-text-muted">
						指定不希望出现在图像中的元素。部分模型支持此参数。
					</p>
				</div>

				{/* 高级选项 */}
				<div className="space-y-4 pt-4 border-t border-border">
					<h4 className="font-medium text-text-primary">高级选项</h4>
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className="text-sm text-text-secondary mb-1.5 block">
								图片质量
							</label>
							<div className="relative">
								<select
									value={config.quality || "standard"}
									onChange={(e) => handleChange("quality", e.target.value)}
									className="w-full appearance-none px-4 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all cursor-pointer"
								>
									<option value="standard">标准</option>
									<option value="hd">高清 (HD)</option>
								</select>
								<ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
							</div>
						</div>
						<div>
							<label className="text-sm text-text-secondary mb-1.5 block">
								图片风格
							</label>
							<div className="relative">
								<select
									value={config.style || "natural"}
									onChange={(e) => handleChange("style", e.target.value)}
									className="w-full appearance-none px-4 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all cursor-pointer"
								>
									<option value="natural">自然</option>
									<option value="vivid">鲜艳</option>
								</select>
								<ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
							</div>
						</div>
					</div>
				</div>

				{/* 状态提示 */}
				{!config.providerId || !config.model ? (
					<div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
						<p className="text-sm text-amber-800">
							⚠️ 请配置提供商和模型后才能使用生图功能。
						</p>
					</div>
				) : (
					<div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
						<p className="text-sm text-emerald-800">
							✅ 配置完成！在编辑器中选中文字，右键选择「AI 生成配图」即可使用。
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
