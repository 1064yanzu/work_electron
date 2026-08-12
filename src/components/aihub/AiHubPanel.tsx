/**
 * AiHubPanel —— 中栏「内嵌单个 Web AI 站点」的标签页内容。
 *
 * 关键前提：**本组件不渲染网页内容**。网页由主进程的 `aiHubViewService` 用
 * Electron `WebContentsView` 原生覆盖在窗口上层（每个站点独立 partition，
 * 登录态互相隔离且持久化）。因此这里的职责只有三件：
 *
 *   1. 渲染当前站点的工具栏（真实 DOM，永远位于原生视图之外）；
 *   2. 用一个空占位 div 测量「网页应该出现的矩形」，把 bounds 上报主进程；
 *   3. 卸载 / 尺寸退化 / 弹窗遮挡时把原生视图摘掉 —— 否则它会一直浮在
 *      其它界面上面（原生层永远在 DOM 之上，z-index 对它无效）。
 *
 * **站点切换不再由本组件负责**：每个站点是中栏的一个独立标签页
 * （`centerTabsStore` 的 `web:<siteId>`），App 用 `key={siteId}` 换实例。
 * 这样「ChatGPT 一个页签、Gemini 一个页签」符合直觉，也避免 tab-in-tab 嵌套。
 *
 * bounds 坐标系：`WebContentsView.setBounds` 用的是相对窗口内容区的坐标，
 * 与 `getBoundingClientRect()` 的视口坐标在 Electron 中完全一致，取整即可。
 *
 * 后端契约见 docs/api/harness-hub.md 与 docs/harness-hub-施工文档.md。
 */

import {
	AlertTriangle,
	ArrowDownToLine,
	ExternalLink,
	Globe,
	KeyRound,
	Loader2,
	MoreHorizontal,
	RotateCw,
	Settings2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	type AiHubSiteRow,
	type BrowserCookieSourceRow,
	closeAiHub,
	extractFromAiHub,
	importAiHubCookies,
	importAiHubSession,
	injectToAiHub,
	listAiHubSites,
	listCookieSources,
	openAiHubSite,
	reloadAiHubSite,
	setAiHubBounds,
} from "../../lib/api/harnessHub";
import {
	aiHubRequestStore,
	useAiHubRequest,
} from "../../lib/stores/aiHubRequestStore";
import { setNativeViewRect } from "../../lib/stores/nativeViewRectStore";
import { openBrowserWindow } from "../../lib/config";
import { EVENTS, events } from "../../lib/events";
import { cn } from "../../lib/utils";
import { confirmDialog } from "../ui/ConfirmDialog";
import { ContextMenu, type ContextMenuItem } from "../ui/ContextMenu";
import { toast } from "../ui/Toast";
import { Tooltip } from "../ui/Tooltip";

interface Bounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface PanelStatus {
	kind: "success" | "error" | "info";
	text: string;
}

/**
 * 遮挡检测轮询间隔。应用内所有弹窗 / 全屏 Overlay（设置面板、命令面板、
 * 确认框、阅读器、卡片库、桌宠引导…）都带 `aria-modal="true"`，
 * 检测到就把原生视图摘掉，关闭后再挂回来。
 */
const OVERLAY_POLL_MS = 200;

/** 工具栏内联状态的展示时长。 */
const STATUS_TTL_MS = 5000;

/**
 * 工具栏收窄阈值（px）。
 *
 * 中栏可以分屏之后，一个 Web AI 面板可能只有三四百像素宽。窄到这个程度时
 * 「一排图标 + 一个文字按钮 + 站点名 + URL」必然挤成一团，所以次要动作收进
 * 溢出菜单，只留下真正高频的那一个。
 */
const COMPACT_TOOLBAR_WIDTH = 460;

/** 站点与选择器配置所在的设置页（见 Settings/settingsCatalog.ts）。 */
const SETTINGS_TAB_ID = "integrations.harnessHub";

function errMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function boundsEqual(a: Bounds | null, b: Bounds | null): boolean {
	if (!a || !b) return false;
	return (
		a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
	);
}

