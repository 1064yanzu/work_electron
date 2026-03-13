import {
	codingWorkspaceStore,
	type FileTreeNode,
	type GitCommitInfo,
} from "../stores/codingWorkspaceStore";

export async function loadFileTree(projectPath: string) {
	try {
		codingWorkspaceStore.setFileTreeLoading(true);
		const result = await window.electronAPI.invoke("coding_read_file_tree", {
			path: projectPath,
			maxDepth: 5,
		});
		codingWorkspaceStore.setFileTree(
			result.tree as FileTreeNode[],
			result.isGitRepo,
		);
	} catch (error) {
		console.error("[CodingWorkspace] 加载文件树失败:", error);
		codingWorkspaceStore.setFileTreeLoading(false);
	}
}

export async function loadGitStatus(projectPath: string) {
	try {
		const result = await window.electronAPI.invoke("coding_git_status", {
			path: projectPath,
		});
		codingWorkspaceStore.setGitStatus(result.isGitRepo ? result.status : null);
		if (!result.isGitRepo) {
			codingWorkspaceStore.setGitBranches([]);
			codingWorkspaceStore.setGitHistory([]);
		}
	} catch (error) {
		console.error("[CodingWorkspace] 加载 Git 状态失败:", error);
	}
}

export async function loadGitBranches(projectPath: string) {
	try {
		const result = await window.electronAPI.invoke("coding_git_branches", {
			path: projectPath,
		});
		codingWorkspaceStore.setGitBranches(
			result.isGitRepo ? result.branches : [],
		);
	} catch (error) {
		console.error("[CodingWorkspace] 加载 Git 分支失败:", error);
	}
}

export async function loadGitHistory(projectPath: string, limit = 12) {
	try {
		const result = await window.electronAPI.invoke("coding_git_history", {
			path: projectPath,
			limit,
		});
		codingWorkspaceStore.setGitHistory(
			(result.isGitRepo ? result.commits : []) as GitCommitInfo[],
		);
	} catch (error) {
		console.error("[CodingWorkspace] 加载 Git 历史失败:", error);
	}
}

export async function refreshGitWorkspaceData(projectPath: string) {
	await Promise.all([
		loadGitStatus(projectPath),
		loadGitBranches(projectPath),
		loadGitHistory(projectPath),
	]);
}

// ── Git 写操作（操作完成后自动刷新状态） ──────────────────────────

export async function gitAddFiles(
	projectPath: string,
	files: string[],
): Promise<{ success: boolean; error?: string }> {
	const result = await window.electronAPI.invoke("coding_git_add", {
		dirPath: projectPath,
		files,
	});
	if (result.success) void refreshGitWorkspaceData(projectPath);
	return result;
}

export async function gitUnstageFiles(
	projectPath: string,
	files: string[],
): Promise<{ success: boolean; error?: string }> {
	const result = await window.electronAPI.invoke("coding_git_unstage", {
		dirPath: projectPath,
		files,
	});
	if (result.success) void refreshGitWorkspaceData(projectPath);
	return result;
}

export async function gitDiscardFiles(
	projectPath: string,
	files: string[],
): Promise<{ success: boolean; error?: string }> {
	const result = await window.electronAPI.invoke("coding_git_discard", {
		dirPath: projectPath,
		files,
	});
	if (result.success) void refreshGitWorkspaceData(projectPath);
	return result;
}

export async function gitCommit(
	projectPath: string,
	message: string,
	amend = false,
): Promise<{ success: boolean; hash?: string; error?: string }> {
	const result = await window.electronAPI.invoke("coding_git_commit", {
		dirPath: projectPath,
		message,
		amend,
	});
	if (result.success) void refreshGitWorkspaceData(projectPath);
	return result;
}

export async function gitPush(
	projectPath: string,
	remote?: string,
	branch?: string,
): Promise<{ success: boolean; error?: string }> {
	const result = await window.electronAPI.invoke("coding_git_push", {
		dirPath: projectPath,
		remote,
		branch,
	});
	if (result.success) void refreshGitWorkspaceData(projectPath);
	return result;
}

export async function gitPull(
	projectPath: string,
	remote?: string,
	branch?: string,
): Promise<{ success: boolean; error?: string }> {
	const result = await window.electronAPI.invoke("coding_git_pull", {
		dirPath: projectPath,
		remote,
		branch,
	});
	if (result.success) void refreshGitWorkspaceData(projectPath);
	return result;
}

export async function gitCheckoutBranch(
	projectPath: string,
	branch: string,
): Promise<{ success: boolean; error?: string }> {
	const result = await window.electronAPI.invoke("coding_git_checkout", {
		dirPath: projectPath,
		branch,
	});
	if (result.success) void refreshGitWorkspaceData(projectPath);
	return result;
}

export async function gitCreateBranch(
	projectPath: string,
	branchName: string,
	startPoint?: string,
): Promise<{ success: boolean; error?: string }> {
	const result = await window.electronAPI.invoke("coding_git_create_branch", {
		dirPath: projectPath,
		branchName,
		startPoint,
	});
	if (result.success) void refreshGitWorkspaceData(projectPath);
	return result;
}

export async function gitStashAction(
	projectPath: string,
	action: "push" | "pop" | "list",
	message?: string,
): Promise<{ success: boolean; output?: string; error?: string }> {
	const result = await window.electronAPI.invoke("coding_git_stash", {
		dirPath: projectPath,
		action,
		message,
	});
	if (result.success && action !== "list")
		void refreshGitWorkspaceData(projectPath);
	return result;
}
