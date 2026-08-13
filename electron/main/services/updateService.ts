/**
 * 应用自动更新服务
 *
 * 基于 electron-updater，从 GitHub Releases 检测、下载并安装更新。
 * 通过事件推送实时通知渲染进程下载进度与状态变化。
 */
import { app, BrowserWindow, shell } from "electron";
import electronUpdater, { type UpdateInfo } from "electron-updater";
import { createLogger } from "../logging/logger";
import { sendToLiveWebContents } from "../utils/safeWebContentsSend";

const { autoUpdater } = electronUpdater;

const logger = createLogger();

/** 更新状态机 */
export type UpdateStatus =
	| "idle"
	| "checking"
	| "available"
	| "not-available"
	| "downloading"
	| "downloaded"
	| "installing"
	| "error";

export interface UpdateState {
	status: UpdateStatus;
	version?: string;
	releaseName?: string;
	releaseNotes?: string;
	progress?: {
		percent: number;
		transferred: number;
		total: number;
		bytesPerSecond: number;
	};
	error?: string;
}

let current: UpdateState = { status: "idle" };
let checkTimer: ReturnType<typeof setInterval> | null = null;
let downloadedFilePath: string | null = null;
let installWatchdog: ReturnType<typeof setTimeout> | null = null;
let beforeQuitFired = false;

function getState(): UpdateState {
	return { ...current };
}

function emit(event: string, payload?: unknown) {
	for (const win of BrowserWindow.getAllWindows()) {
		if (!win.isDestroyed()) {
			sendToLiveWebContents(win, event, payload);
		}
	}
}

function patchState(patch: Partial<UpdateState>) {
	current = { ...current, ...patch };
	emit("update-state-changed", getState());
}

function clearInstallWatchdog() {
	if (installWatchdog) {
		clearTimeout(installWatchdog);
		installWatchdog = null;
	}
}

function isInstallReadyState(state: UpdateState) {
	return state.status === "downloaded" || state.status === "installing";
}

/** 配置 autoUpdater 并绑定事件 */
export function initUpdateService() {
	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = true;
	autoUpdater.logger = {
		info: (msg: string) => logger.info({ msg, scope: "updater" }),
		warn: (msg: string) => logger.warn({ msg, scope: "updater" }),
		error: (msg: string) => logger.error({ msg, scope: "updater" }),
		debug: (msg: string) =>
			logger.info({ msg, scope: "updater", level: "debug" }),
	} as any;

	autoUpdater.on("checking-for-update", () => {
		patchState({ status: "checking", error: undefined });
	});

	autoUpdater.on("update-available", (info: UpdateInfo) => {
		patchState({
			status: "available",
			version: info.version,
			releaseName: info.releaseName ?? undefined,
			releaseNotes:
				typeof info.releaseNotes === "string" ? info.releaseNotes : undefined,
		});
	});

	autoUpdater.on("update-not-available", (_info: UpdateInfo) => {
		patchState({ status: "not-available" });
	});

	autoUpdater.on("error", (err: Error) => {
		logger.error({
			msg: "Auto-updater error",
			error: err.message,
			scope: "updater",
		});
		clearInstallWatchdog();
		patchState({ status: "error", error: err.message });
	});

	autoUpdater.on("download-progress", (progress) => {
		patchState({
			status: "downloading",
			progress: {
				percent: Math.round(progress.percent * 100) / 100,
				transferred: progress.transferred,
				total: progress.total,
				bytesPerSecond: progress.bytesPerSecond,
			},
		});
	});

	autoUpdater.on("update-downloaded", (info: UpdateInfo) => {
		// electron-updater 在 info 上挂 downloadedFile 字段（运行时存在，类型未声明）
		const file = (info as unknown as { downloadedFile?: string })
			.downloadedFile;
		if (file && typeof file === "string") {
			downloadedFilePath = file;
			logger.info({
				msg: "Update package downloaded",
				path: file,
				scope: "updater",
			});
		}
		patchState({
			status: "downloaded",
			version: info.version,
			releaseName: info.releaseName ?? undefined,
			progress: undefined,
		});
	});

	// 监听 before-quit 以确认 quitAndInstall 真的让 app 进入退出流程
	app.on("before-quit", () => {
		beforeQuitFired = true;
		clearInstallWatchdog();
	});

	// 启动后 30 秒自动检查一次，之后每 4 小时检查
	setTimeout(() => {
		checkForUpdates().catch(() => {});
	}, 30_000);

	checkTimer = setInterval(
		() => {
			checkForUpdates().catch(() => {});
		},
		4 * 60 * 60 * 1000,
	);

	logger.info({ msg: "Update service initialized", scope: "updater" });
}

