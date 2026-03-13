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
		codingWorkspaceStore.setFileTree(result.tree as FileTreeNode[], result.isGitRepo);
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
		codingWorkspaceStore.setGitBranches(result.isGitRepo ? result.branches : []);
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
