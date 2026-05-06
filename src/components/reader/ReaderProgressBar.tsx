import { ChevronLeft, ChevronRight } from "lucide-react";

interface ReaderProgressBarProps {
	percent: number;
	chapterTitle: string | null;
	onPrev: () => void;
	onNext: () => void;
	canPrev: boolean;
	canNext: boolean;
	onSeek: (percent: number) => void;
}

export function ReaderProgressBar({
	percent,
	chapterTitle,
	onPrev,
	onNext,
	canPrev,
	canNext,
	onSeek,
}: ReaderProgressBarProps) {
	const pct = Math.max(0, Math.min(1, percent || 0));
	return (
		<footer className="reader-progressbar">
			<div className="reader-progressbar__left">
				<button
					type="button"
					className="reader-progressbar__nav-btn"
					onClick={onPrev}
					disabled={!canPrev}
					aria-label="上一章"
					title="上一章（←）"
				>
					<ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
				</button>
				<button
					type="button"
					className="reader-progressbar__nav-btn"
					onClick={onNext}
					disabled={!canNext}
					aria-label="下一章"
					title="下一章（→）"
				>
					<ChevronRight className="w-4 h-4" strokeWidth={1.5} />
				</button>
				{chapterTitle ? (
					<span className="reader-progressbar__chapter">{chapterTitle}</span>
				) : null}
			</div>
			<div className="reader-progressbar__bar">
				<div
					className="reader-progressbar__fill"
					style={{ width: `${(pct * 100).toFixed(2)}%` }}
				/>
				<input
					className="reader-progressbar__range"
					type="range"
					min={0}
					max={1000}
					step={1}
					value={Math.round(pct * 1000)}
					onChange={(event) => onSeek(Number(event.currentTarget.value) / 1000)}
					aria-label="章节内阅读进度"
				/>
			</div>
			<span className="reader-progressbar__percent tabular-nums">
				{Math.round(pct * 100)}%
			</span>
		</footer>
	);
}
