/**
 * BrowserShell - 拟真浏览器壳子
 * macOS 风装饰条 + 浏览器工具栏 + 设备框包裹的 iframe
 * 已解耦：TrafficLights / DevServerStatusBadge / DeviceFrame / LoadProgressBar
 */

import {
	ArrowLeft,
	ArrowRight,
	ExternalLink,
	Maximize2,
	Minimize2,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@/lib/tauriCompat";
import { usePreviewServerStoreSelector } from "@/lib/previewServerStore";
import { cn } from "@/lib/utils";
import { IconButton } from "../../ui/Button";
import { AddressBar } from "./AddressBar";
import {
	BreakpointSwitcher,
	type Breakpoint,
	getBreakpointSize,
} from "./BreakpointSwitcher";
import { DeviceFrame } from "./DeviceFrame";
import { DevServerStatusBadge } from "./DevServerStatusBadge";
import { IframePreview, type IframePreviewHandle } from "./IframePreview";
import { LoadProgressBar } from "./LoadProgressBar";
import { TrafficLights } from "./TrafficLights";

interface BrowserShellProps {
	src?: string;
	srcDoc?: string;
	taskId?: string;
	className?: string;
	/** 标题（macOS 风装饰条上显示），默认"沙盒预览" */
	title?: string;
	/** 是否显示装饰条（含交通灯 + 标题 + 状态徽章），默认 true */
	showDecorationBar?: boolean;
}

export function BrowserShell({
	src: initialSrc,
	srcDoc,
	taskId,
	className,
	title = "沙盒预览",
	showDecorationBar = true,
}: BrowserShellProps) {
	const iframeRef = useRef<IframePreviewHandle>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// 历史栈管理
	const [history, setHistory] = useState<string[]>(() =>
		initialSrc ? [initialSrc] : [],
	);
	const [historyIndex, setHistoryIndex] = useState<number>(() =>
		initialSrc ? 0 : -1,
	);
	const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	const previewServer = usePreviewServerStoreSelector((state) =>
		taskId ? state.servers[taskId] : undefined,
	);

	const currentUrl = historyIndex >= 0 ? history[historyIndex] : "";

	// 外部 src 变化时重置历史
	useEffect(() => {
		if (initialSrc) {
			setHistory([initialSrc]);
			setHistoryIndex(0);
		}
	}, [initialSrc]);

	/** 追加到历史栈（丢弃前进记录） */
	const pushHistory = useCallback(
		(url: string) => {
			setHistory((prev) => {
				const truncated = prev.slice(0, historyIndex + 1);
				return [...truncated, url];
			});
			setHistoryIndex((prev) => prev + 1);
		},
		[historyIndex],
	);

	// 监听子页面 postMessage 路由变化
	useEffect(() => {
		const handler = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.url && typeof detail.url === "string") {
				pushHistory(detail.url);
			}
		};
		window.addEventListener("preview-navigate", handler);
		return () => window.removeEventListener("preview-navigate", handler);
	}, [pushHistory]);

	// 全屏状态变化监听
	useEffect(() => {
		const handler = () => {
			setIsFullscreen(document.fullscreenElement !== null);
		};
		document.addEventListener("fullscreenchange", handler);
		return () => document.removeEventListener("fullscreenchange", handler);
	}, []);

	const canGoBack = historyIndex > 0;
	const canGoForward = historyIndex < history.length - 1;

	const handleBack = useCallback(() => {
		if (!canGoBack) return;
		setHistoryIndex((prev) => prev - 1);
	}, [canGoBack]);

	const handleForward = useCallback(() => {
		if (!canGoForward) return;
		setHistoryIndex((prev) => prev + 1);
	}, [canGoForward]);

	const handleRefresh = useCallback(() => {
		iframeRef.current?.refresh();
	}, []);

	const handleNavigate = useCallback(
		(url: string) => {
			pushHistory(url);
		},
		[pushHistory],
	);

	const handleToggleFullscreen = useCallback(async () => {
		const el = containerRef.current;
		if (!el) return;
		try {
			if (document.fullscreenElement) {
				await document.exitFullscreen();
			} else {
				await el.requestFullscreen();
			}
		} catch (err) {
			console.error("[BrowserShell] 全屏切换失败:", err);
		}
	}, []);

	const handlePopout = useCallback(async () => {
		if (!taskId) return;
		try {
			await invoke("preview_window_open", {
				task_id: taskId,
				url: currentUrl,
			});
		} catch (err) {
			console.error("[BrowserShell] 弹出窗口失败:", err);
		}
	}, [taskId, currentUrl]);

	const handleBreakpointChange = useCallback((bp: Breakpoint) => {
		setBreakpoint(bp);
	}, []);

	// 断点对应的容器尺寸
	const breakpointSize = useMemo(
		() => getBreakpointSize(breakpoint),
		[breakpoint],
	);

	const hasContent = Boolean(initialSrc || srcDoc);
	const isDesktop = breakpoint === "desktop";

	return (
		<div
			ref={containerRef}
			className={cn(
				"flex flex-col h-full overflow-hidden",
				"bg-cream-100 dark:bg-cream-900",
				className,
			)}
		>
			{/* 装饰条：交通灯 + 标题 + 服务器状态徽章 */}
			{showDecorationBar ? (
				<div
					className={cn(
						"flex items-center gap-3 px-3 py-1.5 shrink-0",
						"bg-cream-200/70 dark:bg-cream-900/80",
						"border-b border-border/60",
						"backdrop-blur-sm",
					)}
				>
					<TrafficLights muted={!hasContent} />

					<div className="flex-1 min-w-0 flex items-center justify-center">
						<div className="inline-flex items-center gap-2 px-2.5 py-0.5 max-w-full">
							<span className="text-[11px] font-medium text-text-secondary truncate">
								{title}
							</span>
							{isLoading ? (
								<span className="inline-flex items-center gap-1 text-[10px] text-text-light">
									<span className="block w-1 h-1 rounded-full bg-terracotta animate-pulse" />
									加载中
								</span>
							) : null}
						</div>
					</div>

					<div className="flex items-center gap-2 shrink-0">
						<DevServerStatusBadge server={previewServer} />
					</div>
				</div>
			) : null}

			{/* 工具栏 */}
			<div
				className={cn(
					"relative flex items-center gap-1.5 px-3 py-2 shrink-0",
					"bg-surface/95 dark:bg-cream-900/95",
					"border-b border-border/80",
					"backdrop-blur-sm",
				)}
			>
				{/* 顶部加载进度条 */}
				<LoadProgressBar loading={isLoading} />

				{/* 导航按钮组 */}
				<div className="flex items-center gap-0.5">
					<IconButton
						size="sm"
						variant="ghost"
						onClick={handleBack}
						disabled={!canGoBack}
						aria-label="后退"
						title="后退"
					>
						<ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
					</IconButton>

					<IconButton
						size="sm"
						variant="ghost"
						onClick={handleForward}
						disabled={!canGoForward}
						aria-label="前进"
						title="前进"
					>
						<ArrowRight className="w-4 h-4" strokeWidth={1.75} />
					</IconButton>

					<IconButton
						size="sm"
						variant="ghost"
						onClick={handleRefresh}
						aria-label={isLoading ? "停止加载" : "刷新"}
						title={isLoading ? "刷新中..." : "刷新"}
					>
						<RefreshCw
							className={cn(
								"w-4 h-4 transition-transform",
								isLoading && "animate-spin",
							)}
							strokeWidth={1.75}
						/>
					</IconButton>
				</div>

				{/* 地址栏 */}
				<AddressBar
					url={currentUrl}
					onNavigate={handleNavigate}
					disabled={!initialSrc && !srcDoc}
				/>

				{/* 分隔线 */}
				<div className="w-px h-5 bg-cream-300 dark:bg-cream-700 mx-0.5" />

				{/* 断点切换 */}
				<BreakpointSwitcher
					current={breakpoint}
					onChange={handleBreakpointChange}
				/>

				{/* 分隔线 */}
				<div className="w-px h-5 bg-cream-300 dark:bg-cream-700 mx-0.5" />

				{/* 弹出按钮 */}
				<IconButton
					size="sm"
					variant="ghost"
					onClick={handlePopout}
					disabled={!taskId || !currentUrl}
					aria-label="在新窗口中打开"
					title="在独立窗口打开"
				>
					<ExternalLink className="w-4 h-4" strokeWidth={1.75} />
				</IconButton>

				{/* 全屏按钮 */}
				<IconButton
					size="sm"
					variant="ghost"
					onClick={handleToggleFullscreen}
					aria-label={isFullscreen ? "退出全屏" : "全屏"}
					title={isFullscreen ? "退出全屏" : "进入全屏"}
				>
					{isFullscreen ? (
						<Minimize2 className="w-4 h-4" strokeWidth={1.75} />
					) : (
						<Maximize2 className="w-4 h-4" strokeWidth={1.75} />
					)}
				</IconButton>
			</div>

			{/* iframe 容器 — 桌面：贴边铺满；移动 / 平板：居中带设备框 */}
			<div
				className={cn(
					"flex-1 min-h-0 overflow-auto",
					isDesktop
						? "bg-surface"
						: cn(
								"bg-gradient-to-b from-cream-100 to-cream-200/60",
								"dark:from-cream-900 dark:to-cream-950",
								"flex items-start justify-center",
							),
				)}
			>
				<DeviceFrame
					breakpoint={breakpoint}
					width={breakpointSize.width}
					height={breakpointSize.height}
					className={isDesktop ? "" : "mx-auto"}
				>
					<IframePreview
						ref={iframeRef}
						src={currentUrl || undefined}
						srcDoc={!currentUrl && srcDoc ? srcDoc : undefined}
						onLoadingChange={setIsLoading}
						emptyTitle="暂无可预览内容"
						emptyDescription="切换到「代码」视图编辑文件，或运行 Agent 生成产物，预览会自动加载。"
					/>
				</DeviceFrame>
			</div>
		</div>
	);
}
