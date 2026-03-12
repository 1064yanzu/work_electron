/**
 * Git 状态 Tab
 * 显示当前分支、文件状态
 */
import {
	Check,
	FileCode,
	FileMinus,
	FilePlus,
	FileQuestion,
	FileText,
	GitBranch,
} from "lucide-react";
import { useCodingWorkspaceSelector } from "../../lib/stores/codingWorkspaceStore";

export function CodingGitPanel() {
	const isGitRepo = useCodingWorkspaceSelector((s) => s.isGitRepo);
	const gitStatus = useCodingWorkspaceSelector((s) => s.gitStatus);

	if (!isGitRepo) {
		return (
			<div className="flex flex-col items-center justify-center h-full px-4 py-12">
				<GitBranch className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mb-3" />
				<p className="text-xs text-zinc-400 text-center">
					当前目录不是 Git 仓库
				</p>
			</div>
		);
	}

	if (!gitStatus) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 border-t-[#D96C46] rounded-full animate-spin" />
			</div>
		);
	}

	const staged = gitStatus.files.filter((f) => f.staged);
	const unstaged = gitStatus.files.filter((f) => !f.staged && f.status !== "untracked");
	const untracked = gitStatus.files.filter((f) => f.status === "untracked");

	return (
		<div className="h-full overflow-y-auto scrollbar-thin">
			{/* 分支信息 */}
			<div className="px-3 py-3 border-b border-black/[0.04] dark:border-white/[0.04]">
				<div className="flex items-center gap-2">
					<GitBranch className="w-3.5 h-3.5 text-[#D96C46]" />
					<span className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-200">
						{gitStatus.branch}
					</span>
					{(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
						<span className="text-[10px] text-zinc-400 font-mono">
							{gitStatus.ahead > 0 && `↑${gitStatus.ahead}`}
							{gitStatus.behind > 0 && ` ↓${gitStatus.behind}`}
						</span>
					)}
				</div>
			</div>

			{/* 已暂存 */}
			{staged.length > 0 && (
				<FileSection
					title="已暂存"
					icon={Check}
					iconColor="text-emerald-500"
					files={staged}
				/>
			)}

			{/* 未暂存 */}
			{unstaged.length > 0 && (
				<FileSection
					title="已修改"
					icon={FileCode}
					iconColor="text-amber-500"
					files={unstaged}
				/>
			)}

			{/* 未跟踪 */}
			{untracked.length > 0 && (
				<FileSection
					title="未跟踪"
					icon={FileQuestion}
					iconColor="text-zinc-400"
					files={untracked}
				/>
			)}

			{/* 干净状态 */}
			{gitStatus.files.length === 0 && (
				<div className="flex flex-col items-center justify-center py-12 px-4">
					<Check className="w-8 h-8 text-emerald-500/30 mb-3" />
					<p className="text-xs text-zinc-400 text-center">
						工作区干净，没有未提交的更改
					</p>
				</div>
			)}
		</div>
	);
}

function FileSection({
	title,
	icon: Icon,
	iconColor,
	files,
}: {
	title: string;
	icon: React.ElementType;
	iconColor: string;
	files: Array<{
		path: string;
		status: "modified" | "added" | "deleted" | "renamed" | "untracked";
	}>;
}) {
	return (
		<div className="py-2">
			<div className="px-3 py-1.5 flex items-center gap-1.5">
				<Icon className={`w-3 h-3 ${iconColor}`} />
				<span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
					{title}
				</span>
				<span className="text-[10px] text-zinc-400 ml-auto">{files.length}</span>
			</div>
			{files.map((file) => {
				const filename = file.path.split("/").pop() || file.path;
				const StatusIcon = getStatusIcon(file.status);
				return (
					<div
						key={file.path}
						className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors"
					>
						<StatusIcon
							className={`w-3 h-3 shrink-0 ${getStatusColor(file.status)}`}
						/>
						<span className="text-xs text-zinc-700 dark:text-zinc-300 truncate font-mono">
							{filename}
						</span>
					</div>
				);
			})}
		</div>
	);
}

function getStatusIcon(status: string) {
	switch (status) {
		case "added":
			return FilePlus;
		case "deleted":
			return FileMinus;
		case "untracked":
			return FileQuestion;
		default:
			return FileText;
	}
}

function getStatusColor(status: string): string {
	switch (status) {
		case "added":
			return "text-emerald-500";
		case "deleted":
			return "text-red-500";
		case "modified":
			return "text-amber-500";
		case "renamed":
			return "text-blue-500";
		default:
			return "text-zinc-400";
	}
}
