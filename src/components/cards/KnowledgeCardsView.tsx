import { useCallback, useEffect, useMemo, useState } from "react";
import {
	BookOpen,
	Brain,
	Loader2,
	Maximize2,
	Pencil,
	Play,
	Search,
	Tag,
	Trash2,
	X,
} from "lucide-react";

import {
	readerDeleteCard,
	readerListAllCards,
	readerListBooks,
	readerListCardTags,
	readerReviewCard,
	readerUpdateCard,
} from "../../lib/api/reader";
import type { ReaderBook, ReaderKnowledgeCard } from "../../lib/api/reader";
import { toast } from "../ui/Toast";
import { Tooltip } from "../ui/Tooltip";
import { ReaderCardEdit } from "../reader/ReaderCardEdit";
import { ReaderCardReview } from "../reader/ReaderCardReview";

import "./cardLibrary.css";

type Variant = "overlay" | "embedded";

interface BaseProps {
	variant: Variant;
	onClose?: () => void;
	onExpand?: () => void;
	hideTitle?: boolean;
}

function KnowledgeCardsViewBase({
	variant,
	onClose,
	onExpand,
	hideTitle,
}: BaseProps) {
	const [loading, setLoading] = useState(true);
	const [cards, setCards] = useState<ReaderKnowledgeCard[]>([]);
	const [books, setBooks] = useState<ReaderBook[]>([]);
	const [tags, setTags] = useState<string[]>([]);
	const [filterBook, setFilterBook] = useState<string | null>(null);
	const [filterTag, setFilterTag] = useState<string | null>(null);
	const [filterDue, setFilterDue] = useState(false);
	const [search, setSearch] = useState("");

	const [editing, setEditing] = useState<ReaderKnowledgeCard | null>(null);
	const [reviewOpen, setReviewOpen] = useState(false);
	const [reviewIndex, setReviewIndex] = useState(0);
	const [reviewMode, setReviewMode] = useState<"all" | "due">("all");

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			const [list, bookList, tagList] = await Promise.all([
				readerListAllCards({
					book_id: filterBook,
					tag: filterTag,
					due_only: filterDue ? true : null,
					search: search.trim() || null,
				}),
				readerListBooks({ limit: 200 }),
				readerListCardTags({ book_id: filterBook }),
			]);
			setCards(list);
			setBooks(bookList);
			setTags(tagList);
		} catch (e) {
			toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`);
		} finally {
			setLoading(false);
		}
	}, [filterBook, filterTag, filterDue, search]);

	useEffect(() => {
		void reload();
	}, [reload]);

	const bookMap = useMemo(() => {
		const m = new Map<string, ReaderBook>();
		for (const b of books) m.set(b.id, b);
		return m;
	}, [books]);

	const dueCount = useMemo(() => {
		const now = Date.now();
		return cards.filter(
			(c) => c.next_review_at == null || c.next_review_at <= now,
		).length;
	}, [cards]);

	const reviewList = useMemo(
		() =>
			reviewMode === "due"
				? cards.filter((c) => {
						const now = Date.now();
						return c.next_review_at == null || c.next_review_at <= now;
					})
				: cards,
		[cards, reviewMode],
	);

	const handleStartReview = (mode: "all" | "due") => {
		const list =
			mode === "due"
				? cards.filter((c) => {
						const now = Date.now();
						return c.next_review_at == null || c.next_review_at <= now;
					})
				: cards;
		if (list.length === 0) {
			toast.info(mode === "due" ? "当前没有需要复习的卡" : "复习卡库为空");
			return;
		}
		setReviewMode(mode);
		setReviewIndex(0);
		setReviewOpen(true);
	};

	const handleDelete = useCallback(async (id: string) => {
		try {
			await readerDeleteCard(id);
			setCards((prev) => prev.filter((c) => c.id !== id));
		} catch (e) {
			toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
		}
	}, []);

	const handleEditSave = useCallback(
		async (id: string, question: string, answer: string) => {
			try {
				const updated = await readerUpdateCard({ id, question, answer });
				setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
				setEditing(null);
				toast.success("已更新");
			} catch (e) {
				toast.error(`更新失败：${e instanceof Error ? e.message : String(e)}`);
			}
		},
		[],
	);

	const handleReview = useCallback(async (id: string, quality: 0 | 1 | 2) => {
		try {
			const updated = await readerReviewCard(id, quality);
			setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));
		} catch (e) {
			toast.error(
				`复习记录失败：${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}, []);

	const rootClassName =
		variant === "overlay"
			? "card-library"
			: "card-library card-library--embedded";

	return (
		<div className={rootClassName}>
			{!hideTitle ? (
				<header className="card-library__header">
					<div className="card-library__title">
						<Brain className="w-5 h-5" strokeWidth={1.5} />
						<span>复习卡库</span>
						<span className="card-library__count">{cards.length}</span>
					</div>
					<div className="card-library__header-actions">
						<button
							type="button"
							className="card-library__primary-btn"
							onClick={() => handleStartReview("due")}
							disabled={dueCount === 0}
						>
							<Play className="w-3.5 h-3.5" strokeWidth={1.5} />
							今日复习 · {dueCount}
						</button>
						<button
							type="button"
							className="card-library__ghost-btn"
							onClick={() => handleStartReview("all")}
						>
							浏览全部
						</button>
						{onExpand ? (
							<button
								type="button"
								className="reader-icon-btn"
								onClick={onExpand}
								aria-label="放大查看"
								title="放大查看"
							>
								<Maximize2 className="w-4 h-4" strokeWidth={1.5} />
							</button>
						) : null}
						{onClose ? (
							<button
								type="button"
								className="reader-icon-btn"
								onClick={onClose}
								aria-label="关闭"
							>
								<X className="w-4 h-4" strokeWidth={1.5} />
							</button>
						) : null}
					</div>
				</header>
			) : null}

			{hideTitle && variant === "embedded" ? (
				<div className="card-library__embedded-actions">
					<button
						type="button"
						className="card-library__primary-btn"
						onClick={() => handleStartReview("due")}
						disabled={dueCount === 0}
					>
						<Play className="w-3.5 h-3.5" strokeWidth={1.5} />
						今日复习 · {dueCount}
					</button>
					<button
						type="button"
						className="card-library__ghost-btn"
						onClick={() => handleStartReview("all")}
					>
						浏览全部
					</button>
				</div>
			) : null}

			<section className="card-library__filters">
				<label className="card-library__search">
					<Search className="w-4 h-4" strokeWidth={1.5} />
					<input
						type="text"
						placeholder="搜索问题或答案..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
					{search ? (
						<Tooltip content="清空" placement="top">
							<button
								type="button"
								className="card-library__search-clear"
								onClick={() => setSearch("")}
								aria-label="清空"
							>
								<X className="w-3 h-3" strokeWidth={1.5} />
							</button>
						</Tooltip>
					) : null}
				</label>
				<div className="card-library__filter-pills">
					<FilterPill
						active={!filterBook}
						label="全部书"
						onClick={() => setFilterBook(null)}
					/>
					{books.slice(0, 12).map((b) => (
						<FilterPill
							key={b.id}
							active={filterBook === b.id}
							label={b.title}
							onClick={() => setFilterBook(filterBook === b.id ? null : b.id)}
						/>
					))}
				</div>
				{tags.length > 0 ? (
					<div className="card-library__filter-pills">
						<FilterPill
							active={!filterTag}
							label="全部标签"
							onClick={() => setFilterTag(null)}
						/>
						{tags.slice(0, 16).map((t) => (
							<FilterPill
								key={t}
								active={filterTag === t}
								label={t}
								icon={<Tag className="w-3 h-3" strokeWidth={1.5} />}
								onClick={() => setFilterTag(filterTag === t ? null : t)}
							/>
						))}
					</div>
				) : null}
				<div className="card-library__filter-pills">
					<FilterPill
						active={filterDue}
						label="仅显示待复习"
						onClick={() => setFilterDue((v) => !v)}
					/>
				</div>
			</section>

			<section className="card-library__body">
				{loading ? (
					<div className="card-library__loading">
						<Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
						加载中...
					</div>
				) : cards.length === 0 ? (
					<div className="card-library__empty">
						{search || filterTag || filterBook || filterDue
							? "没有符合条件的复习卡"
							: "复习卡库还是空的 — 在阅读器里选中文字或为某章生成复习卡，它们会出现在这里。"}
					</div>
				) : (
					<ul className="card-library__grid" role="list">
						{cards.map((card) => {
							const book = bookMap.get(card.book_id);
							return (
								<li key={card.id} className="card-library__card">
									<div className="card-library__card-q">{card.question}</div>
									<div className="card-library__card-a">{card.answer}</div>
									<div className="card-library__card-meta">
										{book ? (
											<span className="card-library__card-book">
												<BookOpen className="w-3 h-3" strokeWidth={1.5} />
												{book.title}
											</span>
										) : null}
										{card.tags.length > 0
											? card.tags.slice(0, 3).map((t) => (
													<span key={t} className="reader-card-tag-chip">
														<Tag className="w-2.5 h-2.5" strokeWidth={1.5} />
														{t}
													</span>
												))
											: null}
									</div>
									<div className="card-library__card-actions">
										<Tooltip content="编辑" placement="top">
											<button
												type="button"
												className="reader-card-row__action"
												onClick={() => setEditing(card)}
											>
												<Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
											</button>
										</Tooltip>
										<Tooltip content="删除" placement="top">
											<button
												type="button"
												className="reader-card-row__action"
												onClick={() => handleDelete(card.id)}
											>
												<Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
											</button>
										</Tooltip>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</section>

			<ReaderCardReview
				open={reviewOpen}
				cards={reviewList}
				currentIndex={reviewIndex}
				mode={reviewMode}
				onClose={() => setReviewOpen(false)}
				onPrev={() => setReviewIndex((i) => Math.max(0, i - 1))}
				onNext={() =>
					setReviewIndex((i) => Math.min(reviewList.length - 1, i + 1))
				}
				onDelete={async (id) => {
					await handleDelete(id);
				}}
				onEdit={(c) => {
					setReviewOpen(false);
					setEditing(c);
				}}
				onReview={handleReview}
			/>

			<ReaderCardEdit
				card={editing}
				onSave={handleEditSave}
				onClose={() => setEditing(null)}
			/>
		</div>
	);
}

interface KnowledgeCardsViewProps {
	onClose: () => void;
}

/** 全屏 Overlay 模式（保持原签名兼容 KnowledgeCardsApp） */
export function KnowledgeCardsView({ onClose }: KnowledgeCardsViewProps) {
	return <KnowledgeCardsViewBase variant="overlay" onClose={onClose} />;
}

interface KnowledgeCardsEmbeddedProps {
	onExpand?: () => void;
	hideTitle?: boolean;
}

/** 嵌入到极窄边栏卡片视图里的紧凑模式 */
export function KnowledgeCardsEmbedded({
	onExpand,
	hideTitle,
}: KnowledgeCardsEmbeddedProps) {
	return (
		<KnowledgeCardsViewBase
			variant="embedded"
			onExpand={onExpand}
			hideTitle={hideTitle}
		/>
	);
}

function FilterPill({
	active,
	label,
	icon,
	onClick,
}: {
	active: boolean;
	label: string;
	icon?: React.ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={`card-library__pill ${active ? "is-active" : ""}`}
			onClick={onClick}
			title={label}
		>
			{icon}
			<span>{label}</span>
		</button>
	);
}
