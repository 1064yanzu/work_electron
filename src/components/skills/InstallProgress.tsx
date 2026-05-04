/**
 * InstallProgress —— 顶层进度浮层（可选，挂在 SkillsView 头部）
 *
 * 当 progress map 中有正在安装的 entry 时显示一个紧凑列表。
 */

import { Loader2, X } from "lucide-react";
import {
	skillsMarketplaceStore,
	useMarketplaceStore,
} from "../../lib/skillsMarketplaceStore";

export function InstallProgress() {
	const { progress } = useMarketplaceStore();
	const entries = Object.values(progress);
	const active = entries.filter(
		(p) => p.phase !== "done" && p.phase !== "error",
	);
	if (active.length === 0) return null;
	return (
		<div className="px-4 pt-2 pb-1 space-y-1">
			{active.map((p) => (
				<div
					key={p.entryId}
					className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-warm-200/50 dark:bg-surface/20 text-[11px] text-text-secondary"
				>
					<Loader2 className="w-3 h-3 animate-spin text-primary" />
					<span className="flex-1 truncate font-mono">{p.entryId}</span>
					<span className="text-text-light">{p.percent}%</span>
					<button
						type="button"
						onClick={() => skillsMarketplaceStore.clearProgress(p.entryId)}
						className="p-0.5 rounded hover:bg-black/5"
						title="收起"
					>
						<X className="w-3 h-3" />
					</button>
				</div>
			))}
		</div>
	);
}
