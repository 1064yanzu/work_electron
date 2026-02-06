/**
 * 进度条组件
 * 用于显示备份/恢复操作的进度
 */
import { useEffect, useState } from "react";

export interface ProgressBarProps {
	progress: number; // 0-100
	stage?: string; // 当前阶段描述
	className?: string;
	showPercentage?: boolean;
}

export const ProgressBar = ({
	progress,
	stage,
	className = "",
	showPercentage = true,
}: ProgressBarProps) => {
	const [displayProgress, setDisplayProgress] = useState(0);

	// 平滑动画
	useEffect(() => {
		const timer = setTimeout(() => {
			setDisplayProgress(progress);
		}, 50);
		return () => clearTimeout(timer);
	}, [progress]);

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
		<div className={`space-y-2 ${className}`}>
			{stage && (
				<div className="flex items-center justify-between text-sm">
					<span className="text-gray-600 dark:text-gray-400">
						{getStageText(stage)}
					</span>
					{showPercentage && (
						<span className="font-medium text-gray-900 dark:text-gray-100">
							{Math.round(displayProgress)}%
						</span>
					)}
				</div>
			)}
			<div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
				<div
					className="h-full bg-blue-500 dark:bg-blue-600 rounded-full transition-all duration-300 ease-out"
					style={{ width: `${displayProgress}%` }}
				/>
			</div>
		</div>
	);
};

export interface CircularProgressProps {
	progress: number; // 0-100
	size?: number;
	strokeWidth?: number;
	className?: string;
}

export const CircularProgress = ({
	progress,
	size = 48,
	strokeWidth = 4,
	className = "",
}: CircularProgressProps) => {
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const offset = circumference - (progress / 100) * circumference;

	return (
		<div
			className={`relative inline-flex items-center justify-center ${className}`}
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
					className="text-gray-200 dark:text-gray-700"
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
					className="text-blue-500 dark:text-blue-600 transition-all duration-300 ease-out"
				/>
			</svg>
			<span className="absolute text-xs font-medium text-gray-900 dark:text-gray-100">
				{Math.round(progress)}%
			</span>
		</div>
	);
};
