/**
 * File Watcher Bridge
 * 将主进程的文件系统变更事件桥接到前端 store
 * - 监听 `coding-file-changed` IPC 事件
 * - 自动刷新文件树和 Git 状态
 */

import { invoke } from "../tauriCompat";
import { listen } from "../tauriEventCompat";
import {
	codingWorkspaceStore,
	type FileTreeNode,
} from "../stores/codingWorkspaceStore";

// 文件变更事件载荷（与后端 fileWatcherService 对应）
interface FileChangePayload {
	projectPath: string;
	changes: Array<{
		type: "add" | "change" | "unlink" | "addDir" | "unlinkDir";
		path: string;
		name: string;
	}>;
}

/** 事件监听取消函数 */
let unlistenFn: (() => void) | null = null;

/**
 * 启动文件监听
 * 1. IPC 通知主进程开始 chokidar watch
 * 2. 注册渲染进程事件监听，接收变更通知
 */
export async function startFileWatcher(projectPath: string): Promise<void> {
	// 先停止之前的监听
	await stopFileWatcher();

	// 通知主进程开始监听
	try {
		await invoke("coding_watch_start", { path: projectPath });
	} catch (err) {
		console.error("[FileWatcherBridge] 启动监听失败:", err);
		return;
	}

	// 注册渲染进程事件监听
	try {
		unlistenFn = await listen<FileChangePayload>(
			"coding-file-changed",
			(event) => {
				handleFileChanges(event.payload);
			},
		);
	} catch (err) {
		console.error("[FileWatcherBridge] 注册事件监听失败:", err);
	}
}

/**
 * 停止文件监听
 */
export async function stopFileWatcher(): Promise<void> {
	// 取消渲染进程事件监听
	if (unlistenFn) {
		unlistenFn();
		unlistenFn = null;
	}

	// 通知主进程停止
	const projectPath = codingWorkspaceStore.getState().projectPath;
	if (projectPath) {
		try {
			await invoke("coding_watch_stop", { path: projectPath });
		} catch {
			// 忽略（可能已经停止了）
		}
	}
}

/**
 * 处理文件变更事件
 * 根据变更类型决定刷新哪些数据
 */
function handleFileChanges(payload: FileChangePayload) {
	const { projectPath, changes } = payload;
	const currentProject = codingWorkspaceStore.getState().projectPath;

	// 确保是当前项目的变更
	if (projectPath !== currentProject) return;

	// 判断是否需要刷新文件树（文件/目录增删）
	const needsTreeRefresh = changes.some((c) =>
		["add", "unlink", "addDir", "unlinkDir"].includes(c.type),
	);

	// 判断是否需要刷新 Git 状态（任何文件变更都可能影响 Git）
	const needsGitRefresh = changes.length > 0;

	// 判断是否需要刷新当前预览的文件
	const currentPreviewPath =
		codingWorkspaceStore.getState().selectedFilePreview.path;
	const previewChanged = currentPreviewPath
		? changes.some((c) => c.path === currentPreviewPath && c.type === "change")
		: false;

	if (needsTreeRefresh) {
		refreshFileTree(projectPath);
	}

	if (needsGitRefresh) {
		refreshGitStatus(projectPath);
	}

	if (previewChanged && currentPreviewPath) {
		refreshFilePreview(currentPreviewPath);
	}
}

// === 刷新操作（复用 CodingWorkspace 中的逻辑） ===

async function refreshFileTree(projectPath: string) {
	try {
		const result = await window.electronAPI.invoke("coding_read_file_tree", {
			path: projectPath,
			maxDepth: 5,
		});
		codingWorkspaceStore.setFileTree(
			result.tree as FileTreeNode[],
			result.isGitRepo,
		);
	} catch (err) {
		console.error("[FileWatcherBridge] 刷新文件树失败:", err);
	}
}

async function refreshGitStatus(projectPath: string) {
	try {
		const result = await window.electronAPI.invoke("coding_git_status", {
			path: projectPath,
		});
		if (result.isGitRepo && result.status) {
			codingWorkspaceStore.setGitStatus(result.status);
		}
	} catch (err) {
		console.error("[FileWatcherBridge] 刷新 Git 状态失败:", err);
	}
}

async function refreshFilePreview(filePath: string) {
	try {
		const result = await window.electronAPI.invoke("coding_read_file", {
			path: filePath,
		});
		codingWorkspaceStore.setSelectedFilePreview({
			path: filePath,
			content: result.content,
			truncated: result.truncated,
		});
	} catch (err) {
		console.error("[FileWatcherBridge] 刷新文件预览失败:", err);
	}
}
