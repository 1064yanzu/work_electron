import {
	CheckCircle2,
	CircleDot,
	FileClock,
	GitCommitHorizontal,
	Minus,
	Plus,
	RotateCcw,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { openCodingFilePreview } from "../../../lib/coding/filePreview";
import {
	gitAddFiles,
	gitDiscardFiles,
	gitUnstageFiles,
} from "../../../lib/coding/gitWorkspaceData";
import { cn } from "../../../lib/utils";
import type { GitSection, GitSectionId, GitSectionEntry } from "./gitPanelUtils";
import { getStatusToken } from "./gitPanelUtils";

interface GitChangesSectionProps {
	sections: GitSection[];
	activeFilter: GitSectionId | "all";
	onFilterChange: (next: GitSectionId | "all") => void;
	pendingDiffPaths: Set<string>;
	projectPath: string;
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
	projectPath,
}: GitChangesSectionProps) {
	const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());

	const visibleSections = useMemo(() => {
		if (activeFilter === "all") {
			return sections.filter((section) => section.entries.length > 0);
		}
		return sections.filter(
			(section) =>
				section.id === activeFilter && section.entries.length > 0,
		);
	}, [activeFilter, sections]);

	const markLoading = (paths: string[], loading: boolean) => {
		setLoadingFiles((prev) => {
			const next = new Set(prev);
			for (const p of paths) {
				if (loading) next.add(p);
				else next.delete(p);
			}
			return next;
		});
	};

	const handleStage = useCallback(
		async (e: React.MouseEvent, files: string[]) => {
			e.stopPropagation();
			markLoading(files, true);
			try {
				await gitAddFiles(projectPath, files);
			} finally {
				markLoading(files, false);
			}
		},
		[projectPath],
	);

	const handleUnstage = useCallback(
		async (e: React.MouseEvent, files: string[]) => {
			e.stopPropagation();
			markLoading(files, true);
			try {
				await gitUnstageFiles(projectPath, files);
			} finally {
				markLoading(files, false);
			}
		},
		[projectPath],
	);

	const handleDiscard = useCallback(
		async (e: React.MouseEvent, files: string[]) => {
			e.stopPropagation();
			if (!window.confirm(`确定丢弃这 ${files.length} 个文件的变更？`)) return;
			markLoading(files, true);
			try {
				await gitDiscardFiles(projectPath, files);
			} finally {
				markLoading(files, false);
			}
		},
		[projectPath],
	);

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
					{visibleSections.map((section) => {
						const allPaths = section.entries.map((e) => e.path);
						return (
							<div
								key={section.id}
								className="overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.06]"
							>
								{/* Section 头部 */}
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
									<div className="flex items-center gap-1.5">
										{/* 批量操作按钮 */}
										{section.id !== "conflicted" && (
											<>
												{section.id === "staged" ? (
													<button
														type="button"
														onClick={(e) =>
															void handleUnstage(e, allPaths)
														}
														className="rounded-lg border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-500 hover:border-amber-300 hover:text-amber-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
														title="全部取消暂存"
													>
														全部取消
													</button>
												) : (
													<button
														type="button"
														onClick={(e) =>
															void handleStage(e, allPaths)
														}
														className="rounded-lg border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-500 hover:border-emerald-300 hover:text-emerald-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
														title="全部暂存"
													>
														全部暂存
													</button>
												)}
											</>
										)}
										<div className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/[0.05] dark:text-zinc-300">
											{section.entries.length}
										</div>
									</div>
								</div>

								{/* 文件列表 */}
								<div className="divide-y divide-black/[0.05] dark:divide-white/[0.05]">
									{section.entries.map((entry) => (
										<FileEntry
											key={entry.key}
											entry={entry}
											section={section.id}
											isLoading={loadingFiles.has(entry.path)}
											isPending={pendingDiffPaths.has(entry.absolutePath)}
											onStage={(e) => void handleStage(e, [entry.path])}
											onUnstage={(e) => void handleUnstage(e, [entry.path])}
											onDiscard={(e) => void handleDiscard(e, [entry.path])}
										/>
									))}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

interface FileEntryProps {
	entry: GitSectionEntry;
	section: GitSectionId;
	isLoading: boolean;
	isPending: boolean;
	onStage: (e: React.MouseEvent) => void;
	onUnstage: (e: React.MouseEvent) => void;
	onDiscard: (e: React.MouseEvent) => void;
}

function FileEntry({
	entry,
	section,
	isLoading,
	isPending,
	onStage,
	onUnstage,
	onDiscard,
}: FileEntryProps) {
	return (
		<div
			className={cn(
				"group flex w-full items-start gap-2.5 px-3 py-2 text-left transition hover:bg-zinc-50 dark:hover:bg-white/[0.03]",
				isLoading && "opacity-50 pointer-events-none",
			)}
		>
			{/* 文件状态 + 预览（点击左侧区域） */}
			<button
				type="button"
				onClick={() => void openCodingFilePreview(entry.absolutePath)}
				className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
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
						<div className="mt-0.5 truncate text-[10px] text-sky-600 dark:text-sky-400">
							← {entry.originalPath}
						</div>
					)}
					{isPending && (
						<span className="mt-0.5 inline-block rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400">
							AI 待确认
						</span>
					)}
				</div>
			</button>

			{/* 操作按钮（悬停显示） */}
			<div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
				{section === "staged" && (
					<ActionButton
						icon={<Minus className="h-3 w-3" />}
						label="取消暂存"
						tone="amber"
						onClick={onUnstage}
					/>
				)}
				{(section === "unstaged" || section === "untracked") && (
					<ActionButton
						icon={<Plus className="h-3 w-3" />}
						label="暂存"
						tone="emerald"
						onClick={onStage}
					/>
				)}
				{section === "unstaged" && (
					<ActionButton
						icon={<RotateCcw className="h-3 w-3" />}
						label="丢弃"
						tone="red"
						onClick={onDiscard}
					/>
				)}
			</div>
		</div>
	);
}

interface ActionButtonProps {
	icon: React.ReactNode;
	label: string;
	tone: "emerald" | "amber" | "red";
	onClick: (e: React.MouseEvent) => void;
}

function ActionButton({ icon, label, tone, onClick }: ActionButtonProps) {
	const toneClass = {
		emerald:
			"border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800/50 dark:text-emerald-400 dark:hover:bg-emerald-900/20",
		amber:
			"border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-800/50 dark:text-amber-400 dark:hover:bg-amber-900/20",
		red: "border-red-200 text-red-500 hover:bg-red-50 dark:border-red-800/50 dark:text-red-400 dark:hover:bg-red-900/20",
	}[tone];

	return (
		<button
			type="button"
			onClick={onClick}
			title={label}
			className={cn(
				"flex h-6 w-6 items-center justify-center rounded-md border transition",
				toneClass,
			)}
		>
			{icon}
		</button>
	);
}

function SectionIcon({ section }: { section: GitSectionId }) {
	if (section === "staged") {
		return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
	}
	if (section === "conflicted") {
		return <FileClock className="h-3.5 w-3.5 text-orange-500" />;
	}
	return <CircleDot className="h-3.5 w-3.5 text-zinc-400" />;
}

function StatusBadge({ kind }: { kind: Parameters<typeof getStatusToken>[0] }) {
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
