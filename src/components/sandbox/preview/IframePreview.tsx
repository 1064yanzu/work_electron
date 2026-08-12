/**
 * IframePreview - 受控 iframe 组件
 * 支持 src / srcDoc 两种模式，监听 postMessage 同步子页面路由
 * 暴露 loading / error 状态供外层呈现进度条 / 状态遮罩
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
import { PreviewStatusOverlay } from "./PreviewStatusOverlay";

interface IframePreviewProps {
	src?: string;
	srcDoc?: string;
	onLoad?: () => void;
	onError?: () => void;
	/** 加载状态变化回调（外层进度条用） */
	onLoadingChange?: (loading: boolean) => void;
	/** 是否显示空态遮罩（无 src 且无 srcDoc 时） */
	showEmptyOverlay?: boolean;
	emptyTitle?: string;
	emptyDescription?: string;
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
>(function IframePreview(
	{
		src,
		srcDoc,
		onLoad,
		onError,
		onLoadingChange,
		showEmptyOverlay = true,
		emptyTitle,
		emptyDescription,
		className,
	},
	ref,
) {
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string>("");
	const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const setLoading = useCallback(
		(value: boolean) => {
			setIsLoading(value);
			onLoadingChange?.(value);
		},
		[onLoadingChange],
	);

	const handleRefresh = useCallback(() => {
		const iframe = iframeRef.current;
		if (!iframe) return;
		setLoading(true);
		setHasError(false);
		setErrorMessage("");
		const currentSrc = iframe.src;
		iframe.src = "";
		requestAnimationFrame(() => {
			iframe.src = currentSrc;
		});
	}, [setLoading]);

	useImperativeHandle(
		ref,
		() => ({
			getContentWindow: () => iframeRef.current?.contentWindow ?? null,
			refresh: handleRefresh,
		}),
		[handleRefresh],
	);

	// 监听子页面通过 postMessage 发送路由变化
	useEffect(() => {
		const handler = (event: MessageEvent) => {
			if (isPreviewMessage(event.data)) {
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
		setLoading(false);
		setHasError(false);
		setErrorMessage("");
		if (loadTimerRef.current) {
			clearTimeout(loadTimerRef.current);
			loadTimerRef.current = null;
		}
		onLoad?.();
	}, [setLoading, onLoad]);

	const handleError = useCallback(() => {
		setLoading(false);
		setHasError(true);
		setErrorMessage("iframe 加载失败");
		if (loadTimerRef.current) {
			clearTimeout(loadTimerRef.current);
			loadTimerRef.current = null;
		}
		onError?.();
	}, [setLoading, onError]);

	// src 变化时标记 loading
	useEffect(() => {
		if (src || srcDoc) {
			setLoading(true);
			setHasError(false);
			setErrorMessage("");
			loadTimerRef.current = setTimeout(() => {
				setLoading(false);
			}, 15000);
		} else {
			setLoading(false);
		}
		return () => {
			if (loadTimerRef.current) {
				clearTimeout(loadTimerRef.current);
				loadTimerRef.current = null;
			}
		};
	}, [src, srcDoc, setLoading]);

	const isEmpty = !src && !srcDoc;

	return (
		<div className={cn("relative w-full h-full", className)}>
			{isEmpty && showEmptyOverlay ? (
				<PreviewStatusOverlay
					mode="empty"
					title={emptyTitle}
					description={emptyDescription}
				/>
			) : null}

			{!isEmpty && isLoading ? <PreviewStatusOverlay mode="skeleton" /> : null}

			{!isEmpty && hasError ? (
				<PreviewStatusOverlay
					mode="error"
					errorMessage={errorMessage}
					onRetry={handleRefresh}
				/>
			) : null}

			{!isEmpty ? (
				<iframe
					ref={iframeRef}
					src={src}
					srcDoc={srcDoc}
					onLoad={handleLoad}
					onError={handleError}
					sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
					className="w-full h-full border-none bg-white dark:bg-cream-900"
					title="沙盒预览"
				/>
			) : null}
		</div>
	);
});
