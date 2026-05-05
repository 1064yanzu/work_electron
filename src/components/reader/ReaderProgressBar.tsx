import { ChevronLeft, ChevronRight } from "lucide-react";

interface ReaderProgressBarProps {
	percent: number;
	chapterTitle: string | null;
	onPrev: () => void;
	onNext: () => void;
	canPrev: boolean;
	canNext: boolean;
}

export function ReaderProgressBar({
	percent,
	chapterTitle,
	onPrev,
	onNext,
	canPrev,
	canNext,
}: ReaderProgressBarProps) {
	const pct = Math.max(0, Math.min(1, percent || 0));
	return (
		<footer className="reader-progressbar">
			<button
				type="button"
				className="reader-progressbar__nav"
				onClick={onPrev}
				disabled={!canPrev}
				aria-label="上一章"
				title="上一章（←）"
			>
				<ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
			</button>
			<div className="reader-progressbar__bar">
				<div
					className="reader-progressbar__fill"
					style={{ width: `${(pct * 100).toFixed(2)}%` }}
				/>
				{chapterTitle ? (
					<span className="reader-progressbar__chapter">{chapterTitle}</span>
				) : null}
				<span className="reader-progressbar__percent tabular-nums">
					{Math.round(pct * 100)}%
				</span>
			</div>
			<button
				type="button"
				className="reader-progressbar__nav"
				onClick={onNext}
				disabled={!canNext}
				aria-label="下一章"
				title="下一章（→）"
			>
				<ChevronRight className="w-4 h-4" strokeWidth={1.5} />
			</button>
		</footer>
	);
}
