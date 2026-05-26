import path from "node:path";
import {
	app,
	dialog,
	Menu,
	nativeImage,
	Tray,
	type BrowserWindow,
} from "electron";
import type { AppCloseBehavior } from "../../shared/ipc-schema";
import type { DbContext } from "../db/client";
import type { Logger } from "../logging/types";
import {
	getWindowsCloseBehavior,
	setWindowsCloseBehavior,
} from "./windowClosePreference";

let tray: Tray | null = null;
let isQuitting = false;

function resolveTrayIconPath(): string {
	if (app.isPackaged) {
		return path.join(process.resourcesPath, "icon.ico");
	}
	const appRoot = process.env.APP_ROOT;
	if (appRoot) return path.join(appRoot, "build", "icon.ico");
	return path.join(process.cwd(), "build", "icon.ico");
}

function showMainWindow(win: BrowserWindow) {
	if (win.isDestroyed()) return;
	if (win.isMinimized()) win.restore();
	win.show();
	win.focus();
}

function ensureTray(
	win: BrowserWindow,
	quitIncludingPet: () => void,
): Tray | null {
	if (process.platform !== "win32") return null;
	if (tray && !tray.isDestroyed()) return tray;

	const iconPath = resolveTrayIconPath();
	const image = nativeImage.createFromPath(iconPath);
	tray = new Tray(image);
	tray.setToolTip("IPO Workbench");
	tray.setContextMenu(
		Menu.buildFromTemplate([
			{
				label: "打开 IPO Workbench",
				click: () => showMainWindow(win),
			},
			{ type: "separator" },
			{
				label: "彻底退出（包括桌宠）",
				click: quitIncludingPet,
			},
		]),
	);
	tray.on("double-click", () => showMainWindow(win));
	return tray;
}

async function askCloseBehavior(
	win: BrowserWindow,
	db: DbContext,
): Promise<AppCloseBehavior | "cancel"> {
	const result = await dialog.showMessageBox(win, {
		type: "question",
		title: "关闭 IPO Workbench",
		message: "要关闭 IPO Workbench 吗？",
		detail:
			"隐藏到后台会保留后台服务和桌宠运行，可从系统托盘重新打开；彻底退出会关闭应用和桌宠。",
		buttons: ["隐藏到后台", "彻底退出（包括桌宠）", "取消"],
		defaultId: 0,
		cancelId: 2,
		noLink: true,
		checkboxLabel: "记住我的选择",
		checkboxChecked: false,
	});

	const behavior: AppCloseBehavior | "cancel" =
		result.response === 0
			? "hide_to_tray"
			: result.response === 1
				? "quit"
				: "cancel";

	if (behavior !== "cancel" && result.checkboxChecked) {
		await setWindowsCloseBehavior(db, behavior);
	}
	return behavior;
}

function hideToBackground(win: BrowserWindow, quitIncludingPet: () => void) {
	ensureTray(win, quitIncludingPet);
	win.hide();
}

export function markAppQuittingForWindowClose() {
	isQuitting = true;
}

export function installWindowsCloseBehavior({
	win,
	db,
	logger,
}: {
	win: BrowserWindow;
	db: DbContext;
	logger: Logger;
}) {
	if (process.platform !== "win32") return;

	const quitIncludingPet = () => {
		isQuitting = true;
		app.quit();
	};

	win.on("close", (event) => {
		if (isQuitting || win.isDestroyed()) return;

		event.preventDefault();
		void (async () => {
			try {
				const saved = await getWindowsCloseBehavior(db);
				const behavior =
					saved === "ask" ? await askCloseBehavior(win, db) : saved;

				if (behavior === "cancel") return;
				if (behavior === "quit") {
					quitIncludingPet();
					return;
				}
				hideToBackground(win, quitIncludingPet);
			} catch (error) {
				logger.warn({
					msg: "Failed to resolve Windows close behavior, hiding to tray",
					error: error instanceof Error ? error.message : String(error),
				});
				hideToBackground(win, quitIncludingPet);
			}
		})();
	});
}
