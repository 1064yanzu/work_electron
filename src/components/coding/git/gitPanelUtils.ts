import type {
	GitBranchInfo,
	GitChangeKind,
	GitCommitInfo,
	GitFileStatus,
	GitStatusInfo,
} from "../../../lib/stores/codingWorkspaceStore";

export type GitSectionId = "conflicted" | "staged" | "unstaged" | "untracked";

export interface GitSectionEntry {
	key: string;
	path: string;
	absolutePath: string;
	originalPath?: string;
	originalAbsolutePath?: string;
	kind: GitChangeKind;
	section: GitSectionId;
}

export interface GitSection {
	id: GitSectionId;
	title: string;
	description: string;
	entries: GitSectionEntry[];
}

export interface GitSummaryStats {
	totalChangedFiles: number;
	stagedCount: number;
	unstagedCount: number;
	untrackedCount: number;
	conflictedCount: number;
	localBranchCount: number;
	recentCommitCount: number;
	isClean: boolean;
	syncLabel: string;
}

const SECTION_META: Record<
	GitSectionId,
	{ title: string; description: string }
> = {
	conflicted: {
		title: "冲突",
		description: "需要优先处理的合并/变基冲突",
	},
	staged: {
		title: "已暂存",
		description: "这些改动已经进入下一次提交",
	},
	unstaged: {
		title: "工作区更改",
		description: "这些改动还没有暂存",
	},
	untracked: {
		title: "未跟踪",
		description: "这些文件尚未纳入 Git 管理",
	},
};

export function buildGitSections(status: GitStatusInfo | null): GitSection[] {
	if (!status) return [];

	const grouped: Record<GitSectionId, GitSectionEntry[]> = {
		conflicted: [],
		staged: [],
		unstaged: [],
		untracked: [],
	};

	for (const file of status.files) {
		if (
			file.indexStatus === "conflicted" ||
			file.workingTreeStatus === "conflicted"
		) {
			grouped.conflicted.push(toEntry(file, "conflicted", "conflicted"));
			continue;
		}

		if (file.indexStatus && file.indexStatus !== "untracked") {
			grouped.staged.push(toEntry(file, file.indexStatus, "staged"));
		}

		if (file.workingTreeStatus === "untracked") {
			grouped.untracked.push(toEntry(file, "untracked", "untracked"));
			continue;
		}

		if (file.workingTreeStatus) {
			grouped.unstaged.push(toEntry(file, file.workingTreeStatus, "unstaged"));
		}
	}

	return (Object.keys(SECTION_META) as GitSectionId[]).map((id) => ({
		id,
		title: SECTION_META[id].title,
		description: SECTION_META[id].description,
		entries: grouped[id],
	}));
}

export function buildGitSummaryStats(input: {
	status: GitStatusInfo | null;
	branches: GitBranchInfo[];
	commits: GitCommitInfo[];
}): GitSummaryStats {
	const sections = buildGitSections(input.status);
	const localBranchCount = input.branches.filter(
		(branch) => !branch.name.startsWith("remotes/"),
	).length;

	return {
		totalChangedFiles: input.status?.files.length ?? 0,
		stagedCount: getSectionCount(sections, "staged"),
		unstagedCount: getSectionCount(sections, "unstaged"),
		untrackedCount: getSectionCount(sections, "untracked"),
		conflictedCount: getSectionCount(sections, "conflicted"),
		localBranchCount,
		recentCommitCount: input.commits.length,
		isClean: (input.status?.files.length ?? 0) === 0,
		syncLabel: describeSyncState(input.status),
	};
}

export function getStatusToken(kind: GitChangeKind) {
	switch (kind) {
		case "added":
			return {
				label: "A",
				tone: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
			};
		case "deleted":
			return {
				label: "D",
				tone: "text-red-600 bg-red-500/10 border-red-500/20",
			};
		case "renamed":
			return {
				label: "R",
				tone: "text-sky-600 bg-sky-500/10 border-sky-500/20",
			};
		case "copied":
			return {
				label: "C",
				tone: "text-cyan-600 bg-cyan-500/10 border-cyan-500/20",
			};
		case "untracked":
			return {
				label: "U",
				tone: "text-zinc-600 bg-zinc-500/10 border-zinc-500/20 dark:text-zinc-300",
			};
		case "conflicted":
			return {
				label: "!",
				tone: "text-orange-600 bg-orange-500/10 border-orange-500/20",
			};
		default:
			return {
				label: "M",
				tone: "text-amber-600 bg-amber-500/10 border-amber-500/20",
			};
	}
}

export function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟前`;
	if (hours < 24) return `${hours} 小时前`;
	if (days < 7) return `${days} 天前`;
	return new Date(timestamp).toLocaleDateString("zh-CN", {
		month: "short",
		day: "numeric",
	});
}

export function getVisibleBranches(branches: GitBranchInfo[]) {
	return branches
		.filter((branch) => !branch.name.startsWith("remotes/"))
		.slice(0, 8);
}

function toEntry(
	file: GitFileStatus,
	kind: GitChangeKind,
	section: GitSectionId,
): GitSectionEntry {
	return {
		key: `${section}:${file.path}:${kind}`,
		path: file.path,
		absolutePath: file.absolutePath ?? file.path,
		originalPath: file.originalPath,
		originalAbsolutePath: file.originalAbsolutePath,
		kind,
		section,
	};
}

function getSectionCount(sections: GitSection[], id: GitSectionId) {
	return sections.find((section) => section.id === id)?.entries.length ?? 0;
}

function describeSyncState(status: GitStatusInfo | null) {
	if (!status) return "正在读取";
	if (status.ahead === 0 && status.behind === 0) return "与远端同步";
	if (status.ahead > 0 && status.behind > 0) {
		return `领先 ${status.ahead} / 落后 ${status.behind}`;
	}
	if (status.ahead > 0) return `领先远端 ${status.ahead}`;
	return `落后远端 ${status.behind}`;
}
