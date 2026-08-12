/**
 * InstallProgress —— 顶层进度浮层
 *
 * 当 progress map 中有正在安装的 entry 时显示一个紧凑列表。
 */

import { Loader2, X } from "lucide-react";
import {
	skillsMarketplaceStore,
	useMarketplaceStore,
} from "../../lib/skillsMarketplaceStore";

const PHASE_LABEL: Record<string, string> = {
	queued: "排队",
	resolving: "解析",
	downloading: "下载",
	extracting: "解压",
	verifying: "校验",
	writing: "写入",
};

export function InstallProgress() {
	const { progress } = useMarketplaceStore();
	const entries = Object.values(progress);
	const active = entries.filter(
		(p) => p.phase !== "done" && p.phase !== "error",
	);
	if (active.length === 0) return null;
	return (
		<div className="px-5 pt-2 pb-1 space-y-1 shrink-0">
			{active.map((p) => {
				const entryName = p.entryId.split("/").slice(-1)[0] ?? p.entryId;
				const phaseLabel = PHASE_LABEL[p.phase] ?? p.phase;
				const pct = Math.max(2, Math.min(100, p.percent));
				return (
					<div
						key={p.entryId}
						className="rounded-lg bg-surface dark:bg-cream-900/40 ring-1 ring-cream-300/60 dark:ring-cream-500/20 px-3 py-2"
					>
						<div className="flex items-center gap-2 mb-1.5">
							<Loader2 className="w-3 h-3 animate-spin text-primary shrink-0" />
							<span className="flex-1 truncate text-xs font-medium text-text-secondary">
								{entryName}
							</span>
							<span className="text-[11px] text-text-light shrink-0">
								{phaseLabel} · {p.percent}%
							</span>
							<button
								type="button"
								onClick={() => skillsMarketplaceStore.clearProgress(p.entryId)}
								className="p-0.5 rounded text-text-light hover:text-text-secondary hover:bg-cream-200/70"
								title="收起"
							>
								<X className="w-3 h-3" />
							</button>
						</div>
						<div className="h-[2px] rounded-full bg-cream-200/80 dark:bg-cream-800/50 overflow-hidden">
							<div
								className="h-full bg-primary transition-[color,background-color,border-color,opacity,box-shadow,transform] duration-150 ease-out"
								style={{ width: `${pct}%` }}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}
