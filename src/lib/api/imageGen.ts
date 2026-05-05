import { safeInvoke } from "../tauriBridge";

export interface ImageGenerationPayload {
	model: string;
	prompt: string;
	n?: number;
	size?: string;
	quality?: string;
	style?: string;
	negativePrompt?: string;
	seed?: number;
	numInferenceSteps?: number;
	guidanceScale?: number;
	promptEnhancement?: boolean;
}

/**
 * 图片生成结果 - 标准化格式
 * 后端已统一解析各种 API 响应格式
 */
export interface ImageGenerationResult {
	images: Array<{
		imageUrl: string;
		revisedPrompt?: string;
	}>;
	model: string;
}

export async function invokeImageGeneration(
	payload: ImageGenerationPayload,
): Promise<ImageGenerationResult> {
	return await safeInvoke("invoke_image_generation", { ...payload });
}

export interface ImageGenConfig {
	providerId: string;
	model: string;
	defaultSize: string;
	promptTemplate: string;
	negativePrompt?: string;
	quality?: string;
	style?: string;
}

export async function getImageGenConfig(): Promise<ImageGenConfig> {
	return await safeInvoke("get_image_gen_config", {});
}

export async function setImageGenConfig(
	config: Partial<ImageGenConfig>,
): Promise<{ success: boolean }> {
	return await safeInvoke("set_image_gen_config", config);
}

export async function generateImageForText(options: {
	text: string;
	overrides?: Partial<ImageGenConfig>;
}): Promise<ImageGenerationResult> {
	return await safeInvoke("generate_image_for_text", options);
}
