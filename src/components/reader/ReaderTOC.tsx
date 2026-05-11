import {
	ChevronRight,
	Highlighter,
	List,
	Trash2,
	BookOpen,
	Brain,
	Pencil,
	Play,
	Sparkles,
	Loader2,
	Tag,
} from "lucide-react";

import type {
	ReaderBookmark,
	ReaderHighlight,
	ReaderKnowledgeCard,
	ReaderTocItem,
} from "../../lib/api/reader";

interface ReaderTOCProps {
	tab: "toc" | "highlights" | "bookmarks" | "cards";
	toc: ReaderTocItem[];
	currentChapterId: string | null;
	onJumpToChapter: (chapterId: string) => void;
	highlights: ReaderHighlight[];
	bookmarks: ReaderBookmark[];
	onJumpToHighlight: (h: ReaderHighlight) => void;
	onRemoveHighlight: (id: string) => void;
	onJumpToBookmark: (b: ReaderBookmark) => void;
	onRemoveBookmark: (id: string) => void;
	cards: ReaderKnowledgeCard[];
	onRemoveCard: (id: string) => void;
	onEditCard: (card: ReaderKnowledgeCard) => void;
	onReviewCards: (startIndex?: number) => void;
	onReviewDueCards: () => void;
	onGenerateFromChapter: () => void;
	generating: boolean;
	extractedCount: number;
	dueCount: number;
}

export function ReaderTOC(props: ReaderTOCProps) {
	const { tab } = props;

	return (
		<aside className="reader-toc">
			<header className="reader-toc__header">
				<span className="reader-toc__title">
					{tab === "toc" ? (
						<>
							<List className="w-3.5 h-3.5" strokeWidth={1.5} />
							目录
						</>
					) : tab === "highlights" ? (
						<>
							<Highlighter className="w-3.5 h-3.5" strokeWidth={1.5} />
							高亮
						</>
					) : tab === "bookmarks" ? (
						<>
							<BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
							书签
						</>
					) : (
						<>
							<Brain className="w-3.5 h-3.5" strokeWidth={1.5} />
							知识卡片
						</>
					)}
				</span>
			</header>
			<div className="reader-toc__body">
				{tab === "toc" && <TocList {...props} />}
				{tab === "highlights" && <HighlightList {...props} />}
				{tab === "bookmarks" && <BookmarkList {...props} />}
				{tab === "cards" && <CardList {...props} />}
			</div>
		</aside>
	);
}

function TocList({ toc, currentChapterId, onJumpToChapter }: ReaderTOCProps) {
	if (toc.length === 0) {
		return <div className="reader-toc__empty">本书暂无目录</div>;
	}
	return (
		<ul className="reader-toc__list" role="list">
			{toc.map((item) => (
				<TocItem
					key={item.id || item.href}
					item={item}
					currentChapterId={currentChapterId}
					onJumpToChapter={onJumpToChapter}
				/>
			))}
		</ul>
	);
}

function TocItem({
	item,
	currentChapterId,
	onJumpToChapter,
}: {
	item: ReaderTocItem;
	currentChapterId: string | null;
	onJumpToChapter: (chapterId: string) => void;
}) {
	const isActive =
		currentChapterId === item.href || currentChapterId === item.id;
	const indent = Math.max(0, (item.level || 1) - 1) * 14;
	return (
		<li>
			<button
				type="button"
				className={`reader-toc__item ${isActive ? "is-active" : ""}`}
				style={{ paddingLeft: 12 + indent }}
				onClick={() => onJumpToChapter(item.href || item.id)}
				title={item.label}
			>
				<ChevronRight className="w-3 h-3 reader-toc__caret" strokeWidth={1.5} />
				<span className="reader-toc__label">{item.label}</span>
			</button>
			{item.children && item.children.length > 0 ? (
				<ul className="reader-toc__sublist" role="list">
					{item.children.map((c) => (
						<TocItem
							key={c.id || c.href}
							item={c}
							currentChapterId={currentChapterId}
							onJumpToChapter={onJumpToChapter}
						/>
					))}
				</ul>
			) : null}
		</li>
	);
}

function HighlightList({
	highlights,
	onJumpToHighlight,
	onRemoveHighlight,
}: ReaderTOCProps) {
	if (highlights.length === 0) {
		return (
			<div className="reader-toc__empty">
				还没有高亮 — 选中文字后用浮层加上一笔吧。
			</div>
		);
	}
	return (
		<ul className="reader-toc__list" role="list">
			{highlights.map((h) => (
				<li key={h.id} className="reader-highlight-row">
					<button
						type="button"
						className="reader-highlight-row__main"
						data-color={h.color}
						onClick={() => onJumpToHighlight(h)}
					>
						<span className="reader-highlight-row__chip" />
						<span className="reader-highlight-row__text">{h.text}</span>
						{h.note ? (
							<span className="reader-highlight-row__note">📝 {h.note}</span>
						) : null}
					</button>
					<button
						type="button"
						className="reader-highlight-row__delete"
						aria-label="删除高亮"
						title="删除"
						onClick={() => onRemoveHighlight(h.id)}
					>
						<Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
					</button>
				</li>
			))}
		</ul>
	);
}

