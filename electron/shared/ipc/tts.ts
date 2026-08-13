// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：tts（共 11 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type {
	TTSCapabilities,
	TTSCloneRequest,
	TTSSettings,
	TTSSynthesizeRequest,
	TTSVoice,
} from "./common";

export interface TtsIpcSchema {
	// =====================
	// TTS（文本转语音）— 全局多 provider 模块
	// 接入：阅读器 / 聊天 / 桌宠
	// =====================
	/** 读取 TTS 全局设置（含 providers 数组与各场景默认） */
	tts_settings_get: {
		input: Record<string, never>;
		output: TTSSettings;
	};
	/** 更新 TTS 全局设置（部分字段；providers 整体替换） */
	tts_settings_update: {
		input: Partial<TTSSettings>;
		output: TTSSettings;
	};
	/** 列出某 provider 内的可用音色（含克隆） */
	tts_list_voices: {
		input: { providerId: string; forceRefresh?: boolean };
		output: TTSVoice[];
	};
	/** 试听某音色（不传 text 时使用默认问候语） */
	tts_voice_preview: {
		input: { providerId: string; voiceId: string; text?: string };
		output: { audioBase64: string; format: string };
	};
	/** 克隆新音色：上传样本 + 命名 + 描述 */
	tts_clone_voice: {
		input: TTSCloneRequest;
		output: { ok: boolean; voice?: TTSVoice; error?: string };
	};
	/** 删除已克隆的音色 */
	tts_delete_voice: {
		input: { providerId: string; voiceId: string };
		output: { ok: boolean; error?: string };
	};
	/** 查询某 provider 的能力（用于 UI 决定哪些区块显隐） */
	tts_capabilities: {
		input: { providerId: string };
		output: TTSCapabilities;
	};
	/** 一次性合成（小文本 / 试听走这个；返回 base64） */
	tts_synthesize: {
		input: TTSSynthesizeRequest;
		output: { audioBase64: string; format: string };
	};
	/** 流式合成（长文本走这个；通过 tts-stream-chunk 事件下发） */
	tts_synthesize_stream: {
		input: TTSSynthesizeRequest & { streamId: string };
		output: { ok: boolean };
	};
	/** 取消进行中的流式合成 */
	tts_cancel: {
		input: { streamId: string };
		output: { ok: boolean };
	};
	/** 测试某 provider 配置是否可用 */
	tts_test: {
		input: { providerId: string; text?: string };
		output: {
			ok: boolean;
			audioBase64?: string;
			format?: string;
			error?: string;
		};
	};
}
