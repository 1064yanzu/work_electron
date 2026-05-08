// 前端 TTS API 封装（参照 src/lib/api/reader.ts）
import { safeInvoke } from "../tauriBridge";
import type {
	TTSCapabilities,
	TTSCloneRequest,
	TTSSettings,
	TTSSynthesizeRequest,
	TTSVoice,
} from "../tts/types";

export async function ttsSettingsGet(): Promise<TTSSettings> {
	return safeInvoke<TTSSettings>("tts_settings_get", { payload: {} });
}

export async function ttsSettingsUpdate(
	patch: Partial<TTSSettings>,
): Promise<TTSSettings> {
	return safeInvoke<TTSSettings>("tts_settings_update", { payload: patch });
}

export async function ttsListVoices(
	providerId: string,
	forceRefresh?: boolean,
): Promise<TTSVoice[]> {
	return safeInvoke<TTSVoice[]>("tts_list_voices", {
		payload: { providerId, forceRefresh },
	});
}

export async function ttsVoicePreview(payload: {
	providerId: string;
	voiceId: string;
	text?: string;
}): Promise<{ audioBase64: string; format: string }> {
	return safeInvoke("tts_voice_preview", { payload });
}

export async function ttsCloneVoice(
	payload: TTSCloneRequest,
): Promise<{ ok: boolean; voice?: TTSVoice; error?: string }> {
	return safeInvoke("tts_clone_voice", { payload });
}

export async function ttsDeleteVoice(payload: {
	providerId: string;
	voiceId: string;
}): Promise<{ ok: boolean; error?: string }> {
	return safeInvoke("tts_delete_voice", { payload });
}

export async function ttsCapabilities(
	providerId: string,
): Promise<TTSCapabilities> {
	return safeInvoke<TTSCapabilities>("tts_capabilities", {
		payload: { providerId },
	});
}

export async function ttsSynthesize(
	payload: TTSSynthesizeRequest,
): Promise<{ audioBase64: string; format: string }> {
	return safeInvoke("tts_synthesize", { payload });
}

export async function ttsSynthesizeStream(
	payload: TTSSynthesizeRequest & { streamId: string },
): Promise<{ ok: boolean }> {
	return safeInvoke("tts_synthesize_stream", { payload });
}

export async function ttsCancel(streamId: string): Promise<{ ok: boolean }> {
	return safeInvoke("tts_cancel", { payload: { streamId } });
}

export async function ttsTest(payload: {
	providerId: string;
	text?: string;
}): Promise<{
	ok: boolean;
	audioBase64?: string;
	format?: string;
	error?: string;
}> {
	return safeInvoke("tts_test", { payload });
}
