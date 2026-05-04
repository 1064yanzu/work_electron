// Token 消耗显示组件
// 显示格式: Tokens: 总数 ↑输入 ↓输出 [cache信息] [费用]

interface TokenDisplayProps {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	costUsd?: number;
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
	cacheReadInputTokens,
	cacheCreationInputTokens,
	costUsd,
	className = "",
}: TokenDisplayProps) {
	// 如果没有 token 数据，不显示
	if (totalTokens === 0) {
		return null;
	}

	const hasCacheInfo =
		(cacheReadInputTokens && cacheReadInputTokens > 0) ||
		(cacheCreationInputTokens && cacheCreationInputTokens > 0);

	return (
		<div
			className={`flex items-center gap-1.5 text-xs text-text-muted select-none flex-wrap ${className}`}
		>
			<span className="opacity-60">Tokens:</span>
			<span className="font-mono">{formatTokenCount(totalTokens)}</span>
			<span className="text-success/70 font-mono">
				↑{formatTokenCount(promptTokens)}
			</span>
			<span className="text-orange-500/70 font-mono">
				↓{formatTokenCount(completionTokens)}
			</span>
			{hasCacheInfo && (
				<span className="text-text-light/70 font-mono">
					{cacheReadInputTokens && cacheReadInputTokens > 0
						? `cache ${formatTokenCount(cacheReadInputTokens)}`
						: null}
					{cacheCreationInputTokens && cacheCreationInputTokens > 0
						? ` +${formatTokenCount(cacheCreationInputTokens)}`
						: null}
				</span>
			)}
			{costUsd !== undefined && costUsd > 0 && (
				<span className="text-violet-400/70 font-mono">
					${costUsd < 0.01 ? costUsd.toFixed(4) : costUsd.toFixed(2)}
				</span>
			)}
		</div>
	);
}
