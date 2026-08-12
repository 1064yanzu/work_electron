import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { MarkdownRenderer } from "../ui/MarkdownRenderer";

function formatDurationCompact(durationMs?: number) {
	if (!durationMs || durationMs <= 0) return "";
	const s = Math.max(1, Math.round(durationMs / 1000));
	if (s < 60) return `${s}s`;
	const minutes = Math.floor(s / 60);
	const seconds = s % 60;
	return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function localizeThoughtTitle(title?: string) {
	const normalized = String(title || "")
		.trim()
		.toLowerCase();
	if (!normalized || normalized === "thought" || normalized === "thinking") {
		return "思考中";
	}
	if (normalized === "reasoning") {
		return "推理中";
	}
	return String(title || "思考中").trim();
}

export function ThoughtInline({
	title,
	content,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	phase: _phase,
	durationMs,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	source: _source,
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
	const [open, setOpen] = useState(false);
	const [liveDurationMs, setLiveDurationMs] = useState(0);
	const [frozenDurationMs, setFrozenDurationMs] = useState(durationMs ?? 0);
	const streamStartedAtRef = useRef<number | null>(
		isStreaming ? Date.now() : null,
	);
	const prevStreamingRef = useRef(Boolean(isStreaming));

	useEffect(() => {
		const wasStreaming = prevStreamingRef.current;
		if (isStreaming) {
			if (!wasStreaming || streamStartedAtRef.current === null) {
				streamStartedAtRef.current = Date.now();
				setLiveDurationMs(0);
				setFrozenDurationMs(0);
			}
		} else if (wasStreaming) {
			const elapsed =
				streamStartedAtRef.current === null
					? liveDurationMs
					: Date.now() - streamStartedAtRef.current;
			setFrozenDurationMs(durationMs || elapsed);
			streamStartedAtRef.current = null;
		} else if (durationMs) {
			setFrozenDurationMs(durationMs);
		}
		prevStreamingRef.current = isStreaming;
	}, [durationMs, isStreaming, liveDurationMs]);

	useEffect(() => {
		if (!isStreaming) return;
		const timer = setInterval(() => {
			if (streamStartedAtRef.current === null) return;
			setLiveDurationMs(Date.now() - streamStartedAtRef.current);
		}, 500);
		return () => clearInterval(timer);
	}, [isStreaming]);

	const headerDuration = useMemo(() => {
		const displayDurationMs = isStreaming
			? liveDurationMs
			: durationMs || frozenDurationMs;
		return formatDurationCompact(displayDurationMs);
	}, [durationMs, frozenDurationMs, isStreaming, liveDurationMs]);

	// 标题格式：Thought for Xs
	const headerTitle = useMemo(() => {
		const baseTitle = localizeThoughtTitle(title);
		return headerDuration ? `${baseTitle} ${headerDuration}` : baseTitle;
	}, [title, headerDuration]);

	return (
		<div className="w-full">
			{/* 极简行式布局：折叠箭头 + 文字 */}
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"w-full flex items-center gap-2 text-left transition-colors py-0.5",
					"cursor-pointer hover:bg-warm-50/50 -mx-1.5 px-1.5 rounded",
				)}
				aria-expanded={open}
			>
				{/* 折叠箭头 */}
				<span className="w-4 h-4 flex items-center justify-center text-text-light flex-shrink-0">
					{open ? (
						<ChevronDown className="w-3.5 h-3.5" />
					) : (
						<ChevronRight className="w-3.5 h-3.5" />
					)}
				</span>

				{/* 文字：Thought for Xs */}
				<span className="text-sm text-text-muted">{headerTitle}</span>
			</button>

			{/* 展开内容 - 极简风格 */}
			{open && (
				<div className="mt-2 ml-6 pl-3 border-l-2 border-border">
					{truncated && (
						<div className="mb-2 text-xs text-text-light">
							内容较长，已自动截断展示。
						</div>
					)}
					<div className="max-h-72 overflow-y-auto text-sm text-text-secondary leading-relaxed">
						<div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-headings:mt-3 prose-headings:mb-1.5">
							<MarkdownRenderer content={content} />
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
