/**
 * 文件工具卡片 - Read 显示代码预览，Edit/Write 显示 inline diff
 */
import { FileCode, FilePen, FilePlus, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { SessionToolCall } from '../../../lib/stores/codingSessionTypes';
import { useDiffStoreSelector } from '../../../lib/stores/diffStore';

interface FileToolCardProps {
	toolCall: SessionToolCall;
}

export function FileToolCard({ toolCall }: FileToolCardProps) {
	const [expanded, setExpanded] = useState(false);
	const filePath: string = String(toolCall.input.file_path || toolCall.input.path || '');
	const fileName = filePath.split('/').pop() || filePath;
	const isRead = toolCall.name === 'Read';
	const isEdit = toolCall.name === 'Edit';
	const isWrite = toolCall.name === 'Write';

	const Icon = isRead ? FileCode : isEdit ? FilePen : FilePlus;
	const actionLabel = isRead ? '读取' : isEdit ? '编辑' : '写入';

	// diff 关联
	const diffId = toolCall.diffId;
	const diff = useDiffStoreSelector((s) =>
		diffId ? s.diffs[diffId] : undefined,
	);

	const filePathDisplay = filePath;

	return (
		<div className="rounded-lg border border-zinc-200 dark:border-zinc-700/50 overflow-hidden">
			{/* 头部 */}
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800/60 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
			>
				<Icon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
				<span className="text-xs text-zinc-500">{actionLabel}</span>
				<code className="flex-1 text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
					{fileName}
				</code>
				<StatusDot status={toolCall.status} />
				<ChevronDown
					className={`w-3 h-3 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
				/>
			</button>

			{/* 展开内容 */}
			{expanded ? (
				<div className="border-t border-zinc-200 dark:border-zinc-700/50">
					{/* 完整路径 */}
					<p className="px-3 py-1.5 text-[10px] font-mono text-zinc-400 bg-zinc-50/50 dark:bg-zinc-900/30">
						{filePathDisplay}
					</p>

					{/* Read 输出 */}
					{isRead && toolCall.output != null && (
						<pre className="px-3 py-2 text-xs font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-900/5 dark:bg-black/20 max-h-40 overflow-y-auto whitespace-pre-wrap">
							{typeof toolCall.output === 'string'
								? toolCall.output.slice(0, 2000)
								: JSON.stringify(toolCall.output, null, 2).slice(0, 2000)}
						</pre>
					)}

					{/* Edit/Write diff */}
					{(isEdit || isWrite) && diff && (
						<div className="px-3 py-2 space-y-1">
							{diff.oldContent && (
								<div className="text-xs">
									<div className="text-red-500/70 font-mono text-[10px] mb-0.5">- 旧内容</div>
									<pre className="bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300 px-2 py-1 rounded text-[11px] max-h-24 overflow-y-auto whitespace-pre-wrap">
										{diff.oldContent.slice(0, 1000)}
									</pre>
								</div>
							)}
							{diff.newContent && (
								<div className="text-xs">
									<div className="text-emerald-500/70 font-mono text-[10px] mb-0.5">+ 新内容</div>
									<pre className="bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded text-[11px] max-h-24 overflow-y-auto whitespace-pre-wrap">
										{diff.newContent.slice(0, 1000)}
									</pre>
								</div>
							)}
						</div>
					)}
				</div>
			) : null}
		</div>
	);
}

function StatusDot({ status }: { status: SessionToolCall['status'] }) {
	if (status === 'running') {
		return <div className="w-2 h-2 rounded-full bg-[#D96C46] animate-pulse shrink-0" />;
	}
	if (status === 'completed') {
		return <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />;
	}
	if (status === 'error') {
		return <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />;
	}
	return <div className="w-2 h-2 rounded-full bg-zinc-300 shrink-0" />;
}
