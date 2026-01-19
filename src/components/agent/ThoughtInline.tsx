import { Brain, ChevronDown, ChevronRight, Clock } from "lucide-react";
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
}: {
	title: string;
	content: string;
	phase?: string;
	durationMs?: number;
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
		<div className="rounded-2xl bg-zinc-50/80 dark:bg-zinc-800/40 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/60 dark:hover:bg-zinc-900/30 transition-colors"
			>
				<div className="flex items-center gap-2 min-w-0">
					<div className="p-1.5 rounded-xl bg-white dark:bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
						<Brain className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
					</div>
					<div className="min-w-0">
						<div className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate">
							{title}
						</div>
						{subtitle ? (
							<div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
								<Clock className="w-3 h-3" />
								<span className="truncate">{subtitle}</span>
							</div>
						) : null}
					</div>
				</div>
				<div className={cn("text-zinc-400", open ? "" : "")}>
					{open ? (
						<ChevronDown className="w-4 h-4" />
					) : (
						<ChevronRight className="w-4 h-4" />
					)}
				</div>
			</button>

			{open ? (
				<div className="px-3 pb-3">
					<div className="text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">
						<div className="markdown-prose prose-sm dark:prose-invert max-w-none prose-p:leading-6 prose-headings:font-semibold prose-headings:tracking-tight prose-strong:font-medium prose-a:text-indigo-500 hover:prose-a:text-indigo-600 transition-colors">
							<MarkdownRenderer content={content} />
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
