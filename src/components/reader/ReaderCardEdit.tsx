import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ReaderKnowledgeCard } from "../../lib/api/reader";

interface ReaderCardEditProps {
	card: ReaderKnowledgeCard | null;
	onSave: (id: string, question: string, answer: string) => void;
	onClose: () => void;
}

export function ReaderCardEdit({ card, onSave, onClose }: ReaderCardEditProps) {
	const [question, setQuestion] = useState("");
	const [answer, setAnswer] = useState("");
	const questionRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		if (card) {
			setQuestion(card.question);
			setAnswer(card.answer);
			setTimeout(() => questionRef.current?.focus(), 100);
		}
	}, [card]);

	if (!card) return null;

	const handleSave = () => {
		const q = question.trim();
		const a = answer.trim();
		if (!q || !a) return;
		onSave(card.id, q, a);
	};

	return (
		<div
			className="reader-card-edit-overlay"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="reader-card-edit" role="dialog" aria-label="编辑复习卡">
				<header className="reader-card-edit__header">
					<span className="reader-card-edit__title">编辑复习卡</span>
					<button
						type="button"
						className="reader-icon-btn"
						onClick={onClose}
						aria-label="关闭"
					>
						<X className="w-4 h-4" strokeWidth={1.5} />
					</button>
				</header>
				<div className="reader-card-edit__body">
					<label className="reader-card-edit__label">
						问题
						<textarea
							ref={questionRef}
							className="reader-card-edit__textarea"
							value={question}
							onChange={(e) => setQuestion(e.target.value)}
							rows={3}
							placeholder="输入问题..."
						/>
					</label>
					<label className="reader-card-edit__label">
						答案
						<textarea
							className="reader-card-edit__textarea"
							value={answer}
							onChange={(e) => setAnswer(e.target.value)}
							rows={4}
							placeholder="输入答案..."
						/>
					</label>
				</div>
				<footer className="reader-card-edit__footer">
					<button
						type="button"
						className="reader-card-edit__btn"
						onClick={onClose}
					>
						取消
					</button>
					<button
						type="button"
						className="reader-card-edit__btn reader-card-edit__btn--primary"
						onClick={handleSave}
						disabled={!question.trim() || !answer.trim()}
					>
						保存
					</button>
				</footer>
			</div>
		</div>
	);
}
