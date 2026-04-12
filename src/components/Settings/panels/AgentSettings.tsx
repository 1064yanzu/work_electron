import {
	Cog,
	Clock,
	Database,
	Loader2,
	RotateCcw,
	Shield,
	ShieldAlert,
	ShieldCheck,
	Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAgentChatSettingsStore } from "../../../lib/agent/chatSettingsStore";
import { usePermissionStore } from "../../../lib/agent/permissionStore";
import {
	DEFAULT_PERMISSION_POLICY,
	getToolRiskLevels,
	type PermissionMode,
	resetToolRiskLevels,
	setToolRiskLevel,
	TOOL_NAMES,
	type ToolRiskLevel,
	type ToolType,
} from "../../../lib/agent/types";
import {
	type KbEmbeddingStats,
	kbEmbeddingsRebuild,
	kbGetEmbeddingStats,
} from "../../../lib/api";
import { getConfig, setConfig } from "../../../lib/config";
import { useAgentModelSettingsStore } from "../../../lib/models/agentModelSettingsStore";
import { useSettingsStore } from "../../../lib/settingsStore";
import { toast } from "../../ui/Toast";
import { Select } from "../../ui/Select";
import { useSettingsExperience } from "../context/SettingsExperienceContext";
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import { SettingsPageContainer } from "../ui/SettingsPrimitives";
import { Toggle } from "../components";
import { AgentModelScenarioSettings } from "../components/AgentModelScenarioSettings";

const RISK_LEVEL_CONFIG: Record<
	ToolRiskLevel,
	{ label: string; icon: React.ElementType; color: string }
> = {
	L0: { label: "低风险", icon: ShieldCheck, color: "text-emerald-600" },
	L1: { label: "中风险", icon: Shield, color: "text-amber-600" },
	L2: { label: "高风险", icon: ShieldAlert, color: "text-red-600" },
};

const PERMISSION_MODE_OPTIONS: { value: PermissionMode; label: string }[] = [
	{ value: "auto_approve", label: "自动批准" },
	{ value: "ask", label: "每次询问" },
	{ value: "deny", label: "默认拒绝" },
];

const RETRIEVAL_MODE_OPTIONS = [
	{ value: "fts" as const, label: "FTS/LIKE", desc: "传统全文检索，稳定可靠" },
	{
		value: "vector" as const,
		label: "向量检索",
		desc: "语义相似度匹配，需配置模型",
	},
	{
		value: "hybrid" as const,
		label: "混合模式",
		desc: "向量优先，FTS 补充（推荐）",
	},
];

