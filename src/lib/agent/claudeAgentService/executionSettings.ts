import {
	buildPlanExecutionPrompt,
	buildPlanModeSystemPrompt,
	PLAN_MODE_ALLOWED_TOOLS,
} from "@/lib/agent/planModePrompt";
import { getConfig } from "@/lib/config";
import type { ThinkingLevel } from "@/lib/models/agentModelConfig";
import type { ClaudeAgentExecutionOptions } from "./types";

/**
 * 完整的 Claude Code 内置工具清单（与 SDK 0.2.x 的 sdk-tools.d.ts 对齐）。
 *
 * 默认对话流不传 `allowed_tools`，让主进程走 SDK 的
 * `{ type: "preset", preset: "claude_code" }`，自动获得这一整套工具。
 * 这里保留显式裁剪只用于：
 *  - Plan 模式（用 PLAN_MODE_ALLOWED_TOOLS 限制为只读）
 */
function buildAllowedTools(): string[] | undefined {
	// 普通对话流不再显式传 allowed_tools，让主进程走 SDK 的
	// { type: "preset", preset: "claude_code" }，得到完整 Claude Code 工具集。
	return undefined;
}

export function resolveMcpServerLimitByToolSearchMode(
	mode: "auto" | "auto:5" | "true" | "false",
): number | undefined {
	if (mode === "false") return 0;
	if (mode === "true") return undefined;
	if (mode === "auto") return 5;
	const matched = /^auto:(\d+)$/.exec(mode);
	if (matched) {
		const parsed = Number(matched[1]);
		if (Number.isFinite(parsed)) return Math.max(1, Math.floor(parsed));
	}
	return 5;
}

export interface ResolvedExecutionSettings {
	permissionModeForRun: string;
	interactiveApprovalForRun: boolean;
	mergedAdditionalDirectories: string[];
	mergedPlugins: Array<{ type: "local"; path: string }>;
	resolvedMaxTurns: number | undefined;
	resolvedThinkingLevel: ThinkingLevel | undefined;
	resolvedMaxBudgetUsd: number | undefined;
	resolvedSettingSources: Array<"user" | "project" | "local">;
	resolvedBetas: string[];
	resolvedContextPolicy: "balanced" | "strict" | "aggressive";
	resolvedSubagentContextMode: "capsule" | "inherit";
	resolvedContextBudget: {
		max_context_chars: number;
		max_files: number;
		max_file_chars: number;
	};
	resolvedEnableToolSearch: "auto" | "auto:5" | "true" | "false";
	resolvedAllowedTools: string[] | undefined;
	resolvedMcpServerLimit: number | undefined;
	resolvedSystemPrompt: string | undefined;
}

