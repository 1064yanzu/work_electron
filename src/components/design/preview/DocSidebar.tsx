/**
 * 预览页右侧文档侧栏。
 * 把当前 session 关联的 design system / skill 的 Markdown 拉出来显示，
 * 用来对照"产品想达成什么风格 vs 实际生成的稿子"。
 */
import { BookOpen, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { designGetDoc } from "../../../lib/api/design";
import { MarkdownRenderer } from "../../ui/MarkdownRenderer";

interface DocSidebarProps {
	kind: "system" | "skill";
	id: string;
	onClose: () => void;
}

export function DocSidebar({ kind, id, onClose }: DocSidebarProps) {
	const [content, setContent] = useState<string | null>(null);
	const [title, setTitle] = useState<string>("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [reloadKey, setReloadKey] = useState(0);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				setLoading(true);
				setError(null);
				const r = await designGetDoc({ kind, id });
				if (cancelled) return;
				if (!r) {
					setContent(null);
					setError(
						kind === "system"
							? "没有找到 DESIGN.md（system 可能未带文档）"
							: "没有找到 SKILL.md（skill 资源不完整）",
					);
					return;
				}
				setContent(r.content);
				setTitle(r.title ?? id);
			} catch (e) {
				if (cancelled) return;
				setError(e instanceof Error ? e.message : String(e));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [kind, id, reloadKey]);

	return (
		<div className="w-80 h-full flex flex-col border-l border-border bg-background">
			<header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-bg-surface">
				<div className="flex items-center gap-1.5 min-w-0">
					<BookOpen
						className="w-3.5 h-3.5 text-primary shrink-0"
						strokeWidth={1.5}
					/>
					<span className="text-[11px] uppercase tracking-wider text-text-muted shrink-0">
						{kind === "system" ? "DESIGN.md" : "SKILL.md"}
					</span>
					<span className="text-xs font-medium text-text-primary truncate">
						· {title || id}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setReloadKey((k) => k + 1)}
						className="p-1 text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded transition-colors"
						title="重新加载"
					>
						<RefreshCw className="w-3 h-3" strokeWidth={1.5} />
					</button>
					<button
						type="button"
						onClick={onClose}
						className="p-1 text-text-muted hover:text-text-primary hover:bg-warm-200/60 rounded transition-colors"
						title="关闭"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				</div>
			</header>
			<div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 design-doc-scroll">
				{loading ? (
					<div className="text-xs text-text-muted">加载中…</div>
				) : error ? (
					<div className="text-xs text-text-muted leading-relaxed">{error}</div>
				) : content ? (
					<MarkdownRenderer content={content} />
				) : null}
			</div>
		</div>
	);
}
