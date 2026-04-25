import { FilePen, FilePlus } from "lucide-react";

import type { FileUpdate } from "../../lib/chat/types";

export function FileChangeCard({ update }: { update: FileUpdate }) {
	const isCreate = update.type === "create";

	return (
		<div className="my-5 group rounded-xl bg-surface ring-1 ring-zinc-200 dark:ring-zinc-800 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-3.5 transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:ring-zinc-300 dark:hover:ring-zinc-700">
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-3 min-w-0 flex-1">
					{/* 图标容器 - 极简灰 */}
					<div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-warm-200 text-text-secondary">
						{isCreate ? (
							<FilePlus className="w-4.5 h-4.5" />
						) : (
							<FilePen className="w-4.5 h-4.5" />
						)}
					</div>

					{/* 文本信息 */}
					<div className="min-w-0 flex-1">
						<h4 className="font-medium text-text-primary text-sm truncate leading-tight mb-0.5">
							{update.fileName}
						</h4>
						<p className="text-xs text-text-muted flex items-center gap-1.5">
							{isCreate ? "创建新文档" : "已完成修改"}
						</p>
					</div>
				</div>

				{/* 统计数据 Badge - 极简数字 */}
				<div className="flex items-center gap-2 shrink-0 self-center">
					{update.additions > 0 && (
						<span className="text-[11px] font-mono font-medium text-text-secondary bg-warm-50 px-1.5 py-0.5 rounded">
							+{update.additions}
						</span>
					)}
					{update.deletions > 0 && (
						<span className="text-[11px] font-mono font-medium text-text-secondary bg-warm-50 px-1.5 py-0.5 rounded">
							-{update.deletions}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
