import { app, BrowserWindow } from "electron";
import { initDatabase } from "./db/init";
import { startHttpServers } from "./http/start";
import { registerIpcHandlers } from "./ipc/register";
import { createLogger } from "./logging/logger";
import { autoSyncScheduler } from "./services/AutoSyncScheduler";
import { initRemoteControlOrchestrator } from "./remote-control/core/service";

export async function bootstrapApp({
	createWindow,
}: {
	createWindow: () => void;
}) {
	const logger = createLogger();

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

	let db: Awaited<ReturnType<typeof initDatabase>>;
	let httpStatus: Awaited<ReturnType<typeof startHttpServers>>;
	let remoteControl: ReturnType<typeof initRemoteControlOrchestrator> | null =
		null;

	try {
		db = await initDatabase({ logger });
		logger.info({ msg: "Database initialized successfully" });
	} catch (error) {
		logger.error({ msg: "Failed to initialize database", error });
		throw error;
	}

	try {
		httpStatus = await startHttpServers({ logger, db });
		logger.info({ msg: "HTTP servers started successfully" });
	} catch (error) {
		logger.error({ msg: "Failed to start HTTP servers", error });
		throw error;
	}

	try {
		remoteControl = initRemoteControlOrchestrator({ db, logger });
	} catch (error) {
		logger.error({ msg: "Failed to init remote control orchestrator", error });
	}

	try {
		registerIpcHandlers({ logger, httpStatus, db });
		logger.info({ msg: "IPC handlers registered successfully" });
	} catch (error) {
		logger.error({ msg: "Failed to register IPC handlers", error });
		throw error;
	}

	try {
		if (remoteControl) await remoteControl.start();
		logger.info({ msg: "Remote control orchestrator started successfully" });
	} catch (error) {
		logger.error({ msg: "Failed to start remote control orchestrator", error });
	}

	// 启动自动同步调度器
	try {
		await autoSyncScheduler.start();
		logger.info({ message: "AutoSyncScheduler started successfully" });
	} catch (error) {
		logger.error({ message: "Failed to start AutoSyncScheduler", error });
	}

	// 应用退出时停止调度器
	app.on("before-quit", () => {
		autoSyncScheduler.stop();
		logger.info({ message: "AutoSyncScheduler stopped" });
		if (remoteControl) {
			void remoteControl.stop();
		}
	});
}
