import {
	getOpenAICompatibleAuthHeaders,
	normalizeOpenAICompatibleBaseUrl,
} from "../providerHttp";
import { sleep } from "../shared";
import type {
	ImageGenerationOptions,
	ImageGenerationResult,
	Provider,
} from "../types";

/**
 * 调用 OpenAI 兼容的图像生成 API
 */
export async function callOpenAIImageGeneration(
	provider: Provider,
	options: ImageGenerationOptions,
	apiKey: string | undefined,
): Promise<ImageGenerationResult> {
	const baseUrl = normalizeOpenAICompatibleBaseUrl(
		provider,
		"https://api.openai.com",
	);
	const url = `${baseUrl}/images/generations`;

	const transientStatus = new Set([429, 500, 502, 503, 504, 524]);
	let response: Response | null = null;
	let lastErrorText = "";

	for (let attempt = 0; attempt < 3; attempt++) {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getOpenAICompatibleAuthHeaders(provider, apiKey),
			},
			body: JSON.stringify({
				model: options.model,
				prompt: options.prompt,
				n: options.n ?? 1,
				size: options.size ?? "1024x1024",
				quality: options.quality,
				style: options.style,
				response_format: "url",
				// 高级参数（供应商支持情况各异）
				negative_prompt: options.negativePrompt,
				seed: options.seed,
				num_inference_steps: options.numInferenceSteps,
				guidance_scale: options.guidanceScale,
				prompt_enhancement: options.promptEnhancement,
			}),
		});

		if (response.ok) break;
		lastErrorText = await response.text();
		if (transientStatus.has(response.status) && attempt < 2) {
			await sleep(500 * (attempt + 1) * (attempt + 1));
			continue;
		}
		throw new Error(
			`Image generation failed: ${response.status} - ${lastErrorText}`,
		);
	}

	if (!response || !response.ok) {
		throw new Error(
			`Image generation failed: unknown - ${lastErrorText || "no response"}`,
		);
	}

	const data = (await response.json()) as {
		data: Array<{
			url?: string;
			b64_json?: string;
			revised_prompt?: string;
		}>;
	};

	return {
		images: data.data.map((item) => ({
			url: item.url,
			base64: item.b64_json,
			revised_prompt: item.revised_prompt,
		})),
		model: options.model,
	};
}
