import {
	Brain,
	ChevronDown,
	ChevronRight,
	Clock,
	Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "../../lib/utils";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";

function formatDuration(durationMs?: number) {
	if (!durationMs || durationMs <= 0) return "";
	const s = durationMs / 1000;
	return s >= 10 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`;
}

export function ThoughtInline({
	title,
	content,
	phase,
	durationMs,
	source,
	truncated,
}: {
	title: string;
	content: string;
	phase?: string;
	durationMs?: number;
	source?: string;
	truncated?: boolean;
}) {
	const [open, setOpen] = useState(false);

	const subtitle = useMemo(() => {
		const parts: string[] = [];
		if (phase) parts.push(phase);
		const d = formatDuration(durationMs);
		if (d) parts.push(d);
		return parts.join(" · ");
	}, [phase, durationMs]);

	return (
		<div className="rounded-2xl bg-gradient-to-br from-zinc-50 via-white to-zinc-50/80 dark:from-zinc-900/70 dark:via-zinc-900 dark:to-zinc-800/60 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden shadow-[0_14px_40px_-30px_rgba(0,0,0,0.45)]">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/70 dark:hover:bg-zinc-900/40 transition-colors"
			>
				<div className="flex items-center gap-2 min-w-0">
					<div className="p-1.5 rounded-xl bg-white/85 dark:bg-zinc-950 ring-1 ring-black/5 dark:ring-white/10">
						<Brain className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
					</div>
					<div className="min-w-0">
						<div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate tracking-wide">
							{title}
						</div>
						<div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
							{subtitle ? (
								<>
									<Clock className="w-3 h-3" />
									<span className="truncate">{subtitle}</span>
								</>
							) : null}
							{source ? (
								<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100/80 dark:bg-zinc-800/70 text-[10px] uppercase tracking-wider">
									<Sparkles className="w-2.5 h-2.5" />
									{source}
								</span>
							) : null}
						</div>
					</div>
				</div>
				<div className={cn("text-zinc-400")}>
					{open ? (
						<ChevronDown className="w-4 h-4" />
					) : (
						<ChevronRight className="w-4 h-4" />
					)}
				</div>
			</button>

			{open ? (
				<div className="px-3 pb-3">
					{truncated ? (
						<div className="mb-2 text-[11px] text-amber-600 dark:text-amber-400">
							内容较长，已自动截断展示。
						</div>
					) : null}
					<div className="text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
						<div className="markdown-prose prose-sm dark:prose-invert max-w-none font-mono prose-p:leading-6 prose-headings:font-semibold prose-headings:tracking-tight prose-strong:font-medium prose-a:text-indigo-500 hover:prose-a:text-indigo-600 transition-colors">
							<MarkdownRenderer content={content} />
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
