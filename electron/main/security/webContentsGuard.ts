/**
 * 全局 WebContents 安全守卫。
 *
 * ## 要解决的问题
 *
 * 主窗口 / 桌宠窗口挂着 preload，而 preload 暴露的 `invoke` 能打到全部 IPC 命令
 * （含写文件、起终端）。只要这两个窗口被导航到远程源，远程页面就等于拿到了
 * 完整的本机能力。历史实现里主窗口既没有 `will-navigate` 拦截也没有
 * `setWindowOpenHandler`，一次拖拽链接进窗口就能触发导航。
 *
 * ## 为什么是「按 preload 区分」而不是一刀切
 *
 * 本应用有大量**故意加载远程内容**的表面：AI Hub 内嵌站点、浏览器面板、
 * 网页抓取窗口。它们都是 `contextIsolation + sandbox + 无 preload`，跳转到任意
 * 站点是它们的本职工作，不能拦。所以这里只对「挂了我们 preload 的 webContents」
 * 施加导航白名单，其余只兜底 window-open 行为。
 *
 * ## 与各服务自带 setWindowOpenHandler 的关系
 *
 * `web-contents-created` 在构造函数内部同步触发，早于服务代码里那句
 * `setWindowOpenHandler`。后者会覆盖这里的默认值 —— 这正是我们想要的顺序：
 * 默认安全，各服务按需放宽。
 */
import { app, session, shell, type WebContents } from "electron";
import type { Logger } from "../logging/types";

/** 允许在受信任窗口内直接打开的协议。 */
const INTERNAL_PROTOCOLS = new Set(["file:", "mascot:", "devtools:", "about:"]);

/** 允许外开系统浏览器的协议。其余（如 javascript:）一律丢弃。 */
const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * 默认会话允许的权限。
 *
 * 内嵌浏览器/网页抓取窗口走的也是 defaultSession，所以这里给的是一个够用但
 * 不含定位、串口、USB、HID 的集合。AI Hub 各站点用的是独立 partition，
 * 不受这里影响（它们的登录态需要隔离，权限策略也各自独立）。
 */
const ALLOWED_PERMISSIONS = new Set([
	"clipboard-read",
	"clipboard-sanitized-write",
	"fullscreen",
	"media",
	"mediaKeySystem",
	"notifications",
	"pointerLock",
]);

/**
 * 挂着我们 preload 的 webContents id。
 *
 * 用显式登记而不是运行时嗅探 `webPreferences.preload`：Electron 没有稳定的公开
 * API 能在主进程读回某个 webContents 的 preload 路径，而窗口工厂本来就是我们
 * 自己的代码，登记一行的成本远低于依赖内部 API。
 */
const trustedWebContentsIds = new Set<number>();

/** 由窗口工厂调用：声明这个 webContents 拥有完整 IPC 能力，需要导航白名单保护。 */
export function markWebContentsTrusted(contents: WebContents): void {
	trustedWebContentsIds.add(contents.id);
	contents.once("destroyed", () => {
		trustedWebContentsIds.delete(contents.id);
	});
}

export interface WebContentsGuardOptions {
	/** dev 模式下 Vite 的 origin（如 http://localhost:5173），生产为 undefined。 */
	devServerUrl?: string;
	logger: Logger;
}

/**
 * 受信任窗口是否可以导航到该 URL。
 *
 * 导出供单测覆盖：这条判定错一次就等于整个防线失效，值得单独测。
 */
export function isAllowedInternalNavigation(
	rawUrl: string,
	devServerOrigin?: string,
): boolean {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return false;
	}

	if (INTERNAL_PROTOCOLS.has(parsed.protocol)) return true;

	// dev 模式：Vite dev server 是渲染端的真实来源，必须放行（含 HMR 的同源子路径）
	if (devServerOrigin && parsed.origin === devServerOrigin) return true;

	return false;
}

export function installWebContentsGuard(
	options: WebContentsGuardOptions,
): void {
	const { logger } = options;

	let devServerOrigin: string | undefined;
	if (options.devServerUrl) {
		try {
			devServerOrigin = new URL(options.devServerUrl).origin;
		} catch {
			devServerOrigin = undefined;
		}
	}

	const openExternalIfSafe = (rawUrl: string) => {
		try {
			const parsed = new URL(rawUrl);
			if (!EXTERNAL_PROTOCOLS.has(parsed.protocol)) return;
			void shell.openExternal(parsed.toString()).catch(() => undefined);
		} catch {
			// 非法 URL 直接丢弃
		}
	};

	app.on("web-contents-created", (_event, contents: WebContents) => {
		// 默认策略：不在应用内开新窗口，能外开的外开。
		// 需要别的行为的服务（AI Hub / 浏览器面板 / 预览窗口）会在构造后覆盖。
		contents.setWindowOpenHandler(({ url }) => {
			openExternalIfSafe(url);
			return { action: "deny" };
		});

		// webview 标签（当前未使用，但一旦有人加上就必须是安全默认值）
		contents.on("will-attach-webview", (_e, webPreferences) => {
			webPreferences.preload = undefined;
			webPreferences.nodeIntegration = false;
			webPreferences.contextIsolation = true;
		});

		// 判定推迟到事件触发时：`web-contents-created` 早于窗口工厂调用
		// `markWebContentsTrusted`，这里不能在创建瞬间就下结论。
		const blockNavigation = (
			event: { preventDefault: () => void },
			url: string,
		) => {
			if (!trustedWebContentsIds.has(contents.id)) return;
			if (isAllowedInternalNavigation(url, devServerOrigin)) return;
			event.preventDefault();
			logger.warn({
				msg: "已拦截受信任窗口的越界导航",
				scope: "security",
				url: url.slice(0, 200),
			});
			openExternalIfSafe(url);
		};

		contents.on("will-navigate", (event, url) => blockNavigation(event, url));
	});

	// `session.defaultSession` 在 app ready 之前访问会抛错，而 web-contents-created
	// 的监听必须在 ready 之前挂上（否则错过第一个窗口）。所以权限策略延后到 ready。
	void app.whenReady().then(() => {
		session.defaultSession.setPermissionRequestHandler(
			(_webContents, permission, callback) => {
				const allowed = ALLOWED_PERMISSIONS.has(permission);
				if (!allowed) {
					logger.info({
						msg: "已拒绝权限请求",
						scope: "security",
						permission,
					});
				}
				callback(allowed);
			},
		);

		// 同步的检查版本：Chromium 某些路径（如 <video autoplay>）走这个而不是上面的异步版
		session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
			ALLOWED_PERMISSIONS.has(permission),
		);
	});
}
