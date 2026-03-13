/**
 * Codex 文件变更卡片 - 显示 file_change 事件的文件列表、变更类型、patch 状态
 */
import {
	FilePlus,
	FileX,
	FilePen,
	ChevronDown,
	CheckCircle2,
	XCircle,
} from 'lucide-react';
import { useState } from 'react';
import type { SessionToolCall } from '../../../lib/stores/codingSessionTypes';
import { useDiffStoreSelector } from '../../../lib/stores/diffStore';

interface CodexFileChangeCardProps {
	toolCall: SessionToolCall;
}

interface FileChange {
	path: string;
	kind: 'add' | 'delete' | 'update';
}

const KIND_CONFIG = {
	add: {
		Icon: FilePlus,
		label: '新增',
		color: 'text-emerald-500',
		bg: 'bg-emerald-500/10',
	},
	delete: {
		Icon: FileX,
		label: '删除',
		color: 'text-red-500',
		bg: 'bg-red-500/10',
	},
	update: {
		Icon: FilePen,
		label: '修改',
		color: 'text-blue-500',
		bg: 'bg-blue-500/10',
	},
} as const;

export function CodexFileChangeCard({ toolCall }: CodexFileChangeCardProps) {
	const [expanded, setExpanded] = useState(false);

	const output = toolCall.output as
		| { changes?: FileChange[]; patchStatus?: string }
		| undefined;
	const changes: FileChange[] = output?.changes ?? [];
	const patchStatus = output?.patchStatus ?? (toolCall.status === 'error' ? 'failed' : 'completed');

	// diff 关联
	const diffId = toolCall.diffId;
	const diff = useDiffStoreSelector((s) =>
		diffId ? s.diffs[diffId] : undefined,
	);

	const fileCount = changes.length;
	const summary = fileCount === 0
		? '文件变更'
		: fileCount === 1
			? changes[0].path.split('/').pop() || changes[0].path
			: `${fileCount} 个文件`;

	return (
		<div className="group -mx-2 px-2 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
			{/* 头部 */}
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 py-1.5 text-left"
			>
				<FilePen className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
				<span className="text-xs text-zinc-500">文件变更</span>
				<span className="flex-1 text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">
					{summary}
				</span>
				<PatchStatusBadge status={patchStatus} />
				<StatusDot status={toolCall.status} />
				<ChevronDown
					className={`w-3 h-3 text-zinc-400 opacity-0 group-hover:opacity-100 transition-all ${expanded ? 'rotate-180 opacity-100' : ''}`}
				/>
			</button>

			{/* 展开内容 */}
			{expanded && (
				<div className="pb-2 pt-1">
					{/* 文件变更列表 */}
					{changes.length > 0 && (
						<div className="px-3 py-2 space-y-1">
							{changes.map((change, i) => {
								const cfg = KIND_CONFIG[change.kind] ?? KIND_CONFIG.update;
								const ChangeIcon = cfg.Icon;
								return (
									<div
										key={`${change.path}-${i}`}
										className="flex items-center gap-2 py-0.5"
									>
										<ChangeIcon className={`w-3 h-3 shrink-0 ${cfg.color}`} />
										<code className="flex-1 text-xs font-mono text-zinc-600 dark:text-zinc-400 truncate">
											{change.path}
										</code>
										<span
											className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} font-medium`}
										>
											{cfg.label}
										</span>
									</div>
								);
							})}
						</div>
					)}

					{/* Diff 预览 */}
					{diff && diff.newContent && (
						<div className="pb-2 pt-1">
							<div className="text-[10px] text-zinc-400 mb-1">Diff 预览</div>
							{diff.oldContent && diff.oldContent !== "(变更前内容不可用)" && (
								<pre className="bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300 px-2 py-1 rounded text-[11px] max-h-20 overflow-y-auto whitespace-pre-wrap mb-1">
									{diff.oldContent.slice(0, 800)}
								</pre>
							)}
							<pre className="bg-emerald-50 dark:bg-emerald-900/10 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded text-[11px] max-h-20 overflow-y-auto whitespace-pre-wrap">
								{diff.newContent.slice(0, 800)}
							</pre>
						</div>
					)}

					{/* 无文件变更时的占位 */}
					{changes.length === 0 && toolCall.status === 'running' && (
						<div className="px-3 py-3 text-xs text-zinc-400 text-center">
							正在应用文件变更...
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function PatchStatusBadge({ status }: { status: string }) {
	if (status === 'completed') {
		return (
			<span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
				<CheckCircle2 className="w-3 h-3" />
				已应用
			</span>
		);
	}
	if (status === 'failed') {
		return (
			<span className="inline-flex items-center gap-0.5 text-[10px] text-red-500">
				<XCircle className="w-3 h-3" />
				失败
			</span>
		);
	}
	return null;
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