export async function resolveExecutionSettings(
	options: ClaudeAgentExecutionOptions,
	isClaudeModel: boolean,
): Promise<ResolvedExecutionSettings> {
	const {
		systemPrompt,
		maxTurns,
		thinkingLevel,
		maxBudgetUsd,
		settingSources,
		betas,
		contextPolicy,
		subagentContextMode,
		contextBudget,
		enableToolSearch,
		additionalDirectories,
		plugins,
		interactiveApproval,
		permissionMode: explicitPermissionMode,
		planMode,
		confirmedPlan,
	} = options;

	const [
		configInteractiveApproval,
		configPermissionMode,
		configAdditionalDirs,
		configPluginPaths,
		configCompatMode,
		configMaxTurns,
		configMaxBudgetUsd,
		configSettingSources,
		configBetas,
		configContextPolicy,
		configSubagentContextMode,
		configContextBudget,
		configEnableToolSearch,
	] = await Promise.all([
		getConfig("agent.sdk.interactive_approval_enabled").catch(() => null),
		getConfig("agent.sdk.default_permission_mode").catch(() => null),
		getConfig("agent.sdk.additional_directories").catch(() => null),
		getConfig("agent.sdk.plugin_paths").catch(() => null),
		getConfig("agent.sdk.compat_mode").catch(() => null),
		getConfig("agent.sdk.max_turns").catch(() => null),
		getConfig("agent.sdk.max_budget_usd").catch(() => null),
		getConfig("agent.sdk.setting_sources").catch(() => null),
		getConfig("agent.sdk.betas").catch(() => null),
		getConfig("agent.sdk.context_policy").catch(() => null),
		getConfig("agent.sdk.subagent_context_mode").catch(() => null),
		getConfig("agent.sdk.context_budget").catch(() => null),
		getConfig("agent.sdk.enable_tool_search").catch(() => null),
	]);
	const parseStringArray = (value: unknown): string[] =>
		Array.isArray(value)
			? value.filter((v): v is string => typeof v === "string")
			: [];
	const parseNumber = (value: unknown): number | undefined => {
		if (typeof value === "number" && Number.isFinite(value)) return value;
		if (typeof value === "string" && value.trim()) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
		return undefined;
	};
	const normalizeSettingSources = (
		value: unknown,
	): Array<"user" | "project" | "local"> => {
		const allowed = new Set(["user", "project", "local"]);
		const arr = Array.isArray(value)
			? value
			: typeof value === "string"
				? value.split(/[,\s]+/g)
				: [];
		const out: Array<"user" | "project" | "local"> = [];
		for (const item of arr) {
			const s = String(item || "").trim() as "user" | "project" | "local";
			if (!allowed.has(s)) continue;
			if (!out.includes(s)) out.push(s);
		}
		return out.length > 0 ? out : ["user", "project"];
	};
	const sdkAdditionalDirectories = parseStringArray(configAdditionalDirs);
	const sdkPluginsFromConfig = parseStringArray(configPluginPaths).map(
		(pluginPath) => ({
			type: "local" as const,
			path: pluginPath,
		}),
	);
	const resolvedInteractiveApproval =
		typeof interactiveApproval === "boolean"
			? interactiveApproval
			: typeof configInteractiveApproval === "boolean"
				? configInteractiveApproval
				: true;
	const resolvedPermissionMode =
		typeof explicitPermissionMode === "string" &&
		explicitPermissionMode.trim().length > 0
			? explicitPermissionMode.trim()
			: typeof configPermissionMode === "string" &&
					configPermissionMode.trim().length > 0
				? configPermissionMode.trim()
				: "default";
	const compatModeEnabled = configCompatMode === true;
	const permissionModeForRun = compatModeEnabled
		? "acceptEdits"
		: resolvedPermissionMode;
	const interactiveApprovalForRun = compatModeEnabled
		? false
		: resolvedInteractiveApproval;
	const mergedAdditionalDirectories = Array.from(
		new Set(
			[
				...sdkAdditionalDirectories,
				...(Array.isArray(additionalDirectories) ? additionalDirectories : []),
			].filter((item) => typeof item === "string" && item.trim().length > 0),
		),
	);
	const mergedPlugins = Array.from(
		new Map(
			[...sdkPluginsFromConfig, ...(Array.isArray(plugins) ? plugins : [])]
				.filter(
					(item): item is { type: "local"; path: string } =>
						!!item &&
						item.type === "local" &&
						typeof item.path === "string" &&
						item.path.trim().length > 0,
				)
				.map((item) => [item.path, item] as const),
		).values(),
	);
	const resolvedMaxTurns = parseNumber(maxTurns) ?? parseNumber(configMaxTurns);
	const resolvedThinkingLevel = thinkingLevel;
	const resolvedMaxBudgetUsd =
		parseNumber(maxBudgetUsd) ?? parseNumber(configMaxBudgetUsd);
	const resolvedSettingSources = normalizeSettingSources(
		settingSources || configSettingSources,
	);
	const resolvedBetas = Array.from(
		new Set(
			parseStringArray(Array.isArray(betas) ? betas : configBetas).map((item) =>
				item.trim(),
			),
		),
	).filter(Boolean);
	const resolvedContextPolicy =
		(contextPolicy ||
			(typeof configContextPolicy === "string" ? configContextPolicy : "")) ===
		"strict"
			? "strict"
			: (contextPolicy ||
						(typeof configContextPolicy === "string"
							? configContextPolicy
							: "")) === "aggressive"
				? "aggressive"
				: "balanced";
	const resolvedSubagentContextMode =
		(subagentContextMode ||
			(typeof configSubagentContextMode === "string"
				? configSubagentContextMode
				: "")) === "inherit"
			? "inherit"
			: "capsule";
	const contextBudgetRaw =
		contextBudget && typeof contextBudget === "object"
			? contextBudget
			: configContextBudget && typeof configContextBudget === "object"
				? (configContextBudget as Record<string, unknown>)
				: {};
	const resolvedContextBudget = {
		max_context_chars: Math.max(
			1000,
			Math.floor(
				parseNumber((contextBudgetRaw as any).max_context_chars) ?? 16000,
			),
		),
		max_files: Math.max(
			1,
			Math.floor(parseNumber((contextBudgetRaw as any).max_files) ?? 12),
		),
		max_file_chars: Math.max(
			500,
			Math.floor(parseNumber((contextBudgetRaw as any).max_file_chars) ?? 6000),
		),
	};
	const resolvedEnableToolSearch =
		enableToolSearch ||
		(typeof configEnableToolSearch === "string"
			? (configEnableToolSearch as "auto" | "auto:5" | "true" | "false")
			: "false");
	const resolvedAllowedTools: string[] | undefined = planMode
		? [...PLAN_MODE_ALLOWED_TOOLS]
		: buildAllowedTools();
	const resolvedMcpServerLimit = resolveMcpServerLimitByToolSearchMode(
		resolvedEnableToolSearch,
	);

	// 规划模式：构建最终 system prompt
	const resolvedSystemPrompt = (() => {
		const parts: string[] = [];
		if (systemPrompt) parts.push(systemPrompt);
		if (!isClaudeModel && resolvedThinkingLevel === undefined) {
			parts.push(
				"当前运行的不是 Claude 系列模型。请减少隐藏思考，优先尽快进入工具调用或直接输出可执行内容；如长时间停留在 reasoning/thinking 通道，说明该模型与 Claude Agent SDK 的兼容性一般。",
			);
		}
		if (planMode) {
			parts.push(buildPlanModeSystemPrompt());
		}
		if (confirmedPlan) {
			parts.push(buildPlanExecutionPrompt(confirmedPlan));
		}
		return parts.length > 0 ? parts.join("\n\n") : undefined;
	})();

	return {
		permissionModeForRun,
		interactiveApprovalForRun,
		mergedAdditionalDirectories,
		mergedPlugins,
		resolvedMaxTurns,
		resolvedThinkingLevel,
		resolvedMaxBudgetUsd,
		resolvedSettingSources,
		resolvedBetas,
		resolvedContextPolicy,
		resolvedSubagentContextMode,
		resolvedContextBudget,
		resolvedEnableToolSearch,
		resolvedAllowedTools,
		resolvedMcpServerLimit,
		resolvedSystemPrompt,
	};
}
