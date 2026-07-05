/**
 * 小米 MiMo TTS Provider（mimo-v2.5-tts 系列）
 *
 * 必填字段：api_key + model
 * 可选字段：api_base（默认 https://api.xiaomimimo.com/v1）、voice（默认音色 id）
 *          metadata.style_prompt（自然语言风格指令；voicedesign 模型下必填）
 *          metadata.voices（自定义音色列表，覆盖默认预置音色）
 *
 * 接入域名：
 *   - 普通 API： https://api.xiaomimimo.com/v1            （按量计费）
 *   - Token Plan：https://token-plan-cn.xiaomimimo.com/v1 （套餐包，国内集群）
 *   两者共用同一份请求 / 响应格式与鉴权 header，仅 base url 不同；
 *   UI 端通过 providerCatalog.apiBasePresets 提供一键切换。
 *
 * 端点：POST {api_base}/chat/completions
 *   - Auth header：api-key: <api_key>
 *   - 请求体（OpenAI Chat Completions 格式）：
 *       {
 *         model,
 *         messages: [
 *           { role: "user",      content: <自然语言风格指令> },  // 可选；voicedesign 必填
 *           { role: "assistant", content: <要合成的文本>     }   // 必填
 *         ],
 *         audio: { format: "wav" | "pcm16", voice }
 *       }
 *
 * 响应：
 *   - 非流式：choices[0].message.audio.data 为 base64 音频
 *   - 流式：  目前官方降级为「全量推理完后一次性返回」，因此与非流式等价；
 *            adapter 里直接走全量切片，简化前端处理。
 *
 * 模型说明：
 *   - mimo-v2.5-tts             — 预置音色（推荐默认）
 *   - mimo-v2.5-tts-voicedesign — 文本描述生成音色（user message 即音色描述，必填）
 *   - mimo-v2.5-tts-voiceclone  — 音色复刻（voice 字段填 data:audio/...;base64,XXX）
 *
 * 文档：docs/api/mimotts.md
 */
import {
	DEFAULT_CAPABILITIES,
	type TTSAdapterContext,
	type TTSCloneRequest,
	type TTSProviderAdapter,
	type TTSProviderConfig,
	type TTSSynthesizeRequest,
	type TTSVoice,
} from "../types";

const DEFAULT_BASE = "https://api.xiaomimimo.com/v1";
const DEFAULT_MODEL = "mimo-v2.5-tts";
const VOICECLONE_MODEL = "mimo-v2.5-tts-voiceclone";
/** 克隆音色 id 前缀；synthesize 看到这个前缀就知道要从 metadata.cloned_voices 取样本 */
const MIMO_CLONE_PREFIX = "mimo_clone_";

/** 合法的克隆样本 MIME；MiMo 文档明确仅 mp3 / wav */
const ALLOWED_CLONE_MIME = new Set([
	"audio/mpeg",
	"audio/mp3",
	"audio/wav",
	"audio/x-wav",
	"audio/wave",
]);
/** 克隆样本 base64 体积上限（10 MB，对应文档限制） */
const MAX_CLONE_BYTES = 10 * 1024 * 1024;

/** 预置音色列表（mimo-v2.5-tts 模型可直接使用） */
const MIMO_PRESET_VOICES: Array<{
	id: string;
	name: string;
	language: string;
	gender: "male" | "female" | "neutral";
	description?: string;
}> = [
	{
		id: "mimo_default",
		name: "MiMo · 默认",
		language: "zh-CN",
		gender: "neutral",
		description: "随集群自动切换，中国默认为「冰糖」",
	},
	{
		id: "冰糖",
		name: "冰糖",
		language: "zh-CN",
		gender: "female",
		description: "中文女声，清亮甜美",
	},
	{
		id: "茉莉",
		name: "茉莉",
		language: "zh-CN",
		gender: "female",
		description: "中文女声，温柔抒情",
	},
	{
		id: "苏打",
		name: "苏打",
		language: "zh-CN",
		gender: "male",
		description: "中文男声，少年感",
	},
	{
		id: "白桦",
		name: "白桦",
		language: "zh-CN",
		gender: "male",
		description: "中文男声，沉稳磁性",
	},
	{
		id: "Mia",
		name: "Mia",
		language: "en-US",
		gender: "female",
		description: "英文女声，自然亲切",
	},
	{
		id: "Chloe",
		name: "Chloe",
		language: "en-US",
		gender: "female",
		description: "英文女声，明亮活泼",
	},
	{
		id: "Milo",
		name: "Milo",
		language: "en-US",
		gender: "male",
		description: "英文男声，温暖叙事",
	},
	{
		id: "Dean",
		name: "Dean",
		language: "en-US",
		gender: "male",
		description: "英文男声，浑厚低沉",
	},
];

