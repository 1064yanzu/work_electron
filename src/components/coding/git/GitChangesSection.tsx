import { CheckCircle2, CircleDot, FileClock4, GitCommitHorizontal } from "lucide-react";
import { useMemo } from "react";
import { openCodingFilePreview } from "../../../lib/coding/filePreview";
import { cn } from "../../../lib/utils";
import type { GitSection, GitSectionId } from "./gitPanelUtils";
import { getStatusToken } from "./gitPanelUtils";

interface GitChangesSectionProps {
	sections: GitSection[];
	activeFilter: GitSectionId | "all";
	onFilterChange: (next: GitSectionId | "all") => void;
	pendingDiffPaths: Set<string>;
}

const FILTERS: Array<{ id: GitSectionId | "all"; label: string }> = [
	{ id: "all", label: "全部" },
	{ id: "staged", label: "已暂存" },
	{ id: "unstaged", label: "工作区" },
	{ id: "untracked", label: "未跟踪" },
	{ id: "conflicted", label: "冲突" },
];

export function GitChangesSection({
	sections,
	activeFilter,
	onFilterChange,
	pendingDiffPaths,
}: GitChangesSectionProps) {
	const visibleSections = useMemo(() => {
		if (activeFilter === "all") {
			return sections.filter((section) => section.entries.length > 0);
		}
		return sections.filter(
			(section) => section.id === activeFilter && section.entries.length > 0,
		);
	}, [activeFilter, sections]);

	return (
		<div className="border-b border-black/[0.05] px-3 py-3 dark:border-white/[0.05]">
			<div className="mb-2 flex items-center gap-2">
				<GitCommitHorizontal className="h-4 w-4 text-zinc-400" />
				<h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
					变更文件
				</h3>
			</div>

			<div className="mb-3 flex flex-wrap gap-1.5">
				{FILTERS.map((filter) => (
					<button
						key={filter.id}
						type="button"
						onClick={() => onFilterChange(filter.id)}
						className={cn(
							"rounded-full px-2.5 py-1 text-[11px] transition",
							activeFilter === filter.id
								? "bg-[#D96C46]/10 text-[#D96C46]"
								: "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/[0.04] dark:text-zinc-400 dark:hover:bg-white/[0.08]",
						)}
					>
						{filter.label}
					</button>
				))}
			</div>

			{visibleSections.length === 0 ? (
				<div className="rounded-2xl border border-dashed border-black/[0.08] px-4 py-6 text-center text-xs text-zinc-400 dark:border-white/[0.08]">
					当前筛选下没有对应状态的文件。
				</div>
			) : (
				<div className="space-y-3">
					{visibleSections.map((section) => (
						<div
							key={section.id}
							className="overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.06]"
						>
							<div className="flex items-center gap-2 border-b border-black/[0.05] bg-zinc-50/80 px-3 py-2 dark:border-white/[0.05] dark:bg-white/[0.03]">
								<SectionIcon section={section.id} />
								<div className="min-w-0 flex-1">
									<div className="text-xs font-medium text-zinc-800 dark:text-zinc-100">
										{section.title}
									</div>
									<div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
										{section.description}
									</div>
								</div>
								<div className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/[0.05] dark:text-zinc-300">
									{section.entries.length}
								</div>
							</div>

							<div className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
								{section.entries.map((entry) => (
									<button
										key={entry.key}
										type="button"
										onClick={() => void openCodingFilePreview(entry.absolutePath)}
										className="flex w-full items-start gap-3 px-3 py-2 text-left transition hover:bg-zinc-50 dark:hover:bg-white/[0.03]"
									>
										<StatusBadge kind={entry.kind} />

										<div className="min-w-0 flex-1">
											<div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-100">
												{getFileName(entry.path)}
											</div>
											<div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
												{getDirectory(entry.path) || "项目根目录"}
											</div>
											{entry.originalPath && (
												<div className="mt-1 truncate text-[10px] text-sky-600 dark:text-sky-400">
													由 {entry.originalPath} 重命名而来
												</div>
											)}
										</div>

										<div className="flex shrink-0 items-center gap-1">
											{pendingDiffPaths.has(entry.absolutePath) && (
												<span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
													AI 待确认
												</span>
											)}
										</div>
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function SectionIcon({ section }: { section: GitSectionId }) {
	if (section === "staged") {
		return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
	}
	if (section === "conflicted") {
		return <FileClock4 className="h-3.5 w-3.5 text-orange-500" />;
	}
	return <CircleDot className="h-3.5 w-3.5 text-zinc-400" />;
}

function StatusBadge({
	kind,
}: {
	kind: Parameters<typeof getStatusToken>[0];
}) {
	const token = getStatusToken(kind);
	return (
		<span
			className={cn(
				"inline-flex min-w-7 items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
				token.tone,
			)}
		>
			{token.label}
		</span>
	);
}

function getFileName(filePath: string) {
	return filePath.split(/[\\/]/).pop() || filePath;
}

function getDirectory(filePath: string) {
	return filePath.split(/[\\/]/).slice(0, -1).join("/");
}
