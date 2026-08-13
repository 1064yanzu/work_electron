/**
 * File Watcher Service
 * 基于 chokidar 实现项目文件系统监听
 * 当文件变更时通过 IPC 事件通知渲染进程
 */
import type { BrowserWindow } from "electron";
import { FSWatcher, type ChokidarOptions } from "chokidar";
import { homedir } from "node:os";
import { basename, dirname, parse, resolve } from "node:path";
import { createLogger } from "../logging/logger";
import { sendToLiveWebContents } from "../utils/safeWebContentsSend";

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

/**
 * 同时存在的 watcher 上限。
 *
 * chokidar 的每个 watcher 在非轮询模式下要吃掉一批 fd（递归目录树，深度 5），
 * 轮询模式下则是一组常驻定时器。没有上限时，反复切换工作区就会把 fd 用光，
 * 表现为「一段时间后文件监听整体失效」这种极难排查的问题。
 * 超限时按 LRU 淘汰最久未使用的那个。
 */
const MAX_WATCHERS = 8;

/**
 * 活跃的 watcher 实例映射：projectPath -> watcher。
 *
 * Map 的插入顺序即 LRU 顺序：每次命中都 delete + set 把条目挪到队尾。
 */
const watchers = new Map<string, FSWatcher>();

/**
 * 明确拒绝监听的路径 —— 递归监听这些位置等价于监听整台机器，
 * 一定会打满 fd 并把主进程拖到不可用。
 */
function rejectReason(projectPath: string): string | null {
	const resolved = resolve(projectPath);
	const { root } = parse(resolved);

	if (resolved === root) return "不能监听文件系统根目录";
	if (resolved === homedir()) return "不能监听用户主目录";

	for (const base of ["/Volumes", "/media", "/mnt", "/run/media"]) {
		if (dirname(resolved) === base) return `不能监听磁盘挂载点根目录：${base}`;
	}

	const depth = resolved
		.slice(root.length)
		.split(/[\\/]+/)
		.filter(Boolean).length;
	if (depth < 2) return "监听目标离文件系统根不足两级，范围过大";

	return null;
}

const logger = createLogger();

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
	const reason = rejectReason(projectPath);
	if (reason) {
		logger.warn({
			msg: "拒绝启动文件监听",
			scope: "file-watcher",
			path: projectPath,
			reason,
		});
		return { success: false, error: reason };
	}

	// 如果已经在监听，先停止
	if (watchers.has(projectPath)) {
		await stopWatching(projectPath);
	}

	// LRU 淘汰：给新 watcher 腾位置
	while (watchers.size >= MAX_WATCHERS) {
		const oldest = watchers.keys().next().value;
		if (!oldest) break;
		logger.info({
			msg: "watcher 数量达上限，淘汰最久未使用的监听",
			scope: "file-watcher",
			evicted: oldest,
			limit: MAX_WATCHERS,
		});
		await stopWatching(oldest);
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
			logger.warn({
				msg: "文件监听出错",
				scope: "file-watcher",
				path: projectPath,
				error: error instanceof Error ? error.message : String(error),
			});
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
		// 即使 watcher 已经被清掉，也要确保任何残留的 buffer 被释放
		pendingChanges.delete(projectPath);
		const stale = debounceTimers.get(projectPath);
		if (stale) {
			clearTimeout(stale);
			debounceTimers.delete(projectPath);
		}
		return { success: true };
	}

	try {
		await watcher.close();
		watchers.delete(projectPath);

		// 清理防抖定时器与待发送变更，避免空 entry 累积
		const timer = debounceTimers.get(projectPath);
		if (timer) {
			clearTimeout(timer);
			debounceTimers.delete(projectPath);
		}
		pendingChanges.delete(projectPath);

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

	// 触碰 LRU：把这个 watcher 挪到 Map 末尾，淘汰时优先保留活跃工作区
	const watcher = watchers.get(projectPath);
	if (watcher) {
		watchers.delete(projectPath);
		watchers.set(projectPath, watcher);
	}

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
				sendToLiveWebContents(mainWindow, "coding-file-changed", {
					projectPath,
					changes,
				});
			}
		}, 500),
	);
}
