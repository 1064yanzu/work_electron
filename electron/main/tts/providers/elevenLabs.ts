/**
 * ElevenLabs Provider
 *
 * 必填字段：api_key
 * 可选字段：api_base（默认 https://api.elevenlabs.io）、model（默认 eleven_multilingual_v2）、voice
 *
 * 端点：
 *   - GET  /v1/voices                — 列出全部音色（含克隆）
 *   - POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128
 *   - POST /v1/voices/add            — IVC 即时克隆（multipart/form-data）
 *   - DELETE /v1/voices/{voice_id}   — 删除克隆音色
 *
 * 文档：https://elevenlabs.io/docs/api-reference/voices
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

const DEFAULT_BASE = "https://api.elevenlabs.io";
const DEFAULT_MODEL = "eleven_multilingual_v2";

function base(provider: TTSProviderConfig): string {
	const raw = (provider.api_base || DEFAULT_BASE).trim();
	return raw.replace(/\/+$/, "");
}

function authHeaders(provider: TTSProviderConfig): Record<string, string> {
	const headers: Record<string, string> = {};
	if (provider.api_key) {
		headers["xi-api-key"] = provider.api_key;
	}
	return headers;
}

interface ElevenVoice {
	voice_id: string;
	name?: string;
	category?: string;
	description?: string;
	labels?: Record<string, string>;
	preview_url?: string;
	high_quality_base_model_ids?: string[];
}

export const elevenLabsProvider: TTSProviderAdapter = {
	type: "elevenlabs",
	capabilities: DEFAULT_CAPABILITIES.elevenlabs,

	async synthesize(req: TTSSynthesizeRequest, ctx: TTSAdapterContext) {
		const provider = ctx.provider;
		const voiceId = req.voice || provider.voice;
		if (!voiceId) {
			throw new Error("ElevenLabs 合成需要 voice id（请在设置中选择默认音色）");
		}
		const model = provider.model || DEFAULT_MODEL;
		const url = `${base(provider)}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`;
		const response = await fetch(url, {
			method: "POST",
			headers: {
				...authHeaders(provider),
				"Content-Type": "application/json",
				Accept: "audio/mpeg",
			},
			body: JSON.stringify({
				text: req.text,
				model_id: model,
				voice_settings: {
					stability: 0.5,
					similarity_boost: 0.7,
				},
			}),
			signal: ctx.signal,
		});
		if (!response.ok) {
			const text = await safeText(response);
			throw new Error(
				`ElevenLabs TTS failed (${response.status}): ${text.slice(0, 200)}`,
			);
		}
		const audio = await response.arrayBuffer();
		return { audio, format: "mp3" };
	},

	async synthesizeStream(req, ctx) {
		const provider = ctx.provider;
		const voiceId = req.voice || provider.voice;
		if (!voiceId) {
			throw new Error("ElevenLabs 合成需要 voice id");
		}
		const model = provider.model || DEFAULT_MODEL;
		const url = `${base(provider)}/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_128`;
		const response = await fetch(url, {
			method: "POST",
			headers: {
				...authHeaders(provider),
				"Content-Type": "application/json",
				Accept: "audio/mpeg",
			},
			body: JSON.stringify({
				text: req.text,
				model_id: model,
			}),
			signal: ctx.signal,
		});
		if (!response.ok || !response.body) {
			const text = await safeText(response);
			throw new Error(
				`ElevenLabs stream failed (${response.status}): ${text.slice(0, 200)}`,
			);
		}
		const send = ctx.sendChunk;
		if (!send) return;
		const reader = response.body.getReader();
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				if (!value) continue;
				const audioBase64 = bufToBase64(value);
				send({
					streamId: req.streamId || "",
					audioBase64,
					format: "mp3",
					done: false,
				});
			}
			send({ streamId: req.streamId || "", done: true });
		} catch (e) {
			send({
				streamId: req.streamId || "",
				done: true,
				error: e instanceof Error ? e.message : String(e),
			});
		}
	},

	async listVoices(ctx) {
		const provider = ctx.provider;
		const url = `${base(provider)}/v1/voices`;
		const response = await fetch(url, {
			method: "GET",
			headers: authHeaders(provider),
			signal: ctx.signal,
		});
		if (!response.ok) {
			const text = await safeText(response);
			throw new Error(
				`ElevenLabs list voices failed (${response.status}): ${text.slice(0, 200)}`,
			);
		}
		const data = (await response.json()) as { voices?: ElevenVoice[] };
		const list = Array.isArray(data.voices) ? data.voices : [];
		const out: TTSVoice[] = [];
		for (const v of list) {
			if (!v.voice_id) continue;
			out.push({
				id: v.voice_id,
				providerId: provider.id,
				name: v.name || v.voice_id,
				description: v.description,
				preview_url: v.preview_url,
				is_cloned: v.category === "cloned" || v.category === "professional",
				labels: v.labels,
			});
		}
		return out;
	},

	async cloneVoice(req: TTSCloneRequest, ctx: TTSAdapterContext) {
		const provider = ctx.provider;
		const url = `${base(provider)}/v1/voices/add`;
		const samples = req.samples || [];
		if (samples.length === 0) {
			throw new Error("克隆至少需要一个样本");
		}

		ctx.sendCloneProgress?.("uploading", 0.1, "上传样本中…");

		const form = new FormData();
		form.append("name", req.name);
		if (req.description) form.append("description", req.description);
		if (req.labels) form.append("labels", JSON.stringify(req.labels));

		for (const [i, sample] of samples.entries()) {
			const buffer = Buffer.from(sample.dataBase64, "base64");
			const blob = new Blob([buffer], {
				type: sample.mimeType || "audio/mpeg",
			});
			form.append("files", blob, sample.filename || `sample-${i}.mp3`);
		}

		ctx.sendCloneProgress?.("training", 0.4, "ElevenLabs 处理中…");

		const response = await fetch(url, {
			method: "POST",
			headers: authHeaders(provider),
			body: form,
			signal: ctx.signal,
		});

		if (!response.ok) {
			const text = await safeText(response);
			ctx.sendCloneProgress?.("error", 1, `失败：${text.slice(0, 100)}`);
			throw new Error(
				`ElevenLabs clone failed (${response.status}): ${text.slice(0, 200)}`,
			);
		}

		const data = (await response.json()) as { voice_id?: string };
		if (!data.voice_id) {
			throw new Error("ElevenLabs 返回缺少 voice_id");
		}

		ctx.sendCloneProgress?.("ready", 1, "克隆成功");

		return {
			id: data.voice_id,
			providerId: provider.id,
			name: req.name,
			description: req.description,
			is_cloned: true,
			labels: req.labels,
			created_at: Date.now(),
		};
	},

	async deleteVoice(voiceId, ctx) {
		const provider = ctx.provider;
		const url = `${base(provider)}/v1/voices/${encodeURIComponent(voiceId)}`;
		const response = await fetch(url, {
			method: "DELETE",
			headers: authHeaders(provider),
			signal: ctx.signal,
		});
		if (!response.ok) {
			const text = await safeText(response);
			throw new Error(
				`ElevenLabs delete voice failed (${response.status}): ${text.slice(0, 200)}`,
			);
		}
	},

	async previewVoice(voiceId, ctx) {
		const provider = ctx.provider;
		try {
			const voices = await elevenLabsProvider.listVoices?.(ctx);
			const found = voices?.find((v) => v.id === voiceId);
			if (found?.preview_url) {
				const resp = await fetch(found.preview_url, { signal: ctx.signal });
				if (resp.ok) {
					const audio = await resp.arrayBuffer();
					return { audio, format: "mp3" };
				}
			}
		} catch {
			// fall through
		}
		return elevenLabsProvider.synthesize(
			{
				providerId: provider.id,
				voice: voiceId,
				text: "Hello, this is a voice preview from ElevenLabs.",
			},
			ctx,
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

function bufToBase64(value: Uint8Array): string {
	return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString(
		"base64",
	);
}