/** 停止定时检查（应用退出时调用） */
export function stopUpdateService() {
	if (checkTimer) {
		clearInterval(checkTimer);
		checkTimer = null;
	}
	clearInstallWatchdog();
}

/** 手动检查更新 */
export async function checkForUpdates(): Promise<UpdateState> {
	try {
		patchState({
			status: "checking",
			error: undefined,
			progress: current.status === "downloading" ? current.progress : undefined,
		});
		const result = await autoUpdater.checkForUpdates();
		if (!result) {
			patchState({ status: "not-available" });
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		patchState({ status: "error", error: msg });
	}
	return getState();
}

/** 开始下载更新 */
export async function downloadUpdate(): Promise<UpdateState> {
	try {
		patchState({
			status: "downloading",
			error: undefined,
			progress: undefined,
		});
		await autoUpdater.downloadUpdate();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		patchState({ status: "error", error: msg });
	}
	return getState();
}

/** 立即退出并安装更新 */
export function quitAndInstall() {
	if (!isInstallReadyState(current)) {
		patchState({
			status: "error",
			error: "UPDATE_NOT_READY",
		});
		return;
	}

	logger.info({ msg: "quitAndInstall requested", scope: "updater" });
	patchState({ status: "installing", error: undefined });
	beforeQuitFired = false;
	clearInstallWatchdog();

	// 看门狗：如果 6 秒内 before-quit 没有触发，说明 quitAndInstall 没有
	// 真正让 app 进入退出流程（常见于 macOS 未签名 / Windows 安装包损坏 /
	// 系统更新器进程启动失败）。把错误暴露给前端，并提供手动安装兜底。
	installWatchdog = setTimeout(() => {
		if (beforeQuitFired) return;
		logger.error({
			msg: "quitAndInstall did not trigger app quit within 6s",
			scope: "updater",
		});
		patchState({
			status: "error",
			error: "INSTALL_NOT_TRIGGERED",
		});
		installWatchdog = null;
	}, 6_000);

	// setImmediate 让当前 IPC 调用先返回，再执行 quitAndInstall，避免阻塞渲染端 await。
	setImmediate(() => {
		try {
			// macOS: isSilent 参数被忽略；isForceRunAfter=true 让安装完成后自动重启。
			// Windows: isSilent=false 显示安装进度（NSIS）；isForceRunAfter=true 保证重启。
			autoUpdater.quitAndInstall(false, true);
			logger.info({
				msg: "autoUpdater.quitAndInstall returned without throwing",
				scope: "updater",
			});
		} catch (err) {
			clearInstallWatchdog();
			const msg = err instanceof Error ? err.message : String(err);
			logger.error({
				msg: "autoUpdater.quitAndInstall threw",
				error: msg,
				scope: "updater",
			});
			patchState({ status: "error", error: msg });
		}
	});
}

/**
 * 在文件管理器中显示已下载的更新包，作为自动安装失败时的兜底。
 * macOS 上是 .zip / .dmg；Windows 上是 NSIS 安装器；Linux 上是 AppImage。
 */
export async function revealDownloadedUpdate(): Promise<{
	success: boolean;
	path?: string;
	error?: string;
}> {
	if (!downloadedFilePath) {
		return { success: false, error: "NO_DOWNLOADED_FILE" };
	}
	try {
		shell.showItemInFolder(downloadedFilePath);
		return { success: true, path: downloadedFilePath };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export { getState as getUpdateState };
