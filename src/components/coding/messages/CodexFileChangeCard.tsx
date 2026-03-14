/**
 * Codex 文件变更卡片 - 使用统一 ToolCardShell（Zed 风格）
 * 显示 file_change 事件的文件列表、变更类型、patch 状态
 */
import { FilePlus, FileX, FilePen, CheckCircle2, XCircle } from "lucide-react";
import type { SessionToolCall } from "../../../lib/stores/codingSessionTypes";
import { useDiffStoreSelector } from "../../../lib/stores/diffStore";
import { ToolCardShell } from "./shared/ToolCardShell";

interface CodexFileChangeCardProps {
	toolCall: SessionToolCall;
}

interface FileChange {
	path: string;
	kind: "add" | "delete" | "update";
}

const KIND_CONFIG = {
	add: {
		Icon: FilePlus,
		label: "新增",
		color: "text-emerald-500",
		bg: "bg-emerald-500/10",
	},
	delete: {
		Icon: FileX,
		label: "删除",
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
	update: {
		Icon: FilePen,
		label: "修改",
		color: "text-blue-500",
		bg: "bg-blue-500/10",
	},
} as const;

export function CodexFileChangeCard({ toolCall }: CodexFileChangeCardProps) {
	const output = toolCall.output as
		| { changes?: FileChange[]; patchStatus?: string }
		| undefined;
	const changes: FileChange[] = output?.changes ?? [];
	const patchStatus =
		output?.patchStatus ??
		(toolCall.status === "error" ? "failed" : "completed");

	// diff 关联
	const diffId = toolCall.diffId;
	const diff = useDiffStoreSelector((s) =>
		diffId ? s.diffs[diffId] : undefined,
	);

	const fileCount = changes.length;
	const title =
		fileCount === 0
			? "文件变更"
			: fileCount === 1
				? changes[0].path
				: `${fileCount} 个文件变更`;

	const headerRight = <PatchStatusBadge status={patchStatus} />;

	return (
		<ToolCardShell
			icon={FilePen}
			label="文件变更"
			title={title}
			status={toolCall.status}
			isError={toolCall.isError}
			headerRight={headerRight}
		>
			<div className="space-y-1.5">
				{/* 文件变更列表 */}
				{changes.length > 0 && (
					<div className="space-y-0.5">
						{changes.map((change, i) => {
							const cfg = KIND_CONFIG[change.kind] ?? KIND_CONFIG.update;
							const ChangeIcon = cfg.Icon;
							return (
								<div
									key={`${change.path}-${i}`}
									className="flex items-center gap-2 py-0.5"
								>
									<ChangeIcon className={`w-3 h-3 shrink-0 ${cfg.color}`} />
									<code className="flex-1 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 truncate">
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
					<div>
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
				{changes.length === 0 && toolCall.status === "running" && (
					<div className="text-xs text-zinc-400 text-center py-2">
						正在应用文件变更...
					</div>
				)}
			</div>
		</ToolCardShell>
	);
}

function PatchStatusBadge({ status }: { status: string }) {
	if (status === "completed") {
		return (
			<span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
				<CheckCircle2 className="w-3 h-3" />
				已应用
			</span>
		);
	}
	if (status === "failed") {
		return (
			<span className="inline-flex items-center gap-0.5 text-[10px] text-red-500">
				<XCircle className="w-3 h-3" />
				失败
			</span>
		);
	}
	return null;
}
