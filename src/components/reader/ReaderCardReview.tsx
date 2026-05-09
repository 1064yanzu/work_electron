import { useCallback, useEffect, useState } from "react";
import {
	BookOpen,
	ChevronLeft,
	ChevronRight,
	Pencil,
	Trash2,
	X,
} from "lucide-react";
import type { ReaderKnowledgeCard } from "../../lib/api/reader";

interface ReaderCardReviewProps {
	open: boolean;
	cards: ReaderKnowledgeCard[];
	currentIndex: number;
	mode: "all" | "due";
	onClose: () => void;
	onPrev: () => void;
	onNext: () => void;
	onDelete: (id: string) => void;
	onEdit: (card: ReaderKnowledgeCard) => void;
	onReview: (id: string, quality: 0 | 1 | 2) => Promise<void> | void;
	onJumpToSource?: (card: ReaderKnowledgeCard) => void;
}

const QUALITY_LABELS: Record<0 | 1 | 2, string> = {
	0: "不认识",
	1: "一般",
	2: "认识",
};

export function ReaderCardReview({
	open,
	cards,
	currentIndex,
	mode,
	onClose,
	onPrev,
	onNext,
	onDelete,
	onEdit,
	onReview,
	onJumpToSource,
}: ReaderCardReviewProps) {
	const [flipped, setFlipped] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		setFlipped(false);
		setSubmitting(false);
	}, [currentIndex]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				onPrev();
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				onNext();
			} else if (e.key === " " || e.key === "Enter") {
				e.preventDefault();
				setFlipped((f) => !f);
			} else if (flipped) {
				if (e.key === "1") {
					e.preventDefault();
					handleQuality(0);
				} else if (e.key === "2") {
					e.preventDefault();
					handleQuality(1);
				} else if (e.key === "3") {
					e.preventDefault();
					handleQuality(2);
				}
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, flipped, currentIndex, cards.length]);

	const handleFlip = useCallback(() => {
		setFlipped((f) => !f);
	}, []);

	const handleQuality = useCallback(
		async (quality: 0 | 1 | 2) => {
			const card = cards[currentIndex];
			if (!card || submitting) return;
			setSubmitting(true);
			try {
				await onReview(card.id, quality);
			} finally {
				setSubmitting(false);
				if (currentIndex >= cards.length - 1) {
					onClose();
				} else {
					onNext();
				}
			}
		},
		[cards, currentIndex, onReview, onNext, onClose, submitting],
	);

	if (!open || cards.length === 0) return null;

	const card = cards[currentIndex];
	const total = cards.length;
	const progressPct = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;

	return (
		<div className="reader-card-review-overlay" onClick={onClose}>
			<div className="reader-card-review" onClick={(e) => e.stopPropagation()}>
				<header className="reader-card-review__header">
					<div className="reader-card-review__counter">
						{mode === "due" ? (
							<span className="reader-card-review__mode">今日复习</span>
						) : null}
						<span>
							{currentIndex + 1} / {total}
						</span>
					</div>
					<button
						type="button"
						className="reader-icon-btn"
						onClick={onClose}
						aria-label="关闭"
					>
						<X className="w-4 h-4" strokeWidth={1.5} />
					</button>
				</header>

				<div className="reader-card-review__progress" aria-hidden>
					<span
						className="reader-card-review__progress-fill"
						style={{ width: `${progressPct}%` }}
					/>
				</div>

				<div
					className="reader-card-scene"
					onClick={handleFlip}
					role="button"
					tabIndex={0}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							handleFlip();
						}
					}}
					aria-label={flipped ? "点击翻回问题" : "点击翻转查看答案"}
				>
					<div className={`reader-card-flipper ${flipped ? "is-flipped" : ""}`}>
						<div className="reader-card-face reader-card-face--front">
							<span className="reader-card-face__badge">Q</span>
							<p className="reader-card-face__text">{card.question}</p>
							<span className="reader-card-face__hint">
								点击 / 空格 翻转查看答案
							</span>
						</div>
						<div className="reader-card-face reader-card-face--back">
							<span className="reader-card-face__badge">A</span>
							<p className="reader-card-face__text">{card.answer}</p>
							{card.tags && card.tags.length > 0 ? (
								<div className="reader-card-face__tags">
									{card.tags.map((t) => (
										<span key={t} className="reader-card-tag-chip">
											{t}
										</span>
									))}
								</div>
							) : null}
						</div>
					</div>
				</div>

				{flipped ? (
					<div className="reader-card-review__quality" role="group">
						<button
							type="button"
							className="reader-card-quality-btn reader-card-quality-btn--bad"
							onClick={() => handleQuality(0)}
							disabled={submitting}
							title="快捷键 1"
						>
							<span className="reader-card-quality-btn__label">
								{QUALITY_LABELS[0]}
							</span>
							<span className="reader-card-quality-btn__hint">10 分钟后</span>
						</button>
						<button
							type="button"
							className="reader-card-quality-btn reader-card-quality-btn--mid"
							onClick={() => handleQuality(1)}
							disabled={submitting}
							title="快捷键 2"
						>
							<span className="reader-card-quality-btn__label">
								{QUALITY_LABELS[1]}
							</span>
							<span className="reader-card-quality-btn__hint">明天</span>
						</button>
						<button
							type="button"
							className="reader-card-quality-btn reader-card-quality-btn--good"
							onClick={() => handleQuality(2)}
							disabled={submitting}
							title="快捷键 3"
						>
							<span className="reader-card-quality-btn__label">
								{QUALITY_LABELS[2]}
							</span>
							<span className="reader-card-quality-btn__hint">
								{nextIntervalLabel(card)}
							</span>
						</button>
					</div>
				) : null}

				<footer className="reader-card-review__footer">
					<button
						type="button"
						className="reader-card-review__btn"
						onClick={onPrev}
						disabled={currentIndex === 0}
					>
						<ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
						上一张
					</button>
					{onJumpToSource && card.locator ? (
						<button
							type="button"
							className="reader-card-review__btn"
							onClick={() => onJumpToSource(card)}
							title="跳转到原文"
						>
							<BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
							回原文
						</button>
					) : null}
					<button
						type="button"
						className="reader-card-review__btn"
						onClick={() => onEdit(card)}
					>
						<Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
						编辑
					</button>
					<button
						type="button"
						className="reader-card-review__btn reader-card-review__btn--danger"
						onClick={() => onDelete(card.id)}
					>
						<Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
						删除
					</button>
					<button
						type="button"
						className="reader-card-review__btn"
						onClick={onNext}
						disabled={currentIndex >= cards.length - 1}
					>
						下一张
						<ChevronRight className="w-4 h-4" strokeWidth={1.5} />
					</button>
				</footer>
			</div>
		</div>
	);
}

function nextIntervalLabel(card: ReaderKnowledgeCard): string {
	const reviewCount = card.review_count;
	const interval = card.interval_days;
	const ease = card.ease || 2.5;
	let next: number;
	if (reviewCount === 0) next = 1;
	else if (reviewCount === 1) next = 3;
	else next = Math.max(1, Math.round(interval * ease));
	if (next < 1) return "明天";
	if (next === 1) return "明天";
	if (next < 7) return `${next} 天后`;
	if (next < 30) return `${Math.round(next / 7)} 周后`;
	return `${Math.round(next / 30)} 个月后`;
}
