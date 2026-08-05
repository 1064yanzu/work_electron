/**
 * AI Hub —— 中栏「内嵌 Web AI 站点」主视图。
 *
 * 关键前提：**本组件不渲染网页内容**。网页由主进程的 `aiHubViewService` 用
 * Electron `WebContentsView` 原生覆盖在窗口上层（每个站点独立 partition，
 * 登录态互相隔离且持久化）。因此这里的职责只有三件：
 *
 *   1. 渲染站点 tab 条 + 工具栏（真实 DOM，永远位于原生视图之外）；
 *   2. 用一个空占位 div 测量「网页应该出现的矩形」，把 bounds 上报主进程；
 *   3. 卸载 / 尺寸退化 / 弹窗遮挡时把原生视图摘掉 —— 否则它会一直浮在
 *      其它界面上面（原生层永远在 DOM 之上，z-index 对它无效）。
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
	Loader2,
	MessagesSquare,
	RotateCw,
	Settings2,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	type AiHubSiteRow,
	closeAiHub,
	extractFromAiHub,
	importAiHubSession,
	injectToAiHub,
	listAiHubSites,
	openAiHubSite,
	setAiHubBounds,
} from "../../lib/api/harnessHub";
import {
	aiHubRequestStore,
	useAiHubRequest,
} from "../../lib/stores/aiHubRequestStore";
import { openBrowserWindow } from "../../lib/config";
import { EVENTS, events } from "../../lib/events";
import { cn } from "../../lib/utils";
import { workspaceStore } from "../../lib/workspaceStore";
import { confirmDialog } from "../ui/ConfirmDialog";
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

/** 记住上次浏览的站点，切走再回来不用重新挑。 */
const LAST_SITE_STORAGE_KEY = "aihub:last-site-id";

/**
 * 遮挡检测轮询间隔。应用内所有弹窗 / 全屏 Overlay（设置面板、命令面板、
 * 确认框、阅读器、卡片库、桌宠引导…）都带 `aria-modal="true"`，
 * 检测到就把原生视图摘掉，关闭后再挂回来。
 */
const OVERLAY_POLL_MS = 200;

/** 工具栏内联状态的展示时长。 */
const STATUS_TTL_MS = 5000;

/** 站点与选择器配置所在的设置页（见 Settings/settingsCatalog.ts）。 */
const SETTINGS_TAB_ID = "integrations.harnessHub";

