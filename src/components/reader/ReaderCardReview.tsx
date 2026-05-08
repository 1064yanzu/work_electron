import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Trash2, X } from "lucide-react";
import type { ReaderKnowledgeCard } from "../../lib/api/reader";

interface ReaderCardReviewProps {
	open: boolean;
	cards: ReaderKnowledgeCard[];
	currentIndex: number;
	onClose: () => void;
	onPrev: () => void;
	onNext: () => void;
	onDelete: (id: string) => void;
	onEdit: (card: ReaderKnowledgeCard) => void;
}

export function ReaderCardReview({
	open,
	cards,
	currentIndex,
	onClose,
	onPrev,
	onNext,
	onDelete,
	onEdit,
}: ReaderCardReviewProps) {
	const [flipped, setFlipped] = useState(false);

	// 翻页时重置为正面
	useEffect(() => {
		setFlipped(false);
	}, [currentIndex]);

	// ESC 关闭
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
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose, onPrev, onNext]);

	const handleFlip = useCallback(() => {
		setFlipped((f) => !f);
	}, []);

	if (!open || cards.length === 0) return null;

	const card = cards[currentIndex];

	return (
		<div className="reader-card-review-overlay" onClick={onClose}>
			<div className="reader-card-review" onClick={(e) => e.stopPropagation()}>
				<header className="reader-card-review__header">
					<span className="reader-card-review__counter">
						{currentIndex + 1} / {cards.length}
					</span>
					<button
						type="button"
						className="reader-icon-btn"
						onClick={onClose}
						aria-label="关闭"
					>
						<X className="w-4 h-4" strokeWidth={1.5} />
					</button>
				</header>

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
							<span className="reader-card-face__hint">点击翻转查看答案</span>
						</div>
						<div className="reader-card-face reader-card-face--back">
							<span className="reader-card-face__badge">A</span>
							<p className="reader-card-face__text">{card.answer}</p>
						</div>
					</div>
				</div>

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
