/**
 * AiHubViewService —— 中栏内嵌 Web AI 站点（ChatGPT / Gemini / Kimi / 豆包 / GLM / DeepSeek）。
 *
 * 用 Electron 40 的 `WebContentsView` 把网页原生覆盖在主窗口内容区上层，
 * 位置由渲染端 `AiHubPanel` 测量占位 div 后通过 `aihub_set_bounds` 上报。
 *
 * 关键设计：
 * - **每站点独立 partition**（`persist:aihub-<siteId>`）：各站点登录态互相隔离且持久化，
 *   切换站点不掉登录，也不会串 cookie。
 * - **视图保活**：切换站点只 `removeChildView`，view 仍留在 Map 里，页面与滚动位置不丢；
 *   只有 destroy 才真正销毁。
 * - **注入只填不发**：把交接包填进输入框但不点发送，避免把未经用户确认的内容发出去。
 * - **降级优先**：DOM selector 随站点改版随时会失效，注入/提取全部有剪贴板与空结果兜底，
 *   任何情况下都不抛异常到主进程。
 */

import { WebContentsView, app, clipboard, session, shell } from "electron";
import type { BrowserWindow } from "electron";
import { createLogger } from "../logging/logger";
import type { WebSiteConfig } from "../harnessHub/types";

const logger = createLogger();

/** 渲染端上报的内嵌区域位置（相对窗口内容区）。 */
export interface AiHubBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** 注入结果：dom = 成功填进输入框；clipboard = 降级到剪贴板。 */
export interface AiHubInjectResult {
	ok: boolean;
	method: "dom" | "clipboard";
}

/** 提取结果。 */
export interface AiHubExtractResult {
	ok: boolean;
	messages: { role: string; content: string }[];
}

/** 单条提取消息的最大长度，避免超长页面把 IPC 撑爆。 */
const MAX_EXTRACT_CHARS = 20_000;
/** 最多提取的消息条数。 */
const MAX_EXTRACT_MESSAGES = 400;

let cachedUserAgent: string | null = null;

/**
 * 某站点内嵌视图的 session 分区名。
 *
 * 导出给「从本机浏览器导入登录态」用——分区名对不上就等于把 cookie 写进了一个
 * 谁也不读的空分区，这种错还特别难查（导入成功、登录依然没有）。
 */
export function aiHubPartition(siteId: string): string {
	return `persist:aihub-${siteId}`;
}

/**
 * 内嵌站点用的 User-Agent：把 Electron 默认 UA 里的 `Electron/x.y.z` 与应用名
 * token 摘掉，剩下的就是一条货真价实的 Chrome UA。
 *
 * 不这么做的话，Google 系登录（Gemini、以及任何走 Google OAuth 的站点）会直接
 * 判定为"内嵌浏览器"并拒绝：*此浏览器或应用可能不安全*，用户在内嵌视图里根本
 * 登不进去，只能退回外部浏览器——这正是"内嵌 Web AI"最劝退的一步。
 *
 * 也不硬编码一条假 UA：那样在 Windows 上会自称 macOS、Chromium 大版本还会随
 * Electron 升级而对不上，反而更容易被风控。从真实 UA 上做减法最稳。
 */