function readLastSiteId(): string | null {
	try {
		return window.localStorage.getItem(LAST_SITE_STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeLastSiteId(siteId: string): void {
	try {
		window.localStorage.setItem(LAST_SITE_STORAGE_KEY, siteId);
	} catch {
		// 隐私模式下 localStorage 可能不可用，忽略即可
	}
}

function errMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function boundsEqual(a: Bounds | null, b: Bounds | null): boolean {
	if (!a || !b) return false;
	return (
		a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
	);
}

/** 是否存在会被原生视图盖住的模态层。 */
function hasBlockingOverlay(): boolean {
	return document.querySelector('[aria-modal="true"]') !== null;
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

export function AiHubPanel() {
	const [sites, setSites] = useState<AiHubSiteRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
	const [attached, setAttached] = useState(false);
	const [suspended, setSuspended] = useState(false);
	const [extracting, setExtracting] = useState(false);
	const [status, setStatus] = useState<PanelStatus | null>(null);
	/** 会话中枢发来的「打开站点 + 注入交接包」请求 */
	const hubRequest = useAiHubRequest();

	/** 网页内容占位区 —— 原生视图会精确覆盖在它上面。 */
	const contentRef = useRef<HTMLDivElement | null>(null);
	const rafRef = useRef<number | null>(null);
	const lastBoundsRef = useRef<Bounds | null>(null);
	const activeSiteIdRef = useRef<string | null>(null);
	const attachedRef = useRef(false);
	const suspendedRef = useRef(false);
	const disposedRef = useRef(false);
	const statusTimerRef = useRef<number | null>(null);

	const activeSite = useMemo(
		() => sites.find((site) => site.id === activeSiteId) ?? null,
		[sites, activeSiteId],
	);

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
		void closeAiHub().catch(() => undefined);
	}, []);

	/** 把指定站点挂到占位区位置。 */
	const attachView = useCallback(
		async (siteId: string) => {
			if (disposedRef.current || suspendedRef.current) return;
			const bounds = measure();
			// 尺寸还没稳定（首帧 / 面板折叠）：交给 ResizeObserver 的下一次回调
			if (!bounds) return;
			try {
				const ok = await openAiHubSite(siteId, bounds);
				if (disposedRef.current) {
					void closeAiHub().catch(() => undefined);
					return;
				}
				// 等待期间用户已切走 → 由后一次 attach 负责，这里不写状态
				if (activeSiteIdRef.current !== siteId || suspendedRef.current) return;
				if (!ok) {
					showStatus("error", "站点挂载失败，请检查站点配置");
					return;
				}
				attachedRef.current = true;
				lastBoundsRef.current = bounds;
				setAttached(true);
			} catch (error) {
				if (disposedRef.current) return;
				showStatus("error", `内嵌视图挂载失败：${errMessage(error)}`);
			}
		},
		[measure, showStatus],
	);

	/** 用 rAF 合并高频调用（面板拖动时每帧最多一次 IPC）。 */
	const scheduleSync = useCallback(() => {
		if (rafRef.current !== null) return;
		rafRef.current = window.requestAnimationFrame(() => {
			rafRef.current = null;
			if (disposedRef.current || suspendedRef.current) return;
			const siteId = activeSiteIdRef.current;
			if (!siteId) return;
			const bounds = measure();
			if (!bounds) {
				// 面板被折叠到 0 宽/高 —— 先摘掉，恢复尺寸后自动挂回
				detachView();
				return;
			}
			if (!attachedRef.current) {
				void attachView(siteId);
				return;
			}
			if (boundsEqual(lastBoundsRef.current, bounds)) return;
			lastBoundsRef.current = bounds;
			void setAiHubBounds(bounds).catch(() => undefined);
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
			void closeAiHub().catch(() => undefined);
		};
	}, []);

	const reloadSites = useCallback(async (options?: { silent?: boolean }) => {
		if (!options?.silent) setLoading(true);
		setLoadError(null);
		try {
			const rows = await listAiHubSites();
			if (disposedRef.current) return;
			const enabled = rows.filter((row) => row.enabled);
			setSites(enabled);
			setActiveSiteId((prev) => {
				if (prev && enabled.some((row) => row.id === prev)) return prev;
				const remembered = readLastSiteId();
				const next =
					enabled.find((row) => row.id === remembered) ?? enabled[0] ?? null;
				return next ? next.id : null;
			});
		} catch (error) {
			if (!disposedRef.current) setLoadError(errMessage(error));
		} finally {
			if (!disposedRef.current) setLoading(false);
		}
	}, []);

	useEffect(() => {
		void reloadSites();
	}, [reloadSites]);

	// 当前站点变化 → 重新挂载（主进程的 attach 会替换掉旧的子视图）
	useEffect(() => {
		activeSiteIdRef.current = activeSiteId;
		if (!activeSiteId) {
			detachView();
			return;
		}
		writeLastSiteId(activeSiteId);
		void attachView(activeSiteId);
	}, [activeSiteId, attachView, detachView]);

	// 会话中枢发来的「打开某站点 + 注入交接包」请求。
	// 站点切换与 view 挂载都由本组件负责，所以注入必须等 attachView 完成后再做，
	// 发起方（HarnessView）无法知道这个时机。
	useEffect(() => {
		if (!hubRequest) return;
		const site = sites.find((row) => row.id === hubRequest.siteId);
		if (!site) {
			// 站点被禁用或已删除
			toast.error("目标站点不可用，请在设置中检查 Web AI 站点清单");
			aiHubRequestStore.clear();
			return;
		}
		if (activeSiteId !== hubRequest.siteId) {
			// 先切站点，等下一轮 effect（此时 view 已挂好）再注入
			setActiveSiteId(hubRequest.siteId);
			return;
		}
		const text = hubRequest.text;
		aiHubRequestStore.clear();
		if (!text) return;

		let cancelled = false;
		void (async () => {
			try {
				await attachView(hubRequest.siteId);
				if (cancelled || disposedRef.current) return;
				const injected = await injectToAiHub(hubRequest.siteId, text);
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
	}, [hubRequest, sites, activeSiteId, attachView]);

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

	// 弹窗遮挡守卫：模态层出现时摘掉原生视图，关闭后挂回来
	useEffect(() => {
		const timer = window.setInterval(() => {
			if (disposedRef.current) return;
			const blocked = hasBlockingOverlay();
			if (blocked === suspendedRef.current) return;
			suspendedRef.current = blocked;
			setSuspended(blocked);
			if (blocked) {
				detachView();
				return;
			}
			const siteId = activeSiteIdRef.current;
			if (siteId) void attachView(siteId);
		}, OVERLAY_POLL_MS);
		return () => window.clearInterval(timer);
	}, [attachView, detachView]);

	// ============================================================
	// 动作
	// ============================================================

	const handleSelectSite = useCallback((siteId: string) => {
		if (siteId === activeSiteIdRef.current) return;
		setActiveSiteId(siteId);
	}, []);

	const handleExtract = useCallback(async () => {
		if (!activeSite || extracting) return;
		setExtracting(true);
		try {
			const result = await extractFromAiHub(activeSite.id);
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
				message: `已从「${activeSite.label}」当前页面提取到 ${messages.length} 条消息，确认存入会话中枢？`,
				confirmText: "存入",
				cancelText: "取消",
				type: "info",
			});
			if (!confirmed) {
				showStatus("info", "已取消导入");
				return;
			}

			const title = deriveSessionTitle(activeSite.label, messages);
			await importAiHubSession({
				site_id: activeSite.id,
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
	}, [activeSite, extracting, showStatus]);

	const handleRefreshSites = useCallback(async () => {
		await reloadSites({ silent: true });
		if (disposedRef.current) return;
		showStatus("info", "站点列表已刷新");
	}, [reloadSites, showStatus]);

	const handleOpenExternal = useCallback(async () => {
		if (!activeSite) return;
		try {
			await openBrowserWindow(activeSite.url);
		} catch (error) {
			toast.error(`在外部窗口打开失败：${errMessage(error)}`);
		}
	}, [activeSite]);

	const handleOpenSettings = useCallback(() => {
		events.emit(EVENTS.OPEN_SETTINGS, { tab: SETTINGS_TAB_ID });
	}, []);

	const handleBackToWorkspace = useCallback(() => {
		workspaceStore.setMainView("editor");
	}, []);

	// ============================================================
	// 渲染
	// ============================================================

	const hasSites = sites.length > 0;

	return (
		<div className="flex h-full flex-col overflow-hidden bg-surface">
			{/* 顶栏：站点 tab 条 + 工具栏 */}
			<div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
				<div
					role="tablist"
					aria-label="AI 站点切换"
					className="scrollbar-hide flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
				>
					{hasSites ? (
						sites.map((site) => (
							<SiteTab
								key={site.id}
								site={site}
								active={site.id === activeSiteId}
								onSelect={handleSelectSite}
							/>
						))
					) : (
						<span className="truncate px-1 text-xs text-text-muted">
							{loading ? "正在读取站点列表…" : "尚未启用任何站点"}
						</span>
					)}
				</div>

				<div className="flex shrink-0 items-center gap-1">
					{status ? (
						<span
							role="status"
							className={cn(
								"inline-flex max-w-[15rem] items-center truncate rounded-full px-2.5 py-1 text-[11px] font-medium",
								status.kind === "success" && "bg-success-muted text-success",
								status.kind === "error" && "bg-error-muted text-error",
								status.kind === "info" && "bg-warm-200 text-text-secondary",
							)}
						>
							{status.text}
						</span>
					) : null}

					<button
						type="button"
						onClick={() => void handleExtract()}
						disabled={!activeSite || !attached || extracting}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
							"text-terracotta transition-colors hover:bg-terracotta/[0.12]",
							"disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
						)}
					>
						{extracting ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<ArrowDownToLine className="h-3.5 w-3.5" strokeWidth={1.5} />
						)}
						提取当前对话
					</button>

					<Tooltip content="刷新站点列表" placement="bottom">
						<button
							type="button"
							onClick={() => void handleRefreshSites()}
							aria-label="刷新站点列表"
							className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-warm-200 hover:text-text-primary"
						>
							<RotateCw className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					</Tooltip>

					<Tooltip content="在外部窗口打开" placement="bottom">
						<button
							type="button"
							onClick={() => void handleOpenExternal()}
							disabled={!activeSite}
							aria-label="在外部窗口打开"
							className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-warm-200 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
						>
							<ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					</Tooltip>

					<Tooltip content="站点与选择器设置" placement="bottom">
						<button
							type="button"
							onClick={handleOpenSettings}
							aria-label="站点与选择器设置"
							className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-warm-200 hover:text-text-primary"
						>
							<Settings2 className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					</Tooltip>

					<div className="mx-0.5 h-4 w-px bg-border" />

					<Tooltip content="返回工作区" placement="bottom">
						<button
							type="button"
							onClick={handleBackToWorkspace}
							aria-label="返回工作区"
							className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-warm-200 hover:text-text-primary"
						>
							<X className="h-3.5 w-3.5" strokeWidth={1.5} />
						</button>
					</Tooltip>
				</div>
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
								title="正在读取站点列表"
								description="从本地配置加载可用的 Web AI 站点"
							/>
						) : loadError ? (
							<PlaceholderState
								tone="error"
								icon={<AlertTriangle className="h-5 w-5" strokeWidth={1.5} />}
								title="站点列表加载失败"
								description={loadError}
								action={{
									label: "重试",
									onClick: () => {
										void reloadSites();
									},
								}}
							/>
						) : !hasSites ? (
							<PlaceholderState
								icon={<MessagesSquare className="h-5 w-5" strokeWidth={1.5} />}
								title="尚未启用任何 Web AI 站点"
								description="在设置面板中启用内置站点（ChatGPT / Gemini / Kimi / 豆包 / 智谱 GLM / DeepSeek），或添加自定义站点后再回到这里。"
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
								title={`正在打开 ${activeSite?.label ?? "站点"}`}
								description="首次打开需要登录；登录态会按站点独立保存。"
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}

// ============================================================
// 子组件
// ============================================================

interface SiteTabProps {
	site: AiHubSiteRow;
	active: boolean;
	onSelect: (siteId: string) => void;
}

function SiteTab({ site, active, onSelect }: SiteTabProps) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={active}
			title={site.url}
			onClick={() => onSelect(site.id)}
			className={cn(
				"inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5",
				"text-xs font-medium transition-[background-color,color] duration-150",
				active
					? "bg-terracotta/[0.12] text-terracotta"
					: "text-text-muted hover:bg-warm-200 hover:text-text-primary",
			)}
		>
			<SiteFavicon url={site.url} />
			<span className="max-w-[9rem] truncate">{site.label}</span>
		</button>
	);
}

/** 站点图标：取站点自身的 favicon，失败回落到通用图标。 */
function SiteFavicon({ url }: { url: string }) {
	const [failed, setFailed] = useState(false);
	const host = useMemo(() => {
		try {
			return new URL(url).host;
		} catch {
			return null;
		}
	}, [url]);

	if (!host || failed) {
		return (
			<Globe className="h-3.5 w-3.5 shrink-0 opacity-70" strokeWidth={1.5} />
		);
	}

	return (
		<img
			src={`https://icons.duckduckgo.com/ip3/${host}.ico`}
			alt=""
			className="h-3.5 w-3.5 shrink-0 rounded-sm object-contain"
			onError={() => setFailed(true)}
		/>
	);
}

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
