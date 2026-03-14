/**
 * 进度条组件
 * 用于显示备份/恢复操作的进度
 */
import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";

export interface ProgressBarProps {
	progress: number; // 0-100
	stage?: string; // 当前阶段描述
	className?: string;
	showPercentage?: boolean;
	/**
	 * 颜色主题
	 */
	color?: "primary" | "blue" | "green" | "amber" | "red";
	/**
	 * 不确定状态（进度未知时显示动画）
	 */
	indeterminate?: boolean;
	/**
	 * 尺寸
	 */
	size?: "sm" | "md" | "lg";
}

const colorStyles = {
	primary: "bg-gradient-to-r from-primary to-primary-hover",
	blue: "bg-gradient-to-r from-blue-400 to-blue-600",
	green: "bg-gradient-to-r from-emerald-400 to-emerald-600",
	amber: "bg-gradient-to-r from-amber-400 to-amber-600",
	red: "bg-gradient-to-r from-red-400 to-red-600",
};

const sizeStyles = {
	sm: "h-1",
	md: "h-2",
	lg: "h-3",
};

export const ProgressBar = ({
	progress,
	stage,
	className = "",
	showPercentage = true,
	color = "blue",
	indeterminate = false,
	size = "md",
}: ProgressBarProps) => {
	const [displayProgress, setDisplayProgress] = useState(0);

	// 平滑动画
	useEffect(() => {
		if (indeterminate) return;
		const timer = setTimeout(() => {
			setDisplayProgress(progress);
		}, 50);
		return () => clearTimeout(timer);
	}, [progress, indeterminate]);

	// 阶段描述文本
	const getStageText = (stageKey: string | undefined) => {
		if (!stageKey) return "";
		const stageMap: Record<string, string> = {
			preparing: "准备中...",
			writing_data: "写入数据...",
			copying_files: "复制文件...",
			preparing_compression: "准备压缩...",
			compressing: "压缩中...",
			extracting: "解压中...",
			extracted: "解压完成",
			reading_data: "读取数据...",
			completed: "完成",
			uploading: "上传中...",
			downloading: "下载中...",
		};
		return stageMap[stageKey] || stageKey;
	};

	return (
		<div className={cn("space-y-2", className)}>
			{stage && (
				<div className="flex items-center justify-between text-sm">
					<span className="text-zinc-600 dark:text-zinc-400">
						{getStageText(stage)}
					</span>
					{showPercentage && !indeterminate && (
						<span className="font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">
							{Math.round(displayProgress)}%
						</span>
					)}
				</div>
			)}
			<div
				className={cn(
					"bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden",
					sizeStyles[size],
				)}
			>
				{indeterminate ? (
					<div
						className={cn(
							"h-full rounded-full animate-shimmer",
							colorStyles[color],
						)}
						style={{
							width: "50%",
							backgroundSize: "200% 100%",
						}}
					/>
				) : (
					<div
						className={cn(
							"h-full rounded-full transition-all duration-300 ease-out",
							colorStyles[color],
						)}
						style={{ width: `${displayProgress}%` }}
					/>
				)}
			</div>
		</div>
	);
};

export interface CircularProgressProps {
	progress: number; // 0-100
	size?: number;
	strokeWidth?: number;
	className?: string;
	/**
	 * 颜色主题
	 */
	color?: "primary" | "blue" | "green" | "amber" | "red";
	/**
	 * 是否显示百分比
	 */
	showPercentage?: boolean;
}

const circularColorStyles = {
	primary: "text-primary",
	blue: "text-blue-500 dark:text-blue-400",
	green: "text-emerald-500 dark:text-emerald-400",
	amber: "text-amber-500 dark:text-amber-400",
	red: "text-red-500 dark:text-red-400",
};

export const CircularProgress = ({
	progress,
	size = 48,
	strokeWidth = 4,
	className = "",
	color = "blue",
	showPercentage = true,
}: CircularProgressProps) => {
	const [displayProgress, setDisplayProgress] = useState(0);
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (displayProgress / 100) * circumference;

	// 平滑动画
	useEffect(() => {
		const timer = setTimeout(() => {
			setDisplayProgress(progress);
		}, 50);
		return () => clearTimeout(timer);
	}, [progress]);

	return (
		<div
			className={cn(
				"relative inline-flex items-center justify-center",
				className,
			)}
		>
			<svg width={size} height={size} className="transform -rotate-90">
				{/* 背景圆环 */}
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					stroke="currentColor"
					strokeWidth={strokeWidth}
					fill="none"
					className="text-zinc-200 dark:text-zinc-700"
				/>
				{/* 进度圆环 */}
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					stroke="currentColor"
					strokeWidth={strokeWidth}
					fill="none"
					strokeDasharray={circumference}
					strokeDashoffset={offset}
					strokeLinecap="round"
					className={cn(
						"transition-all duration-500 ease-out",
						circularColorStyles[color],
					)}
				/>
			</svg>
			{showPercentage && (
				<span className="absolute text-xs font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">
					{Math.round(displayProgress)}%
				</span>
			)}
		</div>
	);
};
