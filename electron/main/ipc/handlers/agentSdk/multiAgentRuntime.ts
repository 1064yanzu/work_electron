type MultiAgentMode = "subagent_only" | "hybrid" | "teammate_preferred";
type TeammateMode = "auto" | "tmux" | "in-process";

export type MultiAgentRuntime = {
	experimentalEnabled: boolean;
	multiAgentMode: MultiAgentMode;
	maxTeammates: number;
	teammateMode: TeammateMode;
	teammateBudget: {
		maxTurns: number;
		maxThinkingTokens: number;
		maxBudgetUsd?: number;
	};
	teamId: string;
	leaderRunId: string;
	parentSessionId?: string;
	agentRole: "leader";
	leaderSummaryModel?: string;
	teammateExecutionModel?: string;
	useDelegateMode: boolean;
};

function normalizeNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function normalizeText(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const normalized = value.trim();
	return normalized || undefined;
}

export function normalizeMultiAgentMode(value: unknown): MultiAgentMode {
	return value === "subagent_only" || value === "teammate_preferred"
		? value
		: "hybrid";
}

export function normalizeTeammateMode(value: unknown): TeammateMode {
	return value === "tmux" || value === "in-process" ? value : "auto";
}

export function buildMultiAgentRuntime(input: {
	runId: string;
	resumeSessionId?: string;
	experimentalMultiAgent?: unknown;
	multiAgentMode?: unknown;
	maxTeammates?: unknown;
	teammateMode?: unknown;
	teammateBudget?: unknown;
	leaderSummaryModel?: unknown;
	teammateExecutionModel?: unknown;
}): MultiAgentRuntime {
	const experimentalEnabled = input.experimentalMultiAgent === true;
	const multiAgentMode = normalizeMultiAgentMode(input.multiAgentMode);
	const maxTeammates = Math.max(
		1,
		Math.min(8, Math.floor(normalizeNumber(input.maxTeammates) ?? 2)),
	);
	const teammateMode = normalizeTeammateMode(input.teammateMode);
	const rawBudget =
		input.teammateBudget && typeof input.teammateBudget === "object"
			? (input.teammateBudget as Record<string, unknown>)
			: {};
	const teammateBudget = {
		maxTurns: Math.max(
			1,
			Math.floor(
				normalizeNumber(rawBudget.max_turns ?? rawBudget.maxTurns) ?? 12,
			),
		),
		maxThinkingTokens: Math.max(
			256,
			Math.floor(
				normalizeNumber(
					rawBudget.max_thinking_tokens ?? rawBudget.maxThinkingTokens,
				) ?? 4096,
			),
		),
		maxBudgetUsd: normalizeNumber(
			rawBudget.max_budget_usd ?? rawBudget.maxBudgetUsd,
		),
	};
	const teamId = `${input.runId}-team`;

	return {
		experimentalEnabled,
		multiAgentMode,
		maxTeammates,
		teammateMode,
		teammateBudget,
		teamId,
		leaderRunId: input.runId,
		parentSessionId: normalizeText(input.resumeSessionId),
		agentRole: "leader",
		leaderSummaryModel: normalizeText(input.leaderSummaryModel),
		teammateExecutionModel: normalizeText(input.teammateExecutionModel),
		useDelegateMode:
			experimentalEnabled && multiAgentMode === "teammate_preferred",
	};
}

function trimInline(text: string, maxChars: number): string {
	const normalized = String(text || "")
		.replace(/\s+/g, " ")
		.trim();
	if (!normalized) return "";
	return normalized.length > maxChars
		? `${normalized.slice(0, maxChars)}...`
		: normalized;
}

export function buildStableTaskSpine(input: {
	prompt: string;
	systemPrompt?: string;
	contextPolicy: "balanced" | "strict" | "aggressive";
	subagentContextMode: "capsule" | "inherit";
	runtime: MultiAgentRuntime;
}): string {
	const lines = [
		`任务目标：${trimInline(input.prompt, 800)}`,
		`上下文策略：${input.contextPolicy}`,
		`子代理上下文：${input.subagentContextMode}`,
	];
	if (input.runtime.experimentalEnabled) {
		lines.push(
			`多 Agent：enabled=${input.runtime.experimentalEnabled}, mode=${input.runtime.multiAgentMode}, max_teammates=${input.runtime.maxTeammates}, teammate_mode=${input.runtime.teammateMode}`,
		);
	}
	if (input.runtime.leaderSummaryModel) {
		lines.push(`leader_summary_model：${input.runtime.leaderSummaryModel}`);
	}
	if (input.runtime.teammateExecutionModel) {
		lines.push(
			`teammate_execution_model：${input.runtime.teammateExecutionModel}`,
		);
	}
	if (input.systemPrompt) {
		lines.push(`系统约束摘录：${trimInline(input.systemPrompt, 600)}`);
	}
	return lines.join("\n");
}

export function buildSubagentCapsuleContext(input: {
	prompt: string;
	runtime: MultiAgentRuntime;
}): string {
	const lines = [
		`主任务摘要：${trimInline(input.prompt, 500)}`,
		"你是协作单元，只接收最小必要上下文。",
		"请只返回结构化结果：summary / key_facts / artifacts / next_actions。",
		"不要回传整段原文 transcript，也不要重复主代理已知背景。",
	];
	if (input.runtime.teammateExecutionModel) {
		lines.push(`推荐执行模型：${input.runtime.teammateExecutionModel}`);
	}
	return lines.join("\n");
}

export function buildLeaderCollaborationPrompt(input: {
	runtime: MultiAgentRuntime;
}): string {
	if (!input.runtime.experimentalEnabled) return "";
	const lines = [
		"## 多 Agent 协作策略",
		`当前协作模式：${input.runtime.multiAgentMode}`,
		`最多并发 teammates：${input.runtime.maxTeammates}`,
		`teammate 运行模式：${input.runtime.teammateMode}`,
		"优先把任务拆成清晰 brief，只传最小上下文 capsule。",
		"子代理或 teammate 返回时，只吸收 summary / key_facts / artifacts / next_actions。",
		"如果 Teammate 不可用、失败或当前环境不支持，立即回退到 Task 子代理，不要卡住主流程。",
	];
	if (input.runtime.useDelegateMode) {
		lines.push("当前 leader 处于 delegate 优先模式，应以编排和汇总为主。");
	}
	return lines.join("\n");
}

export function buildRuntimeMetadata(
	runtime: MultiAgentRuntime,
): Record<string, unknown> {
	return {
		agentRole: runtime.agentRole,
		teamId: runtime.teamId,
		leaderRunId: runtime.leaderRunId,
		parentSessionId: runtime.parentSessionId,
		teammateMode: runtime.teammateMode,
		delegationMode: runtime.multiAgentMode,
		experimentalMultiAgent: runtime.experimentalEnabled,
		maxTeammates: runtime.maxTeammates,
	};
}
