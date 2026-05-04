/**
 * IframePreview - 受控 iframe 组件
 * 支持 src / srcDoc 两种模式，监听 postMessage 同步子页面路由
 */

import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";

interface IframePreviewProps {
	src?: string;
	srcDoc?: string;
	onLoad?: () => void;
	onError?: () => void;
	className?: string;
}

/** 子页面 postMessage 消息约定 */
interface PreviewMessage {
	type: "preview-route-change";
	url: string;
}

function isPreviewMessage(data: unknown): data is PreviewMessage {
	return (
		typeof data === "object" &&
		data !== null &&
		(data as Record<string, unknown>).type === "preview-route-change" &&
		typeof (data as Record<string, unknown>).url === "string"
	);
}

export interface IframePreviewHandle {
	/** 获取 iframe 的 contentWindow */
	getContentWindow: () => WindowProxy | null;
	/** 触发刷新 */
	refresh: () => void;
}

export const IframePreview = forwardRef<
	IframePreviewHandle,
	IframePreviewProps
>(function IframePreview({ src, srcDoc, onLoad, onError, className }, ref) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [isLoading, setIsLoading] = useState(true);
	const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useImperativeHandle(ref, () => ({
		getContentWindow: () => iframeRef.current?.contentWindow ?? null,
		refresh: () => {
			const iframe = iframeRef.current;
			if (!iframe) return;
			setIsLoading(true);
			// 通过重新设置 src 触发刷新
			const currentSrc = iframe.src;
			iframe.src = "";
			// 使用 microtask 确保浏览器处理空白帧后再恢复
			requestAnimationFrame(() => {
				iframe.src = currentSrc;
			});
		},
	}));

	// 监听子页面通过 postMessage 发送路由变化
	useEffect(() => {
		const handler = (event: MessageEvent) => {
			if (isPreviewMessage(event.data)) {
				// 通过自定义事件向上冒泡，BrowserShell 可以监听
				window.dispatchEvent(
					new CustomEvent("preview-navigate", {
						detail: { url: event.data.url },
					}),
				);
			}
		};
		window.addEventListener("message", handler);
		return () => window.removeEventListener("message", handler);
	}, []);

	const handleLoad = useCallback(() => {
		setIsLoading(false);
		if (loadTimerRef.current) {
			clearTimeout(loadTimerRef.current);
			loadTimerRef.current = null;
		}
		onLoad?.();
	}, [onLoad]);

	const handleError = useCallback(() => {
		setIsLoading(false);
		if (loadTimerRef.current) {
			clearTimeout(loadTimerRef.current);
			loadTimerRef.current = null;
		}
		onError?.();
	}, [onError]);

	// src 变化时标记 loading
	useEffect(() => {
		if (src || srcDoc) {
			setIsLoading(true);
			// 安全超时：避免某些情况下 load 事件不触发导致永久 loading
			loadTimerRef.current = setTimeout(() => setIsLoading(false), 15000);
		}
		return () => {
			if (loadTimerRef.current) {
				clearTimeout(loadTimerRef.current);
				loadTimerRef.current = null;
			}
		};
	}, [src, srcDoc]);

	return (
		<div className={cn("relative w-full h-full", className)}>
			{/* Loading 指示器 */}
			{isLoading && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/60 backdrop-blur-[2px]">
					<div className="flex flex-col items-center gap-2">
						<div className="w-6 h-6 border-2 border-warm-400 border-t-transparent rounded-full animate-spin" />
						<span className="text-xs text-text-muted">加载中...</span>
					</div>
				</div>
			)}

			<iframe
				ref={iframeRef}
				src={src}
				srcDoc={srcDoc}
				onLoad={handleLoad}
				onError={handleError}
				sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
				className="w-full h-full border-none bg-white dark:bg-zinc-900"
				title="沙盒预览"
			/>
		</div>
	);
});
