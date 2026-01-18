import { app, BrowserWindow } from "electron";
import { initDatabase } from "./db/init";
import { startHttpServers } from "./http/start";
import { registerIpcHandlers } from "./ipc/register";
import { createLogger } from "./logging/logger";

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

	const db = await initDatabase({ logger });
	const httpStatus = await startHttpServers({ logger, db });
	registerIpcHandlers({ logger, httpStatus, db });
}
