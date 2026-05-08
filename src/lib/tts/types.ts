// 前端 TTS 类型 — 与主进程 IPC 类型对齐
export type {
	TTSCapabilities,
	TTSCloneProgressEvent,
	TTSCloneRequest,
	TTSCloneSample,
	TTSProviderConfig,
	TTSProviderType,
	TTSScenePetFilter,
	TTSSettings,
	TTSStreamChunkEvent,
	TTSSynthesizeRequest,
	TTSVoice,
} from "../../../electron/shared/ipc-schema";

export type TTSScope = "reader" | "chat" | "pet" | "global";
export type TTSStatus = "idle" | "loading" | "playing" | "paused";