function embeddedUserAgent(): string {
	if (cachedUserAgent) return cachedUserAgent;
	const raw = app.userAgentFallback || "";
	const appName = app.getName();
	const ua = raw
		.split(/\s+/)
		.filter((token) => {
			if (/^Electron\//i.test(token)) return false;
			if (
				appName &&
				token.toLowerCase().startsWith(`${appName.toLowerCase()}/`)
			)
				return false;
			return true;
		})
		.join(" ")
		.trim();
	cachedUserAgent = ua || raw;
	return cachedUserAgent;
}

class AiHubViewService {
	/** siteId → view，保活用（切换站点不销毁，页面状态与登录态都保留） */
	private views = new Map<string, WebContentsView>();
	/**
	 * siteId → 与「登录态来源浏览器」一致的 UA 覆盖。
	 *
	 * 从本机浏览器导入 cookie 后必须把 UA 也对齐：Cloudflare 的 `cf_clearance`
	 * 是 IP + User-Agent 绑定的，搬了 Chrome 151 的 cookie 却用 Electron 自带
	 * Chromium 的 UA 发请求，一比对就作废 → 挑战页 / 仍然未登录。
	 * 没有覆盖时回落到 `embeddedUserAgent()`。
	 */
	private siteUserAgents = new Map<string, string>();
	/**
	 * 当前挂在窗口上的站点 → 它占据的位置。
	 *
	 * 中栏支持分屏之后，多个站点会**同时**挂在窗口上（左边 ChatGPT、右边 Gemini），
	 * 所以这里必须是一张表而不是单个 currentSiteId。每个站点的 bounds 由各自的
	 * 渲染端面板独立上报，互不影响。
	 */
	private attached = new Map<string, AiHubBounds>();
	/** view 所属窗口（detach 时要从同一个窗口移除） */
	private hostWindow: BrowserWindow | null = null;

	/** 当前挂在窗口上的全部站点 id。 */
	getAttachedSiteIds(): string[] {
		return [...this.attached.keys()];
	}

	/** 某站点当前是否挂在窗口上。 */
	isAttached(siteId: string): boolean {
		return this.attached.has(siteId);
	}

	/**
	 * 设置某站点要使用的 UA 覆盖（来自「登录态导入」时探测到的来源浏览器 UA）。
	 *
	 * 必须在 `attach` 之前调用才能覆盖到首个导航；对已存在的 view 会即时改写
	 * session 与 webContents 的 UA，但**不自动刷新**——刷不刷由调用方决定
	 * （导入 cookie 后本来就要 reload 一次，没必要连刷两遍）。
	 *
	 * 传 null 清除覆盖，回落到 `embeddedUserAgent()`。
	 */
	setSiteUserAgent(siteId: string, userAgent: string | null): void {
		if (userAgent) {
			this.siteUserAgents.set(siteId, userAgent);
		} else {
			this.siteUserAgents.delete(siteId);
		}
		const ua = this.userAgentFor(siteId);
		try {
			session.fromPartition(aiHubPartition(siteId)).setUserAgent(ua);
		} catch (error) {
			logger.warn({
				msg: "AI Hub 更新分区 UA 失败",
				siteId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
		const view = this.views.get(siteId);
		if (view && !view.webContents.isDestroyed()) {
			view.webContents.setUserAgent(ua);
		}
	}

	/** 该站点实际生效的 UA：优先用导入登录态时对齐的来源浏览器 UA。 */
	private userAgentFor(siteId: string): string {
		return this.siteUserAgents.get(siteId) ?? embeddedUserAgent();
	}

	/**
	 * 挂载并显示某站点。已创建过的 view 直接复用（不重新 loadURL）。
	 *
	 * **不会**摘掉其它站点：分屏下多个站点同时可见是常态。
	 */
	attach(
		win: BrowserWindow,
		siteId: string,
		site: WebSiteConfig,
		bounds: AiHubBounds,
	): void {
		if (win.isDestroyed()) return;

		// 宽高为 0 时（渲染端首帧尚未布局完成）复用该站点上一次的有效值，
		// 否则视图会以 0 尺寸挂上去，直到下一次 setBounds 才显形。
		const effectiveBounds =
			bounds.width > 0 && bounds.height > 0
				? bounds
				: (this.attached.get(siteId) ?? bounds);

		let view = this.views.get(siteId);
		if (view && view.webContents.isDestroyed()) {
			// 页面进程崩溃过：丢弃残骸重建
			this.views.delete(siteId);
			view = undefined;
		}

		const isNew = !view;
		if (!view) {
			const partition = aiHubPartition(siteId);
			// UA 要在 view 创建前打到 session 上：分区里所有请求（含首个导航）
			// 都得带上，晚一步首屏就已经用默认 UA 发出去了。
			const ua = this.userAgentFor(siteId);
			try {
				session.fromPartition(partition).setUserAgent(ua);
			} catch (error) {
				logger.warn({
					msg: "AI Hub 设置 UA 失败，退回 Electron 默认 UA",
					siteId,
					error: error instanceof Error ? error.message : String(error),
				});
			}
			view = new WebContentsView({
				webPreferences: {
					// 独立 partition：各站点登录态互不干扰且持久化到磁盘
					partition,
					contextIsolation: true,
					nodeIntegration: false,
					sandbox: true,
					// 分屏下有站点会长期处于非焦点分屏，节流会让它的流式回答变慢甚至停滞
					backgroundThrottling: false,
				},
			});
			view.webContents.setUserAgent(embeddedUserAgent());
			// 站内点外链一律外开系统浏览器，不在内嵌区弹无控制的新窗口
			view.webContents.setWindowOpenHandler(({ url }) => {
				void shell.openExternal(url).catch(() => undefined);
				return { action: "deny" };
			});
			view.webContents.on("render-process-gone", (_event, details) => {
				logger.warn({
					msg: "AI Hub 站点渲染进程退出",
					siteId,
					reason: details.reason,
				});
			});
			this.views.set(siteId, view);
		}

		try {
			win.contentView.addChildView(view);
			view.setBounds(effectiveBounds);
			this.hostWindow = win;
			this.attached.set(siteId, effectiveBounds);
			if (isNew) {
				void view.webContents.loadURL(site.url).catch((error: unknown) => {
					logger.warn({
						msg: "AI Hub 站点加载失败",
						siteId,
						url: site.url,
						error: error instanceof Error ? error.message : String(error),
					});
				});
			}
		} catch (error) {
			logger.warn({
				msg: "AI Hub 视图挂载失败",
				siteId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * 重新加载某站点页面。
	 *
	 * 导入登录态之后必须走一次：cookie 是写进 session 的，已经加载好的页面不会
	 * 因此变成已登录状态，得让它带着新 cookie 重新请求一遍。
	 */
	reload(siteId: string): boolean {
		const view = this.views.get(siteId);
		if (!view || view.webContents.isDestroyed()) return false;
		try {
			view.webContents.reload();
			return true;
		} catch {
			return false;
		}
	}

	/** 更新某个站点视图的位置（分屏拖动 / 窗口 resize）。 */
	setBounds(siteId: string, bounds: AiHubBounds): void {
		if (!this.attached.has(siteId)) return;
		this.attached.set(siteId, bounds);
		const view = this.views.get(siteId);
		if (!view || view.webContents.isDestroyed()) return;
		try {
			view.setBounds(bounds);
		} catch {
			// view 已失效：忽略
		}
	}

	/**
	 * 从窗口移除某个站点的视图（**不销毁**，页面与登录态保活）。
	 * 用于：该分屏被关掉、切走标签、模态层遮挡。
	 */
	detach(siteId: string): void {
		this.attached.delete(siteId);
		const view = this.views.get(siteId);
		const win = this.hostWindow;
		if (!view || !win || win.isDestroyed()) return;
		try {
			win.contentView.removeChildView(view);
		} catch {
			// 已经不在树上：忽略
		}
	}

	/** 摘掉全部已挂载的站点（模态层遮挡、主视图整体切走时用）。 */
	detachAll(): void {
		for (const siteId of [...this.attached.keys()]) this.detach(siteId);
	}

	/** 真正销毁某个站点的视图（登录态仍留在 partition 里）。 */
	destroy(siteId: string): void {
		const view = this.views.get(siteId);
		if (!view) return;
		this.detach(siteId);
		this.views.delete(siteId);
		try {
			if (!view.webContents.isDestroyed()) view.webContents.close();
		} catch {
			// 忽略
		}
	}

	/** 销毁全部视图（应用退出时调用）。 */
	destroyAll(): void {
		this.detachAll();
		for (const siteId of [...this.views.keys()]) {
			this.destroy(siteId);
		}
		this.views.clear();
		this.hostWindow = null;
	}

	/**
	 * 把文本填入站点输入框。
	 *
	 * **只填入，不自动发送**：发送与否交给用户，避免误发未确认内容。
	 * 按 inputSelectors 顺序尝试，全部失败降级写剪贴板。
	 */
	async inject(site: WebSiteConfig, text: string): Promise<AiHubInjectResult> {
		const view = this.views.get(site.id);
		if (!view || view.webContents.isDestroyed()) {
			clipboard.writeText(text);
			return { ok: true, method: "clipboard" };
		}

		// 选择器与文本都经 JSON.stringify 转义后再拼进脚本，避免引号/换行破坏语法
		const script = `(() => {
			const selectors = ${JSON.stringify(site.inputSelectors)};
			const text = ${JSON.stringify(text)};
			const fire = (el) => {
				el.dispatchEvent(new Event("input", { bubbles: true }));
				el.dispatchEvent(new Event("change", { bubbles: true }));
			};
			for (const selector of selectors) {
				let el = null;
				try { el = document.querySelector(selector); } catch (e) { continue; }
				if (!el) continue;
				const tag = (el.tagName || "").toLowerCase();
				if (tag === "textarea" || tag === "input") {
					// React 受控组件会拦截直接赋值，必须用原型链上的 native setter
					const proto = tag === "textarea"
						? window.HTMLTextAreaElement.prototype
						: window.HTMLInputElement.prototype;
					const desc = Object.getOwnPropertyDescriptor(proto, "value");
					if (desc && desc.set) desc.set.call(el, text);
					else el.value = text;
					el.focus();
					fire(el);
					return true;
				}
				if (el.isContentEditable) {
					el.focus();
					// 优先走 execCommand：能被富文本编辑器（ProseMirror/Quill）正确识别
					let inserted = false;
					try {
						const range = document.createRange();
						range.selectNodeContents(el);
						const sel = window.getSelection();
						if (sel) {
							sel.removeAllRanges();
							sel.addRange(range);
							inserted = document.execCommand("insertText", false, text);
						}
					} catch (e) { inserted = false; }
					if (!inserted) el.textContent = text;
					fire(el);
					return true;
				}
			}
			return false;
		})()`;

		try {
			const ok = await view.webContents.executeJavaScript(script, true);
			if (ok === true) return { ok: true, method: "dom" };
		} catch (error) {
			logger.warn({
				msg: "AI Hub 注入脚本执行失败，降级剪贴板",
				siteId: site.id,
				error: error instanceof Error ? error.message : String(error),
			});
		}
		clipboard.writeText(text);
		return { ok: true, method: "clipboard" };
	}

	/**
	 * 从站点当前对话提取消息（尽力而为）。
	 * 抓不到就返回空结果，不抛错——DOM 结构不稳定是常态。
	 */
	async extract(site: WebSiteConfig): Promise<AiHubExtractResult> {
		const view = this.views.get(site.id);
		if (!view || view.webContents.isDestroyed()) {
			return { ok: false, messages: [] };
		}

		const script = `(() => {
			const selectors = ${JSON.stringify(site.messageSelectors)};
			const MAX_CHARS = ${MAX_EXTRACT_CHARS};
			const MAX_MESSAGES = ${MAX_EXTRACT_MESSAGES};
			let nodes = [];
			for (const selector of selectors) {
				let found = [];
				try { found = Array.from(document.querySelectorAll(selector)); } catch (e) { continue; }
				if (found.length > nodes.length) nodes = found;
			}
			if (!nodes.length) return [];
			const out = [];
			for (let i = 0; i < nodes.length && out.length < MAX_MESSAGES; i++) {
				const node = nodes[i];
				const text = (node.innerText || node.textContent || "").trim();
				if (!text) continue;
				// role 优先读站点自带的属性（ChatGPT 有 data-message-author-role），
				// 读不到就按出现顺序奇偶交替兜底
				let role = node.getAttribute("data-message-author-role")
					|| node.getAttribute("data-role")
					|| "";
				if (!role) {
					const inner = node.querySelector("[data-message-author-role]");
					if (inner) role = inner.getAttribute("data-message-author-role") || "";
				}
				if (role !== "user" && role !== "assistant") {
					role = out.length % 2 === 0 ? "user" : "assistant";
				}
				out.push({
					role,
					content: text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text,
				});
			}
			return out;
		})()`;

		try {
			const raw = await view.webContents.executeJavaScript(script, true);
			if (!Array.isArray(raw) || raw.length === 0) {
				return { ok: false, messages: [] };
			}
			const messages = raw
				.map((item: unknown) => {
					if (typeof item !== "object" || item === null) return null;
					const rec = item as Record<string, unknown>;
					const content =
						typeof rec.content === "string" ? rec.content.trim() : "";
					if (!content) return null;
					const role = rec.role === "user" ? "user" : "assistant";
					return { role, content };
				})
				.filter((m): m is { role: string; content: string } => m !== null);
			return { ok: messages.length > 0, messages };
		} catch (error) {
			logger.warn({
				msg: "AI Hub 提取脚本执行失败",
				siteId: site.id,
				error: error instanceof Error ? error.message : String(error),
			});
			return { ok: false, messages: [] };
		}
	}

	// ============================================================
	// 「把 Web 站点当工具调用」所需的能力
	// ============================================================

	/**
	 * 确保某站点的视图存在并已加载完首屏，**不要求挂到窗口上**。
	 *
	 * 这是「Web as tool」的前提：被本应用 Agent 或外部 CLI 通过 MCP 调用时，
	 * 用户可能正在看别的标签页，不能因为要问 ChatGPT 一句话就抢走中栏。
	 *
	 * 未挂载的 WebContents 会被 Chromium 判定为后台页面并节流定时器，
	 * 站点的流式渲染会变得极慢甚至停滞，所以显式关掉 backgroundThrottling。
	 */
	async ensureView(site: WebSiteConfig): Promise<WebContentsView | null> {
		let view = this.views.get(site.id);
		if (view?.webContents.isDestroyed()) {
			this.views.delete(site.id);
			view = undefined;
		}

		if (!view) {
			const partition = aiHubPartition(site.id);
			const ua = this.userAgentFor(site.id);
			try {
				session.fromPartition(partition).setUserAgent(ua);
			} catch {
				// 回落默认 UA
			}
			view = new WebContentsView({
				webPreferences: {
					partition,
					contextIsolation: true,
					nodeIntegration: false,
					sandbox: true,
					// 后台调用时不能被节流，否则站点的流式回答会卡住
					backgroundThrottling: false,
				},
			});
			view.webContents.setUserAgent(ua);
			view.webContents.setWindowOpenHandler(({ url }) => {
				void shell.openExternal(url).catch(() => undefined);
				return { action: "deny" };
			});
			this.views.set(site.id, view);
			try {
				await view.webContents.loadURL(site.url);
			} catch (error) {
				logger.warn({
					msg: "AI Hub 后台加载站点失败",
					siteId: site.id,
					error: error instanceof Error ? error.message : String(error),
				});
				return null;
			}
			// 首屏 DOM 到位后 SPA 往往还要再渲染一轮输入框
			await delay(1500);
			return view;
		}

		if (view.webContents.isLoading()) {
			await new Promise<void>((resolve) => {
				const done = () => resolve();
				view?.webContents.once("did-finish-load", done);
				view?.webContents.once("did-fail-load", done);
				setTimeout(done, 15_000);
			});
		}
		return view;
	}

	/**
	 * 点击站点的发送按钮。
	 *
	 * 与 `inject`（只填不发）分开是刻意的：交互式使用时发不发由用户决定，
	 * 只有「当成工具调用」这种明确的程序化场景才会走到这里。
	 */
	async submit(site: WebSiteConfig): Promise<boolean> {
		const view = this.views.get(site.id);
		if (!view || view.webContents.isDestroyed()) return false;
		if (!site.submitSelectors.length) return false;

		const script = `(() => {
			const selectors = ${JSON.stringify(site.submitSelectors)};
			for (const selector of selectors) {
				let el = null;
				try { el = document.querySelector(selector); } catch (e) { continue; }
				if (!el) continue;
				if (el.disabled === true) continue;
				if (el.getAttribute && el.getAttribute("aria-disabled") === "true") continue;
				el.click();
				return true;
			}
			return false;
		})()`;

		try {
			return (await view.webContents.executeJavaScript(script, true)) === true;
		} catch (error) {
			logger.warn({
				msg: "AI Hub 点击发送失败",
				siteId: site.id,
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}

	/**
	 * 把一个文件作为附件塞进站点。
	 *
	 * 两条路径依次尝试（都是真实可用的浏览器机制，不是 hack）：
	 *   1. 页面上有 `input[type=file]` → 构造 `File` + `DataTransfer` 赋给 `files` 并派发 change
	 *   2. 没有 file input → 对输入框派发带 `DataTransfer` 的 `paste` 事件
	 *      （ChatGPT / Gemini 都按「粘贴文件」处理）
	 *
	 * 两条都失败时**如实返回 false**，由调用方回落到「把内容当正文发」，
	 * 不假装上传成功。
	 */
	async uploadAttachment(
		site: WebSiteConfig,
		file: { fileName: string; mimeType: string; base64: string },
	): Promise<boolean> {
		const view = this.views.get(site.id);
		if (!view || view.webContents.isDestroyed()) return false;

		const script = `(async () => {
			const b64 = ${JSON.stringify(file.base64)};
			const name = ${JSON.stringify(file.fileName)};
			const mime = ${JSON.stringify(file.mimeType)};
			const inputSelectors = ${JSON.stringify(site.inputSelectors)};

			const bin = atob(b64);
			const bytes = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
			const fileObj = new File([bytes], name, { type: mime });

			const dt = new DataTransfer();
			dt.items.add(fileObj);

			// 路径 1：真正的 file input
			const fileInputs = Array.from(document.querySelectorAll("input[type=file]"));
			for (const input of fileInputs) {
				try {
					input.files = dt.files;
					input.dispatchEvent(new Event("change", { bubbles: true }));
					return true;
				} catch (e) { /* 下一个 */ }
			}

			// 路径 2：对输入框派发 paste
			for (const selector of inputSelectors) {
				let el = null;
				try { el = document.querySelector(selector); } catch (e) { continue; }
				if (!el) continue;
				el.focus();
				try {
					const evt = new ClipboardEvent("paste", {
						bubbles: true,
						cancelable: true,
						clipboardData: dt,
					});
					el.dispatchEvent(evt);
					return true;
				} catch (e) { /* 下一个 */ }
			}
			return false;
		})()`;

		try {
			const ok = await view.webContents.executeJavaScript(script, true);
			return ok === true;
		} catch (error) {
			logger.warn({
				msg: "AI Hub 附件上传失败",
				siteId: site.id,
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}

	/**
	 * 把站点当工具用：提问 → 发送 → 等回答写完 → 取回答。
	 *
	 * 「回答写完」没有通用信号（各站点 DOM 完全不同），这里用的判据是
	 * **最后一条 assistant 消息的文本连续 N 次轮询不再变化**，配合硬超时。
	 * 超时不当作失败，而是把已经产出的部分带 `partial: true` 返回——
	 * 半个答案也比一句"超时了"有用，但必须让调用方知道它不完整。
	 */
	async ask(
		site: WebSiteConfig,
		prompt: string,
		options: { timeoutMs?: number; pollMs?: number } = {},
	): Promise<{
		ok: boolean;
		answer: string;
		partial: boolean;
		error: string | null;
	}> {
		const timeoutMs = options.timeoutMs ?? 180_000;
		const pollMs = options.pollMs ?? 1_500;
		/** 连续多少次文本不变视为写完。 */
		const stableRounds = 3;

		const view = await this.ensureView(site);
		if (!view) {
			return {
				ok: false,
				answer: "",
				partial: false,
				error: `无法加载站点 ${site.label}`,
			};
		}

		// 记录提问前的最后一条 assistant 文本，用来识别"新回答"
		const before = await this.extract(site);
		const beforeLast = lastAssistantText(before.messages);
		const beforeCount = before.messages.length;

		const injected = await this.inject(site, prompt);
		if (injected.method === "clipboard") {
			return {
				ok: false,
				answer: "",
				partial: false,
				error: `${site.label} 的输入框选择器已失效，无法自动提问（内容已复制到剪贴板）`,
			};
		}

		// 富文本编辑器要一点时间把内容 commit 进去，立刻点发送会发出空消息
		await delay(400);
		const submitted = await this.submit(site);
		if (!submitted) {
			return {
				ok: false,
				answer: "",
				partial: false,
				error: `${site.label} 的发送按钮选择器已失效，问题已填入输入框但未发送`,
			};
		}

		const deadline = Date.now() + timeoutMs;
		let lastText = "";
		let stable = 0;

		while (Date.now() < deadline) {
			await delay(pollMs);
			const snapshot = await this.extract(site);
			if (!snapshot.ok) continue;
			// 提问后消息数至少 +1（我们的问题），回答通常再 +1
			if (snapshot.messages.length <= beforeCount) continue;
			const text = lastAssistantText(snapshot.messages);
			if (!text || text === beforeLast) continue;

			if (text === lastText) {
				stable += 1;
				if (stable >= stableRounds) {
					return { ok: true, answer: text, partial: false, error: null };
				}
			} else {
				stable = 0;
				lastText = text;
			}
		}

		if (lastText) {
			return { ok: true, answer: lastText, partial: true, error: null };
		}
		return {
			ok: false,
			answer: "",
			partial: false,
			error: `等待 ${site.label} 回答超时（${Math.round(timeoutMs / 1000)}s），未抓到新回答`,
		};
	}
}

/** 取消息列表里最后一条 assistant 文本。 */
function lastAssistantText(
	messages: { role: string; content: string }[],
): string {
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "assistant") return messages[i].content.trim();
	}
	return "";
}

/** await 版 setTimeout。 */
function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

let instance: AiHubViewService | null = null;

/** 取 AiHubViewService 单例。 */
export function getAiHubViewService(): AiHubViewService {
	if (!instance) instance = new AiHubViewService();
	return instance;
}
