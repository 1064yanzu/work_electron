/**
 * TTS Provider 目录与新建模板。
 * 把"内置可选 provider"集中在这里，方便日后扩充。
 */
import type { TTSProviderConfig, TTSProviderType } from "../../../../lib/tts";

/**
 * API Base 预设：当一个供应商对外提供多套接入域名（如 MiMo 的「普通 API」与
 * 「Token Plan」），用预设 chip 让用户一键切换；用户仍可自由编辑输入框，
 * 不在预设里的值会被识别为「自定义」。
 */
export interface TTSApiBasePreset {
	value: string;
	label: string;
	hint?: string;
}

export interface TTSProviderTemplate {
	type: TTSProviderType;
	label: string;
	description: string;
	defaultName: string;
	defaultApiBase?: string;
	supportsApiKey: boolean;
	supportsApiBase: boolean;
	supportsModel: boolean;
	supportsClone: boolean;
	helpUrl?: string;
	defaultModel?: string;
	/** 可选：API Base 一键切换预设（不影响输入框的自由编辑能力） */
	apiBasePresets?: TTSApiBasePreset[];
}

/**
 * 把任意 base URL 标准化为可比较形式（trim + 去尾部斜杠 + 大小写统一）。
 * 用于在 UI 上判断当前 api_base 是否命中某个预设。
 */
export function normalizeApiBase(raw: string | undefined | null): string {
	return (raw || "").trim().replace(/\/+$/, "").toLowerCase();
}

export const TTS_PROVIDER_TEMPLATES: TTSProviderTemplate[] = [
	{
		type: "system",
		label: "系统语音（本地 WebSpeech）",
		description: "调用浏览器/操作系统内置语音引擎，离线可用，零成本。",
		defaultName: "系统语音",
		supportsApiKey: false,
		supportsApiBase: false,
		supportsModel: false,
		supportsClone: false,
	},
	{
		type: "openai_compatible",
		label: "OpenAI 兼容（OpenAI / DeepSeek-TTS）",
		description:
			"任何遵循 OpenAI Audio Speech API 的服务，例如官方 tts-1、DeepSeek-TTS。",
		defaultName: "OpenAI Compatible",
		defaultApiBase: "https://api.openai.com/v1",
		defaultModel: "tts-1",
		supportsApiKey: true,
		supportsApiBase: true,
		supportsModel: true,
		supportsClone: false,
		helpUrl:
			"https://platform.openai.com/docs/api-reference/audio/createSpeech",
	},
	{
		type: "mimo",
		label: "小米 MiMo（mimo-v2.5-tts 系列）",
		description:
			"小米 MiMo 语音大模型，预置 9 种中英文精品音色，支持自然语言风格 / 音频标签控制；可上传 mp3/wav 样本进行音色复刻（voiceclone），合成时自动展开为样本注入。普通 API 与 Token Plan 套餐共用同一接口，仅域名不同。",
		defaultName: "小米 MiMo",
		defaultApiBase: "https://api.xiaomimimo.com/v1",
		defaultModel: "mimo-v2.5-tts",
		supportsApiKey: true,
		supportsApiBase: true,
		supportsModel: true,
		supportsClone: true,
		helpUrl: "https://api.xiaomimimo.com",
		apiBasePresets: [
			{
				value: "https://api.xiaomimimo.com/v1",
				label: "普通 API",
				hint: "按量计费",
			},
			{
				value: "https://token-plan-cn.xiaomimimo.com/v1",
				label: "Token Plan",
				hint: "套餐包",
			},
		],
	},
	{
		type: "elevenlabs",
		label: "ElevenLabs（含克隆）",
		description:
			"高质量多语言 TTS，支持瞬时音色克隆（IVC）与专业级克隆（PVC）。",
		defaultName: "ElevenLabs",
		defaultApiBase: "https://api.elevenlabs.io",
		supportsApiKey: true,
		supportsApiBase: true,
		supportsModel: true,
		supportsClone: true,
		defaultModel: "eleven_multilingual_v2",
		helpUrl: "https://elevenlabs.io/docs/api-reference/voices",
	},
	{
		type: "volcano",
		label: "火山引擎语音（含声音复刻）",
		description:
			"字节跳动语音合成，含定制音色复刻，需 access_token 与 app_id。",
		defaultName: "火山引擎",
		defaultApiBase: "https://openspeech.bytedance.com",
		supportsApiKey: true,
		supportsApiBase: true,
		supportsModel: true,
		supportsClone: true,
		helpUrl: "https://www.volcengine.com/docs/6561",
	},
];

export function makeProviderFromTemplate(
	template: TTSProviderTemplate,
): TTSProviderConfig {
	return {
		id: `tts_${template.type}_${Date.now().toString(36)}`,
		name: template.defaultName,
		type: template.type,
		api_base: template.defaultApiBase,
		model: template.defaultModel,
		is_enabled: true,
	};
}

export function findTemplateByType(
	type: TTSProviderType,
): TTSProviderTemplate | null {
	return TTS_PROVIDER_TEMPLATES.find((t) => t.type === type) ?? null;
}
