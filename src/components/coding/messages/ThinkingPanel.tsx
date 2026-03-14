/**
 * 思考过程面板 - Zed 风格浅灰背景圆角矩形
 * 可折叠，支持流式追加，使用 Markdown 渲染思考内容
 */
import { ChevronDown, Lightbulb } from "lucide-react";
import { useState, useEffect } from "react";
import type { ThinkingBlock } from "../../../lib/stores/codingSessionTypes";
import { MarkdownRenderer } from "../../ui/MarkdownRenderer";

interface ThinkingPanelProps {
	blocks: ThinkingBlock[];
}

export function ThinkingPanel({ blocks }: ThinkingPanelProps) {
	const isAnyStreaming = blocks.some((b) => b.isStreaming);
	const [expanded, setExpanded] = useState(isAnyStreaming);

	useEffect(() => {
		if (isAnyStreaming) setExpanded(true);
		else setExpanded(false);
	}, [isAnyStreaming]);

	if (blocks.length === 0) return null;

	const totalContent = blocks.map((b) => b.content).join("");

	return (
		<div className={`rounded-lg overflow-hidden transition-colors ${
			isAnyStreaming
				? "bg-zinc-100/80 dark:bg-zinc-800/60 animate-[pulse_3s_ease-in-out_infinite]"
				: "bg-zinc-100/70 dark:bg-zinc-800/50"
		}`}>
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-200/50 dark:hover:bg-zinc-700/40 cursor-pointer"
			>
				<Lightbulb className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
				<span className="text-xs text-zinc-600 dark:text-zinc-300 font-medium">Thinking</span>
				{isAnyStreaming && (
					<span className="h-1.5 w-1.5 rounded-full bg-[#D96C46] animate-pulse shrink-0" />
				)}
				<span className="flex-1" />
				<ChevronDown
					className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-150 ${
						expanded ? "" : "-rotate-90"
					}`}
				/>
			</button>

			{expanded && (
				<div className="border-t border-zinc-200/40 dark:border-zinc-700/40 px-3 pb-2.5 pt-2">
					<div className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
						<MarkdownRenderer
							content={totalContent}
							isStreaming={isAnyStreaming}
						/>
					</div>
					{isAnyStreaming && (
						<span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse rounded-full bg-zinc-400 align-middle" />
					)}
				</div>
			)}
		</div>
	);
}
