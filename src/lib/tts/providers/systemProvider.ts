/**
 * System Provider — 浏览器 SpeechSynthesis 封装
 *
 * 这是渲染端唯一不需要走 IPC 的 provider：直接用浏览器原生的 Web Speech API。
 * 优点：零配置 / 离线可用 / 系统中文音色。
 * 缺点：不同 OS 音色质量参差；无克隆能力。
 */

import type { TTSVoice } from "../types";

export interface SystemPlaybackHandle {
	pause(): void;
	resume(): void;
	stop(): void;
	setRate(rate: number): void;
}

export interface SystemPlayOptions {
	voiceId?: string | null;
	rate?: number;
	pitch?: number;
	volume?: number;
	onStart?: () => void;
	onEnd?: () => void;
	onError?: (e: SpeechSynthesisErrorEvent) => void;
	onPause?: () => void;
	onResume?: () => void;
}

export function isSystemTTSAvailable(): boolean {
	return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** 列出系统可用的音色 — 在 voices 加载完成前可能为空，调用方应监听 voiceschanged */
export function listSystemVoices(providerId = "system"): TTSVoice[] {
	if (!isSystemTTSAvailable()) return [];
	const list = window.speechSynthesis.getVoices();
	return list.map((v) => ({
		id: v.voiceURI || v.name,
		providerId,
		name: v.name,
		language: v.lang,
		is_cloned: false,
		labels: {
			default: v.default ? "true" : "false",
			localService: v.localService ? "true" : "false",
		},
	}));
}

/** 监听 voices 加载（首次启动 voices 可能异步加载） */
export function subscribeSystemVoices(callback: () => void): () => void {
	if (!isSystemTTSAvailable()) return () => {};
	const handler = () => callback();
	window.speechSynthesis.addEventListener("voiceschanged", handler);
	return () => {
		window.speechSynthesis.removeEventListener("voiceschanged", handler);
	};
}

export function speakSystem(
	text: string,
	options: SystemPlayOptions = {},
): SystemPlaybackHandle | null {
	if (!isSystemTTSAvailable()) return null;
	try {
		window.speechSynthesis.cancel();
	} catch {}

	const utter = new SpeechSynthesisUtterance(text);
	utter.rate = clamp(options.rate ?? 1, 0.1, 10);
	utter.pitch = clamp(options.pitch ?? 1, 0, 2);
	utter.volume = clamp(options.volume ?? 1, 0, 1);

	if (options.voiceId) {
		const voices = window.speechSynthesis.getVoices();
		const found =
			voices.find((v) => v.voiceURI === options.voiceId) ??
			voices.find((v) => v.name === options.voiceId);
		if (found) utter.voice = found;
	}

	utter.onstart = () => options.onStart?.();
	utter.onend = () => options.onEnd?.();
	utter.onerror = (e) => options.onError?.(e);
	utter.onpause = () => options.onPause?.();
	utter.onresume = () => options.onResume?.();

	try {
		window.speechSynthesis.speak(utter);
	} catch {
		options.onError?.(
			new Event("error") as unknown as SpeechSynthesisErrorEvent,
		);
		return null;
	}

	return {
		pause() {
			try {
				window.speechSynthesis.pause();
			} catch {}
		},
		resume() {
			try {
				window.speechSynthesis.resume();
			} catch {}
		},
		stop() {
			try {
				window.speechSynthesis.cancel();
			} catch {}
		},
		setRate(rate: number) {
			utter.rate = clamp(rate, 0.1, 10);
		},
	};
}

function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v));
}
