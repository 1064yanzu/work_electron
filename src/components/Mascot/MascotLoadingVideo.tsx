import { useEffect, useRef } from "react";
import { cn } from "../../lib/utils";
import { useMascot } from "../../lib/mascotStore";
import type { MascotSize } from "./Mascot";

const SIZE_CLASS: Record<MascotSize, string> = {
	xs: "w-6 h-6",
	sm: "w-10 h-10",
	md: "w-16 h-16",
	lg: "w-24 h-24",
	xl: "w-32 h-32",
	"2xl": "w-44 h-44",
};

export interface MascotLoadingVideoProps {
	size?: MascotSize;
	className?: string;
	wrapperClassName?: string;
	/** 视频不可用时的 fallback；通常应该传一个 PNG <Mascot /> */
	fallback?: React.ReactNode;
}

/**
 * MascotLoadingVideo — 渲染当前 IP 的 loading 视频动画
 *
 * - 仅当 useMascot().getAnimation("loading") 返回 URL 时播放视频
 * - 缺位（如 efficiency / cloud / off）时回退到 fallback
 * - 透明 mp4 在 Chromium / WebKit 都原生支持，autoPlay + muted + loop + playsInline
 *   是浏览器允许自动播放的必要组合
 */
export function MascotLoadingVideo({
	size = "md",
	className,
	wrapperClassName,
	fallback = null,
}: MascotLoadingVideoProps) {
	const { getAnimation } = useMascot();
	const src = getAnimation("loading");
	const videoRef = useRef<HTMLVideoElement | null>(null);

	// IP 切换时重新加载视频源（src 变化 React 会重建 <video>，这里再保险一次）
	useEffect(() => {
		const v = videoRef.current;
		if (v && src) {
			v.load();
			v.play().catch(() => {
				/* 自动播放被拒，静默忽略——muted+playsInline 已是浏览器允许的最低组合 */
			});
		}
	}, [src]);

	if (!src) return <>{fallback}</>;

	return (
		<div
			className={cn(
				"relative inline-flex items-center justify-center select-none",
				SIZE_CLASS[size],
				wrapperClassName,
			)}
		>
			<video
				ref={videoRef}
				src={src}
				autoPlay
				loop
				muted
				playsInline
				preload="metadata"
				disablePictureInPicture
				disableRemotePlayback
				className={cn(
					"w-full h-full object-contain pointer-events-none",
					className,
				)}
			/>
		</div>
	);
}
