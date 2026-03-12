/**
 * 思考过程面板 - 可折叠，支持流式追加
 */
import { ChevronDown, Brain } from 'lucide-react';
import { useState } from 'react';
import type { ThinkingBlock } from '../../../lib/stores/codingSessionTypes';

interface ThinkingPanelProps {
	blocks: ThinkingBlock[];
}

export function ThinkingPanel({ blocks }: ThinkingPanelProps) {
	const [expanded, setExpanded] = useState(false);

	if (blocks.length === 0) return null;

	// 合并所有块的内容用于显示
	const totalContent = blocks.map((b) => b.content).join('');
	const isAnyStreaming = blocks.some((b) => b.isStreaming);

	return (
		<div className="mb-2">
			<button
				onClick={() => setExpanded(!expanded)}
				className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors group"
			>
				<Brain className="w-3 h-3" />
				<span>思考过程</span>
				{isAnyStreaming && (
					<span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
				)}
				<ChevronDown
					className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
				/>
			</button>

			{expanded && (
				<div className="mt-1.5 px-3 py-2 border-l-2 border-amber-300/50 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-900/10 rounded-r-lg">
					<p className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
						{totalContent}
						{isAnyStreaming && (
							<span className="inline-block w-1 h-3 bg-amber-400 animate-pulse ml-0.5 align-middle" />
						)}
					</p>
				</div>
			)}
		</div>
	);
}
