/**
 * TTSPlaybackBar — 全局播放控制条（升级自 ReaderTTSBar）
 *
 * 由 useTTS 驱动；显示当前 scope、状态、语速、停止/暂停按钮。
 * 与 reader 解耦：可放在阅读器、聊天或独立位置。
 */
import { Pause, Play, Square } from "lucide-react";
import { useTTS } from "../../lib/tts";

interface TTSPlaybackBarProps {
	scope: "reader" | "chat" | "pet" | "global";
	statusText?: string;
}

export function TTSPlaybackBar({ scope, statusText }: TTSPlaybackBarProps) {
	const tts = useTTS({ scope });

	if (tts.status === "idle" || tts.scope !== scope) return null;

	return (
		<div className="reader-tts-bar" role="region" aria-label="朗读控制">
			<button
				type="button"
				className="reader-tts-bar__btn"
				onClick={() => {
					if (tts.status === "playing") tts.pause();
					else if (tts.status === "paused") tts.resume();
				}}
				aria-label={tts.status === "playing" ? "暂停" : "继续"}
			>
				{tts.status === "playing" ? (
					<Pause className="w-3.5 h-3.5" strokeWidth={1.5} />
				) : (
					<Play className="w-3.5 h-3.5" strokeWidth={1.5} />
				)}
			</button>
			<button
				type="button"
				className="reader-tts-bar__btn"
				onClick={tts.stop}
				aria-label="停止朗读"
				title="停止"
			>
				<Square className="w-3.5 h-3.5" strokeWidth={1.5} />
			</button>
			<div className="reader-tts-bar__rate">
				<span>语速</span>
				<input
					type="range"
					min={0.5}
					max={2.0}
					step={0.1}
					value={tts.rate}
					onChange={(e) => tts.setRate(Number(e.target.value))}
					aria-label="朗读语速"
				/>
				<span className="tabular-nums">{tts.rate.toFixed(1)}x</span>
			</div>
			<div className="reader-tts-bar__status">
				{statusText ?? (tts.status === "loading" ? "合成中…" : "朗读中…")}
			</div>
		</div>
	);
}