interface MimoClonedVoice {
	id: string;
	name: string;
	description?: string;
	language?: string;
	gender?: "male" | "female" | "neutral";
	/** 形如 `data:audio/mpeg;base64,xxx` —— 合成时直接放进 audio.voice 字段 */
	sample_data_url: string;
	created_at: number;
}

interface MimoMeta {
	style_prompt?: string;
	voices?: Array<{
		id: string;
		name: string;
		language?: string;
		gender?: "male" | "female" | "neutral";
		description?: string;
	}>;
	/** 用户上传的克隆样本；合成时会把 voice 字段替换为对应 sample_data_url */
	cloned_voices?: MimoClonedVoice[];
}

interface MimoCompletionResponse {
	choices?: Array<{
		message?: {
			audio?: {
				data?: string;
			};
		};
	}>;
	error?: { message?: string; type?: string };
}

function getMeta(provider: TTSProviderConfig): MimoMeta {
	const m = provider.metadata as MimoMeta | undefined;
	return m && typeof m === "object" ? m : {};
}

function normalizeBase(provider: TTSProviderConfig): string {
	const raw = (provider.api_base || DEFAULT_BASE).trim();
	return raw.replace(/\/+$/, "");
}

function authHeaders(provider: TTSProviderConfig): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (provider.api_key) {
		// MiMo 使用 api-key header（非 Bearer Token）
		headers["api-key"] = provider.api_key;
	}
	return headers;
}

function pickFormat(req: TTSSynthesizeRequest): "wav" | "pcm16" {
	if (req.format === "wav") return "wav";
	// MiMo 仅支持 wav / pcm16；mp3/opus 等回退到 wav
	return "wav";
}

/** 判断是否为 voicedesign 模型（音色由 user message 描述生成，无需 voice 字段） */
function isVoiceDesignModel(model: string): boolean {
	return model.toLowerCase().includes("voicedesign");
}

/** 判断是否为 voiceclone 模型（voice 字段填 data:audio/...;base64,...） */
function isVoiceCloneModel(model: string): boolean {
	return model.toLowerCase().includes("voiceclone");
}

async function postChatCompletions(
	provider: TTSProviderConfig,
	body: Record<string, unknown>,
	signal: AbortSignal,
): Promise<{ audio: ArrayBuffer; format: string }> {
	const url = `${normalizeBase(provider)}/chat/completions`;
	const response = await fetch(url, {
		method: "POST",
		headers: authHeaders(provider),
		body: JSON.stringify(body),
		signal,
	});
	if (!response.ok) {
		const detail = await safeReadText(response);
		throw new Error(
			`MiMo TTS HTTP ${response.status}: ${detail.slice(0, 200)}`,
		);
	}
	const data = (await response.json()) as MimoCompletionResponse;
	if (data.error) {
		throw new Error(`MiMo TTS 错误：${data.error.message || "未知"}`);
	}
	const base64 = data.choices?.[0]?.message?.audio?.data;
	if (typeof base64 !== "string" || base64.length === 0) {
		throw new Error(
			"MiMo TTS 返回缺少音频数据（choices[0].message.audio.data）",
		);
	}
	const buffer = Buffer.from(base64, "base64");
	const audio = buffer.buffer.slice(
		buffer.byteOffset,
		buffer.byteOffset + buffer.byteLength,
	);
	// 请求里指定的 format 决定返回；流式路径会传 pcm16，但 adapter 对外仍统一标记为 wav（已包好 header 或下游不直接播）
	const format =
		typeof body.audio === "object" && body.audio !== null
			? ((body.audio as Record<string, unknown>).format as string) || "wav"
			: "wav";
	return { audio, format: format === "pcm16" ? "pcm16" : "wav" };
}

async function safeReadText(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch {
		return "";
	}
}

function buildMessages(
	req: TTSSynthesizeRequest,
	provider: TTSProviderConfig,
	model: string,
): Array<{ role: "user" | "assistant"; content: string }> {
	const meta = getMeta(provider);
	const stylePrompt = (meta.style_prompt || "").trim();
	const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

	if (isVoiceDesignModel(model)) {
		// voicedesign 模型：user message = 音色描述，必填
		const description = stylePrompt;
		if (!description) {
			throw new Error(
				"mimo-v2.5-tts-voicedesign 需要在 metadata.style_prompt 中配置音色描述",
			);
		}
		messages.push({ role: "user", content: description });
	} else if (stylePrompt.length > 0) {
		// 其它模型：user message 可选；用户配置了风格指令就传进去
		messages.push({ role: "user", content: stylePrompt });
	}

	messages.push({ role: "assistant", content: req.text });
	return messages;
}

