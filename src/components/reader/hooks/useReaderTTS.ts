import { useCallback, useEffect, useRef, useState } from "react";

export type ReaderTTSStatus = "idle" | "playing" | "paused";

export interface ReaderTTSController {
	status: ReaderTTSStatus;
	rate: number;
	queueText: (text: string) => void;
	playPause: () => void;
	stop: () => void;
	setRate: (rate: number) => void;
}

/** 浏览器原生 SpeechSynthesis 简易封装。OpenAI/Azure 等 Provider 走 P5 设置面板对接。 */
export function useReaderTTS(initialRate = 1.0): ReaderTTSController {
	const [status, setStatus] = useState<ReaderTTSStatus>("idle");
	const [rate, setRateState] = useState(initialRate);
	const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
	const queueRef = useRef<string>("");

	useEffect(() => {
		return () => {
			try {
				window.speechSynthesis?.cancel();
			} catch {}
		};
	}, []);

	const playInternal = useCallback(
		(text: string) => {
			if (!("speechSynthesis" in window)) return;
			try {
				window.speechSynthesis.cancel();
			} catch {}
			const u = new SpeechSynthesisUtterance(text);
			u.rate = rate;
			u.onend = () => setStatus("idle");
			u.onerror = () => setStatus("idle");
			u.onpause = () => setStatus("paused");
			u.onresume = () => setStatus("playing");
			utterRef.current = u;
			setStatus("playing");
			try {
				window.speechSynthesis.speak(u);
			} catch {
				setStatus("idle");
			}
		},
		[rate],
	);

	const queueText = useCallback(
		(text: string) => {
			const t = (text || "").trim();
			if (!t) return;
			queueRef.current = t;
			playInternal(t);
		},
		[playInternal],
	);

	const playPause = useCallback(() => {
		const synth = window.speechSynthesis;
		if (!synth) return;
		if (status === "playing") {
			try {
				synth.pause();
				setStatus("paused");
			} catch {}
		} else if (status === "paused") {
			try {
				synth.resume();
				setStatus("playing");
			} catch {}
		} else if (queueRef.current) {
			playInternal(queueRef.current);
		}
	}, [status, playInternal]);

	const stop = useCallback(() => {
		try {
			window.speechSynthesis?.cancel();
		} catch {}
		setStatus("idle");
	}, []);

	const setRate = useCallback((next: number) => {
		setRateState(next);
		const u = utterRef.current;
		if (u) u.rate = next;
	}, []);

	return { status, rate, queueText, playPause, stop, setRate };
}
