import {
	AlertCircle,
	CheckCircle2,
	Image as ImageIcon,
	Loader2,
	RotateCcw,
	Square,
	RectangleVertical,
	RectangleHorizontal,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	getImageGenConfig,
	setImageGenConfig,
	type ImageGenConfig,
} from "../../../lib/api";
import { useSettingsStore } from "../../../lib/settingsStore";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import { Select } from "../../ui/Select";
import {
	SettingsBadge,
	SettingsButton,
	SettingsCardSection,
	SettingsField,
	SettingsHint,
	SettingsPageContainer,
	SettingsTextArea,
	SettingsTextInput,
} from "../ui/SettingsPrimitives";
import { cn } from "../../../lib/utils";

// 比例预设
type AspectRatio = {
	label: string;
	value: string;
	w: number;
	h: number;
};

type AspectGroup = {
	label: string;
	icon: typeof Square;
	options: AspectRatio[];
};

const ASPECT_RATIO_GROUPS: AspectGroup[] = [
	{
		label: "方形",
		icon: Square,
		options: [{ label: "1:1", value: "1:1", w: 1, h: 1 }],
	},
	{
		label: "竖版",
		icon: RectangleVertical,
		options: [
			{ label: "2:3", value: "2:3", w: 2, h: 3 },
			{ label: "3:4", value: "3:4", w: 3, h: 4 },
			{ label: "9:16", value: "9:16", w: 9, h: 16 },
		],
	},
	{
		label: "横版",
		icon: RectangleHorizontal,
		options: [
			{ label: "3:2", value: "3:2", w: 3, h: 2 },
			{ label: "4:3", value: "4:3", w: 4, h: 3 },
			{ label: "16:9", value: "16:9", w: 16, h: 9 },
		],
	},
];

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

	const enabledProviders = providers.filter((p) => p.isEnabled && p.apiKey);

	const selectedProvider = useMemo(
		() => enabledProviders.find((p) => p.id === config.providerId),
		[enabledProviders, config.providerId],
	);

	const availableModels = useMemo(() => {
		if (!selectedProvider) return [];
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
		return imageModels.length > 0 ? imageModels : providerModels;
	}, [selectedProvider]);

	useEffect(() => {
		void loadConfig();
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
		if (key === "providerId" && value !== config.providerId) {
			newConfig.model = "";
		}
		setConfig(newConfig);

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
			<SettingsPageContainer>
				<div className="flex h-40 items-center justify-center text-text-muted">
					<Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载生图配置…
				</div>
			</SettingsPageContainer>
		);
	}

	const ready = !!(config.providerId && config.model);

	return (
		<SettingsPageContainer>
			<div
				id="workshop.imagegen.overview"
				data-settings-anchor="workshop.imagegen.overview"
			>
				<SettingsPanelHeader
					icon={ImageIcon}
					title="AI 生图"
					description="配置图像生成模型与默认提示词，编辑器中可对选中文字一键生成配图。"
					actions={
						isSaving ? (
							<SettingsBadge tone="info" icon={Loader2}>
								保存中
							</SettingsBadge>
						) : null
					}
				/>
			</div>

			{/* 状态条 */}
			<StatusBanner ready={ready} />

			{/* 提供商与模型 */}
			<SettingsCardSection
				title="提供商与模型"
				description="推荐使用 SiliconFlow、OpenAI 或其他兼容 OpenAI 生图协议的服务。"
				bodyClassName="px-5 py-2"
			>
				<SettingsField
					label="生图提供商"
					hint="只显示已启用且填入 API Key 的渠道。"
					layout="horizontal"
				>
					<Select
						value={config.providerId}
						onChange={(e) => handleChange("providerId", e.target.value)}
						variant="inline"
						placeholder="选择提供商…"
						options={enabledProviders.map((p) => ({
							value: p.id,
							label: p.name,
						}))}
					/>
				</SettingsField>
				<SettingsField
					label="生图模型"
					hint={
						!config.providerId
							? "请先选择提供商"
							: availableModels.length === 0
								? "该提供商暂无预设模型，请手动输入支持的生图模型 ID。"
								: "已自动筛选可能的生图模型。"
					}
					layout="horizontal"
				>
					{config.providerId && availableModels.length > 0 ? (
						<Select
							value={config.model}
							onChange={(e) => handleChange("model", e.target.value)}
							variant="inline"
							placeholder="选择模型…"
							options={availableModels.map((m: string) => ({
								value: m,
								label: m,
							}))}
						/>
					) : config.providerId ? (
						<SettingsTextInput
							value={config.model}
							onChange={(value) => handleChange("model", value)}
							placeholder="如 dall-e-3"
						/>
					) : (
						<span className="text-xs text-text-light">—</span>
					)}
				</SettingsField>
			</SettingsCardSection>

			{/* 图片比例 */}
			<SettingsCardSection
				title="图片比例"
				description="选择默认输出比例，部分模型可能仅支持其中一部分。"
				bodyClassName="px-5 py-5 space-y-4"
			>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					{ASPECT_RATIO_GROUPS.map((group) => {
						const GroupIcon = group.icon;
						return (
							<div
								key={group.label}
								className="rounded-2xl border border-border bg-surface p-3"
							>
								<div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
									<GroupIcon className="h-3 w-3" strokeWidth={1.6} />
									{group.label}
								</div>
								<div className="flex flex-wrap gap-1.5">
									{group.options.map((opt) => {
										const active = config.defaultSize === opt.value;
										return (
											<button
												key={opt.value}
												type="button"
												onClick={() => handleChange("defaultSize", opt.value)}
												className={cn(
													"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-[color,background-color,border-color,box-shadow] duration-150 ease-out",
													active
														? "bg-primary text-primary-foreground shadow-bai-card"
														: "bg-surface border border-border text-text-secondary hover:border-warm-500 hover:text-text-primary",
												)}
											>
												<RatioGlyph w={opt.w} h={opt.h} active={active} />
												{opt.label}
											</button>
										);
									})}
								</div>
							</div>
						);
					})}
				</div>
			</SettingsCardSection>

			{/* 提示词配置 */}
			<SettingsCardSection
				title="提示词模板"
				description="使用 {text} 占位符替换为编辑器中选中的文字。"
				headerAction={
					<SettingsButton
						variant="secondary"
						size="sm"
						icon={RotateCcw}
						onClick={() =>
							handleChange("promptTemplate", DEFAULT_PROMPT_TEMPLATE)
						}
					>
						恢复默认
					</SettingsButton>
				}
				bodyClassName="px-5 py-4 space-y-4"
			>
				<SettingsField
					label="正向提示词"
					hint="通用风格描述；模板中的 {text} 占位符会被替换为选中文字。"
				>
					<SettingsTextArea
						value={config.promptTemplate}
						onChange={(value) => handleChange("promptTemplate", value)}
						rows={4}
						minHeight={120}
						placeholder="使用 {text} 作为选中文字的占位符"
						mono
					/>
				</SettingsField>
				<SettingsField
					label="负向提示词"
					hint="指定不希望出现的元素，部分模型支持。可留空。"
				>
					<SettingsTextArea
						value={config.negativePrompt || ""}
						onChange={(value) => handleChange("negativePrompt", value)}
						rows={2}
						minHeight={64}
						placeholder="low quality, blurry, distorted, watermark, text"
					/>
				</SettingsField>
			</SettingsCardSection>

			{/* 高级选项 */}
			<SettingsCardSection
				title="高级选项"
				description="部分参数仅 DALL·E 3 等模型支持，其余模型会被忽略。"
				bodyClassName="px-5 py-2"
			>
				<SettingsField
					label="图片质量"
					hint="HD 会消耗更多算力。"
					layout="horizontal"
				>
					<Select
						value={config.quality || "standard"}
						onChange={(e) =>
							handleChange("quality", e.target.value as "standard" | "hd")
						}
						variant="inline"
						options={[
							{ value: "standard", label: "标准" },
							{ value: "hd", label: "高清 HD" },
						]}
					/>
				</SettingsField>
				<SettingsField
					label="图片风格"
					hint="自然偏写实，鲜艳偏插画。"
					layout="horizontal"
				>
					<Select
						value={config.style || "natural"}
						onChange={(e) =>
							handleChange("style", e.target.value as "natural" | "vivid")
						}
						variant="inline"
						options={[
							{ value: "natural", label: "自然" },
							{ value: "vivid", label: "鲜艳" },
						]}
					/>
				</SettingsField>
			</SettingsCardSection>
		</SettingsPageContainer>
	);
}