/**
 * 是否存在会被原生视图盖住的浮层。
 *
 * 两类：
 * - `[aria-modal="true"]` —— 设置面板 / 命令面板 / 确认框 / 阅读器 / 卡片库…
 * - `[data-native-overlay="true"]` —— 非模态但同样必须可见的浮层，目前是
 *   右键菜单（中栏标签条的「+」菜单就正正压在原生视图上方）。ContextMenu
 *   不是 dialog，挂 aria-modal 属于 ARIA 误用，所以另立一个私有标记。
 */
function hasBlockingOverlay(): boolean {
	return (
		document.querySelector(
			'[aria-modal="true"], [data-native-overlay="true"]',
		) !== null
	);
}

/**
 * 原生视图在 `nativeViewRectStore` 里的登记名。
 *
 * 中栏支持分屏后可以同时挂多个站点，所以必须按 siteId 分开登记；
 * 本面板卸载 / 摘视图时只清自己那一条，不影响别的分屏。
 */
function nativeViewKey(siteId: string): string {
	return `aihub:${siteId}`;
}

/** 用首条用户消息推导会话标题（真实内容，不编造）。 */
function deriveSessionTitle(
	siteLabel: string,
	messages: { role: string; content: string }[],
): string {
	const firstUser = messages.find(
		(m) => m.role === "user" && m.content.trim().length > 0,
	);
	const raw = (firstUser?.content ?? messages[0]?.content ?? "").trim();
	const firstLine = raw
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!firstLine) return `${siteLabel} 对话`;
	return firstLine.length > 40 ? `${firstLine.slice(0, 40)}…` : firstLine;
}

export interface AiHubPanelProps {
	/** 本标签页对应的站点 id（由 centerTabsStore 的 `web:<siteId>` 标签决定）。 */
	siteId: string;
}

