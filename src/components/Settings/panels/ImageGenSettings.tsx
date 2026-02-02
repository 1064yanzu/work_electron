import { ChevronDown, Image, Loader2, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
    getImageGenConfig,
    setImageGenConfig,
    type ImageGenConfig,
} from "../../../lib/api";
import { useSettingsStore } from "../../../lib/settingsStore";

// 常用尺寸预设
const SIZE_PRESETS = [
    { value: "1024x1024", label: "1024×1024（方形）" },
    { value: "1024x1536", label: "1024×1536（竖版）" },
    { value: "1536x1024", label: "1536×1024（横版）" },
    { value: "512x512", label: "512×512（小图）" },
];

export function ImageGenSettings() {
    const { providers } = useSettingsStore();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [config, setConfig] = useState<ImageGenConfig>({
        providerId: "",
        model: "",
        defaultSize: "1024x1024",
        promptTemplate: "为以下内容生成一张精美的配图：{text}",
        negativePrompt: "",
        quality: "standard",
        style: "natural",
    });

    // 获取所有已启用的提供商
    const enabledProviders = providers.filter((p) => p.isEnabled && p.apiKey);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setIsLoading(true);
        try {
            const savedConfig = await getImageGenConfig();
            setConfig((prev) => ({ ...prev, ...savedConfig }));
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
        setConfig(newConfig);

        // 自动保存
        setIsSaving(true);
        try {
            await setImageGenConfig({ [key]: value });
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
                <div className="space-y-4">
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
                        选择已配置 API Key 的提供商。推荐使用 Silicon Flow、OpenAI 或其他支持生图
                        API 的服务。
                    </p>
                </div>

                {/* 模型选择 */}
                <div className="space-y-4">
                    <h4 className="font-medium text-text-primary">生图模型</h4>
                    <input
                        type="text"
                        value={config.model}
                        onChange={(e) => handleChange("model", e.target.value)}
                        placeholder="例如: dall-e-3, flux.1-schnell, stable-diffusion-xl"
                        className="w-full px-4 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
                    />
                    <p className="text-xs text-text-muted">
                        输入提供商支持的生图模型 ID。常用模型：dall-e-3、flux.1-schnell、stable-diffusion-xl
                    </p>
                </div>

                {/* 图片尺寸 */}
                <div className="space-y-4">
                    <h4 className="font-medium text-text-primary">默认尺寸</h4>
                    <div className="relative">
                        <select
                            value={config.defaultSize}
                            onChange={(e) => handleChange("defaultSize", e.target.value)}
                            className="w-full appearance-none px-4 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all cursor-pointer"
                        >
                            {SIZE_PRESETS.map((size) => (
                                <option key={size.value} value={size.value}>
                                    {size.label}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                    </div>
                </div>

                {/* 提示词模板 */}
                <div className="space-y-4">
                    <h4 className="font-medium text-text-primary flex items-center gap-2">
                        <Wand2 className="w-4 h-4" />
                        提示词模板
                    </h4>
                    <textarea
                        value={config.promptTemplate}
                        onChange={(e) => handleChange("promptTemplate", e.target.value)}
                        rows={3}
                        placeholder="使用 {text} 作为选中文字的占位符"
                        className="w-full px-4 py-3 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all resize-none"
                    />
                    <p className="text-xs text-text-muted">
                        <code className="px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600">
                            {"{text}"}
                        </code>{" "}
                        将替换为用户选中的文字。可以自定义模板来优化生成效果。
                    </p>
                </div>

                {/* 负向提示词 */}
                <div className="space-y-4">
                    <h4 className="font-medium text-text-primary">负向提示词（可选）</h4>
                    <textarea
                        value={config.negativePrompt || ""}
                        onChange={(e) => handleChange("negativePrompt", e.target.value)}
                        rows={2}
                        placeholder="例如: 低质量, 模糊, 变形, 水印"
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
                            ✅ 配置完成！现在可以在编辑器中选中文字，右键选择「AI
                            生成配图」。
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
