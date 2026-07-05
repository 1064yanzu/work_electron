/**
 * 火山引擎 TTS Provider（豆包 / 字节跳动语音）
 *
 * 必填 metadata: { appid, access_token, cluster }（cluster 默认 volcano_tts）
 * 必填字段：voice（音色 id，如 BV001_streaming）
 *
 * 端点：
 *   - HTTP TTS:  POST https://openspeech.bytedance.com/api/v1/tts
 *     Auth header: `Bearer; <access_token>`
 *   - 声音复刻:  POST https://openspeech.bytedance.com/api/v1/mega_tts/audio/upload
 *
 * 文档：https://www.volcengine.com/docs/6561/1257584（火山方舟语音）
 *      https://www.volcengine.com/docs/6561/1283146（声音复刻）
 *
 * 注意：火山的内置音色 "列表" 是开发者文档列表，平台未暴露 list API；
 * 这里读 metadata.voices（用户自定义维护一份内置音色列表）+ 调用 list_clone API 拉克隆音色。
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

const TTS_BASE = "https://openspeech.bytedance.com/api/v1/tts";
const CLONE_UPLOAD =
	"https://openspeech.bytedance.com/api/v1/mega_tts/audio/upload";
const CLONE_LIST =
	"https://openspeech.bytedance.com/api/v1/mega_tts/audio/list";

interface VolcanoMeta {
	appid?: string;
	access_token?: string;
	cluster?: string;
	voices?: Array<{
		id: string;
		name: string;
		language?: string;
		description?: string;
	}>;
}

function getMeta(provider: TTSProviderConfig): VolcanoMeta {
	const m = provider.metadata as VolcanoMeta | undefined;
	return m && typeof m === "object" ? m : {};
}

function authHeader(provider: TTSProviderConfig): string {
	const meta = getMeta(provider);
	const token = meta.access_token || provider.api_key || "";
	return `Bearer; ${token}`;
}

function ensureCreds(provider: TTSProviderConfig): {
	appid: string;
	cluster: string;
} {
	const meta = getMeta(provider);
	const appid = (meta.appid || "").trim();
	if (!appid)
		throw new Error("火山 TTS 缺少 appid（请在 metadata.appid 配置）");
	const cluster = (meta.cluster || "volcano_tts").trim();
	return { appid, cluster };
}

function genReqId(): string {
	return `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const volcanoProvider: TTSProviderAdapter = {
	type: "volcano",
	capabilities: DEFAULT_CAPABILITIES.volcano,

	async synthesize(req: TTSSynthesizeRequest, ctx: TTSAdapterContext) {
		const provider = ctx.provider;
		const { appid, cluster } = ensureCreds(provider);
		const voice = req.voice || provider.voice;
		if (!voice) throw new Error("火山 TTS 需要 voice 参数");

		const body = {
			app: { appid, token: "access_token", cluster },
			user: { uid: "ipo-workbench" },
			audio: {
				voice_type: voice,
				encoding: req.format === "wav" ? "wav" : "mp3",
				speed_ratio:
					typeof req.rate === "number" && Number.isFinite(req.rate)
						? Math.max(0.5, Math.min(2, req.rate))
						: 1.0,
				volume_ratio: 1.0,
				pitch_ratio: 1.0,
			},
			request: {
				reqid: genReqId(),
				text: req.text,
				text_type: "plain",
				operation: "query",
			},
		};

		const response = await fetch(TTS_BASE, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: authHeader(provider),
			},
			body: JSON.stringify(body),
			signal: ctx.signal,
		});
		if (!response.ok) {
			const text = await safeText(response);
			throw new Error(
				`火山 TTS HTTP ${response.status}: ${text.slice(0, 200)}`,
			);
		}
		const data = (await response.json()) as {
			code?: number;
			message?: string;
			data?: string;
		};
		if (data.code !== 3000 || typeof data.data !== "string") {
			throw new Error(
				`火山 TTS 错误：${data.message || JSON.stringify(data).slice(0, 200)}`,
			);
		}
		const buffer = Buffer.from(data.data, "base64");
		const audio = buffer.buffer.slice(
			buffer.byteOffset,
			buffer.byteOffset + buffer.byteLength,
		);
		return { audio, format: req.format === "wav" ? "wav" : "mp3" };
	},

	async synthesizeStream(req, ctx) {
		const result = await this.synthesize(req, ctx);
		if (!ctx.sendChunk) return;
		ctx.sendChunk({
			streamId: req.streamId || "",
			audioBase64: arrayBufferToBase64(result.audio),
			format: result.format,
			done: false,
		});
		ctx.sendChunk({ streamId: req.streamId || "", done: true });
	},

	async listVoices(ctx) {
		const provider = ctx.provider;
		const meta = getMeta(provider);
		const builtIn: TTSVoice[] = (meta.voices || []).map((v) => ({
			id: v.id,
			providerId: provider.id,
			name: v.name,
			language: v.language,
			description: v.description,
			is_cloned: false,
		}));

		// 拉克隆音色列表（声音复刻）
		const cloned: TTSVoice[] = [];
		try {
			const { appid } = ensureCreds(provider);
			const response = await fetch(CLONE_LIST, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: authHeader(provider),
					"Resource-Id": "volc.megatts.voiceclone",
				},
				body: JSON.stringify({ appid }),
				signal: ctx.signal,
			});
			if (response.ok) {
				const data = (await response.json()) as {
					speakers?: Array<{
						speaker_id?: string;
						version?: string;
						state?: string;
					}>;
				};
				for (const s of data.speakers || []) {
					if (!s.speaker_id) continue;
					cloned.push({
						id: s.speaker_id,
						providerId: provider.id,
						name: `克隆音色 ${s.speaker_id}`,
						is_cloned: true,
						description: s.state ? `状态：${s.state}` : undefined,
					});
				}
			}
		} catch {
			// 静默忽略：克隆 API 不可用不应阻塞内置列表
		}

		return [...builtIn, ...cloned];
	},

	async cloneVoice(req: TTSCloneRequest, ctx: TTSAdapterContext) {
		const provider = ctx.provider;
		const { appid } = ensureCreds(provider);
		const samples = req.samples || [];
		if (samples.length === 0) {
			throw new Error("克隆至少需要一个样本");
		}

		ctx.sendCloneProgress?.("uploading", 0.1, "上传样本中…");

		const speakerId = `S_${Date.now().toString(36)}`;
		const audios = samples.map((s) => ({
			audio_bytes: s.dataBase64,
			audio_format: (s.mimeType?.includes("wav") ? "wav" : "mp3") as
				| "wav"
				| "mp3",
		}));

		const response = await fetch(CLONE_UPLOAD, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: authHeader(provider),
				"Resource-Id": "volc.megatts.voiceclone",
			},
			body: JSON.stringify({
				appid,
				speaker_id: speakerId,
				audios,
				source: 2,
				language: 0,
				model_type: 1,
			}),
			signal: ctx.signal,
		});

		if (!response.ok) {
			const text = await safeText(response);
			ctx.sendCloneProgress?.("error", 1, `失败：${text.slice(0, 100)}`);
			throw new Error(
				`火山声音复刻 HTTP ${response.status}: ${text.slice(0, 200)}`,
			);
		}
		const data = (await response.json()) as {
			BaseResp?: { StatusCode?: number; StatusMessage?: string };
			speaker_id?: string;
		};
		const code = data.BaseResp?.StatusCode ?? 0;
		if (code !== 0) {
			ctx.sendCloneProgress?.("error", 1, data.BaseResp?.StatusMessage);
			throw new Error(
				`火山声音复刻业务错误：${data.BaseResp?.StatusMessage ?? "unknown"}`,
			);
		}

		ctx.sendCloneProgress?.("ready", 1, "克隆任务已提交，请耐心等待训练");

		return {
			id: data.speaker_id || speakerId,
			providerId: provider.id,
			name: req.name,
			description: req.description,
			is_cloned: true,
			labels: req.labels,
			created_at: Date.now(),
		};
	},

	async deleteVoice() {
		throw new Error(
			"火山引擎暂不支持通过 API 直接删除已复刻的音色，请到控制台操作",
		);
	},
};

async function safeText(response: Response): Promise<string> {
	try {
		return await response.text();
	} catch {
		return "";
	}
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	return Buffer.from(buffer).toString("base64");
}
