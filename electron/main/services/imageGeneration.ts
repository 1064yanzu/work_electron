/**
 * 图像生成服务模块
 * 统一管理生图配置和请求，支持多提供商
 */

import type { DbContext } from "../db/client";
import type { Provider, ProviderType } from "../../shared/types";

// ==================== 配置接口 ====================

export interface ImageGenConfig {
	providerId: string; // 使用的提供商 ID
	model: string; // 生图模型
	defaultSize: string; // 默认尺寸
	promptTemplate: string; // 提示词模板，{text} 为占位符
	negativePrompt?: string; // 默认负向提示词
	quality?: string; // 图片质量
	style?: string; // 图片风格
}

// 配置存储的 key 前缀
const CONFIG_KEY = "image_gen.config";

// 默认配置
const DEFAULT_CONFIG: ImageGenConfig = {
	providerId: "",
	model: "",
	defaultSize: "1024x1024",
	promptTemplate: "为以下内容生成一张精美的配图：{text}",
	negativePrompt: "",
	quality: "standard",
	style: "natural",
};

// ==================== 生成结果接口 ====================

export interface ImageGenerationResult {
	images: Array<{
		url?: string;
		base64?: string;
		revised_prompt?: string;
	}>;
	model: string;
}

// ==================== 配置管理 ====================

/**
 * 获取生图配置
 */
export async function getImageGenConfig(
	db: DbContext,
): Promise<ImageGenConfig> {
	try {
		const rows = await db.client.execute({
			sql: `SELECT value FROM app_config WHERE key = ?`,
			args: [CONFIG_KEY],
		});

		if (rows.rows.length === 0) {
			return DEFAULT_CONFIG;
		}

		const raw = rows.rows[0].value as string;
		const parsed = JSON.parse(raw);
		return { ...DEFAULT_CONFIG, ...parsed };
	} catch (error) {
		console.error("[imageGeneration] 获取配置失败:", error);
		return DEFAULT_CONFIG;
	}
}

/**
 * 保存生图配置
 */
export async function saveImageGenConfig(
	db: DbContext,
	config: Partial<ImageGenConfig>,
): Promise<void> {
	const current = await getImageGenConfig(db);
	const merged = { ...current, ...config };

	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [CONFIG_KEY, JSON.stringify(merged), Date.now()],
	});
}

// ==================== 提供商获取 ====================

/**
 * 获取指定 ID 的提供商配置
 */
async function getProvider(
	db: DbContext,
	providerId: string,
): Promise<Provider | null> {
	try {
		const rows = await db.client.execute({
			sql: `SELECT * FROM providers WHERE id = ?`,
			args: [providerId],
		});

		if (rows.rows.length === 0) return null;

		const row = rows.rows[0];
		return {
			id: row.id as string,
			name: row.name as string,
			provider_type: row.provider_type as ProviderType,
			api_key: row.api_key as string | undefined,
			api_base: row.api_base as string | undefined,
			is_enabled: Boolean(row.is_enabled),
			models:
				typeof row.models === "string" ? JSON.parse(row.models) : row.models,
			metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : (row.metadata || {}),
			template_id: row.template_id as string | undefined,
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		};
	} catch (error) {
		console.error("[imageGeneration] 获取提供商失败:", error);
		return null;
	}
}

// ==================== 图像生成核心 ====================

/**
 * 标准化 OpenAI 兼容 API 的 baseUrl
 */
function normalizeBaseUrl(provider: Provider, fallback: string): string {
	let base = (provider.api_base || fallback).trim();
	if (base.endsWith("/")) base = base.slice(0, -1);
	// 移除多余的路径部分
	base = base.replace(/\/v1\/?$/, "").replace(/\/chat\/completions\/?$/, "");
	return `${base}/v1`;
}

/**
 * 构建请求头
 */
function buildAuthHeaders(
	provider: Provider,
): Record<string, string> {
	const headers: Record<string, string> = {};
	if (provider.api_key) {
		headers["Authorization"] = `Bearer ${provider.api_key}`;
	}
	return headers;
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 调用生图 API
 */
async function callImageGenerationAPI(
	provider: Provider,
	options: {
		model: string;
		prompt: string;
		n?: number;
		size?: string;
		quality?: string;
		style?: string;
		negativePrompt?: string;
	},
): Promise<ImageGenerationResult> {
	const baseUrl = normalizeBaseUrl(provider, "https://api.openai.com");
	const url = `${baseUrl}/images/generations`;

	const transientStatus = new Set([429, 500, 502, 503, 504, 524]);
	let response: Response | null = null;
	let lastErrorText = "";

	for (let attempt = 0; attempt < 3; attempt++) {
		response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...buildAuthHeaders(provider),
			},
			body: JSON.stringify({
				model: options.model,
				prompt: options.prompt,
				n: options.n ?? 1,
				size: options.size ?? "1024x1024",
				quality: options.quality,
				style: options.style,
				response_format: "url",
				// 高级参数（部分提供商支持）
				negative_prompt: options.negativePrompt,
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

// ==================== 统一入口 ====================

export interface GenerateImageOptions {
	text: string; // 用户选中的文字
	overrides?: Partial<ImageGenConfig>; // 覆盖配置
}

/**
 * 生成图像 - 统一入口
 * 使用配置的提供商、模型和提示词模板
 */
export async function generateImage(
	db: DbContext,
	options: GenerateImageOptions,
): Promise<ImageGenerationResult> {
	// 1. 获取配置
	const config = await getImageGenConfig(db);
	const merged = { ...config, ...options.overrides };

	// 2. 验证配置
	if (!merged.providerId) {
		throw new Error("请先在设置中配置生图提供商");
	}
	if (!merged.model) {
		throw new Error("请先在设置中配置生图模型");
	}

	// 3. 获取提供商
	const provider = await getProvider(db, merged.providerId);
	if (!provider) {
		throw new Error(`找不到提供商: ${merged.providerId}`);
	}
	if (!provider.api_key) {
		throw new Error(`提供商 ${provider.name} 未配置 API Key`);
	}

	// 4. 构建提示词
	const prompt = merged.promptTemplate.replace("{text}", options.text);

	// 5. 调用 API
	return await callImageGenerationAPI(provider, {
		model: merged.model,
		prompt,
		size: merged.defaultSize,
		quality: merged.quality,
		style: merged.style,
		negativePrompt: merged.negativePrompt,
	});
}
