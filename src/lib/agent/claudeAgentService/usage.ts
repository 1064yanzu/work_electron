import type { AgentUsageStats } from "./types";

export function parseUsageStatsFromResult(
	resultAny: any,
): AgentUsageStats | undefined {
	const usageAny = resultAny?.usage;
	const toFiniteNumber = (v: unknown): number | null => {
		const n =
			typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
		return Number.isFinite(n) ? n : null;
	};
	const promptTokens =
		toFiniteNumber(usageAny?.prompt_tokens) ??
		toFiniteNumber(usageAny?.input_tokens) ??
		toFiniteNumber(usageAny?.inputTokens) ??
		null;
	const completionTokens =
		toFiniteNumber(usageAny?.completion_tokens) ??
		toFiniteNumber(usageAny?.output_tokens) ??
		toFiniteNumber(usageAny?.outputTokens) ??
		null;
	const cacheReadInputTokens =
		toFiniteNumber(usageAny?.cache_read_input_tokens) ??
		toFiniteNumber(usageAny?.cacheReadInputTokens) ??
		null;
	const cacheCreationInputTokens =
		toFiniteNumber(usageAny?.cache_creation_input_tokens) ??
		toFiniteNumber(usageAny?.cacheCreationInputTokens) ??
		null;
	const costUsd =
		toFiniteNumber(resultAny?.total_cost_usd) ??
		toFiniteNumber(resultAny?.totalCostUsd) ??
		null;
	return promptTokens !== null && completionTokens !== null
		? {
				promptTokens,
				completionTokens,
				totalTokens: promptTokens + completionTokens,
				cacheReadInputTokens:
					cacheReadInputTokens !== null ? cacheReadInputTokens : undefined,
				cacheCreationInputTokens:
					cacheCreationInputTokens !== null
						? cacheCreationInputTokens
						: undefined,
				costUsd: costUsd !== null ? costUsd : undefined,
				modelUsage:
					resultAny?.modelUsage && typeof resultAny.modelUsage === "object"
						? resultAny.modelUsage
						: undefined,
			}
		: undefined;
}
