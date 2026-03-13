/**
 * 思考过程面板 - 可折叠，支持流式追加
 * 使用 Markdown 渲染思考内容
 */
import { ChevronRight, Brain } from "lucide-react";
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
		<div className="mb-1">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-100/60 hover:text-zinc-600 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-300"
			>
				<ChevronRight
					className={`h-3 w-3 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
				/>
				<Brain className="h-3.5 w-3.5" />
				<span className="font-medium">思考过程</span>
				{isAnyStreaming && (
					<span className="h-1.5 w-1.5 rounded-full bg-[#D96C46] animate-pulse" />
				)}
			</button>

			{expanded && (
				<div className="mt-1.5 ml-2 border-l-[1.5px] border-zinc-200/80 pl-3.5 dark:border-zinc-700/50">
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
