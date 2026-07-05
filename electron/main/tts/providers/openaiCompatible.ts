/**
 * OpenAI 兼容 Provider — 覆盖 OpenAI 官方 / 小米 mimo / DeepSeek-TTS / 第三方网关
 *
 * 必填字段：api_base + api_key + model
 * 可选字段：voice（默认音色 id）
 *
 * 端点契约：POST {api_base}/audio/speech，body 形如：
 *   { model, input, voice, response_format }
 * 返回二进制音频流。
 *
 * voice 列表：OpenAI 官方为固定 6 个；其它服务商若 `metadata.voices` 提供 JSON 数组，则以此为准；
 * 都没有时退回到 OpenAI 默认 6 个，确保 UI 不会空。
 */

import {
	DEFAULT_CAPABILITIES,
	type TTSAdapterContext,
	type TTSProviderAdapter,
	type TTSProviderConfig,
	type TTSSynthesizeRequest,
	type TTSVoice,
} from "../types";

const OPENAI_DEFAULT_VOICES: Array<{
	id: string;
	name: string;
	description: string;
	gender: "male" | "female" | "neutral";
}> = [
	{
		id: "alloy",
		name: "Alloy",
		description: "中性，平衡，万金油",
		gender: "neutral",
	},
	{ id: "echo", name: "Echo", description: "男声，稳重", gender: "male" },
	{
		id: "fable",
		name: "Fable",
		description: "中性，叙事感强",
		gender: "neutral",
	},
	{ id: "onyx", name: "Onyx", description: "男声，深沉", gender: "male" },
	{ id: "nova", name: "Nova", description: "女声，明亮", gender: "female" },
	{
		id: "shimmer",
		name: "Shimmer",
		description: "女声，温柔",
		gender: "female",
	},
];

function normalizeBase(provider: TTSProviderConfig): string {
	const raw = (provider.api_base || "https://api.openai.com/v1").trim();
	return raw.replace(/\/+$/, "");
}

function authHeaders(provider: TTSProviderConfig): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (provider.api_key) {
		headers.Authorization = `Bearer ${provider.api_key}`;
	}
	return headers;
}

async function postSpeech(
	provider: TTSProviderConfig,
	body: Record<string, unknown>,
	signal: AbortSignal,
): Promise<{ audio: ArrayBuffer; format: string }> {
	const base = normalizeBase(provider);
	const url = `${base}/audio/speech`;
	const response = await fetch(url, {
		method: "POST",
		headers: authHeaders(provider),
		body: JSON.stringify(body),
		signal,
	});
	if (!response.ok) {
		const detail = await safeReadText(response);
		throw new Error(
			`OpenAI-compatible TTS failed (${response.status}): ${detail.slice(0, 200)}`,
		);
	}
	const audio = await response.arrayBuffer();
	const format = inferFormat(body.response_format) || "mp3";
	return { audio, format };
}

async function safeReadText(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch {
		return "";
	}
}

function inferFormat(value: unknown): string | null {
	if (typeof value !== "string") return null;
	if (["mp3", "wav", "opus", "flac", "aac", "pcm"].includes(value)) {
		return value;
	}
	return null;
}

function readMetadataVoices(provider: TTSProviderConfig): Array<{
	id: string;
	name: string;
	language?: string;
	description?: string;
}> | null {
	const meta = provider.metadata;
	if (!meta || typeof meta !== "object") return null;
	const value = (meta as Record<string, unknown>).voices;
	if (!Array.isArray(value)) return null;
	const out: Array<{
		id: string;
		name: string;
		language?: string;
		description?: string;
	}> = [];
	for (const v of value) {
		if (!v || typeof v !== "object") continue;
		const r = v as Record<string, unknown>;
		const id = typeof r.id === "string" ? r.id : null;
		if (!id) continue;
		out.push({
			id,
			name: typeof r.name === "string" ? r.name : id,
			language: typeof r.language === "string" ? r.language : undefined,
			description:
				typeof r.description === "string" ? r.description : undefined,
		});
	}
	return out.length > 0 ? out : null;
}

export const openaiCompatibleProvider: TTSProviderAdapter = {
	type: "openai_compatible",
	capabilities: DEFAULT_CAPABILITIES.openai_compatible,

	async synthesize(req: TTSSynthesizeRequest, ctx: TTSAdapterContext) {
		const provider = ctx.provider;
		const model = provider.model || "tts-1";
		const voice = req.voice || provider.voice || "alloy";
		const format = req.format || "mp3";
		const body: Record<string, unknown> = {
			model,
			input: req.text,
			voice,
			response_format: format,
		};
		if (typeof req.rate === "number" && Number.isFinite(req.rate)) {
			body.speed = Math.max(0.25, Math.min(4, req.rate));
		}
		return postSpeech(provider, body, ctx.signal);
	},

	async synthesizeStream(req, ctx) {
		// 与一次性合成共用一条路径：等待全量结果后切片，避免上游不支持流式时空转
		const { audio, format } = await this.synthesize(req, ctx);
		if (!ctx.sendChunk) return;
		const base64 = arrayBufferToBase64(audio);
		ctx.sendChunk({
			streamId: req.streamId || "",
			audioBase64: base64,
			format,
			done: false,
		});
		ctx.sendChunk({
			streamId: req.streamId || "",
			done: true,
		});
	},

	async listVoices(ctx) {
		const provider = ctx.provider;
		const fromMeta = readMetadataVoices(provider);
		const list = fromMeta ?? OPENAI_DEFAULT_VOICES;
		const voices: TTSVoice[] = list.map((v) => ({
			id: v.id,
			providerId: provider.id,
			name: v.name,
			language: (v as { language?: string }).language,
			description: (v as { description?: string }).description,
			is_cloned: false,
		}));
		return voices;
	},
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	return Buffer.from(buffer).toString("base64");
}
