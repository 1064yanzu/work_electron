/**
 * 应用菜单（中文 + 跨平台）
 *
 * macOS：保留首项 "IPO Workbench"（系统强制使用 app.getName()），
 *        其余菜单全部中文化；Edit/Window 用平台 Role 保证快捷键正确。
 * Windows / Linux：默认隐藏菜单栏（按 Alt 才会展开），避免顶栏冗余。
 *
 * 帮助菜单里的"导出日志…"/"打开日志目录"会通过 IPC 转给主窗口去执行，
 * 这样和设置面板"关于"页的导出按钮共用同一条主进程链路。
 */
import {
	app,
	BrowserWindow,
	Menu,
	type MenuItemConstructorOptions,
} from "electron";
import { sendToLiveWebContents } from "./utils/safeWebContentsSend";

function emitLogAction(action: "export" | "reveal") {
	const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
	if (!win) return;
	sendToLiveWebContents(win, "app-menu-action", { type: "logs", action });
}

function buildMenuTemplate(): MenuItemConstructorOptions[] {
	const isMac = process.platform === "darwin";

	const appMenuMac: MenuItemConstructorOptions = {
		label: app.getName(),
		submenu: [
			{ role: "about", label: `关于 ${app.getName()}` },
			{ type: "separator" },
			{ role: "services", label: "服务" },
			{ type: "separator" },
			{ role: "hide", label: `隐藏 ${app.getName()}` },
			{ role: "hideOthers", label: "隐藏其他" },
			{ role: "unhide", label: "全部显示" },
			{ type: "separator" },
			{ role: "quit", label: `退出 ${app.getName()}` },
		],
	};

	const fileMenu: MenuItemConstructorOptions = {
		label: "文件",
		submenu: [
			isMac
				? { role: "close", label: "关闭窗口" }
				: { role: "quit", label: "退出" },
		],
	};

	const editMenu: MenuItemConstructorOptions = {
		label: "编辑",
		submenu: [
			{ role: "undo", label: "撤销" },
			{ role: "redo", label: "重做" },
			{ type: "separator" },
			{ role: "cut", label: "剪切" },
			{ role: "copy", label: "复制" },
			{ role: "paste", label: "粘贴" },
			...(isMac
				? ([
						{
							role: "pasteAndMatchStyle",
							label: "粘贴并匹配样式",
						},
						{ role: "delete", label: "删除" },
						{ role: "selectAll", label: "全选" },
						{ type: "separator" },
						{
							label: "语音",
							submenu: [
								{ role: "startSpeaking", label: "开始朗读" },
								{ role: "stopSpeaking", label: "停止朗读" },
							],
						},
					] satisfies MenuItemConstructorOptions[])
				: ([
						{ role: "delete", label: "删除" },
						{ type: "separator" },
						{ role: "selectAll", label: "全选" },
					] satisfies MenuItemConstructorOptions[])),
		],
	};

	const viewMenu: MenuItemConstructorOptions = {
		label: "视图",
		submenu: [
			{ role: "reload", label: "重新加载" },
			{ role: "forceReload", label: "强制重新加载" },
			{ role: "toggleDevTools", label: "切换开发者工具" },
			{ type: "separator" },
			{ role: "resetZoom", label: "实际大小" },
			{ role: "zoomIn", label: "放大" },
			{ role: "zoomOut", label: "缩小" },
			{ type: "separator" },
			{ role: "togglefullscreen", label: "切换全屏" },
		],
	};

	const windowMenu: MenuItemConstructorOptions = {
		label: "窗口",
		submenu: isMac
			? [
					{ role: "minimize", label: "最小化" },
					{ role: "zoom", label: "缩放" },
					{ type: "separator" },
					{ role: "front", label: "前置全部窗口" },
					{ type: "separator" },
					{ role: "window", label: "窗口" },
				]
			: [
					{ role: "minimize", label: "最小化" },
					{ role: "zoom", label: "缩放" },
					{ role: "close", label: "关闭" },
				],
	};

	const helpMenu: MenuItemConstructorOptions = {
		role: "help",
		label: "帮助",
		submenu: [
			{
				label: "导出日志…",
				click: () => emitLogAction("export"),
			},
			{
				label: "打开日志目录",
				click: () => emitLogAction("reveal"),
			},
			{ type: "separator" },
			{
				label: "项目主页（GitHub）",
				click: async () => {
					const { shell } = await import("electron");
					await shell.openExternal("https://github.com/anthropics/claude-code");
				},
			},
		],
	};

	const template: MenuItemConstructorOptions[] = [];
	if (isMac) template.push(appMenuMac);
	template.push(fileMenu, editMenu, viewMenu, windowMenu, helpMenu);
	return template;
}

/**
 * 安装应用菜单。需在 `app.whenReady()` 之后调用。
 * - macOS：始终使用应用菜单（不可隐藏）；
 * - Windows / Linux：仍构建菜单，但默认 `autoHideMenuBar`，需要时 Alt 触发。
 */
export function installApplicationMenu() {
	try {
		// 在生产环境下确保 macOS 菜单首项显示中文产品名而非 "Electron"。
		// 开发环境下 Electron 会强制使用 Info.plist 里的可执行名（"Electron"），
		// 这是 macOS 的限制，无法通过 app.setName 修改首项菜单文本。
		if (app.isPackaged) {
			try {
				app.setName("IPO Workbench");
			} catch {
				// 忽略——某些平台上 setName 是 no-op
			}
		}

		const template = buildMenuTemplate();
		const menu = Menu.buildFromTemplate(template);
		Menu.setApplicationMenu(menu);

		if (process.platform !== "darwin") {
			// 让 Windows / Linux 默认隐藏菜单栏（按 Alt 临时显示），避免顶栏冗余
			for (const win of BrowserWindow.getAllWindows()) {
				try {
					win.setAutoHideMenuBar(true);
					win.setMenuBarVisibility(false);
				} catch {
					// 忽略：可能窗口已销毁
				}
			}
		}
	} catch {
		// 菜单安装失败不应阻断启动
	}
}

/**
 * 给新建窗口应用菜单栏可见性策略（Windows / Linux 用）。
 */
export function applyMenuBarPolicyToWindow(win: BrowserWindow) {
	if (process.platform === "darwin") return;
	try {
		win.setAutoHideMenuBar(true);
		win.setMenuBarVisibility(false);
	} catch {
		// 忽略
	}
}
