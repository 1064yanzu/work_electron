/**
 * TTS 模块通用类型 — 主进程内部使用
 *
 * 与 electron/shared/ipc-schema.ts 中导出的类型同步，避免循环依赖：
 * 这里定义独立的内部别名（与 schema 类型形态一致），并在 IPC handler 层做类型映射。
 */
import type {
	TTSCapabilities,
	TTSCloneProgressEvent,
	TTSCloneRequest,
	TTSProviderConfig,
	TTSProviderType,
	TTSScenePetFilter,
	TTSSettings,
	TTSStreamChunkEvent,
	TTSSynthesizeRequest,
	TTSVoice,
} from "../../shared/ipc-schema";

export type {
	TTSCapabilities,
	TTSCloneProgressEvent,
	TTSCloneRequest,
	TTSProviderConfig,
	TTSProviderType,
	TTSScenePetFilter,
	TTSSettings,
	TTSStreamChunkEvent,
	TTSSynthesizeRequest,
	TTSVoice,
};

/** Provider Adapter 接口：每个 provider 实现这个；可选方法由 capabilities 控制 */
export interface TTSProviderAdapter {
	type: TTSProviderType;
	capabilities: TTSCapabilities;
	/** 一次性合成（小文本 / 试听） */
	synthesize(
		req: TTSSynthesizeRequest,
		ctx: TTSAdapterContext,
	): Promise<{ audio: ArrayBuffer; format: string }>;
	/** 流式合成；adapter 自行将 chunk 喂给 ctx.sendChunk */
	synthesizeStream?(
		req: TTSSynthesizeRequest,
		ctx: TTSAdapterContext,
	): Promise<void>;
	/** 列出 provider 内的全部音色（含克隆） */
	listVoices?(ctx: TTSAdapterContext): Promise<TTSVoice[]>;
	/** 克隆一个新音色 */
	cloneVoice?(req: TTSCloneRequest, ctx: TTSAdapterContext): Promise<TTSVoice>;
	/** 删除一个已克隆的音色 */
	deleteVoice?(voiceId: string, ctx: TTSAdapterContext): Promise<void>;
	/** 试听某音色（默认实现 fallback 到 synthesize 一段问候语） */
	previewVoice?(
		voiceId: string,
		ctx: TTSAdapterContext,
	): Promise<{ audio: ArrayBuffer; format: string }>;
}

/** Adapter 调用时附带的上下文：provider 配置 + 取消信号 + chunk 推送 */
export interface TTSAdapterContext {
	provider: TTSProviderConfig;
	signal: AbortSignal;
	/** 仅 synthesizeStream 中使用 */
	sendChunk?: (chunk: TTSStreamChunkEvent) => void;
	/** 克隆进度（仅 cloneVoice 中使用） */
	sendCloneProgress?: (
		stage: "uploading" | "training" | "ready" | "error",
		progress: number,
		message?: string,
	) => void;
	/**
	 * 持久化 provider 配置变更（仅在需要服务端不存音色但客户端要记的场景下使用，
	 * 例如 MiMo 的"克隆"实际上是把样本 base64 存进 metadata.cloned_voices，
	 * 每次合成时把 voice 字段替换为 data URL）。
	 *
	 * 接收一个 metadata patch（与 provider.metadata 浅合并）；handler 层在调用
	 * adapter 前注入实现：读 settings → 合并 → updateTtsSettings 写库。
	 *
	 * 注意：这里只更新 metadata；其他字段（api_key / model / voice 等）的持久化
	 * 由 UI 层的 onPatch 流程负责。
	 */
	updateProviderMetadata?: (
		patch: Record<string, unknown>,
	) => Promise<TTSProviderConfig>;
}

/** 默认 capabilities 推断：UI 在用户没显式覆盖时按 provider type 落默认 */
export const DEFAULT_CAPABILITIES: Record<TTSProviderType, TTSCapabilities> = {
	system: {
		listVoices: true,
		cloneVoice: false,
		deleteVoice: false,
		voiceLabels: false,
		streamSynthesis: false,
	},
	openai_compatible: {
		listVoices: true,
		cloneVoice: false,
		deleteVoice: false,
		voiceLabels: false,
		streamSynthesis: true,
	},
	elevenlabs: {
		listVoices: true,
		cloneVoice: true,
		deleteVoice: true,
		voiceLabels: true,
		streamSynthesis: true,
	},
	volcano: {
		listVoices: true,
		cloneVoice: true,
		deleteVoice: true,
		voiceLabels: true,
		streamSynthesis: true,
	},
	mimo: {
		listVoices: true,
		cloneVoice: true,
		deleteVoice: true,
		voiceLabels: false,
		streamSynthesis: true,
	},
};

/** 默认 settings：用于首次启动 / 未配置时 */
export const DEFAULT_TTS_SETTINGS: TTSSettings = {
	default_provider_id: null,
	default_voice_id: null,
	rate: 1.0,
	volume: 1.0,
	pitch: 1.0,
	scene_reader_enabled: true,
	scene_reader_voice_id: null,
	scene_chat_enabled: false,
	scene_chat_auto: false,
	scene_chat_voice_id: null,
	scene_pet_enabled: false,
	scene_pet_filter: ["reminder", "approval"],
	scene_pet_verbosity: "title",
	scene_pet_voice_id: null,
	scene_pet_persona_enabled: false,
	scene_pet_persona_prompt: null,
	scene_pet_persona_provider_id: null,
	scene_pet_persona_model: null,
	providers: [],
	updated_at: null,
};

/** 试听文案 — 多语言简短问候 */
export const PREVIEW_TEXT =
	"你好，这是当前音色的试听样本。Hello, this is a voice preview.";
