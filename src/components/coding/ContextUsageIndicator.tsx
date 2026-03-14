/**
 * 上下文占用指示器
 * 在输入框右下角展示当前会话的上下文使用情况
 * 参考 Codex 官方样式：紧凑的圆环 + 文字
 */

interface ContextUsageIndicatorProps {
	inputTokens: number;
	outputTokens: number;
	/** 上下文窗口上限（默认 200K） */
	contextLimit?: number;
}

/** 格式化 token 数量 */
function formatTokens(count: number): string {
	if (count < 1000) return String(count);
	if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
	return `${(count / 1_000_000).toFixed(2)}M`;
}

/** 计算使用率并返回颜色 */
function getUsageColor(ratio: number): {
	stroke: string;
	text: string;
} {
	if (ratio < 0.5) {
		return { stroke: "#10b981", text: "text-emerald-500" };
	}
	if (ratio < 0.8) {
		return { stroke: "#D96C46", text: "text-[#D96C46]" };
	}
	return { stroke: "#ef4444", text: "text-red-500" };
}

export function ContextUsageIndicator({
	inputTokens,
	outputTokens,
	contextLimit = 200_000,
}: ContextUsageIndicatorProps) {
	const totalTokens = inputTokens + outputTokens;
	if (totalTokens === 0) return null;

	const ratio = Math.min(totalTokens / contextLimit, 1);
	const { stroke, text } = getUsageColor(ratio);

	// SVG 圆环参数
	const size = 16;
	const strokeWidth = 2;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;
	const dashOffset = circumference * (1 - ratio);

	return (
		<span className="inline-flex items-center gap-1" title={`上下文: ${formatTokens(totalTokens)} / ${formatTokens(contextLimit)}`}>
			{/* 圆环 */}
			<svg width={size} height={size} className="shrink-0 -rotate-90">
				{/* 背景圆 */}
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke="currentColor"
					className="text-zinc-200 dark:text-zinc-700"
					strokeWidth={strokeWidth}
				/>
				{/* 进度圆 */}
				<circle
					cx={size / 2}
					cy={size / 2}
					r={radius}
					fill="none"
					stroke={stroke}
					strokeWidth={strokeWidth}
					strokeDasharray={circumference}
					strokeDashoffset={dashOffset}
					strokeLinecap="round"
					className="transition-all duration-300"
				/>
			</svg>
			{/* 文字 */}
			<span className={`text-[10px] tabular-nums ${text}`}>
				{formatTokens(totalTokens)}
			</span>
		</span>
	);
}