// ====================
// 子组件
// ====================

function StatusBanner({ ready }: { ready: boolean }) {
	if (ready) {
		return (
			<SettingsHint tone="success" icon={CheckCircle2} title="生图已就绪">
				在编辑器中选中文字，右键选择「AI 生成配图」即可使用。
			</SettingsHint>
		);
	}
	return (
		<SettingsHint tone="warning" icon={AlertCircle} title="未完成配置">
			请先选择提供商与模型，配图功能才能在编辑器中调用。
		</SettingsHint>
	);
}

/** 迷你比例方块 — 用纯 CSS 渲染，不引入额外资源 */
function RatioGlyph({
	w,
	h,
	active,
}: {
	w: number;
	h: number;
	active: boolean;
}) {
	const max = Math.max(w, h);
	const widthPct = (w / max) * 100;
	const heightPct = (h / max) * 100;
	return (
		<span
			className="relative inline-flex h-3.5 w-3.5 items-center justify-center"
			aria-hidden
		>
			<span
				className={cn(
					"rounded-sm border transition-colors",
					active
						? "border-primary-foreground/80 bg-primary-foreground/30"
						: "border-text-muted/60 bg-text-muted/10",
				)}
				style={{
					width: `${widthPct}%`,
					height: `${heightPct}%`,
				}}
			/>
		</span>
	);
}
