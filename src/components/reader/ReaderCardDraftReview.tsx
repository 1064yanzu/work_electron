import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";

import type { ReaderKnowledgeCard } from "../../lib/api/reader";

interface ReaderCardDraftReviewProps {
	open: boolean;
	drafts: ReaderKnowledgeCard[];
	onClose: () => void;
	onAccept: (ids: string[]) => Promise<void> | void;
	onReject: (ids: string[]) => Promise<void> | void;
	onEditDraft: (card: ReaderKnowledgeCard) => void;
}

/**
 * 草稿审核抽屉：选区/章节生成后的卡片先进入草稿池，
 * 用户在此勾选 / 编辑 / 丢弃，最后批量"接受"才进入活跃池。
 */
export function ReaderCardDraftReview({
	open,
	drafts,
	onClose,
	onAccept,
	onReject,
	onEditDraft,
}: ReaderCardDraftReviewProps) {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [collapsed, setCollapsed] = useState(false);

	// drafts 变化时，默认全选
	useEffect(() => {
		setSelected(new Set(drafts.map((c) => c.id)));
	}, [drafts]);

	const allSelected = useMemo(
		() => drafts.length > 0 && selected.size === drafts.length,
		[drafts, selected],
	);
	const noneSelected = selected.size === 0;

	if (!open || drafts.length === 0) return null;

	const toggle = (id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const toggleAll = () => {
		if (allSelected) setSelected(new Set());
		else setSelected(new Set(drafts.map((c) => c.id)));
	};

	const handleAccept = async () => {
		const ids = drafts.filter((c) => selected.has(c.id)).map((c) => c.id);
		const rest = drafts.filter((c) => !selected.has(c.id)).map((c) => c.id);
		// 接受勾选的，拒绝（删除）未勾选的
		if (rest.length > 0) {
			await onReject(rest);
		}
		if (ids.length > 0) {
			await onAccept(ids);
		}
	};

	const handleRejectAll = async () => {
		await onReject(drafts.map((c) => c.id));
	};

	return (
		<div
			className={`reader-card-draft-review ${collapsed ? "is-collapsed" : ""}`}
			role="dialog"
			aria-label="知识卡片草稿审核"
		>
			<header className="reader-card-draft-review__header">
				<button
					type="button"
					className="reader-card-draft-review__title"
					onClick={() => setCollapsed((c) => !c)}
				>
					{collapsed ? (
						<ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
					) : (
						<ChevronDown className="w-3.5 h-3.5" strokeWidth={1.5} />
					)}
					<span>草稿待审核</span>
					<span className="reader-card-draft-review__count">
						{selected.size} / {drafts.length}
					</span>
				</button>
				<button
					type="button"
					className="reader-icon-btn"
					onClick={onClose}
					aria-label="关闭"
					title="关闭"
				>
					<X className="w-4 h-4" strokeWidth={1.5} />
				</button>
			</header>

			{!collapsed && (
				<>
					<div className="reader-card-draft-review__toolbar">
						<button
							type="button"
							className="reader-card-draft-review__select-all"
							onClick={toggleAll}
						>
							<span
								className={`reader-card-draft-review__checkbox ${allSelected ? "is-checked" : ""}`}
							>
								{allSelected ? (
									<Check className="w-3 h-3" strokeWidth={2.5} />
								) : null}
							</span>
							{allSelected ? "取消全选" : "全选"}
						</button>
						<span className="reader-card-draft-review__hint">
							勾选要保留的卡片，未勾选的将被丢弃
						</span>
					</div>

					<ul className="reader-card-draft-review__list" role="list">
						{drafts.map((card) => {
							const checked = selected.has(card.id);
							return (
								<li
									key={card.id}
									className={`reader-card-draft-review__item ${checked ? "is-checked" : ""}`}
								>
									<button
										type="button"
										className="reader-card-draft-review__row"
										onClick={() => toggle(card.id)}
									>
										<span
											className={`reader-card-draft-review__checkbox ${checked ? "is-checked" : ""}`}
										>
											{checked ? (
												<Check className="w-3 h-3" strokeWidth={2.5} />
											) : null}
										</span>
										<span className="reader-card-draft-review__content">
											<span className="reader-card-draft-review__q">
												{card.question}
											</span>
											<span className="reader-card-draft-review__a">
												{card.answer}
											</span>
										</span>
									</button>
									<div className="reader-card-draft-review__actions">
										<button
											type="button"
											className="reader-card-row__action"
											aria-label="编辑"
											title="编辑"
											onClick={() => onEditDraft(card)}
										>
											<Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
										</button>
										<button
											type="button"
											className="reader-card-row__action"
											aria-label="丢弃"
											title="丢弃"
											onClick={() => onReject([card.id])}
										>
											<Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
										</button>
									</div>
								</li>
							);
						})}
					</ul>

					<footer className="reader-card-draft-review__footer">
						<button
							type="button"
							className="reader-card-review__btn"
							onClick={handleRejectAll}
						>
							全部丢弃
						</button>
						<button
							type="button"
							className="reader-card-review__btn reader-card-review__btn--primary"
							onClick={handleAccept}
							disabled={noneSelected}
						>
							接受 {selected.size} 张并保存
						</button>
					</footer>
				</>
			)}
		</div>
	);
}
