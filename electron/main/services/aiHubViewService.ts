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

import { WebContentsView, clipboard, shell } from "electron";
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

class AiHubViewService {
	/** siteId → view，保活用（切换站点不销毁，页面状态与登录态都保留） */
	private views = new Map<string, WebContentsView>();
	/** 当前挂在窗口上的站点 */
	private currentSiteId: string | null = null;
	/** 当前 view 所属窗口（detach 时要从同一个窗口移除） */
	private hostWindow: BrowserWindow | null = null;
	/** 最近一次 bounds，站点切换时直接复用 */
	private lastBounds: AiHubBounds | null = null;

	/** 当前显示的站点 id。 */
	getCurrentSiteId(): string | null {
		return this.currentSiteId;
	}

	/**
	 * 挂载并显示某站点。已创建过的 view 直接复用（不重新 loadURL）。
	 */
	attach(
		win: BrowserWindow,
		siteId: string,
		site: WebSiteConfig,
		bounds: AiHubBounds,
	): void {
		if (win.isDestroyed()) return;

		// 宽高为 0 时（渲染端首帧尚未布局完成）复用上一次的有效值，
		// 否则视图会以 0 尺寸挂上去，直到下一次 setBounds 才显形。
		const effectiveBounds =
			bounds.width > 0 && bounds.height > 0
				? bounds
				: (this.lastBounds ?? bounds);

		// 先把上一个站点摘下来（同一时刻只显示一个）
		if (this.currentSiteId && this.currentSiteId !== siteId) {
			this.detach();
		}

		let view = this.views.get(siteId);
		if (view && view.webContents.isDestroyed()) {
			// 页面进程崩溃过：丢弃残骸重建
			this.views.delete(siteId);
			view = undefined;
		}

		const isNew = !view;
		if (!view) {
			view = new WebContentsView({
				webPreferences: {
					// 独立 partition：各站点登录态互不干扰且持久化到磁盘
					partition: `persist:aihub-${siteId}`,
					contextIsolation: true,
					nodeIntegration: false,
					sandbox: true,
				},
			});
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
			this.currentSiteId = siteId;
			this.lastBounds = effectiveBounds;
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

	/** 更新当前视图位置（面板拖动 / 窗口 resize）。 */
	setBounds(bounds: AiHubBounds): void {
		this.lastBounds = bounds;
		const view = this.currentView();
		if (!view) return;
		try {
			view.setBounds(bounds);
		} catch {
			// view 已失效：忽略
		}
	}

	/**
	 * 从窗口移除当前视图（**不销毁**，页面与登录态保活）。
	 * 用于：切走主视图、模态层遮挡、站点切换。
	 */
	detach(): void {
		const view = this.currentView();
		const win = this.hostWindow;
		this.currentSiteId = null;
		if (!view || !win || win.isDestroyed()) return;
		try {
			win.contentView.removeChildView(view);
		} catch {
			// 已经不在树上：忽略
		}
	}

	/** 真正销毁某个站点的视图（登录态仍留在 partition 里）。 */
	destroy(siteId: string): void {
		const view = this.views.get(siteId);
		if (!view) return;
		if (this.currentSiteId === siteId) this.detach();
		this.views.delete(siteId);
		try {
			if (!view.webContents.isDestroyed()) view.webContents.close();
		} catch {
			// 忽略
		}
	}

	/** 销毁全部视图（应用退出时调用）。 */
	destroyAll(): void {
		this.detach();
		for (const siteId of [...this.views.keys()]) {
			this.destroy(siteId);
		}
		this.views.clear();
		this.hostWindow = null;
		this.lastBounds = null;
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

	/** 当前挂载中的 view（已销毁则返回 null）。 */
	private currentView(): WebContentsView | null {
		if (!this.currentSiteId) return null;
		const view = this.views.get(this.currentSiteId);
		if (!view || view.webContents.isDestroyed()) return null;
		return view;
	}
}

let instance: AiHubViewService | null = null;

/** 取 AiHubViewService 单例。 */
export function getAiHubViewService(): AiHubViewService {
	if (!instance) instance = new AiHubViewService();
	return instance;
}
