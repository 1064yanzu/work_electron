import { Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ReaderSearchHit } from "../../lib/api/reader";

interface ReaderSearchPanelProps {
	open: boolean;
	onClose: () => void;
	onSearch: (query: string) => Promise<ReaderSearchHit[]>;
	onPick: (hit: ReaderSearchHit) => void;
}

export function ReaderSearchPanel({
	open,
	onClose,
	onSearch,
	onPick,
}: ReaderSearchPanelProps) {
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<ReaderSearchHit[]>([]);
	const [loading, setLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		setQuery("");
		setHits([]);
		const t = setTimeout(() => inputRef.current?.focus(), 50);
		return () => clearTimeout(t);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const trimmed = query.trim();
		if (!trimmed) {
			setHits([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		const id = setTimeout(async () => {
			try {
				const result = await onSearch(trimmed);
				setHits(result);
			} catch (e) {
				console.warn("[reader-search] failed:", e);
				setHits([]);
			} finally {
				setLoading(false);
			}
		}, 240);
		return () => clearTimeout(id);
	}, [query, onSearch, open]);

	if (!open) return null;

	return (
		<div
			className="reader-search-overlay"
			role="dialog"
			aria-modal="true"
			aria-label="书内搜索"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="reader-search-panel">
				<header className="reader-search-panel__header">
					<Search className="w-3.5 h-3.5" strokeWidth={1.5} />
					<input
						ref={inputRef}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="搜索本书..."
						className="reader-search-panel__input"
					/>
					{loading ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
					) : null}
					<button
						type="button"
						className="reader-search-panel__close"
						onClick={onClose}
						aria-label="关闭搜索"
					>
						<X className="w-3.5 h-3.5" strokeWidth={1.5} />
					</button>
				</header>
				<div className="reader-search-panel__body">
					{!query ? (
						<div className="reader-search-panel__hint">
							键入关键词，使用书内 FTS5 全文索引返回片段。
						</div>
					) : hits.length === 0 ? (
						<div className="reader-search-panel__hint">
							{loading ? "搜索中…" : "没有结果"}
						</div>
					) : (
						<ul className="reader-search-panel__list" role="list">
							{hits.map((h) => (
								<li key={`${h.book_id}-${h.locator}`}>
									<button
										type="button"
										className="reader-search-panel__hit"
										onClick={() => onPick(h)}
									>
										<span
											className="reader-search-panel__snippet"
											/* biome-ignore lint/security/noDangerouslySetInnerHtml: 服务端 snippet 已转义 */
											dangerouslySetInnerHTML={{
												__html: highlightSnippet(h.snippet),
											}}
										/>
										<span className="reader-search-panel__locator">
											{h.locator}
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}

function highlightSnippet(snippet: string): string {
	// 服务端使用 << >> 包裹匹配 → 转换为 <mark>
	const escaped = snippet
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	return escaped.replace(/&lt;&lt;/g, "<mark>").replace(/&gt;&gt;/g, "</mark>");
}
