/**
 * LoadProgressBar - iframe 加载期顶部进度条
 * 使用"假进度"模式：start 后从 0 推进到 80%，完成时跳到 100% 后淡出
 * Claude 风暖色（terracotta），克制不喧宾夺主
 */

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface LoadProgressBarProps {
	/** 是否处于加载中 */
	loading: boolean;
	className?: string;
}

export function LoadProgressBar({ loading, className }: LoadProgressBarProps) {
	const [progress, setProgress] = useState(0);
	const [visible, setVisible] = useState(false);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (loading) {
			setVisible(true);
			setProgress(8);
			if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

			// 假进度：先快后慢，逐渐逼近 85%
			timerRef.current = setInterval(() => {
				setProgress((prev) => {
					if (prev >= 85) return prev;
					const remaining = 85 - prev;
					const increment = Math.max(0.6, remaining * 0.06);
					return prev + increment;
				});
			}, 180);

			return () => {
				if (timerRef.current) clearInterval(timerRef.current);
				timerRef.current = null;
			};
		}

		if (timerRef.current) {
			clearInterval(timerRef.current);
			timerRef.current = null;
		}
		// 完成：跳到 100% 后淡出
		setProgress(100);
		fadeTimerRef.current = setTimeout(() => {
			setVisible(false);
			setProgress(0);
		}, 380);
		return () => {
			if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
		};
	}, [loading]);

	return (
		<div
			className={cn(
				"absolute left-0 right-0 top-0 h-[2px] pointer-events-none z-20",
				"transition-opacity duration-250",
				visible ? "opacity-100" : "opacity-0",
				className,
			)}
			aria-hidden="true"
		>
			<div className="relative h-full w-full overflow-hidden">
				<div
					className={cn(
						"h-full transition-[width] duration-150 ease-out",
						"bg-gradient-to-r from-terracotta via-peach-500 to-terracotta",
					)}
					style={{ width: `${progress}%` }}
				/>
				{/* 微光：在进度条尾部一道细微高光，给"在动"的感觉 */}
				{loading && progress < 95 ? (
					<div
						className="absolute top-0 h-full w-12 -translate-x-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent blur-[1px]"
						style={{
							left: `${progress}%`,
							transition: "left 200ms ease-out",
						}}
					/>
				) : null}
			</div>
		</div>
	);
}