function readMetadataVoices(provider: TTSProviderConfig): TTSVoice[] | null {
	const meta = getMeta(provider);
	if (!Array.isArray(meta.voices) || meta.voices.length === 0) return null;
	const out: TTSVoice[] = [];
	for (const v of meta.voices) {
		if (!v || typeof v !== "object" || typeof v.id !== "string") continue;
		out.push({
			id: v.id,
			providerId: provider.id,
			name: v.name || v.id,
			language: v.language,
			gender: v.gender,
			description: v.description,
			is_cloned: false,
		});
	}
	return out.length > 0 ? out : null;
}

/** 在 provider.metadata.cloned_voices 中查找 voice id；命中返回该条目 */
function findClonedVoice(
	provider: TTSProviderConfig,
	voiceId: string | undefined,
): MimoClonedVoice | null {
	if (!voiceId) return null;
	const meta = getMeta(provider);
	if (!Array.isArray(meta.cloned_voices)) return null;
	return meta.cloned_voices.find((v) => v.id === voiceId) ?? null;
}

export const mimoProvider: TTSProviderAdapter = {
	type: "mimo",
	capabilities: DEFAULT_CAPABILITIES.mimo,

	async synthesize(req: TTSSynthesizeRequest, ctx: TTSAdapterContext) {
		const provider = ctx.provider;
		let model = provider.model || DEFAULT_MODEL;
		const format = pickFormat(req);

		const audioParam: Record<string, unknown> = { format };
		// 合成路径分三种：
		//  1. voicedesign 模型 — audio.voice 字段必须缺省
		//  2. voiceclone   模型 — voice 字段必须是 data:audio/...;base64,XXX
		//  3. 普通预置音色 — voice 字段填 voice id（冰糖 / 茉莉 / Mia ...）
		// 此外，如果 voice 是我们本地登记的"克隆音色 id"（mimo_clone_*）：
		//  → 自动切换到 voiceclone 模型并把 voice 字段替换为持久化的 sample_data_url，
		//    这样用户在设置里只要点了某个克隆音色卡，model 字段无需手动改也能工作。
		// 克隆检测放在 voicedesign 判断之前 —— 用户即便错把 model 留在 voicedesign，
		// 选了克隆音色仍能正确走 voiceclone 路径。
		let voice = req.voice || provider.voice;
		const cloned = findClonedVoice(provider, voice ?? undefined);
		if (cloned) {
			voice = cloned.sample_data_url;
			model = VOICECLONE_MODEL;
		}

		if (!isVoiceDesignModel(model)) {
			if (!voice) {
				throw new Error(
					isVoiceCloneModel(model)
						? "mimo-v2.5-tts-voiceclone 需要在 voice 字段传入 data:audio/...;base64,... 格式的音频样本"
						: "MiMo TTS 需要在设置中选择默认音色",
				);
			}
			audioParam.voice = voice;
		}

		const body: Record<string, unknown> = {
			model,
			messages: buildMessages(req, provider, model),
			audio: audioParam,
		};

		return postChatCompletions(provider, body, ctx.signal);
	},

	async synthesizeStream(req, ctx) {
		// MiMo 流式接口目前降级为「全量推理后一次性返回」，与非流式等价。
		// 这里直接走全量合成 + 一次性切片，避免 PCM16 拼接的复杂度。
		const { audio, format } = await this.synthesize(req, ctx);
		if (!ctx.sendChunk) return;
		ctx.sendChunk({
			streamId: req.streamId || "",
			audioBase64: arrayBufferToBase64(audio),
			format,
			done: false,
		});
		ctx.sendChunk({ streamId: req.streamId || "", done: true });
	},

	async listVoices(ctx) {
		const provider = ctx.provider;
		const model = provider.model || DEFAULT_MODEL;
		const meta = getMeta(provider);

		// voicedesign 没有可枚举的"音色列表"概念，返回空让 UI 提示用户
		if (isVoiceDesignModel(model)) {
			return [];
		}

		// 1. 用户克隆的音色（来自 metadata.cloned_voices）
		const clonedList: TTSVoice[] = Array.isArray(meta.cloned_voices)
			? meta.cloned_voices.map((v) => ({
					id: v.id,
					providerId: provider.id,
					name: v.name,
					description: v.description,
					language: v.language,
					gender: v.gender,
					is_cloned: true,
					created_at: v.created_at,
				}))
			: [];

		// 2. 预置音色（仅普通 mimo-v2.5-tts 模型；voiceclone 模型禁用预置）
		let presetList: TTSVoice[] = [];
		if (!isVoiceCloneModel(model)) {
			const fromMeta = readMetadataVoices(provider);
			if (fromMeta) {
				presetList = fromMeta;
			} else {
				presetList = MIMO_PRESET_VOICES.map((v) => ({
					id: v.id,
					providerId: provider.id,
					name: v.name,
					language: v.language,
					gender: v.gender,
					description: v.description,
					is_cloned: false,
				}));
			}
		}

		// 克隆音色排在最前，更醒目
		return [...clonedList, ...presetList];
	},

	async cloneVoice(req: TTSCloneRequest, ctx: TTSAdapterContext) {
		const provider = ctx.provider;

		const samples = req.samples || [];
		if (samples.length === 0) {
			throw new Error("克隆至少需要一个样本");
		}
		// MiMo 模型一次只用一段样本来描述音色，UI 允许多条但实际只取首条
		const sample = samples[0];
		const mimeType = (sample.mimeType || "audio/mpeg").toLowerCase();
		if (!ALLOWED_CLONE_MIME.has(mimeType)) {
			throw new Error(
				`MiMo 仅支持 mp3 / wav 样本，当前类型 "${mimeType}" 不受支持`,
			);
		}
		// dataBase64 是纯 base64（前端 fileToBase64 已经剥掉了 data: 前缀）
		const base64 = (sample.dataBase64 || "").replace(/^data:.*?;base64,/, "");
		if (!base64) {
			throw new Error("样本内容为空");
		}
		// 估算解码后字节数（粗略：base64 长度 * 3/4）
		const approxBytes = Math.floor((base64.length * 3) / 4);
		if (approxBytes > MAX_CLONE_BYTES) {
			throw new Error(
				`样本过大（≈${(approxBytes / 1024 / 1024).toFixed(1)} MB），上限 10 MB`,
			);
		}

		ctx.sendCloneProgress?.("uploading", 0.3, "处理样本中…");

		const labelLanguage = req.labels?.language;
		const now = Date.now();
		const cloneId = `${MIMO_CLONE_PREFIX}${now.toString(36)}_${Math.random()
			.toString(36)
			.slice(2, 8)}`;
		// 标准化为 audio/mpeg / audio/wav；mimo 接口接受这两种 MIME
		const canonicalMime =
			mimeType === "audio/wav" ||
			mimeType === "audio/x-wav" ||
			mimeType === "audio/wave"
				? "audio/wav"
				: "audio/mpeg";
		const newClonedVoice: MimoClonedVoice = {
			id: cloneId,
			name: req.name.trim(),
			description: req.description,
			language: labelLanguage,
			sample_data_url: `data:${canonicalMime};base64,${base64}`,
			created_at: now,
		};

		ctx.sendCloneProgress?.("training", 0.6, "保存到本地…");

		// 持久化：把新条目 append 到 metadata.cloned_voices
		// MiMo 不像 ElevenLabs 那样在服务端创建 voice id —— 每次合成都把样本 base64 塞进
		// audio.voice 字段。所以"克隆"的本质是"在客户端记下来这段样本对应一个 voice id"。
		if (!ctx.updateProviderMetadata) {
			throw new Error(
				"无法持久化克隆音色：缺少 updateProviderMetadata 上下文（请检查 IPC handler 是否注入）",
			);
		}
		const existingMeta = getMeta(provider);
		const nextClonedList = [
			...(Array.isArray(existingMeta.cloned_voices)
				? existingMeta.cloned_voices
				: []),
			newClonedVoice,
		];
		await ctx.updateProviderMetadata({ cloned_voices: nextClonedList });

		ctx.sendCloneProgress?.("ready", 1, "克隆完成");

		return {
			id: cloneId,
			providerId: provider.id,
			name: newClonedVoice.name,
			description: newClonedVoice.description,
			language: newClonedVoice.language,
			is_cloned: true,
			created_at: now,
		};
	},

	async deleteVoice(voiceId, ctx) {
		const provider = ctx.provider;
		const meta = getMeta(provider);
		if (!Array.isArray(meta.cloned_voices)) {
			// 没有克隆列表 → 静默 no-op（用户在 UI 上看到的可能是预置音色，不应被删）
			return;
		}
		if (!ctx.updateProviderMetadata) {
			throw new Error("无法删除克隆音色：缺少 updateProviderMetadata 上下文");
		}
		const filtered = meta.cloned_voices.filter((v) => v.id !== voiceId);
		await ctx.updateProviderMetadata({ cloned_voices: filtered });
	},

	async previewVoice(voiceId, ctx) {
		// 走标准 synthesize 路径；synthesize 自身会处理 cloned voice 的展开
		const provider = ctx.provider;
		const meta = getMeta(provider);
		const cloned = Array.isArray(meta.cloned_voices)
			? meta.cloned_voices.find((v) => v.id === voiceId)
			: null;
		const text = cloned
			? `这是 ${cloned.name} 的试听样本，希望它和你想要的声音对得上。`
			: "你好，这是 MiMo 当前音色的试听样本。";
		return mimoProvider.synthesize(
			{
				providerId: provider.id,
				voice: voiceId,
				text,
			},
			ctx,
		);
	},
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	return Buffer.from(buffer).toString("base64");
}
