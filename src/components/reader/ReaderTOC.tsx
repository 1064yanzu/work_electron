import {
	ChevronRight,
	Highlighter,
	List,
	Trash2,
	BookOpen,
} from "lucide-react";

import type {
	ReaderBookmark,
	ReaderHighlight,
	ReaderTocItem,
} from "../../lib/api/reader";

interface ReaderTOCProps {
	tab: "toc" | "highlights" | "bookmarks";
	toc: ReaderTocItem[];
	currentChapterId: string | null;
	onJumpToChapter: (chapterId: string) => void;
	highlights: ReaderHighlight[];
	bookmarks: ReaderBookmark[];
	onJumpToHighlight: (h: ReaderHighlight) => void;
	onRemoveHighlight: (id: string) => void;
	onJumpToBookmark: (b: ReaderBookmark) => void;
	onRemoveBookmark: (id: string) => void;
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
					) : (
						<>
							<BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
							书签
						</>
					)}
				</span>
			</header>
			<div className="reader-toc__body">
				{tab === "toc" && <TocList {...props} />}
				{tab === "highlights" && <HighlightList {...props} />}
				{tab === "bookmarks" && <BookmarkList {...props} />}
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
