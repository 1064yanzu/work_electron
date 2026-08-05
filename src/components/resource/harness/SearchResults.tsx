/**
 * 全文检索结果列表。
 *
 * snippet 里的 <mark> 由 renderSnippet 安全切分成 React 片段渲染。
 */
import { Loader2 } from "lucide-react";
import type { HarnessSearchHit } from "../../../lib/api/harnessHub";
import { renderSnippet } from "./renderSnippet";
import { formatRelativeTime, sessionTitle } from "./utils";

export function SearchResults({
	hits,
	searching,
	labelOf,
	onOpen,
}: {
	hits: HarnessSearchHit[] | null;
	searching: boolean;
	labelOf: (harness: string) => string;
	onOpen: (sessionId: string) => void;
}) {
	if (hits === null) {
		return (
			<div className="flex items-center justify-center gap-2 py-16 text-[11.5px] text-text-light">
				<Loader2 className="w-3.5 h-3.5 animate-spin" />
				正在检索…
			</div>
		);
	}
	if (hits.length === 0) {
		return (
			<div className="text-center py-16 px-6">
				<div className="text-[32px] font-serif text-text-light/60 leading-none mb-3">
					—
				</div>
				<p className="text-[12.5px] text-text-secondary font-medium">
					{searching ? "正在检索…" : "没有命中的内容"}
				</p>
				<p className="text-[11px] text-text-light mt-2 leading-relaxed">
					换个关键词，或先切到「全部」再搜
				</p>
			</div>
		);
	}
	return (
		<ul className="space-y-px">
			{hits.map((hit) => (
				<li key={`${hit.session_id}:${hit.seq}`}>
					<button
						type="button"
						onClick={() => onOpen(hit.session_id)}
						className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-warm-200/60 dark:hover:bg-cream-800/30 transition duration-200"
					>
						<div className="flex items-baseline gap-1.5 min-w-0">
							<span className="text-[12px] font-medium text-text-primary truncate">
								{sessionTitle(hit)}
							</span>
							<span className="shrink-0 px-1.5 py-px text-[9px] uppercase tracking-[0.12em] rounded-sm bg-terracotta/[0.12] text-terracotta leading-tight">
								{labelOf(hit.harness)}
							</span>
						</div>
						<p className="text-[11px] text-text-secondary leading-relaxed mt-1 line-clamp-3">
							{renderSnippet(hit.snippet)}
						</p>
						<div className="flex items-center gap-1.5 mt-1 text-[10px] text-text-light">
							<span>{hit.role === "user" ? "我" : "助手"}</span>
							<span className="text-text-light/50">·</span>
							<span>第 {hit.seq + 1} 条</span>
							<span className="text-text-light/50">·</span>
							<span>{formatRelativeTime(hit.created_at)}</span>
						</div>
					</button>
				</li>
			))}
		</ul>
	);
}

// ============================================================
