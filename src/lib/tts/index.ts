// TTS 模块 barrel
export type {
	TTSCapabilities,
	TTSCloneRequest,
	TTSCloneSample,
	TTSProviderConfig,
	TTSProviderType,
	TTSScenePetFilter,
	TTSScope,
	TTSSettings,
	TTSStatus,
	TTSStreamChunkEvent,
	TTSSynthesizeRequest,
	TTSVoice,
} from "./types";

export {
	loadTtsSettings,
	updateTtsSettings,
	speakTts,
	speakPrefetchedTts,
	resolveSpeakConfig,
	stopTts,
	pauseTts,
	resumeTts,
	setTtsRate,
	initTtsStore,
	ttsStore,
	useTtsStore,
	useTtsStoreSelector,
} from "./ttsStore";
export type {
	ResolvedSpeakConfig,
	ResolvedSpeakRemote,
	ResolvedSpeakSystem,
	SpeakOptions,
} from "./ttsStore";
export type { RemoteAudioPayload } from "./providers/remoteProvider";
export { synthesizeRemoteAudio } from "./providers/remoteProvider";

export { useTTS } from "./useTTS";
export { useTTSVoices, inferDefaultProvider } from "./useTTSVoices";

export { sanitizeForSpeech, splitForSpeech } from "./sanitize";
export type { SanitizeOptions } from "./sanitize";
export {
	requestAutoSpeak,
	cancelChatAutoSpeak,
	resetChatAutoSpeak,
	forgetSpokenMessage,
} from "./chatAutoSpeak";
export { installChatTtsLifecycle } from "./chatLifecycle";
