/**
 * BrowserShell - 浏览器壳子组件
 * 顶部工具栏 + iframe 容器，bolt.new 风格
 * 工具栏：后退 / 前进 / 刷新 / 地址栏 / 断点切换 / 弹出 / 全屏
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
import { cn } from "@/lib/utils";
import { IconButton } from "../../ui/Button";
import { AddressBar } from "./AddressBar";
import {
	BreakpointSwitcher,
	type Breakpoint,
	getBreakpointSize,
} from "./BreakpointSwitcher";
import { IframePreview, type IframePreviewHandle } from "./IframePreview";

interface BrowserShellProps {
	src?: string;
	srcDoc?: string;
	taskId?: string;
	className?: string;
}

export function BrowserShell({
	src: initialSrc,
	srcDoc,
	taskId,
	className,
}: BrowserShellProps) {
	const iframeRef = useRef<IframePreviewHandle>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// 历史栈管理（前端模拟，因为跨 origin 拿不到原生 history）
	const [history, setHistory] = useState<string[]>(() =>
		initialSrc ? [initialSrc] : [],
	);
	const [historyIndex, setHistoryIndex] = useState<number>(() =>
		initialSrc ? 0 : -1,
	);
	const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
	const [isFullscreen, setIsFullscreen] = useState(false);

	const currentUrl = historyIndex >= 0 ? history[historyIndex] : "";

	// 外部 src 变化时重置历史
	useEffect(() => {
		if (initialSrc) {
			setHistory([initialSrc]);
			setHistoryIndex(0);
		}
	}, [initialSrc]);

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
	}, []);

	// 全屏状态变化监听
	useEffect(() => {
		const handler = () => {
			setIsFullscreen(document.fullscreenElement !== null);
		};
		document.addEventListener("fullscreenchange", handler);
		return () => document.removeEventListener("fullscreenchange", handler);
	}, []);

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

	return (
		<div
			ref={containerRef}
			className={cn(
				"flex flex-col h-full bg-warm-50 dark:bg-zinc-900",
				className,
			)}
		>
			{/* 工具栏 */}
			<div className="flex items-center gap-1.5 bg-surface/92 backdrop-blur-sm border-b border-border/80 px-3 py-2 shrink-0">
				{/* 导航按钮 */}
				<IconButton
					size="sm"
					variant="ghost"
					onClick={handleBack}
					disabled={!canGoBack}
					aria-label="后退"
					title="后退"
				>
					<ArrowLeft className="w-4 h-4" strokeWidth={1.5} />
				</IconButton>

				<IconButton
					size="sm"
					variant="ghost"
					onClick={handleForward}
					disabled={!canGoForward}
					aria-label="前进"
					title="前进"
				>
					<ArrowRight className="w-4 h-4" strokeWidth={1.5} />
				</IconButton>

				<IconButton
					size="sm"
					variant="ghost"
					onClick={handleRefresh}
					aria-label="刷新"
					title="刷新"
				>
					<RefreshCw className="w-4 h-4" strokeWidth={1.5} />
				</IconButton>

				{/* 地址栏 */}
				<AddressBar
					url={currentUrl}
					onNavigate={handleNavigate}
					disabled={!initialSrc && !srcDoc}
				/>

				{/* 分隔线 */}
				<div className="w-px h-5 bg-warm-300 dark:bg-cream-700 mx-0.5" />

				{/* 断点切换 */}
				<BreakpointSwitcher
					current={breakpoint}
					onChange={handleBreakpointChange}
				/>

				{/* 分隔线 */}
				<div className="w-px h-5 bg-warm-300 dark:bg-cream-700 mx-0.5" />

				{/* 弹出按钮 */}
				<IconButton
					size="sm"
					variant="ghost"
					onClick={handlePopout}
					disabled={!taskId || !currentUrl}
					aria-label="在新窗口中打开"
					title="在新窗口中打开"
				>
					<ExternalLink className="w-4 h-4" strokeWidth={1.5} />
				</IconButton>

				{/* 全屏按钮 */}
				<IconButton
					size="sm"
					variant="ghost"
					onClick={handleToggleFullscreen}
					aria-label={isFullscreen ? "退出全屏" : "全屏"}
					title={isFullscreen ? "退出全屏" : "全屏"}
				>
					{isFullscreen ? (
						<Minimize2 className="w-4 h-4" strokeWidth={1.5} />
					) : (
						<Maximize2 className="w-4 h-4" strokeWidth={1.5} />
					)}
				</IconButton>
			</div>

			{/* iframe 容器 */}
			<div className="flex-1 flex items-start justify-center overflow-auto bg-warm-100/50 dark:bg-zinc-800/50">
				<div
					className="h-full transition-[width] duration-300 ease-out"
					style={{
						width: breakpointSize.width ? `${breakpointSize.width}px` : "100%",
					}}
				>
					<IframePreview
						ref={iframeRef}
						src={currentUrl || undefined}
						srcDoc={!currentUrl && srcDoc ? srcDoc : undefined}
					/>
				</div>
			</div>
		</div>
	);
}
