import { Cog, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAgentChatSettingsStore } from "../../../lib/agent/chatSettingsStore";
import { usePermissionStore } from "../../../lib/agent/permissionStore";
import {
	DEFAULT_PERMISSION_POLICY,
	getToolRiskLevels,
	type PermissionMode,
	resetToolRiskLevels,
	setToolRiskLevel,
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
import { SettingsPanelHeader } from "../components/SettingsPanelHeader";
import {
	SettingsButton,
	SettingsPageContainer,
	SettingsStat,
} from "../ui/SettingsPrimitives";
import { AgentModelScenarioSettings } from "../components/AgentModelScenarioSettings";
import { ContextRuntimeSection } from "./agent/ContextRuntimeSection";
import { KbRetrievalSection } from "./agent/KbRetrievalSection";
import { SessionPersistenceSection } from "./agent/SessionPersistenceSection";
import { AgentSdkRuntimeSection } from "./agent/AgentSdkRuntimeSection";
import { PermissionPolicySection } from "./agent/PermissionPolicySection";
import { SlashCommandsSection } from "../sections/SlashCommandsSection";

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
	const { policy, updatePolicy, clearSessionRemembered } = usePermissionStore();
	const { providers } = useSettingsStore();
	const { settings: modelSettings, store: modelSettingsStore } =
		useAgentModelSettingsStore();
	const { settings: chatSettings, agentChatSettingsStore } =
		useAgentChatSettingsStore();
	const [toolRiskLevels, setToolRiskLevelsState] = useState<
		Record<ToolType, ToolRiskLevel>
	>(() => getToolRiskLevels());

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
		useState<boolean>(false);
	const [sdkPermissionMode, setSdkPermissionMode] =
		useState<string>("bypassPermissions");
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
					typeof interactiveApproval === "boolean"
						? interactiveApproval
						: false,
				);
				setSdkPermissionMode(
					typeof permissionMode === "string" && permissionMode.trim()
						? permissionMode
						: "bypassPermissions",
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
		void loadSdkSettings();
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
		void load();
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
		toast.success("Agent 设置已恢复默认");
	};

	const handleToolRiskLevelChange = (
		toolType: ToolType,
		riskLevel: ToolRiskLevel,
	) => {
		setToolRiskLevel(toolType, riskLevel);
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
		maxTurns: 100,
		maxBudgetUsd: undefined as number | undefined,
		settingSources: ["user", "project"] as Array<"user" | "project" | "local">,
		enableToolSearch: "false" as const,
		contextBudget: {
			maxContextChars: 16000,
			maxFiles: 12,
			maxFileChars: 6000,
		},
		betas: [] as string[],
	};

	const saveContextRuntime = async (
		patch: Partial<Omit<typeof contextRuntime, "contextBudget">> & {
			contextBudget?: Partial<typeof contextRuntime.contextBudget>;
		},
	): Promise<void> => {
		const next = {
			...contextRuntime,
			...patch,
			contextBudget: {
				...contextRuntime.contextBudget,
				...(patch.contextBudget || {}),
			},
		};
		await modelSettingsStore.updateContextRuntime(patch as any);
		await Promise.all([
			setConfig("agent.sdk.context_policy", next.contextPolicy),
			setConfig("agent.sdk.subagent_context_mode", next.subagentContextMode),
			setConfig("agent.sdk.max_turns", next.maxTurns),
			setConfig("agent.sdk.max_budget_usd", next.maxBudgetUsd ?? ""),
			setConfig("agent.sdk.setting_sources", next.settingSources),
			setConfig("agent.sdk.enable_tool_search", next.enableToolSearch),
			setConfig("agent.sdk.context_budget", {
				max_context_chars: next.contextBudget.maxContextChars,
				max_files: next.contextBudget.maxFiles,
				max_file_chars: next.contextBudget.maxFileChars,
			}),
			setConfig("agent.sdk.betas", next.betas),
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

	return (
		<SettingsPageContainer>
			<SettingsPanelHeader
				icon={Cog}
				title="Agent 设置"
				description="Claude Agent SDK 运行时、模型场景、权限策略与知识库检索一站式配置。"
				actions={
					<SettingsButton
						variant="secondary"
						icon={RotateCcw}
						onClick={handleResetToDefault}
						title="将权限策略与工具风险等级恢复为默认"
					>
						恢复默认
					</SettingsButton>
				}
			/>

			{/* 概览统计 */}
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<SettingsStat
					label="默认权限"
					value={permissionModeLabel}
					hint="无显式指定时"
				/>
				<SettingsStat
					label="默认模型"
					value={
						<span className="break-all text-[12.5px]">
							{modelSettings.defaultModelId || "未指定"}
						</span>
					}
					hint="Agent 启动时使用"
				/>
				<SettingsStat
					label="启用场景"
					value={enabledScenarioCount}
					hint="模型场景数"
				/>
				<SettingsStat
					label="资料检索"
					value={retrievalModeLabel}
					hint="知识库召回"
				/>
			</div>

			{/* 模型场景 */}
			<div id="ai.agent.scenarios" data-settings-anchor="ai.agent.scenarios">
				<AgentModelScenarioSettings />
			</div>

			{/* SDK 运行时 */}
			<div
				id="ai.agent.sdk.runtime"
				data-settings-anchor="ai.agent.sdk.runtime"
			>
				<AgentSdkRuntimeSection
					sdkInteractiveApproval={sdkInteractiveApproval}
					onInteractiveApprovalChange={(v) =>
						void saveSdkInteractiveApproval(v)
					}
					sdkCompatMode={sdkCompatMode}
					onCompatModeChange={(v) => void saveSdkCompatMode(v)}
					sdkPermissionMode={sdkPermissionMode}
					onPermissionModeChange={(v) => void saveSdkPermissionMode(v)}
					sdkPluginPathsDraft={sdkPluginPathsDraft}
					onPluginPathsDraftChange={setSdkPluginPathsDraft}
					onPluginPathsCommit={() => void saveSdkPluginPaths()}
					sdkAdditionalDirsDraft={sdkAdditionalDirsDraft}
					onAdditionalDirsDraftChange={setSdkAdditionalDirsDraft}
					onAdditionalDirsCommit={() => void saveSdkAdditionalDirs()}
				/>
			</div>

			{/* 上下文治理 */}
			<div
				id="ai.agent.context.runtime"
				data-settings-anchor="ai.agent.context.runtime"
			>
				<ContextRuntimeSection
					contextRuntime={contextRuntime}
					saveContextRuntime={saveContextRuntime}
				/>
			</div>

			{/* 权限策略 */}
			<div
				id="ai.agent.permission.policy"
				data-settings-anchor="ai.agent.permission.policy"
			>
				<PermissionPolicySection
					levelPolicies={policy.levelPolicies}
					onLevelPolicyChange={handleLevelPolicyChange}
					timeoutSeconds={policy.timeoutSeconds}
					onTimeoutChange={handleTimeoutChange}
					toolRiskLevels={toolRiskLevels}
					onToolRiskLevelChange={handleToolRiskLevelChange}
				/>
			</div>

			{/* Claude Code 斜杠命令 */}
			<SlashCommandsSection />

			{/* 会话持久化 */}
			<div
				id="ai.agent.session.persistence"
				data-settings-anchor="ai.agent.session.persistence"
			>
				<SessionPersistenceSection
					chatSettings={chatSettings}
					agentChatSettingsStore={agentChatSettingsStore}
					replayLimitDraft={replayLimitDraft}
					onReplayLimitDraftChange={setReplayLimitDraft}
					onReplayLimitCommit={commitReplayLimit}
				/>
			</div>

			{/* 知识库检索 */}
			<div
				id="ai.agent.kb.retrieval"
				data-settings-anchor="ai.agent.kb.retrieval"
			>
				<KbRetrievalSection
					retrievalModeOptions={RETRIEVAL_MODE_OPTIONS}
					kbRetrievalMode={kbRetrievalMode}
					onModeChange={handleKbModeChange}
					kbEmbeddingMaxChars={kbEmbeddingMaxChars}
					onMaxCharsChange={handleKbEmbeddingMaxCharsChange}
					kbVectorMinScore={kbVectorMinScore}
					onMinScoreChange={handleKbVectorMinScoreChange}
					kbEmbeddingModel={kbEmbeddingModel}
					onEmbeddingModelChange={handleKbEmbeddingModelChange}
					allModels={allModels}
					kbEmbeddingFallbackConcurrency={kbEmbeddingFallbackConcurrency}
					onFallbackConcurrencyChange={handleKbFallbackConcurrencyChange}
					kbStats={kbStats}
					autoHint={autoHint}
					isRebuilding={isRebuilding}
					onRebuild={handleKbRebuild}
				/>
			</div>
		</SettingsPageContainer>
	);
}
