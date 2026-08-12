import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

import type { FileUpdate } from "../../lib/chat/types";

import { FileChangeCard } from "./FileChangeCard";

export function FileUpdatesGroup({ updates }: { updates: FileUpdate[] }) {
	const [expanded, setExpanded] = useState(updates.length <= 1);

	const stats = useMemo(() => {
		const additions = updates.reduce((sum, u) => sum + (u.additions || 0), 0);
		const deletions = updates.reduce((sum, u) => sum + (u.deletions || 0), 0);
		const running = updates.some((u) => u.status === "running");
		const failed = updates.some((u) => u.status === "error");
		return { additions, deletions, running, failed };
	}, [updates]);

	return (
		<div className="my-2 overflow-hidden rounded-xl bg-surface ring-1 ring-border/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-cream-900/70 dark:ring-cream-800">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className="w-full flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-warm-50/45 dark:hover:bg-cream-900/35 transition-colors"
			>
				<div className="min-w-0 flex items-center gap-2">
					<span className="text-sm font-medium text-text-primary dark:text-cream-200">
						{stats.failed
							? "文件写入失败"
							: stats.running
								? "文件写入中"
								: "文件变更"}
					</span>
					<span className="text-xs text-text-muted">{updates.length} 项</span>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					{stats.additions > 0 && (
						<span className="text-xs font-mono font-medium text-text-secondary bg-surface/70 px-1.5 py-0.5 rounded">
							+{stats.additions}
						</span>
					)}
					{stats.deletions > 0 && (
						<span className="text-xs font-mono font-medium text-text-secondary bg-surface/70 px-1.5 py-0.5 rounded">
							-{stats.deletions}
						</span>
					)}
					<ChevronDown
						className={`w-4 h-4 text-text-light transition-transform ${expanded ? "rotate-180" : ""}`}
					/>
				</div>
			</button>

			{expanded ? (
				<div className="border-t border-border/70">
					{updates.map((u, idx) => (
						<FileChangeCard key={`${u.fileName}-${u.type}-${idx}`} update={u} />
					))}
				</div>
			) : null}
		</div>
	);
}
