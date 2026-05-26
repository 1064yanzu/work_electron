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
import { initUpdateService, stopUpdateService } from "./services/updateService";
import {
	startDbMaintenance,
	stopDbMaintenance,
} from "./services/dbMaintenance";
import {
	startPerfTelemetry,
	stopPerfTelemetry,
} from "./services/perfTelemetry";
import { installApplicationMenu } from "./menu";
import {
	installWindowsCloseBehavior,
	markAppQuittingForWindowClose,
} from "./services/windowsCloseBehaviorService";

export async function bootstrapApp({
	createWindow,
	petWindowConfig,
}: {
	createWindow: () => BrowserWindow;
	petWindowConfig?: {
		preloadPath: string;
		rendererUrl?: string;
		rendererDist: string;
	};
}) {
	const logger = createLogger();
	const bootStartedAt = performance.now();
	let mainWindow: BrowserWindow | null = null;

	const showMainWindow = () => {
		if (!mainWindow || mainWindow.isDestroyed()) return;
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.show();
		mainWindow.focus();
	};

	// 单实例锁：mac/win 用户重复双击启动器只保留单进程，避免 libSQL 写锁冲突、
	// 本地 HTTP 端口被自身占用、IPC 派发给错误窗口、文件 watcher 重复触发。
	// dev 模式下 vite-plugin-electron HMR 重启时旧进程主动 quit 会自然释放 lock。
	const gotLock = app.requestSingleInstanceLock();
	if (!gotLock) {
		app.quit();
		return;
	}
	app.on("second-instance", () => {
		showMainWindow();
	});

	// mascot:// protocol 特权必须在 app.whenReady() 之前注册
	registerMascotProtocolPrivileges();

	app.on("window-all-closed", () => {
		if (process.platform !== "darwin" && process.platform !== "win32") {
			app.quit();
		}
	});

	app.on("activate", () => {
		if (!mainWindow || mainWindow.isDestroyed()) {
			mainWindow = createWindow();
		} else {
			showMainWindow();
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

	// 安装中文应用菜单（macOS 顶部菜单栏 + Win/Linux Alt 弹出）
	installApplicationMenu();

	// 修复自定义桌宠索引（移除指向不存在目录的条目；补齐磁盘上有但索引漏的）
	void reconcileCustomMascotIndex().catch((err) => {
		logger.warn({
			msg: "Custom mascot index reconcile failed",
			error: err instanceof Error ? err.message : String(err),
		});
	});

	const db = await initDatabase({ logger });
	logger.info({ msg: "Database initialized successfully" });

	// DB 就绪后，两项独立的文件 IO 任务并行：内置 skill 同步 / agent 记忆文件
	// 两者无依赖关系；任一失败不阻塞主窗口创建。
	await Promise.allSettled([
		import("./ipc/handlers/agentSdk/memoryFileStore")
			.then(({ ensureMemoryFiles }) => ensureMemoryFiles(db))
			.then(() => logger.info({ msg: "Agent memory files ensured" }))
			.catch((err) => {
				logger.warn({
					msg: "Failed to ensure agent memory files",
					error: err instanceof Error ? err.message : String(err),
				});
			}),
	]);

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

	mainWindow = createWindow();
	if (mainWindow) {
		installWindowsCloseBehavior({ win: mainWindow, db, logger });
	}

	// 主窗口创建后，把 non-critical 的服务延迟到下一个 idle tick，
	// 让首屏渲染先拿到 CPU；watcher / updateService / pet window 都不阻塞首屏交互。
	const scheduleIdle = (fn: () => void) => {
		const handle = setImmediate(fn);
		// 不阻止 event loop 退出
		handle.unref?.();
	};

	scheduleIdle(() => {
		void (async () => {
			try {
				const { memoryFileWatcher } = await import(
					"./ipc/handlers/agentSdk/memoryFileWatcher"
				);
				memoryFileWatcher.start(() => BrowserWindow.getAllWindows()[0] ?? null);
				logger.info({ msg: "Agent memory file watcher started" });
			} catch (err) {
				logger.warn({
					msg: "Failed to start agent memory file watcher",
					error: err instanceof Error ? err.message : String(err),
				});
			}
		})();
	});

	scheduleIdle(() => {
		try {
			initUpdateService();
		} catch (err) {
			logger.error({
				msg: "Failed to init update service (non-fatal)",
				error: err instanceof Error ? err.message : String(err),
			});
		}
	});

	// SQLite 周期维护（idle 首检 + 每 24h 周期检查；空间碎片高或距上次 > 7 天才 VACUUM）
	startDbMaintenance(db, logger);

	// 性能 telemetry（每分钟 RSS/heap/handles/loop-lag 写入 perf_metrics，7 天滚动保留）
	startPerfTelemetry(db, logger);

	// 桌面宠物窗口：初始化服务并根据持久化设置启动
	if (petWindowConfig) {
		initPetWindowService(petWindowConfig);
		scheduleIdle(() => {
			bootPetWindow();
			// 桌宠全局热键（默认启用 Ctrl+Alt+Space）
			void (async () => {
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
			})();
		});
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
		markAppQuittingForWindowClose();
		stopUpdateService();
		stopDbMaintenance();
		stopPerfTelemetry();
		autoSyncScheduler.stop();
		logger.info({ message: "AutoSyncScheduler stopped" });
		void remoteControl.stop();
		void cloudNodeClient.stop();
		// 停止 Agent 记忆文件 watcher
		try {
			void import("./ipc/handlers/agentSdk/memoryFileWatcher").then(
				({ memoryFileWatcher }) => memoryFileWatcher.stop(),
			);
		} catch {
			// 静默
		}
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
