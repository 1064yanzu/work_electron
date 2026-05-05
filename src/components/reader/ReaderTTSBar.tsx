import { Pause, Play, Square } from "lucide-react";

interface ReaderTTSBarProps {
	visible: boolean;
	playing: boolean;
	rate: number;
	onPlayPause: () => void;
	onStop: () => void;
	onChangeRate: (rate: number) => void;
	statusText?: string;
}

export function ReaderTTSBar({
	visible,
	playing,
	rate,
	onPlayPause,
	onStop,
	onChangeRate,
	statusText,
}: ReaderTTSBarProps) {
	if (!visible) return null;
	return (
		<div className="reader-tts-bar" role="region" aria-label="朗读控制">
			<button
				type="button"
				className="reader-tts-bar__btn"
				onClick={onPlayPause}
				aria-label={playing ? "暂停" : "继续"}
			>
				{playing ? (
					<Pause className="w-3.5 h-3.5" strokeWidth={1.5} />
				) : (
					<Play className="w-3.5 h-3.5" strokeWidth={1.5} />
				)}
			</button>
			<button
				type="button"
				className="reader-tts-bar__btn"
				onClick={onStop}
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
					value={rate}
					onChange={(e) => onChangeRate(Number(e.target.value))}
					aria-label="朗读语速"
				/>
				<span className="tabular-nums">{rate.toFixed(1)}x</span>
			</div>
			<div className="reader-tts-bar__status">{statusText ?? "朗读中..."}</div>
		</div>
	);
}
