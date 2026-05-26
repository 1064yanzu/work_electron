/**
 * Design 预览视口包装。
 *
 * 自管 iframe + viewport 尺寸 + zoom scale，不复用 BrowserShell。
 * 暴露 ref 给 Inspect overlay 调用 `getIframe()` 注入 inspect 脚本。
 */
import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { type DesignViewport, VIEWPORT_PRESETS } from "./constants";

export interface DesignViewportFrameHandle {
	getIframe: () => HTMLIFrameElement | null;
}

interface DesignViewportFrameProps {
	src: string;
	viewport: DesignViewport;
	zoom: number; // 25..400
	refreshKey: number;
	onLoad?: () => void;
	colorScheme?: "light" | "dark";
}

export const DesignViewportFrame = forwardRef<
	DesignViewportFrameHandle,
	DesignViewportFrameProps
>(function DesignViewportFrame(
	{ src, viewport, zoom, refreshKey, onLoad, colorScheme = "light" },
	ref,
) {
	const iframeRef = useRef<HTMLIFrameElement | null>(null);

	useImperativeHandle(
		ref,
		() => ({
			getIframe: () => iframeRef.current,
		}),
		[],
	);

	const preset = VIEWPORT_PRESETS[viewport];
	const scale = zoom / 100;

	// 给 src 带上 refreshKey,让 React 在 refreshKey 变化时重新挂载 iframe
	const finalSrc = useMemo(() => {
		if (!src) return src;
		const sep = src.includes("?") ? "&" : "?";
		// src 已经带了 ?_=...,这里仅在没带时追加;若带了就保留原状(refreshKey 由父级注入)
		if (/[?&]_=/.test(src)) return src;
		return `${src}${sep}_=${refreshKey}`;
	}, [src, refreshKey]);

	return (
		<div
			className="h-full w-full overflow-auto bg-cream-200/40"
			data-color-scheme={colorScheme}
		>
			{/* min-w-full min-h-full 让小内容居中,大内容撑开滚动容器(避免 flex 居中 + overflow 把内容裁到不可滚动的负边) */}
			<div className="min-w-full min-h-full flex items-center justify-center p-6">
				<div
					style={{
						width: preset.width,
						height: preset.height,
						transform: `scale(${scale})`,
						transformOrigin: "center center",
					}}
					className="shrink-0 bg-background rounded-lg shadow-bai-pop overflow-hidden border border-cream-400"
				>
					<iframe
						ref={iframeRef}
						title="design-preview"
						src={finalSrc}
						onLoad={onLoad}
						className="w-full h-full bg-background"
						sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
					/>
				</div>
			</div>
		</div>
	);
});
