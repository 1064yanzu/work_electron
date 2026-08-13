/**
 * 图像生成服务模块
 * 统一管理生图配置和请求，支持多提供商
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { DbContext } from "../db/client";
import type { Provider, ProviderType } from "../../shared/types";
import { getCacheDir } from "../storage/cacheRoots";
import { decryptSecret } from "../storage/secretVault";

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

// 默认提示词模版（英文，更专业）
const DEFAULT_PROMPT_TEMPLATE = `Create a high-quality, visually appealing illustration for the following content. Style: modern, professional, clean design with vibrant colors.

Content: {text}`;

// 默认配置
const DEFAULT_CONFIG: ImageGenConfig = {
	providerId: "",
	model: "",
	defaultSize: "1:1", // 使用比例格式
	promptTemplate: DEFAULT_PROMPT_TEMPLATE,
	negativePrompt: "",
	quality: "standard",
	style: "natural",
};

// 比例到尺寸的映射
const ASPECT_RATIO_TO_SIZE: Record<string, string> = {
	"1:1": "1024x1024",
	"2:3": "832x1216",
	"3:4": "768x1024",
	"9:16": "576x1024",
	"3:2": "1216x832",
	"4:3": "1024x768",
	"16:9": "1024x576",
};

/**
 * 将比例转换为实际尺寸
 */
function aspectRatioToSize(ratio: string): string {
	// 如果已经是尺寸格式，直接返回
	if (ratio.includes("x")) {
		return ratio;
	}
	return ASPECT_RATIO_TO_SIZE[ratio] || "1024x1024";
}

// ==================== 生成结果接口 ====================

/**
 * 图片生成结果 - 标准化格式
 * 前端只需使用 imageUrl，后端负责统一解析各种 API 响应格式
 */
export interface ImageGenerationResult {
	images: Array<{
		imageUrl: string; // 统一的图片 URL（可以是 http URL 或 data URL）
		revisedPrompt?: string; // 修正后的提示词（部分模型支持）
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
			api_key: decryptSecret(row.api_key as string | undefined),
			api_base: row.api_base as string | undefined,
			is_enabled: Boolean(row.is_enabled),
			models:
				typeof row.models === "string" ? JSON.parse(row.models) : row.models,
			metadata:
				typeof row.metadata === "string"
					? JSON.parse(row.metadata)
					: row.metadata || {},
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
function buildAuthHeaders(provider: Provider): Record<string, string> {
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

	// 处理每张图片：解析响应格式，保存到本地文件
	const images: Array<{ imageUrl: string; revisedPrompt?: string }> = [];
	for (const item of data.data) {
		const rawUrl = normalizeImageResponse(item);
		if (!rawUrl) continue;

		try {
			// 保存图片到本地文件，返回文件路径
			const filePath = await saveImageToFile(rawUrl);
			images.push({
				imageUrl: filePath,
				revisedPrompt: item.revised_prompt,
			});
		} catch (err) {
			console.error("[imageGeneration] 保存图片失败:", err);
			// 如果保存失败，回退使用原始 URL（base64 或 http）
			images.push({
				imageUrl: rawUrl,
				revisedPrompt: item.revised_prompt,
			});
		}
	}

	return {
		images,
		model: options.model,
	};
}

/**
 * 统一解析各种 API 响应格式
 * 支持：
 * 1. url 字段包含 http(s) URL
 * 2. url 字段包含 data URL (data:image/xxx;base64,...)
 * 3. b64_json 字段包含纯 base64 字符串
 */
function normalizeImageResponse(item: {
	url?: string;
	b64_json?: string;
}): string {
	// 优先使用 url 字段（可能是普通 URL 或 data URL）
	if (item.url) {
		return item.url;
	}

	// 如果有 b64_json，转换为 data URL
	if (item.b64_json) {
		// 尝试检测图片类型（默认 png）
		const mimeType = detectImageMimeType(item.b64_json) || "image/png";
		return `data:${mimeType};base64,${item.b64_json}`;
	}

	return "";
}

/**
 * 从 base64 数据检测图片 MIME 类型
 */
function detectImageMimeType(base64: string): string | null {
	// 取前几个字符来判断
	const header = base64.slice(0, 20);

	// JPEG: /9j/
	if (header.startsWith("/9j/")) return "image/jpeg";
	// PNG: iVBORw
	if (header.startsWith("iVBORw")) return "image/png";
	// GIF: R0lGOD
	if (header.startsWith("R0lGOD")) return "image/gif";
	// WebP: UklGR
	if (header.startsWith("UklGR")) return "image/webp";

	return null;
}

/**
 * 获取图片存储目录
 */
function getImageStorageDir(): string {
	return getCacheDir("generated-images");
}

/**
 * 生成唯一的图片文件名
 */
function generateImageFileName(ext: string): string {
	const timestamp = Date.now();
	const random = Math.random().toString(36).substring(2, 8);
	return `img_${timestamp}_${random}.${ext}`;
}

/**
 * 将图片保存到本地文件系统
 * @param imageData base64 数据或 URL
 * @returns 保存后的本地文件绝对路径
 */
async function saveImageToFile(imageData: string): Promise<string> {
	const storageDir = getImageStorageDir();

	// 确保目录存在
	await fs.mkdir(storageDir, { recursive: true });

	let base64Data: string;
	let ext = "png";

	// 如果是 data URL，解析出 base64 数据
	if (imageData.startsWith("data:image/")) {
		const match = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
		if (match) {
			ext = match[1] === "jpeg" ? "jpg" : match[1];
			base64Data = match[2];
		} else {
			throw new Error("无效的 data URL 格式");
		}
	} else if (
		imageData.startsWith("http://") ||
		imageData.startsWith("https://")
	) {
		// 如果是 HTTP URL，下载图片
		const response = await fetch(imageData);
		if (!response.ok) {
			throw new Error(`下载图片失败: ${response.status}`);
		}
		const buffer = await response.arrayBuffer();
		base64Data = Buffer.from(buffer).toString("base64");

		// 尝试从 Content-Type 获取扩展名
		const contentType = response.headers.get("content-type");
		if (contentType?.includes("jpeg") || contentType?.includes("jpg")) {
			ext = "jpg";
		} else if (contentType?.includes("webp")) {
			ext = "webp";
		} else if (contentType?.includes("gif")) {
			ext = "gif";
		}
		// 否则使用检测方法
		const detected = detectImageMimeType(base64Data);
		if (detected) {
			ext = detected.split("/")[1];
			if (ext === "jpeg") ext = "jpg";
		}
	} else {
		// 纯 base64 字符串
		base64Data = imageData;
		const detected = detectImageMimeType(base64Data);
		if (detected) {
			ext = detected.split("/")[1];
			if (ext === "jpeg") ext = "jpg";
		}
	}

	const fileName = generateImageFileName(ext);
	const filePath = path.join(storageDir, fileName);

	// 写入文件
	const buffer = Buffer.from(base64Data, "base64");
	await fs.writeFile(filePath, buffer);

	console.log(
		`[imageGeneration] 图片已保存: ${filePath} (${buffer.length} bytes)`,
	);

	return filePath;
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
		size: aspectRatioToSize(merged.defaultSize),
		quality: merged.quality,
		style: merged.style,
		negativePrompt: merged.negativePrompt,
	});
}
