/**
 * Remote Provider — 调 IPC 拿主进程合成的音频，用 HTMLAudioElement 播放
 *
 * v2 拆分：
 *  - synthesizeRemoteAudio(req)            纯合成，返回 base64 + format（可被预取器复用）
 *  - playRemoteAudioPayload(payload, opts) 接收已合成的音频负载直接播放
 *  - speakRemote(req, opts)                现有 API，内部就是上面两步串接（向后兼容）
 *
 * 暂停 / 继续 / 停止 直接走 audio 控制；rate 通过 audio.playbackRate 实时调整。
 *
 * 后续优化点（流式 chunk）走 MediaSource，但需要服务端按需输出 mp3 chunk；
 * 当前所有实现的 provider 端要么本身不支持流式，要么 chunk 也是完整 mp3，
 * 所以先做全量再迭代。
 */

import { ttsSynthesize } from "../../api/tts";
import type { TTSSynthesizeRequest } from "../types";

export interface RemotePlaybackHandle {
	pause(): void;
	resume(): void;
	stop(): void;
	setRate(rate: number): void;
}

export interface RemotePlayOptions {
	rate?: number;
	volume?: number;
	onStart?: () => void;
	onEnd?: () => void;
	onError?: (error: Error) => void;
	onPause?: () => void;
	onResume?: () => void;
}

/** 已经合成好的音频负载；可被缓存、被复用、被 playRemoteAudioPayload 直接播放 */
export interface RemoteAudioPayload {
	audioBase64: string;
	format: string;
}

/**
 * 仅合成，不播放。供阅读器预取器（audioPrefetcher）使用。
 * 失败抛错，由调用方决定 fallback 行为。
 */
export async function synthesizeRemoteAudio(
	req: TTSSynthesizeRequest,
): Promise<RemoteAudioPayload> {
	const result = await ttsSynthesize(req);
	return { audioBase64: result.audioBase64, format: result.format };
}

/**
 * 把已合成好的音频负载直接送进 HTMLAudio 播放。
 * 同步返回 handle（与 speakRemote 不同；后者还要 await 合成）。
 */
export function playRemoteAudioPayload(
	payload: RemoteAudioPayload,
	options: RemotePlayOptions = {},
): RemotePlaybackHandle | null {
	const audio = new Audio();
	audio.src = `data:${mimeFromFormat(payload.format)};base64,${payload.audioBase64}`;
	audio.playbackRate = clamp(options.rate ?? 1, 0.25, 4);
	audio.volume = clamp(options.volume ?? 1, 0, 1);

	audio.onplay = () => options.onStart?.();
	audio.onended = () => options.onEnd?.();
	audio.onerror = () =>
		options.onError?.(
			new Error(audio.error ? String(audio.error.code) : "audio play failed"),
		);
	audio.onpause = () => {
		// 播放结束时也会触发 pause；但 ended 已经处理了，所以这里只在没结束时触发
		if (!audio.ended) options.onPause?.();
	};

	// audio.play() 是 Promise；同步返回 handle 后异步触发错误回调，避免吞掉 unhandled rejection
	void audio.play().catch((e) => {
		options.onError?.(e instanceof Error ? e : new Error(String(e)));
	});

	return {
		pause() {
			audio.pause();
		},
		resume() {
			void audio
				.play()
				.then(() => options.onResume?.())
				.catch(() => {});
		},
		stop() {
			// 先解绑事件，避免 audio.pause() 触发 onpause → options.onPause 污染状态
			audio.onplay = null;
			audio.onended = null;
			audio.onerror = null;
			audio.onpause = null;
			audio.pause();
			audio.src = "";
			audio.load();
		},
		setRate(rate: number) {
			audio.playbackRate = clamp(rate, 0.25, 4);
		},
	};
}

export async function speakRemote(
	req: TTSSynthesizeRequest,
	options: RemotePlayOptions = {},
): Promise<RemotePlaybackHandle | null> {
	let payload: RemoteAudioPayload;
	try {
		payload = await synthesizeRemoteAudio(req);
	} catch (e) {
		options.onError?.(e instanceof Error ? e : new Error(String(e)));
		return null;
	}
	return playRemoteAudioPayload(payload, options);
}

function mimeFromFormat(format: string): string {
	switch (format) {
		case "wav":
			return "audio/wav";
		case "opus":
			return "audio/ogg";
		case "flac":
			return "audio/flac";
		case "aac":
			return "audio/aac";
		case "pcm":
			return "audio/wav"; // 降级
		default:
			return "audio/mpeg";
	}
}

function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}