function BookmarkList({
	bookmarks,
	onJumpToBookmark,
	onRemoveBookmark,
}: ReaderTOCProps) {
	if (bookmarks.length === 0) {
		return (
			<div className="reader-toc__empty">还没有书签 — 按 B 标记当前位置。</div>
		);
	}
	return (
		<ul className="reader-toc__list" role="list">
			{bookmarks.map((b) => (
				<li key={b.id} className="reader-bookmark-row">
					<button
						type="button"
						className="reader-bookmark-row__main"
						onClick={() => onJumpToBookmark(b)}
					>
						<BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
						<span className="reader-bookmark-row__label">
							{b.label || "未命名书签"}
						</span>
						<span className="reader-bookmark-row__locator">{b.locator}</span>
					</button>
					<button
						type="button"
						className="reader-bookmark-row__delete"
						aria-label="删除书签"
						title="删除"
						onClick={() => onRemoveBookmark(b.id)}
					>
						<Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
					</button>
				</li>
			))}
		</ul>
	);
}

function CardList({
	cards,
	toc,
	onRemoveCard,
	onEditCard,
	onReviewCards,
	onReviewDueCards,
	onGenerateFromChapter,
	generating,
	extractedCount,
	dueCount,
}: ReaderTOCProps) {
	const chapterLabelMap = useChapterLabelMap(toc);
	return (
		<div className="reader-card-list">
			<div className="reader-card-list__actions">
				<button
					type="button"
					className="reader-card-list__gen-btn reader-card-list__gen-btn--primary"
					onClick={onGenerateFromChapter}
					disabled={generating}
				>
					{generating ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
					) : (
						<Sparkles className="w-3.5 h-3.5" strokeWidth={1.5} />
					)}
					{generating
						? extractedCount > 0
							? `已生成 ${extractedCount} 张`
							: "生成中..."
						: "为本章生成"}
				</button>
				{cards.length > 0 ? (
					dueCount > 0 ? (
						<button
							type="button"
							className="reader-card-list__review-btn reader-card-list__review-btn--due"
							onClick={onReviewDueCards}
							title={`${dueCount} 张到期`}
						>
							<Play className="w-3.5 h-3.5" strokeWidth={1.5} />
							今日复习 · {dueCount}
						</button>
					) : (
						<button
							type="button"
							className="reader-card-list__review-btn"
							onClick={() => onReviewCards(0)}
						>
							<Play className="w-3.5 h-3.5" strokeWidth={1.5} />
							浏览全部
						</button>
					)
				) : null}
			</div>
			{cards.length === 0 ? (
				<div className="reader-toc__empty">
					还没有知识卡片 — 选中文字后生成，或点击上方按钮为本章生成。
				</div>
			) : (
				<ul className="reader-toc__list" role="list">
					{cards.map((card, idx) => {
						const chapterLabel = card.chapter_id
							? chapterLabelMap.get(card.chapter_id)
							: null;
						const dueLabel = formatDueLabel(card.next_review_at);
						return (
							<li key={card.id} className="reader-card-row">
								<button
									type="button"
									className="reader-card-row__main"
									onClick={() => onReviewCards(idx)}
									title={card.question}
								>
									<span className="reader-card-row__question">
										{card.question}
									</span>
									<span className="reader-card-row__meta">
										{chapterLabel ? (
											<span
												className="reader-card-row__chapter"
												title={chapterLabel}
											>
												<BookOpen className="w-3 h-3" strokeWidth={1.5} />
												{chapterLabel}
											</span>
										) : null}
										{dueLabel ? (
											<span className={`reader-card-row__due ${dueLabel.tone}`}>
												{dueLabel.text}
											</span>
										) : null}
									</span>
									{card.tags && card.tags.length > 0 ? (
										<span className="reader-card-row__tags">
											{card.tags.slice(0, 4).map((t) => (
												<span key={t} className="reader-card-tag-chip">
													<Tag className="w-2.5 h-2.5" strokeWidth={1.5} />
													{t}
												</span>
											))}
										</span>
									) : null}
								</button>
								<div className="reader-card-row__actions">
									<button
										type="button"
										className="reader-card-row__action"
										aria-label="编辑卡片"
										title="编辑"
										onClick={() => onEditCard(card)}
									>
										<Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
									</button>
									<button
										type="button"
										className="reader-card-row__action"
										aria-label="删除卡片"
										title="删除"
										onClick={() => onRemoveCard(card.id)}
									>
										<Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
									</button>
								</div>
							</li>
						);
					})}
				</ul>
			)}
			{cards.length > 0 && (
				<div className="reader-card-list__count">共 {cards.length} 张卡片</div>
			)}
		</div>
	);
}

function useChapterLabelMap(toc: ReaderTocItem[]): Map<string, string> {
	const map = new Map<string, string>();
	const walk = (items: ReaderTocItem[]) => {
		for (const item of items) {
			const key = item.id || item.href;
			if (key && item.label) {
				map.set(key, item.label);
				if (item.href) map.set(item.href, item.label);
				if (item.id) map.set(item.id, item.label);
			}
			if (item.children?.length) walk(item.children);
		}
	};
	walk(toc);
	return map;
}

function formatDueLabel(
	nextReviewAt: number | null,
): { text: string; tone: "due" | "soon" | "future" } | null {
	if (!nextReviewAt) return null;
	const now = Date.now();
	const diff = nextReviewAt - now;
	const dayMs = 86_400_000;
	if (diff <= 0) return { text: "待复习", tone: "due" };
	if (diff < dayMs) return { text: "今天", tone: "soon" };
	const days = Math.round(diff / dayMs);
	if (days < 7) return { text: `${days}天后`, tone: "future" };
	if (days < 30) return { text: `${Math.round(days / 7)}周后`, tone: "future" };
	return { text: `${Math.round(days / 30)}月后`, tone: "future" };
}
