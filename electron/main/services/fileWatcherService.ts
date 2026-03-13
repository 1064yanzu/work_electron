/**
 * File Watcher Service
 * 基于 chokidar 实现项目文件系统监听
 * 当文件变更时通过 IPC 事件通知渲染进程
 */
import type { BrowserWindow } from "electron";
import { FSWatcher, type ChokidarOptions } from "chokidar";
import { basename } from "node:path";

// 忽略的目录/文件模式
const DEFAULT_IGNORED: (string | RegExp)[] = [
	"**/node_modules/**",
	"**/.git/**",
	"**/.DS_Store",
	"**/dist/**",
	"**/build/**",
	"**/.next/**",
	"**/.nuxt/**",
	"**/.cache/**",
	"**/coverage/**",
	"**/__pycache__/**",
	"**/.venv/**",
	"**/.env/**",
	"**/target/**",
	"**/*.pyc",
	"**/.ipo/**",
	"**/.trae/**",
	"**/session-env/**",
	"**/logs/**",
	"**/dist-electron/**",
	"**/.vite/**",
	"**/.vite-temp/**",
	"**/tmp/**",
	"**/temp/**",
	"**/projects/**",
];

// 文件变更事件类型
export type FileChangeEvent = {
	type: "add" | "change" | "unlink" | "addDir" | "unlinkDir";
	path: string;
	/** 文件名 */
	name: string;
};

/** 活跃的 watcher 实例映射：projectPath -> watcher */
const watchers = new Map<string, FSWatcher>();

/** 主窗口引用 */
let mainWindow: BrowserWindow | null = null;

/** 防抖定时器 */
const debounceTimers = new Map<string, NodeJS.Timeout>();

/** 设置主窗口引用（在 IPC 注册时调用） */
export function setFileWatcherMainWindow(win: BrowserWindow | null) {
	mainWindow = win;
}

function shouldUsePolling(projectPath: string) {
	return process.platform === "darwin" && projectPath.startsWith("/Volumes/");
}

/**
 * 开始监听项目目录
 */
export async function startWatching(
	projectPath: string,
	options?: { ignored?: string[] },
): Promise<{ success: boolean; error?: string }> {
	// 如果已经在监听，先停止
	if (watchers.has(projectPath)) {
		await stopWatching(projectPath);
	}

	try {
		const ignored = [...DEFAULT_IGNORED, ...(options?.ignored || [])];
		const usePolling = shouldUsePolling(projectPath);

		const watcherOptions: ChokidarOptions = {
			ignored,
			persistent: true,
			ignoreInitial: true,
			depth: 5,
			awaitWriteFinish: {
				stabilityThreshold: 300,
				pollInterval: 100,
			},
			ignorePermissionErrors: true,
			usePolling,
			interval: usePolling ? 800 : undefined,
			binaryInterval: usePolling ? 1200 : undefined,
		};

		const watcher = new FSWatcher(watcherOptions);
		watcher.add(projectPath);

		// 监听事件
		watcher.on("add", (path) => emitChange(projectPath, "add", path));
		watcher.on("change", (path) => emitChange(projectPath, "change", path));
		watcher.on("unlink", (path) => emitChange(projectPath, "unlink", path));
		watcher.on("addDir", (path) => emitChange(projectPath, "addDir", path));
		watcher.on("unlinkDir", (path) =>
			emitChange(projectPath, "unlinkDir", path),
		);

		watcher.on("error", (error) => {
			console.error(`[FileWatcher] Error for ${projectPath}:`, error);
		});

		watchers.set(projectPath, watcher);
		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * 停止监听项目目录
 */
export async function stopWatching(
	projectPath: string,
): Promise<{ success: boolean; error?: string }> {
	const watcher = watchers.get(projectPath);
	if (!watcher) {
		return { success: true };
	}

	try {
		await watcher.close();
		watchers.delete(projectPath);

		// 清理防抖定时器
		const timer = debounceTimers.get(projectPath);
		if (timer) {
			clearTimeout(timer);
			debounceTimers.delete(projectPath);
		}

		return { success: true };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * 停止所有监听（应用退出时调用）
 */
export function stopAllWatchers() {
	for (const [path] of watchers) {
		void stopWatching(path);
	}
}

/**
 * 批量发送变更事件（防抖）
 * 短时间内的多个变更合并为一次通知
 */
const pendingChanges = new Map<string, FileChangeEvent[]>();

function emitChange(
	projectPath: string,
	type: FileChangeEvent["type"],
	filePath: string,
) {
	const event: FileChangeEvent = {
		type,
		path: filePath,
		name: basename(filePath),
	};

	// 收集变更
	if (!pendingChanges.has(projectPath)) {
		pendingChanges.set(projectPath, []);
	}
	pendingChanges.get(projectPath)!.push(event);

	// 防抖：500ms 内合并
	const existingTimer = debounceTimers.get(projectPath);
	if (existingTimer) {
		clearTimeout(existingTimer);
	}

	debounceTimers.set(
		projectPath,
		setTimeout(() => {
			const changes = pendingChanges.get(projectPath) || [];
			pendingChanges.delete(projectPath);
			debounceTimers.delete(projectPath);

			if (changes.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.webContents.send("coding-file-changed", {
					projectPath,
					changes,
				});
			}
		}, 500),
	);
}