export function AgentSettings() {
	const { showTechnicalSummaries } = useSettingsExperience();
	const { policy, updatePolicy, clearSessionRemembered } = usePermissionStore();
	const { providers } = useSettingsStore();
	const { settings: modelSettings, store: modelSettingsStore } =
		useAgentModelSettingsStore();
	const { settings: chatSettings, agentChatSettingsStore } =
		useAgentChatSettingsStore();
	const [toolRiskLevels, setToolRiskLevelsState] = useState<
		Record<ToolType, ToolRiskLevel>
	>(() => getToolRiskLevels());

	// 组件挂载时加载风险等级
	useEffect(() => {
		setToolRiskLevelsState(getToolRiskLevels());
	}, []);

	const allModels = useMemo(
		() =>
			providers
				.filter((p) => p.isEnabled)
				.flatMap((p) => p.models.map((m) => ({ id: m, provider: p.name }))),
		[providers],
	);

	const [kbRetrievalMode, setKbRetrievalMode] = useState<
		"fts" | "vector" | "hybrid"
	>("fts");
	const [kbEmbeddingModel, setKbEmbeddingModel] = useState<string>("");
	const [kbStats, setKbStats] = useState<KbEmbeddingStats | null>(null);
	const [isRebuilding, setIsRebuilding] = useState(false);
	const [autoHint, setAutoHint] = useState<string>("");
	const [kbEmbeddingFallbackConcurrency, setKbEmbeddingFallbackConcurrency] =
		useState<number>(4);
	const [kbVectorMinScore, setKbVectorMinScore] = useState<number>(0.2);
	const [kbEmbeddingMaxChars, setKbEmbeddingMaxChars] = useState<number>(480);
	const [replayLimitDraft, setReplayLimitDraft] = useState<string>(
		String(chatSettings.replayLimit),
	);
	const [sdkInteractiveApproval, setSdkInteractiveApproval] =
		useState<boolean>(true);
	const [sdkPermissionMode, setSdkPermissionMode] = useState<string>("default");
	const [sdkCompatMode, setSdkCompatMode] = useState<boolean>(false);
	const [sdkPluginPathsDraft, setSdkPluginPathsDraft] = useState<string>("");
	const [sdkAdditionalDirsDraft, setSdkAdditionalDirsDraft] =
		useState<string>("");

	useEffect(() => {
		setReplayLimitDraft(String(chatSettings.replayLimit));
	}, [chatSettings.replayLimit]);

	useEffect(() => {
		const loadSdkSettings = async () => {
			try {
				const [
					interactiveApproval,
					permissionMode,
					compatMode,
					pluginPaths,
					additionalDirs,
				] = await Promise.all([
					getConfig("agent.sdk.interactive_approval_enabled"),
					getConfig("agent.sdk.default_permission_mode"),
					getConfig("agent.sdk.compat_mode"),
					getConfig("agent.sdk.plugin_paths"),
					getConfig("agent.sdk.additional_directories"),
				]);
				setSdkInteractiveApproval(
					typeof interactiveApproval === "boolean" ? interactiveApproval : true,
				);
				setSdkPermissionMode(
					typeof permissionMode === "string" && permissionMode.trim()
						? permissionMode
						: "default",
				);
				setSdkCompatMode(compatMode === true);
				setSdkPluginPathsDraft(
					Array.isArray(pluginPaths)
						? pluginPaths
								.filter((item): item is string => typeof item === "string")
								.join("\n")
						: "",
				);
				setSdkAdditionalDirsDraft(
					Array.isArray(additionalDirs)
						? additionalDirs
								.filter((item): item is string => typeof item === "string")
								.join("\n")
						: "",
				);
			} catch {
				/* ignore */
			}
		};
		loadSdkSettings();
	}, []);

	useEffect(() => {
		const load = async () => {
			try {
				const mode = await getConfig("kb.retrieval_mode");
				const model = await getConfig("kb.embedding_model");
				const fallbackConc = await getConfig(
					"kb.embedding_fallback_concurrency",
				);
				const minScore = await getConfig("kb.vector_min_score");
				const maxChars = await getConfig("kb.embedding_max_chars");

				const m =
					mode === "fts" || mode === "vector" || mode === "hybrid"
						? mode
						: "fts";
				const em = typeof model === "string" ? model : "";
				const fc =
					typeof fallbackConc === "number"
						? fallbackConc
						: typeof fallbackConc === "string"
							? parseInt(fallbackConc) || 4
							: 4;
				const ms =
					typeof minScore === "number"
						? minScore
						: typeof minScore === "string"
							? parseFloat(minScore) || 0.2
							: 0.2;
				const mc =
					typeof maxChars === "number"
						? maxChars
						: typeof maxChars === "string"
							? parseInt(maxChars) || 480
							: 480;

				setKbRetrievalMode(m);
				setKbEmbeddingModel(em);
				setKbEmbeddingFallbackConcurrency(fc);
				setKbVectorMinScore(Math.max(0, Math.min(1, ms)));
				setKbEmbeddingMaxChars(Math.max(32, Math.min(4096, mc)));
				if ((m === "vector" || m === "hybrid") && em) {
					setAutoHint("已开启自动补齐：后台会逐步生成缺失的向量索引");
				}
			} catch {
				/* ignore */
			}
			try {
				setKbStats(await kbGetEmbeddingStats());
			} catch {
				/* ignore */
			}
		};
		load();
	}, []);

	const handleKbModeChange = async (mode: "fts" | "vector" | "hybrid") => {
		setKbRetrievalMode(mode);
		try {
			await setConfig("kb.retrieval_mode", mode);
		} catch {
			/* ignore */
		}
		try {
			setKbStats(await kbGetEmbeddingStats());
		} catch {
			/* ignore */
		}
		if ((mode === "vector" || mode === "hybrid") && kbEmbeddingModel) {
			setAutoHint("已开启自动补齐：后台会逐步生成缺失的向量索引");
		} else {
			setAutoHint("");
		}
	};

	const handleKbEmbeddingModelChange = async (model: string) => {
		setKbEmbeddingModel(model);
		try {
			await setConfig("kb.embedding_model", model);
			setKbStats(await kbGetEmbeddingStats());
		} catch {
			/* ignore */
		}
		if (
			model &&
			(kbRetrievalMode === "vector" || kbRetrievalMode === "hybrid")
		) {
			setAutoHint("已开启自动补齐：后台会逐步生成缺失的向量索引");
		} else {
			setAutoHint("");
		}
	};

	const handleKbRebuild = async () => {
		if (!kbEmbeddingModel) {
			toast.warning("请先选择 Embedding 模型");
			return;
		}
		setIsRebuilding(true);
		try {
			const rebuilt = await kbEmbeddingsRebuild({
				embedding_model: kbEmbeddingModel,
				force: false,
				batch_size: 32,
			});
			setKbStats(await kbGetEmbeddingStats());
			toast.success(`已生成/更新 ${rebuilt} 条分块向量索引`);
		} catch (e) {
			toast.error(`重建失败: ${e}`);
		} finally {
			setIsRebuilding(false);
		}
	};

	const handleKbFallbackConcurrencyChange = async (val: number) => {
		const v = Math.max(1, Math.min(16, val));
		setKbEmbeddingFallbackConcurrency(v);
		try {
			await setConfig("kb.embedding_fallback_concurrency", v);
		} catch {
			/* ignore */
		}
	};

	const handleKbVectorMinScoreChange = async (val: number) => {
		const v = Math.max(0, Math.min(1, val));
		setKbVectorMinScore(v);
		try {
			await setConfig("kb.vector_min_score", v);
		} catch {
			/* ignore */
		}
	};

	const handleKbEmbeddingMaxCharsChange = async (val: number) => {
		const v = Math.max(32, Math.min(4096, val));
		setKbEmbeddingMaxChars(v);
		try {
			await setConfig("kb.embedding_max_chars", v);
		} catch {
			/* ignore */
		}
	};

	const handleLevelPolicyChange = (
		level: ToolRiskLevel,
		mode: PermissionMode,
	) => {
		updatePolicy({ levelPolicies: { ...policy.levelPolicies, [level]: mode } });
	};

	const handleTimeoutChange = (seconds: number) => {
		updatePolicy({ timeoutSeconds: Math.max(5, Math.min(120, seconds)) });
	};

	const handleResetToDefault = () => {
		updatePolicy(DEFAULT_PERMISSION_POLICY);
		clearSessionRemembered();
		resetToolRiskLevels();
		setToolRiskLevelsState(getToolRiskLevels());
	};

	const handleToolRiskLevelChange = (
		toolType: ToolType,
		riskLevel: ToolRiskLevel,
	) => {
		setToolRiskLevel(toolType, riskLevel);
		// 立即更新状态，确保 UI 响应
		setToolRiskLevelsState((prev) => ({
			...prev,
			[toolType]: riskLevel,
		}));
	};

	const commitReplayLimit = async () => {
		const next =
			replayLimitDraft.trim() === "" ? 0 : parseInt(replayLimitDraft, 10);
		await agentChatSettingsStore.setReplayLimit(
			Number.isFinite(next) ? next : 0,
		);
	};

	const parseLines = (value: string) =>
		value
			.split(/\n+/g)
			.map((item) => item.trim())
			.filter(Boolean);

	const saveSdkInteractiveApproval = async (enabled: boolean) => {
		setSdkInteractiveApproval(enabled);
		await setConfig("agent.sdk.interactive_approval_enabled", enabled);
	};

	const saveSdkPermissionMode = async (mode: string) => {
		setSdkPermissionMode(mode);
		await setConfig("agent.sdk.default_permission_mode", mode);
	};

	const saveSdkCompatMode = async (enabled: boolean) => {
		setSdkCompatMode(enabled);
		await setConfig("agent.sdk.compat_mode", enabled);
	};

	const saveSdkPluginPaths = async () => {
		await setConfig("agent.sdk.plugin_paths", parseLines(sdkPluginPathsDraft));
	};

	const saveSdkAdditionalDirs = async () => {
		await setConfig(
			"agent.sdk.additional_directories",
			parseLines(sdkAdditionalDirsDraft),
		);
	};
	const contextRuntime = modelSettings.contextRuntime || {
		contextPolicy: "balanced" as const,
		subagentContextMode: "capsule" as const,
		maxTurns: 24,
		maxThinkingTokens: 8192,
		maxBudgetUsd: undefined as number | undefined,
		settingSources: ["user", "project"] as Array<"user" | "project" | "local">,
		enableToolSearch: "auto:5" as const,
		contextBudget: {
			maxContextChars: 16000,
			maxFiles: 12,
			maxFileChars: 6000,
		},
		betas: [] as string[],
		experimentalMultiAgentEnabled: false,
		multiAgentMode: "hybrid" as const,
		maxTeammates: 2,
		teammateMode: "auto" as const,
		teammateBudget: {
			maxTurns: 12,
			maxThinkingTokens: 4096,
			maxBudgetUsd: undefined as number | undefined,
		},
		leaderSummaryModel: "" as string | undefined,
		teammateExecutionModel: "" as string | undefined,
	};

	const saveContextRuntime = async (
		patch: Partial<
			Omit<typeof contextRuntime, "contextBudget" | "teammateBudget">
		> & {
			contextBudget?: Partial<typeof contextRuntime.contextBudget>;
			teammateBudget?: Partial<typeof contextRuntime.teammateBudget>;
		},
	): Promise<void> => {
		const next = {
			...contextRuntime,
			...patch,
			contextBudget: {
				...contextRuntime.contextBudget,
				...(patch.contextBudget || {}),
			},
			teammateBudget: {
				...contextRuntime.teammateBudget,
				...(patch.teammateBudget || {}),
			},
		};
		await modelSettingsStore.updateContextRuntime(patch as any);
		await Promise.all([
			setConfig("agent.sdk.context_policy", next.contextPolicy),
			setConfig("agent.sdk.subagent_context_mode", next.subagentContextMode),
			setConfig("agent.sdk.max_turns", next.maxTurns),
			setConfig("agent.sdk.max_thinking_tokens", next.maxThinkingTokens),
			setConfig("agent.sdk.max_budget_usd", next.maxBudgetUsd ?? ""),
			setConfig("agent.sdk.setting_sources", next.settingSources),
			setConfig("agent.sdk.enable_tool_search", next.enableToolSearch),
			setConfig("agent.sdk.context_budget", {
				max_context_chars: next.contextBudget.maxContextChars,
				max_files: next.contextBudget.maxFiles,
				max_file_chars: next.contextBudget.maxFileChars,
			}),
			setConfig("agent.sdk.betas", next.betas),
			setConfig(
				"agent.sdk.experimental_multi_agent_enabled",
				next.experimentalMultiAgentEnabled,
			),
			setConfig("agent.sdk.multi_agent_mode", next.multiAgentMode),
			setConfig("agent.sdk.max_teammates", next.maxTeammates),
			setConfig("agent.sdk.teammate_mode", next.teammateMode),
			setConfig("agent.sdk.teammate_budget", {
				max_turns: next.teammateBudget.maxTurns,
				max_thinking_tokens: next.teammateBudget.maxThinkingTokens,
				max_budget_usd: next.teammateBudget.maxBudgetUsd ?? "",
			}),
			setConfig(
				"agent.sdk.leader_summary_model",
				next.leaderSummaryModel ?? "",
			),
			setConfig(
				"agent.sdk.teammate_execution_model",
				next.teammateExecutionModel ?? "",
			),
		]);
	};

	const enabledScenarioCount = modelSettings.scenarioConfigs.filter(
		(config) => config.enabled,
	).length;
	const permissionModeLabel =
		PERMISSION_MODE_OPTIONS.find(
			(option) => option.value === policy.defaultMode,
		)?.label ?? policy.defaultMode;
	const retrievalModeLabel =
		RETRIEVAL_MODE_OPTIONS.find((option) => option.value === kbRetrievalMode)
			?.label ?? kbRetrievalMode;

	if (showTechnicalSummaries) {
		return (
			<SettingsPageContainer contentClassName="max-w-2xl space-y-6">
				<SettingsPanelHeader
					icon={Cog}
					title="Agent 设置"
					description="Agent 权限、模型场景与检索。"
				/>

				<div className="grid gap-4 sm:grid-cols-2">
					<div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<div className="text-xs text-zinc-500 dark:text-zinc-400">
							默认权限模式
						</div>
						<div className="mt-2 text-lg font-semibold text-text-primary">
							{permissionModeLabel}
						</div>
					</div>
					<div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<div className="text-xs text-zinc-500 dark:text-zinc-400">
							默认模型
						</div>
						<div className="mt-2 text-sm font-semibold text-text-primary break-all">
							{modelSettings.defaultModelId || "尚未指定"}
						</div>
					</div>
					<div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<div className="text-xs text-zinc-500 dark:text-zinc-400">
							已启用场景
						</div>
						<div className="mt-2 text-2xl font-semibold text-text-primary">
							{enabledScenarioCount}
						</div>
					</div>
					<div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
						<div className="text-xs text-zinc-500 dark:text-zinc-400">
							资料检索
						</div>
						<div className="mt-2 text-lg font-semibold text-text-primary">
							{retrievalModeLabel}
						</div>
					</div>
				</div>
			</SettingsPageContainer>
		);
	}

	return (
		<SettingsPageContainer contentClassName="max-w-2xl space-y-8">
			<SettingsPanelHeader
				icon={Cog}
				title="Agent 设置"
				description="模型场景、权限与检索。"
			/>

			{/* 模型场景配置 */}
			<AgentModelScenarioSettings />

			{/* Claude Agent SDK 运行时配置 */}
			<div className="space-y-4">
				<h4 className="font-medium text-text-primary flex items-center gap-2">
					<Cog className="w-4 h-4" />
					Claude Agent SDK
				</h4>
				<div className="space-y-3">
					<div className="flex items-center justify-between gap-3">
						<div>
							<div className="text-sm text-text-primary">交互审批</div>
							<div className="text-xs text-text-muted">
								默认开启。工具调用与 AskUserQuestion 通过 UI 确认。
							</div>
						</div>
						<Toggle
							checked={sdkInteractiveApproval}
							onChange={() =>
								void saveSdkInteractiveApproval(!sdkInteractiveApproval)
							}
						/>
					</div>
					<div className="flex items-center justify-between gap-3">
						<div>
							<div className="text-sm text-text-primary">兼容模式</div>
							<div className="text-xs text-text-muted">
								开启后回退为旧路径（acceptEdits + 关闭交互审批）。
							</div>
						</div>
						<Toggle
							checked={sdkCompatMode}
							onChange={() => void saveSdkCompatMode(!sdkCompatMode)}
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							默认 permission mode
						</label>
						<Select
							value={sdkPermissionMode}
							onChange={(event) => saveSdkPermissionMode(event.target.value)}
							options={[
								{ value: "default", label: "default" },
								{ value: "acceptEdits", label: "acceptEdits" },
								{ value: "dontAsk", label: "dontAsk" },
								{ value: "plan", label: "plan" },
								{ value: "delegate", label: "delegate（多 Agent）" },
							]}
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary">
							插件路径（每行一个）
						</label>
						<textarea
							value={sdkPluginPathsDraft}
							onChange={(event) => setSdkPluginPathsDraft(event.target.value)}
							onBlur={saveSdkPluginPaths}
							placeholder="/abs/path/to/plugin"
							rows={3}
							className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary">
							additionalDirectories（每行一个）
						</label>
						<textarea
							value={sdkAdditionalDirsDraft}
							onChange={(event) =>
								setSdkAdditionalDirsDraft(event.target.value)
							}
							onBlur={saveSdkAdditionalDirs}
							placeholder="/abs/path/to/extra/dir"
							rows={3}
							className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
				</div>
			</div>

			{/* 上下文治理配置 */}
			<div className="space-y-4">
				<h4 className="font-medium text-text-primary flex items-center gap-2">
					<Clock className="w-4 h-4" />
					上下文治理
				</h4>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							context_policy
						</label>
						<Select
							value={contextRuntime.contextPolicy}
							onChange={(event) =>
								void saveContextRuntime({
									contextPolicy: event.target.value as
										| "balanced"
										| "strict"
										| "aggressive",
								})
							}
							options={[
								{ value: "balanced", label: "balanced" },
								{ value: "strict", label: "strict" },
								{ value: "aggressive", label: "aggressive" },
							]}
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							subagent_context_mode
						</label>
						<Select
							value={contextRuntime.subagentContextMode}
							onChange={(event) =>
								void saveContextRuntime({
									subagentContextMode: event.target.value as
										| "capsule"
										| "inherit",
								})
							}
							options={[
								{ value: "capsule", label: "capsule（推荐）" },
								{ value: "inherit", label: "inherit" },
							]}
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							max_turns
						</label>
						<input
							type="number"
							min={1}
							max={200}
							value={contextRuntime.maxTurns}
							onChange={(event) =>
								void saveContextRuntime({
									maxTurns: Math.max(
										1,
										Math.min(200, Number(event.target.value) || 24),
									),
								})
							}
							className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							max_thinking_tokens
						</label>
						<input
							type="number"
							min={256}
							max={131072}
							step={256}
							value={contextRuntime.maxThinkingTokens}
							onChange={(event) =>
								void saveContextRuntime({
									maxThinkingTokens: Math.max(
										256,
										Math.min(131072, Number(event.target.value) || 8192),
									),
								})
							}
							className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							max_budget_usd（可空）
						</label>
						<input
							type="number"
							min={0}
							step={0.1}
							value={contextRuntime.maxBudgetUsd ?? ""}
							onChange={(event) =>
								void saveContextRuntime({
									maxBudgetUsd:
										event.target.value.trim() === ""
											? undefined
											: Math.max(0, Number(event.target.value) || 0),
								})
							}
							className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							enable_tool_search
						</label>
						<Select
							value={contextRuntime.enableToolSearch}
							onChange={(event) =>
								void saveContextRuntime({
									enableToolSearch: event.target.value as
										| "auto"
										| "auto:5"
										| "true"
										| "false",
								})
							}
							options={[
								{ value: "auto:5", label: "auto:5（推荐）" },
								{ value: "auto", label: "auto" },
								{ value: "true", label: "true" },
								{ value: "false", label: "false" },
							]}
						/>
					</div>
				</div>
				<div className="space-y-2">
					<div className="text-sm text-text-primary">setting_sources</div>
					<div className="flex flex-wrap gap-3 text-sm text-text-secondary">
						{(["user", "project", "local"] as const).map((source) => {
							const checked = contextRuntime.settingSources.includes(source);
							return (
								<label key={source} className="inline-flex items-center gap-2">
									<input
										type="checkbox"
										checked={checked}
										onChange={(event) => {
											const next = event.target.checked
												? Array.from(
														new Set([...contextRuntime.settingSources, source]),
													)
												: contextRuntime.settingSources.filter(
														(item) => item !== source,
													);
											void saveContextRuntime({
												settingSources:
													next.length > 0 ? next : ["user", "project"],
											});
										}}
									/>
									<span>{source}</span>
								</label>
							);
						})}
					</div>
				</div>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							context_budget.max_context_chars
						</label>
						<input
							type="number"
							min={1000}
							step={500}
							value={contextRuntime.contextBudget.maxContextChars}
							onChange={(event) =>
								void saveContextRuntime({
									contextBudget: {
										maxContextChars: Math.max(
											1000,
											Number(event.target.value) || 16000,
										),
									},
								})
							}
							className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							context_budget.max_files
						</label>
						<input
							type="number"
							min={1}
							max={100}
							value={contextRuntime.contextBudget.maxFiles}
							onChange={(event) =>
								void saveContextRuntime({
									contextBudget: {
										maxFiles: Math.max(1, Number(event.target.value) || 12),
									},
								})
							}
							className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
					<div>
						<label className="text-sm text-text-primary mb-1.5 block">
							context_budget.max_file_chars
						</label>
						<input
							type="number"
							min={500}
							step={100}
							value={contextRuntime.contextBudget.maxFileChars}
							onChange={(event) =>
								void saveContextRuntime({
									contextBudget: {
										maxFileChars: Math.max(
											500,
											Number(event.target.value) || 6000,
										),
									},
								})
							}
							className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
						/>
					</div>
				</div>
				<div className="rounded-2xl border border-border/70 bg-zinc-50/60 dark:bg-zinc-900/30 p-4 space-y-4">
					<div className="flex items-start justify-between gap-4">
						<div>
							<div className="text-sm font-medium text-text-primary flex items-center gap-2">
								<Users className="w-4 h-4" />多 Agent 协作（实验）
							</div>
							<div className="text-xs text-text-muted mt-1">
								开启后允许 leader 结合 Task / Teammate 做编排；Teammate
								失败会自动回退到稳定子代理。
							</div>
						</div>
						<Toggle
							checked={contextRuntime.experimentalMultiAgentEnabled}
							onChange={() =>
								void saveContextRuntime({
									experimentalMultiAgentEnabled:
										!contextRuntime.experimentalMultiAgentEnabled,
								})
							}
						/>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
						<div>
							<label className="text-sm text-text-primary mb-1.5 block">
								multi_agent_mode
							</label>
							<Select
								value={contextRuntime.multiAgentMode}
								onChange={(event) =>
									void saveContextRuntime({
										multiAgentMode: event.target.value as
											| "subagent_only"
											| "hybrid"
											| "teammate_preferred",
									})
								}
								options={[
									{ value: "hybrid", label: "hybrid（推荐）" },
									{ value: "subagent_only", label: "subagent_only" },
									{
										value: "teammate_preferred",
										label: "teammate_preferred",
									},
								]}
							/>
						</div>
						<div>
							<label className="text-sm text-text-primary mb-1.5 block">
								teammate_mode
							</label>
							<Select
								value={contextRuntime.teammateMode}
								onChange={(event) =>
									void saveContextRuntime({
										teammateMode: event.target.value as
											| "auto"
											| "tmux"
											| "in-process",
									})
								}
								options={[
									{ value: "auto", label: "auto（推荐）" },
									{ value: "in-process", label: "in-process" },
									{ value: "tmux", label: "tmux" },
								]}
							/>
						</div>
						<div>
							<label className="text-sm text-text-primary mb-1.5 block">
								max_teammates
							</label>
							<input
								type="number"
								min={1}
								max={8}
								value={contextRuntime.maxTeammates}
								onChange={(event) =>
									void saveContextRuntime({
										maxTeammates: Math.max(
											1,
											Math.min(8, Number(event.target.value) || 2),
										),
									})
								}
								className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
							/>
						</div>
						<div>
							<label className="text-sm text-text-primary mb-1.5 block">
								leader_summary_model（可空）
							</label>
							<input
								type="text"
								value={contextRuntime.leaderSummaryModel ?? ""}
								onChange={(event) =>
									void saveContextRuntime({
										leaderSummaryModel: event.target.value.trim() || undefined,
									})
								}
								placeholder="留空则沿用主模型"
								className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
							/>
						</div>
						<div className="md:col-span-2">
							<label className="text-sm text-text-primary mb-1.5 block">
								teammate_execution_model（可空）
							</label>
							<input
								type="text"
								value={contextRuntime.teammateExecutionModel ?? ""}
								onChange={(event) =>
									void saveContextRuntime({
										teammateExecutionModel:
											event.target.value.trim() || undefined,
									})
								}
								placeholder="例如 claude-sonnet-4-5；留空则由 SDK/场景配置决定"
								className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
							/>
						</div>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
						<div>
							<label className="text-sm text-text-primary mb-1.5 block">
								teammate_budget.max_turns
							</label>
							<input
								type="number"
								min={1}
								max={100}
								value={contextRuntime.teammateBudget.maxTurns}
								onChange={(event) =>
									void saveContextRuntime({
										teammateBudget: {
											maxTurns: Math.max(
												1,
												Math.min(100, Number(event.target.value) || 12),
											),
										},
									})
								}
								className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
							/>
						</div>
						<div>
							<label className="text-sm text-text-primary mb-1.5 block">
								teammate_budget.max_thinking_tokens
							</label>
							<input
								type="number"
								min={256}
								max={65536}
								step={256}
								value={contextRuntime.teammateBudget.maxThinkingTokens}
								onChange={(event) =>
									void saveContextRuntime({
										teammateBudget: {
											maxThinkingTokens: Math.max(
												256,
												Math.min(65536, Number(event.target.value) || 4096),
											),
										},
									})
								}
								className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
							/>
						</div>
						<div>
							<label className="text-sm text-text-primary mb-1.5 block">
								teammate_budget.max_budget_usd（可空）
							</label>
							<input
								type="number"
								min={0}
								step={0.1}
								value={contextRuntime.teammateBudget.maxBudgetUsd ?? ""}
								onChange={(event) =>
									void saveContextRuntime({
										teammateBudget: {
											maxBudgetUsd:
												event.target.value.trim() === ""
													? undefined
													: Math.max(0, Number(event.target.value) || 0),
										},
									})
								}
								className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
							/>
						</div>
					</div>
				</div>
			</div>

			{/* 工具权限策略 */}
			<div className="space-y-4">
				<h4 className="font-medium text-text-primary flex items-center gap-2">
					<Shield className="w-4 h-4" />
					工具权限策略
				</h4>
				<p className="text-xs text-text-muted -mt-2">
					按风险等级配置工具调用的默认权限。低风险（L0）为纯读取操作，中风险（L1）涉及网络请求，高风险（L2）可能修改系统状态。
				</p>
				<div className="space-y-3">
					{(["L0", "L1", "L2"] as ToolRiskLevel[]).map((level) => {
						const cfg = RISK_LEVEL_CONFIG[level];
						const Icon = cfg.icon;
						return (
							<div
								key={level}
								className="flex items-center justify-between gap-4"
							>
								<div className="flex items-center gap-2 min-w-[100px]">
									<Icon className={`w-4 h-4 ${cfg.color}`} />
									<span className="text-sm text-text-primary">{cfg.label}</span>
								</div>
								<Select
									value={policy.levelPolicies[level]}
									onChange={(e) =>
										handleLevelPolicyChange(
											level,
											e.target.value as PermissionMode,
										)
									}
									containerClassName="flex-1 max-w-[200px]"
									options={PERMISSION_MODE_OPTIONS.map((opt) => ({
										value: opt.value,
										label: opt.label,
									}))}
								/>
							</div>
						);
					})}
				</div>
			</div>

			{/* 会话持久化与回放 */}
			<div className="space-y-4">
				<h4 className="font-medium text-text-primary flex items-center gap-2">
					<Database className="w-4 h-4" />
					会话持久化与回放
				</h4>
				<p className="text-xs text-text-muted -mt-2">
					控制聊天消息是否写入后端 Agent
					Runtime（agent_messages），以及是否在切换会话时从后端回放。
				</p>

				<div className="space-y-3">
					<div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-zinc-50/30">
						<div>
							<div className="text-sm font-medium text-text-primary">
								启用回放
							</div>
							<div className="text-xs text-text-muted mt-0.5">
								切换到绑定了 Agent Session
								的会话时，从后端消息记录回放到聊天窗口
							</div>
						</div>
						<Toggle
							checked={chatSettings.replayEnabled}
							onChange={() =>
								void agentChatSettingsStore.setReplayEnabled(
									!chatSettings.replayEnabled,
								)
							}
						/>
					</div>

					<div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-zinc-50/30">
						<div>
							<div className="text-sm font-medium text-text-primary">
								启用消息落库
							</div>
							<div className="text-xs text-text-muted mt-0.5">
								将 user/assistant 消息写入
								agent_messages（后端不可用会自动降级）
							</div>
						</div>
						<Toggle
							checked={chatSettings.persistEnabled}
							onChange={() =>
								void agentChatSettingsStore.setPersistEnabled(
									!chatSettings.persistEnabled,
								)
							}
						/>
					</div>

					<div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-zinc-50/30">
						<div>
							<div className="text-sm font-medium text-text-primary">
								落库 Trace 事件
							</div>
							<div className="text-xs text-text-muted mt-0.5">
								将工具调用/任务等 trace 事件也写入
								agent_messages（用于更完整回放）
							</div>
						</div>
						<Toggle
							checked={chatSettings.persistTraceEnabled}
							onChange={() =>
								void agentChatSettingsStore.setPersistTraceEnabled(
									!chatSettings.persistTraceEnabled,
								)
							}
						/>
					</div>

					<div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-zinc-50/30">
						<div>
							<div className="text-sm font-medium">Blocks 优先渲染</div>
							<div className="text-xs text-text-muted mt-0.5">
								当消息包含 blocks
								时优先按结构化方式渲染（回放更一致，可随时关闭回退旧渲染）
							</div>
						</div>
						<Toggle
							checked={chatSettings.blocksFirstEnabled}
							onChange={() =>
								void agentChatSettingsStore.setBlocksFirstEnabled(
									!chatSettings.blocksFirstEnabled,
								)
							}
						/>
					</div>

					<div className="flex items-center justify-between py-3">
						<div>
							<div className="text-sm font-medium">就地展示思考/工具调用</div>
							<div className="text-xs text-text-muted mt-0.5">
								在对话正文中按时间线插入“思考/工具卡片/任务列表”，不再集中显示“Agent
								运行过程”面板
							</div>
						</div>
						<Toggle
							checked={chatSettings.inlineTraceEnabled}
							onChange={() =>
								void agentChatSettingsStore.setInlineTraceEnabled(
									!chatSettings.inlineTraceEnabled,
								)
							}
						/>
					</div>

					<div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-border bg-zinc-50/30">
						<div>
							<div className="text-sm font-medium text-text-primary">
								回放条数限制
							</div>
							<div className="text-xs text-text-muted mt-0.5">
								仅回放最近 N 条消息；设置为 0 表示不限制
							</div>
						</div>
						<div className="flex items-center gap-2">
							<input
								type="number"
								min={0}
								max={5000}
								value={replayLimitDraft}
								onChange={(e) => setReplayLimitDraft(e.target.value)}
								onBlur={() => void commitReplayLimit()}
								className="w-24 px-3 py-2 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
							/>
							<span className="text-xs text-text-muted">条</span>
						</div>
					</div>

					<div className="flex items-center justify-between gap-4 pt-2">
						<div>
							<div className="text-sm font-medium text-text-primary">
								重置为默认
							</div>
							<div className="text-xs text-text-muted">
								恢复回放/落库相关开关与限制为默认值
							</div>
						</div>
						<button
							onClick={() => void agentChatSettingsStore.resetToDefaults()}
							className="px-4 py-2 bg-white border border-border rounded-lg text-sm font-medium hover:bg-zinc-50 hover:text-primary hover:border-primary transition-all inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
						>
							<RotateCcw className="w-4 h-4 shrink-0" />
							重置
						</button>
					</div>
				</div>
			</div>

			{/* 内置工具列表 */}
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h4 className="font-medium text-text-primary">内置工具风险等级</h4>
					<p className="text-xs text-text-muted">
						调整每个工具的风险等级，影响权限策略的默认行为
					</p>
				</div>
				<div className="border border-border rounded-xl overflow-hidden">
					<table className="w-full text-sm">
						<thead className="bg-zinc-50">
							<tr>
								<th className="text-left px-4 py-2.5 font-medium text-text-secondary">
									工具名称
								</th>
								<th className="text-left px-4 py-2.5 font-medium text-text-secondary">
									风险等级
								</th>
								<th className="text-left px-4 py-2.5 font-medium text-text-secondary">
									当前策略
								</th>
							</tr>
						</thead>
						<tbody>
							{(Object.keys(TOOL_NAMES) as ToolType[]).map((toolType) => {
								const riskLevel = toolRiskLevels[toolType] || "L0";
								const currentMode = policy.levelPolicies[riskLevel];
								const modeLabel = PERMISSION_MODE_OPTIONS.find(
									(o) => o.value === currentMode,
								)?.label;
								return (
									<tr
										key={toolType}
										className="border-t border-border hover:bg-zinc-50/50"
									>
										<td className="px-4 py-2.5 text-text-primary">
											{TOOL_NAMES[toolType]}
										</td>
										<td className="px-4 py-2.5">
											<Select
												value={riskLevel}
												onChange={(e) =>
													handleToolRiskLevelChange(
														toolType,
														e.target.value as ToolRiskLevel,
													)
												}
												variant="compact"
												containerClassName="inline-block"
												options={(["L0", "L1", "L2"] as ToolRiskLevel[]).map(
													(level) => ({
														value: level,
														label: `${level} - ${RISK_LEVEL_CONFIG[level].label}`,
													}),
												)}
											/>
										</td>
										<td className="px-4 py-2.5 text-text-secondary">
											{modeLabel}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>

			{/* 权限请求超时 */}
			<div className="space-y-4">
				<h4 className="font-medium text-text-primary flex items-center gap-2">
					<Clock className="w-4 h-4" />
					权限请求超时
				</h4>
				<div className="flex items-center gap-3">
					<div className="relative w-28">
						<input
							type="number"
							min={5}
							max={120}
							value={policy.timeoutSeconds}
							onChange={(e) =>
								handleTimeoutChange(parseInt(e.target.value) || 30)
							}
							className="w-full px-4 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
						/>
					</div>
					<span className="text-sm text-text-secondary">
						秒（超时后自动拒绝）
					</span>
				</div>
			</div>

			{/* 资料库检索 */}
			<div className="space-y-4">
				<h4 className="font-medium text-text-primary flex items-center gap-2">
					<Database className="w-4 h-4" />
					资料库检索
				</h4>
				<div className="space-y-3">
					<div>
						<label className="text-sm text-text-secondary mb-1.5 block">
							检索模式
						</label>
						<div className="grid grid-cols-3 gap-3">
							{RETRIEVAL_MODE_OPTIONS.map((opt) => (
								<button
									key={opt.value}
									onClick={() => handleKbModeChange(opt.value)}
									className={`p-3 rounded-xl text-left transition-colors ${
										kbRetrievalMode === opt.value
											? "border-2 border-primary bg-primary/5"
											: "border border-border hover:border-primary/50"
									}`}
								>
									<div
										className={`text-sm font-medium ${kbRetrievalMode === opt.value ? "text-primary" : "text-text-primary"}`}
									>
										{opt.label}
									</div>
									<div className="text-xs text-text-muted mt-0.5">
										{opt.desc}
									</div>
								</button>
							))}
						</div>
					</div>

					<div>
						<label className="text-sm text-text-secondary mb-1.5 block">
							Embedding 输入最大长度
						</label>
						<div className="flex items-center gap-3">
							<div className="relative w-28">
								<input
									type="number"
									min={32}
									max={4096}
									step={16}
									value={kbEmbeddingMaxChars}
									onChange={(e) =>
										handleKbEmbeddingMaxCharsChange(
											parseInt(e.target.value) || 480,
										)
									}
									className="w-full px-4 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
								/>
							</div>
							<span className="text-xs text-text-muted">
								为规避部分服务商的 512 tokens 限制，向量化时会先截断内容（默认
								480 字符）。
							</span>
						</div>
					</div>

					<div>
						<label className="text-sm text-text-secondary mb-1.5 block">
							向量命中阈值
						</label>
						<div className="flex items-center gap-3">
							<div className="relative w-28">
								<input
									type="number"
									min={0}
									max={1}
									step={0.01}
									value={kbVectorMinScore}
									onChange={(e) =>
										handleKbVectorMinScoreChange(
											parseFloat(e.target.value) || 0.2,
										)
									}
									className="w-full px-4 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
								/>
							</div>
							<span className="text-xs text-text-muted">
								仅保留相似度≥阈值的向量命中；不足时会自动回退到 FTS/LIKE
								兜底（建议 0.15-0.35）。
							</span>
						</div>
					</div>

					<div>
						<label className="text-sm text-text-secondary mb-1.5 block">
							Embedding 模型
						</label>
						<Select
							value={kbEmbeddingModel}
							onChange={(e) => handleKbEmbeddingModelChange(e.target.value)}
						>
							<option value="">未选择（将回退到 FTS/LIKE）</option>
							{allModels.map((m) => (
								<option key={`${m.provider}-${m.id}`} value={m.id}>
									{m.id} ({m.provider})
								</option>
							))}
						</Select>
						<p className="text-xs text-text-muted mt-1.5">
							用于将资料库分块转换为向量。
							<strong>必须选择服务商支持的 embedding 专用模型</strong>，如
							OpenAI 的 text-embedding-3-small。
						</p>
					</div>

					<div>
						<label className="text-sm text-text-secondary mb-1.5 block">
							索引补齐并发（兼容模式）
						</label>
						<div className="flex items-center gap-3">
							<div className="relative w-28">
								<input
									type="number"
									min={1}
									max={16}
									value={kbEmbeddingFallbackConcurrency}
									onChange={(e) =>
										handleKbFallbackConcurrencyChange(
											parseInt(e.target.value) || 4,
										)
									}
									className="w-full px-4 py-2.5 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
								/>
							</div>
							<span className="text-xs text-text-muted">
								当服务商不支持批量 embeddings
								时，自动降级为逐条请求并按此并发数执行（1-16）。
							</span>
						</div>
					</div>

					<div className="flex items-center justify-between pt-2">
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
							<div className="text-sm text-text-secondary break-words">
								{kbStats
									? `分块总数 ${kbStats.total_chunks}，已向量化 ${kbStats.embedded_chunks}，缺失 ${kbStats.missing_chunks}`
									: "暂未获取向量索引统计"}
								{autoHint && (
									<div className="text-xs text-text-muted mt-1">{autoHint}</div>
								)}
							</div>
							<button
								onClick={handleKbRebuild}
								disabled={isRebuilding || !kbEmbeddingModel}
								className="min-w-[100px] px-4 py-2 bg-white border border-border rounded-lg text-sm font-medium text-text-primary hover:text-primary hover:border-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 self-start sm:self-auto whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
							>
								{isRebuilding ? (
									<>
										<Loader2 className="w-4 h-4 animate-spin shrink-0" />
										<span>生成中...</span>
									</>
								) : (
									<span>立即补齐</span>
								)}
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* 重置 */}
			<div className="pt-4 border-t border-border">
				<div className="flex items-center justify-between">
					<div>
						<div className="font-medium text-text-primary">重置设置</div>
						<div className="text-xs text-text-muted">
							恢复所有 Agent 设置为默认值
						</div>
					</div>
					<button
						onClick={handleResetToDefault}
						className="px-4 py-2 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-white hover:text-red-600 hover:border-red-300 transition-all inline-flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
					>
						<RotateCcw className="w-4 h-4 shrink-0" />
						重置
					</button>
				</div>
			</div>
		</SettingsPageContainer>
	);
}
