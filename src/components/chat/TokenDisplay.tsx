// Token 消耗显示组件 - 参考 Cherry Studio 样式
// 显示格式: Tokens: 总数 ↑输入 ↓输出

interface TokenDisplayProps {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	className?: string;
}

/**
 * 格式化数字显示，超过1000时使用k表示
 */
function formatTokenCount(count: number): string {
	if (count >= 100000) {
		return `${(count / 1000).toFixed(0)}k`;
	}
	if (count >= 10000) {
		return `${(count / 1000).toFixed(1)}k`;
	}
	return count.toLocaleString();
}

export function TokenDisplay({
	promptTokens,
	completionTokens,
	totalTokens,
	className = "",
}: TokenDisplayProps) {
	// 如果没有 token 数据，不显示
	if (totalTokens === 0) {
		return null;
	}

	return (
		<div
			className={`flex items-center gap-1.5 text-xs text-text-muted select-none ${className}`}
		>
			<span className="opacity-60">Tokens:</span>
			<span className="font-mono">{formatTokenCount(totalTokens)}</span>
			<span className="text-emerald-500/70 font-mono">
				↑{formatTokenCount(promptTokens)}
			</span>
			<span className="text-orange-500/70 font-mono">
				↓{formatTokenCount(completionTokens)}
			</span>
		</div>
	);
}
