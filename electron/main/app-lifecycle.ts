import { performance } from "node:perf_hooks";
import { app, BrowserWindow } from "electron";
import { initCloudNodeClient } from "./cloud-node/service";
import { initDatabase } from "./db/init";
import { startHttpServers, type HttpStatus } from "./http/start";
import { registerIpcHandlers } from "./ipc/register";
import { createLogger } from "./logging/logger";
import { initRemoteControlOrchestrator } from "./remote-control/core/service";
import { autoSyncScheduler } from "./services/AutoSyncScheduler";

import { getTerminalService } from "./services/terminalService";
import { stopAllWatchers } from "./services/fileWatcherService";
import { invalidateProviderCache } from "./llm/invoke";
import {
	initPetWindowService,
	bootPetWindow,
	destroyPetWindow,
} from "./services/petWindowService";
import {
	registerPetGlobalShortcut,
	unregisterPetGlobalShortcut,
} from "./services/petGlobalShortcut";
import {
	registerMascotProtocolPrivileges,
	registerMascotProtocolHandler,
} from "./services/customMascotProtocol";
import { reconcileCustomMascotIndex } from "./services/customMascotService";

export async function bootstrapApp({
	createWindow,
	petWindowConfig,
}: {
	createWindow: () => void;
	petWindowConfig?: {
		preloadPath: string;
		rendererUrl?: string;
		rendererDist: string;
	};
}) {
	const logger = createLogger();
	const bootStartedAt = performance.now();

	// mascot:// protocol 特权必须在 app.whenReady() 之前注册
	registerMascotProtocolPrivileges();

	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") {
			app.quit();
		}
	});

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});

	await app.whenReady();
	const corePhaseStartedAt = performance.now();

	// macOS：兜底确保 Dock 图标可见
	// Why：开发模式下 vite-plugin-electron HMR 重启 Electron 时，
	// 子进程从 node 父进程 fork 出来，偶发出现"主进程在跑、窗口已显示，
	// 但 Dock 图标不出现"的现象。setActivationPolicy('regular') + dock.show()
	// 是 Electron 官方推荐的兜底；正常情况下是 no-op，异常情况下会把 Dock 拉回来。
	if (process.platform === "darwin") {
		try {
			app.setActivationPolicy?.("regular");
			void app.dock?.show?.().catch(() => {});
		} catch (err) {
			logger.warn({
				msg: "Failed to ensure dock icon visible",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	// 注册 mascot:// protocol handler（whenReady 之后才生效）
	registerMascotProtocolHandler();

	// 修复自定义桌宠索引（移除指向不存在目录的条目；补齐磁盘上有但索引漏的）
	void reconcileCustomMascotIndex().catch((err) => {
		logger.warn({
			msg: "Custom mascot index reconcile failed",
			error: err instanceof Error ? err.message : String(err),
		});
	});

	const db = await initDatabase({ logger });
	logger.info({ msg: "Database initialized successfully" });

	const remoteControl = initRemoteControlOrchestrator({ db, logger });
	const cloudNodeClient = initCloudNodeClient({ db, logger });

	let httpStatusPromise: Promise<HttpStatus> | null = null;
	const ensureHttpStatus = async () => {
		if (!httpStatusPromise) {
			httpStatusPromise = startHttpServers({ logger, db });
		}
		return httpStatusPromise;
	};

	registerIpcHandlers({ logger, getHttpStatus: ensureHttpStatus, db });
	logger.info({ msg: "IPC handlers registered successfully" });

	createWindow();

	// 桌面宠物窗口：初始化服务并根据持久化设置启动
	if (petWindowConfig) {
		initPetWindowService(petWindowConfig);
		bootPetWindow();
		// 桌宠全局热键（默认启用 Ctrl+Alt+Space）
		try {
			const { getPetWindowSettings } = await import(
				"./storage/petWindowSettings"
			);
			if (getPetWindowSettings().globalShortcutEnabled !== false) {
				registerPetGlobalShortcut();
			}
		} catch (err) {
			logger.warn({
				msg: "Skip pet global shortcut registration",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	logger.info({
		msg: "App core phase ready",
		scope: "performance",
		corePhaseMs: Math.round(performance.now() - corePhaseStartedAt),
		totalBootMs: Math.round(performance.now() - bootStartedAt),
	});

	void (async () => {
		const backgroundPhaseStartedAt = performance.now();
		const results = await Promise.allSettled([
			ensureHttpStatus(),
			remoteControl.start(),
			cloudNodeClient.start(),
			autoSyncScheduler.start(),
		]);

		const [httpResult, remoteResult, cloudResult, autoSyncResult] = results;

		if (httpResult.status === "fulfilled") {
			logger.info({ msg: "HTTP servers started successfully" });
		} else {
			logger.error({
				msg: "Failed to start HTTP servers",
				error: httpResult.reason,
			});
		}

		if (remoteResult.status === "fulfilled") {
			logger.info({ msg: "Remote control orchestrator started successfully" });
		} else {
			logger.error({
				msg: "Failed to start remote control orchestrator",
				error: remoteResult.reason,
			});
		}

		if (cloudResult.status === "fulfilled") {
			logger.info({ msg: "Cloud node client started successfully" });
		} else {
			logger.error({
				msg: "Failed to start cloud node client",
				error: cloudResult.reason,
			});
		}

		if (autoSyncResult.status === "fulfilled") {
			logger.info({ message: "AutoSyncScheduler started successfully" });
		} else {
			logger.error({
				message: "Failed to start AutoSyncScheduler",
				error: autoSyncResult.reason,
			});
		}

		logger.info({
			msg: "App background phase settled",
			scope: "performance",
			backgroundPhaseMs: Math.round(
				performance.now() - backgroundPhaseStartedAt,
			),
		});
	})();

	app.on("before-quit", () => {
		autoSyncScheduler.stop();
		logger.info({ message: "AutoSyncScheduler stopped" });
		void remoteControl.stop();
		void cloudNodeClient.stop();
		// 解除桌宠全局热键
		unregisterPetGlobalShortcut();
		// 销毁桌面宠物窗口
		destroyPetWindow();
		logger.info({ msg: "Pet window destroyed" });
		// 销毁所有终端进程
		getTerminalService().destroyAll();
		logger.info({ msg: "Terminal processes destroyed" });
		// 停止所有文件监听
		stopAllWatchers();
		logger.info({ msg: "File watchers stopped" });
		// 释放 provider 缓存的模块级单例（含 in-flight promise），避免延迟卸载残留
		invalidateProviderCache();
	});
}
