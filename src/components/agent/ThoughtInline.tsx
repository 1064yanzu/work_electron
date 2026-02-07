import {
	ChevronDown,
	ChevronRight,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { MarkdownRenderer } from "../ui/MarkdownRenderer";

function formatDuration(durationMs?: number) {
	if (!durationMs || durationMs <= 0) return "";
	const s = durationMs / 1000;
	return s >= 10 ? `${Math.round(s)}s` : `${s.toFixed(1)}s`;
}

function formatDurationCompact(durationMs?: number) {
	if (!durationMs || durationMs <= 0) return "";
	const s = Math.max(1, Math.round(durationMs / 1000));
	return `${s}s`;
}

export function ThoughtInline({
	title,
	content,
	phase,
	durationMs,
	source,
	truncated,
	isStreaming = false,
}: {
	title: string;
	content: string;
	phase?: string;
	durationMs?: number;
	source?: string;
	truncated?: boolean;
	isStreaming?: boolean;
}) {
	const [open, setOpen] = useState(Boolean(isStreaming));
	const [liveDurationMs, setLiveDurationMs] = useState(0);
	const streamStartedAtRef = useRef<number | null>(isStreaming ? Date.now() : null);
	const prevStreamingRef = useRef(Boolean(isStreaming));

	useEffect(() => {
		const wasStreaming = prevStreamingRef.current;
		if (isStreaming) {
			if (!wasStreaming || streamStartedAtRef.current === null) {
				streamStartedAtRef.current = Date.now();
				setLiveDurationMs(0);
			}
			// 流式期间强制展开，保证实时可见。
			setOpen(true);
		} else if (wasStreaming) {
			// 思维链结束后自动折叠，符合主流产品默认行为。
			setOpen(false);
		}
		prevStreamingRef.current = isStreaming;
	}, [isStreaming]);

	useEffect(() => {
		if (!isStreaming) return;
		const timer = setInterval(() => {
			if (streamStartedAtRef.current === null) return;
			setLiveDurationMs(Date.now() - streamStartedAtRef.current);
		}, 500);
		return () => clearInterval(timer);
	}, [isStreaming]);

	const subtitle = useMemo(() => {
		const parts: string[] = [];
		if (phase) parts.push(phase);
		const displayDurationMs = isStreaming ? liveDurationMs : durationMs;
		const d = formatDuration(displayDurationMs);
		if (d) parts.push(d);
		return parts.join(" · ");
	}, [phase, durationMs, isStreaming, liveDurationMs]);

	const headerDuration = useMemo(() => {
		const displayDurationMs = isStreaming ? liveDurationMs : durationMs;
		return formatDurationCompact(displayDurationMs);
	}, [durationMs, isStreaming, liveDurationMs]);

	const headerTitle = useMemo(() => {
		const baseTitle = title?.trim() || "Thought";
		return headerDuration ? `${baseTitle} for ${headerDuration}` : baseTitle;
	}, [title, headerDuration]);

	return (
		<div className="w-full">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="w-full flex items-center gap-2 px-1 py-1 text-left text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
				aria-expanded={open}
			>
				<div className="shrink-0 mt-[1px]">
					{open ? (
						<ChevronDown className="w-4 h-4" />
					) : (
						<ChevronRight className="w-4 h-4" />
					)}
				</div>
				<div className="min-w-0 truncate text-[15px] leading-6 font-medium tracking-[0.01em]">
					{headerTitle}
				</div>
			</button>

			{open ? (
				<div className="mt-1 ml-6 pl-4 pr-2 py-3 rounded-md bg-zinc-100/90 dark:bg-zinc-800/55 border border-zinc-200/70 dark:border-zinc-700/70">
					{truncated ? (
						<div className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
							内容较长，已自动截断展示。
						</div>
					) : null}
					<div className="max-h-72 overflow-y-auto pr-2 text-[15px] text-zinc-600 dark:text-zinc-300 leading-[1.65] whitespace-pre-wrap break-words">
						<div className="markdown-prose prose-sm dark:prose-invert max-w-none prose-p:leading-[1.65] prose-headings:font-medium prose-strong:font-medium">
							<MarkdownRenderer content={content} />
						</div>
					</div>
					{subtitle || source ? (
						<div className="mt-2 text-[11px] text-zinc-500/90 dark:text-zinc-400/90">
							{subtitle}
							{subtitle && source ? " · " : ""}
							{source}
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
