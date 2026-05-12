/**
 * 应用自动更新服务
 *
 * 基于 electron-updater，从 GitHub Releases 检测、下载并安装更新。
 * 通过事件推送实时通知渲染进程下载进度与状态变化。
 */
import { BrowserWindow } from "electron";
import electronUpdater, { type UpdateInfo } from "electron-updater";
import { createLogger } from "../logging/logger";

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

function getState(): UpdateState {
	return { ...current };
}

function emit(event: string, payload?: unknown) {
	const win = BrowserWindow.getAllWindows()[0];
	if (win && !win.isDestroyed()) {
		win.webContents.send(event, payload);
	}
}

function patchState(patch: Partial<UpdateState>) {
	current = { ...current, ...patch };
	emit("update-state-changed", getState());
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
		patchState({
			status: "downloaded",
			version: info.version,
			releaseName: info.releaseName ?? undefined,
		});
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
}

/** 手动检查更新 */
export async function checkForUpdates(): Promise<UpdateState> {
	try {
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
		await autoUpdater.downloadUpdate();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		patchState({ status: "error", error: msg });
	}
	return getState();
}

/** 立即退出并安装更新 */
export function quitAndInstall() {
	autoUpdater.quitAndInstall(false, true);
}

export { getState as getUpdateState };