export function AiHubPanel({ siteId }: AiHubPanelProps) {
	const [site, setSite] = useState<AiHubSiteRow | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [attached, setAttached] = useState(false);
	const [suspended, setSuspended] = useState(false);
	const [extracting, setExtracting] = useState(false);
	const [importingCookies, setImportingCookies] = useState(false);
	const [importMenu, setImportMenu] = useState<{
		x: number;
		y: number;
		items: ContextMenuItem[];
	} | null>(null);
	const [status, setStatus] = useState<PanelStatus | null>(null);
	/** 面板过窄：次要动作收进溢出菜单（分屏后这是常态而非例外） */
	const [compact, setCompact] = useState(false);
	const [overflowMenu, setOverflowMenu] = useState<{
		x: number;
		y: number;
		items: ContextMenuItem[];
	} | null>(null);
	/** 会话中枢发来的「打开站点 + 注入交接包」请求 */
	const hubRequest = useAiHubRequest();

	/** 网页内容占位区 —— 原生视图会精确覆盖在它上面。 */
	const contentRef = useRef<HTMLDivElement | null>(null);
	const importButtonRef = useRef<HTMLButtonElement | null>(null);
	const overflowButtonRef = useRef<HTMLButtonElement | null>(null);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const rafRef = useRef<number | null>(null);
	const lastBoundsRef = useRef<Bounds | null>(null);
	const attachedRef = useRef(false);
	const suspendedRef = useRef(false);
	const disposedRef = useRef(false);
	const statusTimerRef = useRef<number | null>(null);
	/** 站点配置就绪前不挂载原生视图（挂了也没 URL 可加载）。 */
	const siteReadyRef = useRef(false);

	/** 站点主域名：导入登录态的确认框要如实告诉用户读的是哪个域。 */
	const siteDomain = useMemo(() => {
		if (!site) return "";
		try {
			return new URL(site.url).hostname;
		} catch {
			return site.url;
		}
	}, [site]);

	const showStatus = useCallback((kind: PanelStatus["kind"], text: string) => {
		if (statusTimerRef.current !== null) {
			window.clearTimeout(statusTimerRef.current);
		}
		setStatus({ kind, text });
		statusTimerRef.current = window.setTimeout(() => {
			statusTimerRef.current = null;
			setStatus(null);
		}, STATUS_TTL_MS);
	}, []);

	// ============================================================
	// bounds 测量与上报
	// ============================================================

	/**
	 * 测量占位区。用 right/bottom 反推宽高，避免 left 与 width 各自取整
	 * 后在面板边缘留下 1px 缝隙。尺寸退化（面板折叠）时返回 null。
	 */
	const measure = useCallback((): Bounds | null => {
		const el = contentRef.current;
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		const x = Math.round(rect.left);
		const y = Math.round(rect.top);
		const width = Math.round(rect.right) - x;
		const height = Math.round(rect.bottom) - y;
		if (width <= 0 || height <= 0) return null;
		return { x, y, width, height };
	}, []);

	/** 摘掉原生视图（主进程保活页面与登录态，不销毁）。 */
	const detachView = useCallback(() => {
		if (!attachedRef.current) return;
		attachedRef.current = false;
		lastBoundsRef.current = null;
		setAttached(false);
		// 视图不在窗口上了，浮层不必再避让这块区域
		setNativeViewRect(nativeViewKey(siteId), null);
		void closeAiHub(siteId).catch(() => undefined);
	}, [siteId]);

	/** 把本标签页的站点挂到占位区位置。 */
	const attachView = useCallback(async () => {
		if (disposedRef.current || suspendedRef.current) return;
		if (!siteReadyRef.current) return;
		const bounds = measure();
		// 尺寸还没稳定（首帧 / 面板折叠）：交给 ResizeObserver 的下一次回调
		if (!bounds) return;
		try {
			const ok = await openAiHubSite(siteId, bounds);
			if (disposedRef.current) {
				void closeAiHub(siteId).catch(() => undefined);
				return;
			}
			if (suspendedRef.current) return;
			if (!ok) {
				showStatus("error", "站点挂载失败，请检查站点配置");
				return;
			}
			attachedRef.current = true;
			lastBoundsRef.current = bounds;
			setAttached(true);
			// 登记占位，让 tooltip / 下拉这类 DOM 浮层能主动避开它
			// （原生视图画在 DOM 之上，z-index 盖不过去）
			setNativeViewRect(nativeViewKey(siteId), bounds);
		} catch (error) {
			if (disposedRef.current) return;
			showStatus("error", `内嵌视图挂载失败：${errMessage(error)}`);
		}
	}, [measure, showStatus, siteId]);

	/** 用 rAF 合并高频调用（面板拖动时每帧最多一次 IPC）。 */
	const scheduleSync = useCallback(() => {
		if (rafRef.current !== null) return;
		rafRef.current = window.requestAnimationFrame(() => {
			rafRef.current = null;
			if (disposedRef.current || suspendedRef.current) return;
			if (!siteReadyRef.current) return;
			const bounds = measure();
			if (!bounds) {
				// 面板被折叠到 0 宽/高 —— 先摘掉，恢复尺寸后自动挂回
				detachView();
				return;
			}
			if (!attachedRef.current) {
				void attachView();
				return;
			}
			if (boundsEqual(lastBoundsRef.current, bounds)) return;
			lastBoundsRef.current = bounds;
			setNativeViewRect(nativeViewKey(siteId), bounds);
			void setAiHubBounds(siteId, bounds).catch(() => undefined);
		});
	}, [attachView, detachView, measure]);

	// ============================================================
	// 生命周期
	// ============================================================

	// 卸载兜底：必须摘掉原生视图，否则它会浮在编辑器 / 浏览器视图上面
	useEffect(() => {
		disposedRef.current = false;
		return () => {
			disposedRef.current = true;
			if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
			if (statusTimerRef.current !== null) {
				window.clearTimeout(statusTimerRef.current);
				statusTimerRef.current = null;
			}
			attachedRef.current = false;
			lastBoundsRef.current = null;
			setNativeViewRect(nativeViewKey(siteId), null);
			void closeAiHub(siteId).catch(() => undefined);
		};
	}, [siteId]);

	/** 读取本标签页站点的配置（label / url / 选择器）。 */
	const reloadSite = useCallback(
		async (options?: { silent?: boolean }) => {
			if (!options?.silent) setLoading(true);
			setLoadError(null);
			try {
				const rows = await listAiHubSites();
				if (disposedRef.current) return;
				const found = rows.find((row) => row.id === siteId && row.enabled);
				setSite(found ?? null);
				siteReadyRef.current = Boolean(found);
				if (!found) {
					setLoadError("该站点已被禁用或删除，请在设置中检查 Web AI 站点清单");
					detachView();
				}
			} catch (error) {
				if (!disposedRef.current) setLoadError(errMessage(error));
			} finally {
				if (!disposedRef.current) setLoading(false);
			}
		},
		[siteId, detachView],
	);

	useEffect(() => {
		void reloadSite();
	}, [reloadSite]);

	// 站点配置就绪 → 挂载原生视图
	useEffect(() => {
		if (!site) return;
		void attachView();
	}, [site, attachView]);

	// 会话中枢发来的「打开某站点 + 注入交接包」请求。
	// 只有目标站点自己的标签页才消费它；标签的打开由 centerTabsStore 负责，
	// 注入必须等 attachView 完成后再做（发起方无法知道这个时机）。
	useEffect(() => {
		if (!hubRequest || hubRequest.siteId !== siteId) return;
		if (!site) return;
		const text = hubRequest.text;
		aiHubRequestStore.clear();
		if (!text) return;

		let cancelled = false;
		void (async () => {
			try {
				await attachView();
				if (cancelled || disposedRef.current) return;
				const injected = await injectToAiHub(siteId, text);
				if (cancelled || disposedRef.current) return;
				if (injected.ok && injected.method === "dom") {
					toast.success(`交接包已填入 ${site.label} 输入框`);
				} else {
					toast.info(`已复制交接包到剪贴板，请在 ${site.label} 中粘贴`);
				}
			} catch (error) {
				if (!cancelled && !disposedRef.current) {
					toast.error(`注入失败：${errMessage(error)}`);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [hubRequest, site, siteId, attachView]);

	// 尺寸/位置变化 → 重新上报 bounds
	useEffect(() => {
		const el = contentRef.current;
		if (!el) return;
		const observer = new ResizeObserver(() => scheduleSync());
		observer.observe(el);
		// 兜底：左右栏折叠、终端拆分等会改变占位区位置而不一定改变自身尺寸
		observer.observe(document.documentElement);
		window.addEventListener("resize", scheduleSync);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", scheduleSync);
		};
	}, [scheduleSync]);

	// 面板宽度观察：分屏后宽度变化频繁，工具栏要跟着换形态
	useEffect(() => {
		const el = rootRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const width = entries[0]?.contentRect.width ?? 0;
			if (width > 0) setCompact(width < COMPACT_TOOLBAR_WIDTH);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	// 浮层遮挡守卫：浮层出现时摘掉原生视图，关闭后挂回来。
	// MutationObserver 负责"立刻"（浮层多是 portal 到 body 的新节点），
	// 定时轮询兜住它盖不到的情况（子树深处的属性变化）。
	useEffect(() => {
		const sync = () => {
			if (disposedRef.current) return;
			const blocked = hasBlockingOverlay();
			if (blocked === suspendedRef.current) return;
			suspendedRef.current = blocked;
			setSuspended(blocked);
			if (blocked) {
				detachView();
				return;
			}
			void attachView();
		};
		const timer = window.setInterval(sync, OVERLAY_POLL_MS);
		// 只看 body 的直接子节点：浮层都是 portal 到 body 的顶层节点，
		// 开 subtree 会被对话流式输出的每一次 DOM 变动打爆。
		const observer = new MutationObserver(sync);
		observer.observe(document.body, { childList: true });
		return () => {
			window.clearInterval(timer);
			observer.disconnect();
		};
	}, [attachView, detachView]);

	// ============================================================
	// 动作
	// ============================================================

	const handleExtract = useCallback(async () => {
		if (!site || extracting) return;
		setExtracting(true);
		try {
			const result = await extractFromAiHub(site.id);
			const messages = result.messages.filter(
				(message) => message.content.trim().length > 0,
			);
			if (!result.ok || messages.length === 0) {
				showStatus("error", "未能识别页面结构");
				toast.error("未能识别页面结构，可在设置中调整该站点的选择器");
				return;
			}

			const confirmed = await confirmDialog.show({
				title: "导入到会话中枢",
				message: `已从「${site.label}」当前页面提取到 ${messages.length} 条消息，确认存入会话中枢？`,
				confirmText: "存入",
				cancelText: "取消",
				type: "info",
			});
			if (!confirmed) {
				showStatus("info", "已取消导入");
				return;
			}

			const title = deriveSessionTitle(site.label, messages);
			await importAiHubSession({
				site_id: site.id,
				title,
				messages,
			});
			showStatus("success", `已存入会话中枢 · ${messages.length} 条`);
			toast.success(`已存入会话中枢：${title}`);
		} catch (error) {
			const message = errMessage(error);
			showStatus("error", `提取失败：${message}`);
			toast.error(`提取当前对话失败：${message}`);
		} finally {
			if (!disposedRef.current) setExtracting(false);
		}
	}, [site, extracting, showStatus]);

	const handleReloadSite = useCallback(async () => {
		await reloadSite({ silent: true });
		if (disposedRef.current) return;
		showStatus("info", "站点配置已刷新");
	}, [reloadSite, showStatus]);

	const handleOpenExternal = useCallback(async () => {
		if (!site) return;
		try {
			await openBrowserWindow(site.url);
		} catch (error) {
			toast.error(`在外部窗口打开失败：${errMessage(error)}`);
		}
	}, [site]);

	const handleOpenSettings = useCallback(() => {
		events.emit(EVENTS.OPEN_SETTINGS, { tab: SETTINGS_TAB_ID });
	}, []);

	/**
	 * 从本机浏览器导入该站点的登录态。
	 *
	 * 两道确认：先在菜单里挑浏览器 profile，再用确认框明确告知"会读取哪个域名的
	 * Cookie"。这是唯一触发路径——没有任何自动/后台导入。
	 */
	const runCookieImport = useCallback(
		async (source: BrowserCookieSourceRow) => {
			if (!site) return;
			const confirmed = await confirmDialog.show({
				title: "从本机浏览器导入登录态",
				message: `将从「${source.label}」读取 ${siteDomain} 的 Cookie，写入本应用为「${site.label}」单独保留的分区。\n\n只读这一个域名，不会碰其它站点；读取时系统可能会弹出钥匙串授权。导入后站点仍可能要求确认一次设备。`,
				confirmText: "导入",
				cancelText: "取消",
				type: "info",
			});
			if (!confirmed) return;

			setImportingCookies(true);
			try {
				const result = await importAiHubCookies({
					site_id: site.id,
					browser: source.browser,
					profile: source.profile,
				});
				if (!result.ok) {
					showStatus("error", result.error ?? "导入失败");
					return;
				}
				showStatus(
					"success",
					`已导入 ${result.imported} 条登录信息${
						result.skipped > 0 ? `（${result.skipped} 条跳过）` : ""
					}，正在重新加载`,
				);
				// cookie 要下一次请求才生效，不重载页面登录态不会出现
				await reloadAiHubSite(site.id).catch(() => undefined);
			} catch (error) {
				showStatus("error", `导入失败：${errMessage(error)}`);
			} finally {
				if (!disposedRef.current) setImportingCookies(false);
			}
		},
		[site, siteDomain, showStatus],
	);

	const handleOpenImportMenu = useCallback(async () => {
		if (!site || importingCookies) return;
		let sources: BrowserCookieSourceRow[];
		try {
			// 带 site.id：后端会统计每个 profile 有多少条该站点的有效 cookie
			sources = await listCookieSources(site.id);
		} catch (error) {
			toast.error(`读取本机浏览器列表失败：${errMessage(error)}`);
			return;
		}
		if (sources.length === 0) {
			toast.info("没有检测到 Chrome / Edge / Brave 的本地配置");
			return;
		}
		const rect = importButtonRef.current?.getBoundingClientRect();
		setImportMenu({
			x: rect ? rect.right - 260 : 0,
			y: rect ? rect.bottom + 4 : 0,
			items: sources.map((source) => {
				const count = source.valid_cookies;
				// 0 条 = 这个 profile 压根没在该站点登录过。不禁用（用户可能确有理由
				// 硬试），但标注清楚——否则就会像之前那样选中一个四个月没动的旧
				// profile，导入"成功"却依然是未登录。
				const suffix =
					count === undefined
						? ""
						: count > 0
							? `　${count} 条登录信息`
							: "　未登录过";
				return {
					label: `${source.label}${suffix}`,
					disabled: count === 0,
					onClick: () => void runCookieImport(source),
				};
			}),
		});
	}, [site, importingCookies, runCookieImport]);

	// ============================================================
	// 渲染
	// ============================================================

	/** 次要动作：宽的时候平铺成图标，窄的时候收进溢出菜单。 */
	const secondaryActions: {
		key: string;
		label: string;
		icon: React.ReactNode;
		disabled?: boolean;
		onClick: () => void;
		/** 溢出菜单里用的图标（ContextMenu 要 ReactNode） */
		menuIcon: React.ReactNode;
	}[] = [
		{
			key: "cookies",
			label: "从本机浏览器导入登录态",
			icon: importingCookies ? (
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
			) : (
				<KeyRound className="h-3.5 w-3.5" strokeWidth={1.5} />
			),
			menuIcon: <KeyRound className="h-4 w-4" strokeWidth={1.5} />,
			disabled: !site || importingCookies,
			onClick: () => void handleOpenImportMenu(),
		},
		{
			key: "reload",
			label: "刷新站点配置",
			icon: <RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />,
			menuIcon: <RotateCw className="h-4 w-4" strokeWidth={1.5} />,
			onClick: () => void handleReloadSite(),
		},
		{
			key: "external",
			label: "在外部窗口打开",
			icon: <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />,
			menuIcon: <ExternalLink className="h-4 w-4" strokeWidth={1.5} />,
			disabled: !site,
			onClick: () => void handleOpenExternal(),
		},
		{
			key: "settings",
			label: "站点与选择器设置",
			icon: <Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} />,
			menuIcon: <Settings2 className="h-4 w-4" strokeWidth={1.5} />,
			onClick: handleOpenSettings,
		},
	];

	return (
		<div
			ref={rootRef}
			className="flex h-full flex-col overflow-hidden bg-surface"
		>
			{/*
			 * 工具栏。
			 *
			 * 刻意**不重复站点名与 URL**：正上方的标签条已经写着这是哪个站点，
			 * 再印一遍只是在窄分屏里抢宽度。真要看完整地址，鼠标停在标签上就有。
			 * 关闭也交给标签上的 ×，这里不再放第二个关闭入口。
			 */}
			<div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
				{status ? (
					<span
						role="status"
						className={cn(
							"inline-flex min-w-0 flex-1 items-center truncate rounded-full px-2.5 py-1 text-xs font-medium",
							status.kind === "success" && "bg-success-muted text-success",
							status.kind === "error" && "bg-error-muted text-error",
							status.kind === "info" && "bg-warm-200 text-text-secondary",
						)}
						title={status.text}
					>
						{status.text}
					</span>
				) : (
					<span className="min-w-0 flex-1 truncate text-xs text-text-light">
						{site
							? attached
								? ""
								: "网页视图未挂载"
							: loading
								? "正在读取站点配置…"
								: "站点不可用"}
					</span>
				)}

				{/* 主动作：把当前对话收进会话中枢，是这个面板唯一的高频动作 */}
				<Tooltip content="提取当前对话并存入会话中枢" placement="bottom">
					<button
						type="button"
						onClick={() => void handleExtract()}
						disabled={!site || !attached || extracting}
						aria-label="提取当前对话"
						className={cn(
							"inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium",
							"text-terracotta transition-colors hover:bg-terracotta/[0.12]",
							"disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
						)}
					>
						{extracting ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={1.5} />
						)}
						{!compact && "提取对话"}
					</button>
				</Tooltip>

				{compact ? (
					<button
						ref={overflowButtonRef}
						type="button"
						aria-label="更多操作"
						onClick={() => {
							const rect = overflowButtonRef.current?.getBoundingClientRect();
							setOverflowMenu({
								x: rect ? rect.right - 220 : 0,
								y: rect ? rect.bottom + 4 : 0,
								items: secondaryActions.map((action) => ({
									label: action.label,
									icon: action.menuIcon,
									disabled: action.disabled,
									onClick: action.onClick,
								})),
							});
						}}
						className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-warm-200 hover:text-text-primary"
					>
						<MoreHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				) : (
					secondaryActions.map((action) => (
						<Tooltip key={action.key} content={action.label} placement="bottom">
							<button
								ref={action.key === "cookies" ? importButtonRef : undefined}
								type="button"
								onClick={action.onClick}
								disabled={action.disabled}
								aria-label={action.label}
								className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-warm-200 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
							>
								{action.icon}
							</button>
						</Tooltip>
					))
				)}
			</div>

			{/*
			 * 网页内容占位区：本身永远是空的，主进程把 WebContentsView
			 * 精确摆到这个矩形上。下面的提示只在原生视图未挂载时可见。
			 */}
			<div
				ref={contentRef}
				className="relative min-h-0 flex-1 overflow-hidden bg-background"
			>
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
					<div className="pointer-events-auto w-full max-w-sm">
						{loading ? (
							<PlaceholderState
								icon={<Loader2 className="h-5 w-5 animate-spin" />}
								title="正在读取站点配置"
								description="从本地配置加载该 Web AI 站点"
							/>
						) : loadError ? (
							<PlaceholderState
								tone="error"
								icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.5} />}
								title="站点不可用"
								description={loadError}
								action={{ label: "打开设置", onClick: handleOpenSettings }}
							/>
						) : suspended ? (
							<PlaceholderState
								icon={<Globe className="h-5 w-5" strokeWidth={1.5} />}
								title="网页视图已临时隐藏"
								description="弹窗打开期间会暂时收起内嵌网页，关闭弹窗后自动恢复，页面与登录态不会丢失。"
							/>
						) : (
							<PlaceholderState
								icon={<Loader2 className="h-5 w-5 animate-spin" />}
								title={`正在打开 ${site?.label ?? "站点"}`}
								description="首次打开需要登录；登录态会按站点独立保存。"
							/>
						)}
					</div>
				</div>
			</div>

			{importMenu ? (
				<ContextMenu
					x={importMenu.x}
					y={importMenu.y}
					items={importMenu.items}
					onClose={() => setImportMenu(null)}
				/>
			) : null}

			{overflowMenu ? (
				<ContextMenu
					x={overflowMenu.x}
					y={overflowMenu.y}
					items={overflowMenu.items}
					onClose={() => setOverflowMenu(null)}
				/>
			) : null}
		</div>
	);
}

// ============================================================
// 子组件
// ============================================================

interface PlaceholderStateProps {
	icon: React.ReactNode;
	title: string;
	description: string;
	tone?: "default" | "error";
	action?: { label: string; onClick: () => void };
}

function PlaceholderState({
	icon,
	title,
	description,
	tone = "default",
	action,
}: PlaceholderStateProps) {
	return (
		<div className="flex flex-col items-center gap-3 text-center">
			<div
				className={cn(
					"flex h-11 w-11 items-center justify-center rounded-2xl",
					tone === "error"
						? "bg-error-muted text-error"
						: "bg-warm-200 text-text-muted",
				)}
			>
				{icon}
			</div>
			<div className="space-y-1.5">
				<p className="text-sm font-medium text-text-primary">{title}</p>
				<p className="text-xs leading-relaxed text-text-muted">{description}</p>
			</div>
			{action ? (
				<button
					type="button"
					onClick={action.onClick}
					className="mt-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-warm-200 hover:text-text-primary"
				>
					{action.label}
				</button>
			) : null}
		</div>
	);
}
