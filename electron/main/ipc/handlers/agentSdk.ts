import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import { isRetryableError, DEFAULT_RETRY_CONFIG } from "../../utils/retryUtils";
import { detectCliBinary, resolveSdkBundledCli } from "../../services/cliBinaryDetector";
import { interactionBroker } from "./agentSdk/interactionBroker";
import { createLifecycleHooks } from "./agentSdk/hooksFactory";
import { runRegistry } from "./agentSdk/runRegistry";
import { createSubagentLifecycleHooks } from "./agentSdk/subagentHooks";
import { normalizeSdkSessionId } from "./agentSdk/sessionId";
import {
	resolveUserPathFromShell,
	normalizeStringArray,
	normalizeNumber,
	normalizeSettingSources,
	normalizeToolSearchMode,
	isLikelyWritingTask,
	pickWritingSkill,
	syncSkillsToCwd,
	uniqStrings,
	listProjectSkills,
	normalizeAdditionalDirectories,
	normalizePlugins,
	writeClaudeConfigSettings,
} from "./agentSdk/configManager";
import {
	type AgentSdkInteractionRequestPayload,
	type GetMainWindow,
	emit,
	DATA_IMAGE_URL_LIMIT,
	collectDataImageUrlsFromUnknown,
	persistDataImageUrlToCwd,
	buildUiToolResultOutput,
	toUIEvents,
} from "./agentSdk/eventTransformer";
import {
	guessDefaultReadableFilePath,
	resolveToolFilePath,
	rewriteBashCommandForMissingFile,
	rewritePathsDeep,
} from "./agentSdk/fileResolver";
import {
	type AgentModelSettingsLike,
	matchScenarioAgentForPrompt,
	buildSubagentAliasMap,
	resolveSubagentType,
	buildDynamicScenarioAgents,
	buildSubagentPolicyAppend,
	buildCustomSystemPrompt,
} from "./agentSdk/scenarioAgents";
import {
	buildLeaderCollaborationPrompt,
	buildMultiAgentRuntime,
	buildRuntimeMetadata,
	buildStableTaskSpine,
	buildSubagentCapsuleContext,
	normalizeMultiAgentMode,
	normalizeTeammateMode,
} from "./agentSdk/multiAgentRuntime";

type AgentSdkStartInput = IPCSchema["agent_sdk_start"]["input"];
type AgentSdkStartOutput = IPCSchema["agent_sdk_start"]["output"];
type AgentSdkAbortInput = IPCSchema["agent_sdk_abort"]["input"];
type AgentSdkAbortOutput = IPCSchema["agent_sdk_abort"]["output"];
type AgentSdkResolveInteractionInput =
	IPCSchema["agent_sdk_resolve_interaction"]["input"];
type AgentSdkResolveInteractionOutput =
	IPCSchema["agent_sdk_resolve_interaction"]["output"];
type AgentSdkControlInput = IPCSchema["agent_sdk_control"]["input"];
type AgentSdkControlOutput = IPCSchema["agent_sdk_control"]["output"];

export function createAgentSdkHandlers(options: {
	getMainWindow: GetMainWindow;
	getAnthropicBaseUrl: () => Promise<string>;
	logger: Logger;
	db: DbContext;
}) {
	const logger = options.logger;

	let cachedAgentModelSettings: { loadedAt: number; settings: any } | null =
		null;
	const AGENT_MODEL_SETTINGS_CACHE_TTL_MS = 5_000;

	async function loadAgentModelSettingsFromDb(): Promise<any | null> {
		const now = Date.now();
		if (
			cachedAgentModelSettings &&
			now - cachedAgentModelSettings.loadedAt <
				AGENT_MODEL_SETTINGS_CACHE_TTL_MS
		) {
			return cachedAgentModelSettings.settings;
		}

		try {
			const rows = await options.db.client.execute({
				sql: `SELECT value FROM app_config WHERE key = ?`,
				args: ["agent.model_settings"],
			});
			const raw = rows.rows.length > 0 ? (rows.rows[0].value as unknown) : null;

			let parsed: any = null;
			try {
				if (typeof raw === "string") parsed = JSON.parse(raw);
				else if (raw && typeof raw === "object") parsed = raw;
			} catch {
				parsed = null;
			}

			cachedAgentModelSettings = { loadedAt: now, settings: parsed };
			// 【调试】记录加载的配置
			logger.info({
				msg: "agent_sdk loadAgentModelSettingsFromDb result",
				scope: "agent",
				hasSettings: !!parsed,
				scenarioConfigsCount: Array.isArray(parsed?.scenarioConfigs)
					? parsed.scenarioConfigs.length
					: 0,
				scenarioConfigsPreview: Array.isArray(parsed?.scenarioConfigs)
					? parsed.scenarioConfigs.slice(0, 3).map((c: any) => ({
							scenario: c?.scenario,
							customName: c?.customName,
							enabled: c?.enabled,
							modelId: c?.modelId,
							providerId: c?.providerId,
						}))
					: [],
			});
			return parsed;
		} catch {
			cachedAgentModelSettings = { loadedAt: now, settings: null };
			return null;
		}
	}

	const agent_sdk_start = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkStartInput,
	): Promise<AgentSdkStartOutput> => {
		const runId = randomUUID();
		const abortController = new AbortController();
		runRegistry.set(runId, { abortController });

		(async () => {
			try {
				const sdk = await import("@anthropic-ai/claude-agent-sdk");
				const stderr = (data: string) => {
					logger.info({
						msg: "agent_sdk stderr",
						scope: "agent",
						runId,
						data:
							typeof data === "string" ? data.slice(0, 20000) : String(data),
					});
					emit(options.getMainWindow, { runId, type: "stderr", error: data });
				};
				const emitLifecycleEvent = (event: Record<string, unknown>) => {
					emit(options.getMainWindow, {
						runId,
						type: "transformed",
						events: [event],
					});
				};
				const toolNameById = new Map<string, string>();
				const toolUseIdByIndex = new Map<number, string>();
				const toolInputJsonById = new Map<string, string>();
				const taskCallSignatureByToolUseId = new Map<string, string>();
				const taskCallStateBySignature = new Map<
					string,
					"running" | "completed"
				>();
				const taskImagePathsByToolUseId = new Map<string, string[]>();
				const normalizeTaskSignaturePart = (v: unknown) =>
					String(v || "")
						.normalize("NFC")
						.trim()
						.toLowerCase()
						.replace(/\s+/g, " ")
						.slice(0, 1200);
				const buildTaskCallSignature = (
					toolInput: Record<string, unknown>,
				): string => {
					const subagent =
						typeof toolInput.subagent_type === "string"
							? toolInput.subagent_type
							: typeof toolInput.subagentType === "string"
								? toolInput.subagentType
								: "";
					const description =
						typeof toolInput.description === "string"
							? toolInput.description
							: "";
					const prompt =
						typeof toolInput.prompt === "string" ? toolInput.prompt : "";
					return [
						normalizeTaskSignaturePart(subagent),
						normalizeTaskSignaturePart(description),
						normalizeTaskSignaturePart(prompt),
					].join("||");
				};
				const logToolUseError = (payload: any) => {
					try {
						const blocks = Array.isArray(payload?.message?.content)
							? payload.message.content
							: [];
						for (const b of blocks) {
							if (b?.type !== "tool_result") continue;
							const toolUseId = String(b?.tool_use_id || "");
							const content = typeof b?.content === "string" ? b.content : "";
							if (!content.includes("<tool_use_error>")) continue;
							const toolName = toolUseId
								? toolNameById.get(toolUseId)
								: undefined;
							const inputJson = toolUseId
								? toolInputJsonById.get(toolUseId)
								: undefined;
							const inputPreview = inputJson
								? inputJson.length > 800
									? `${inputJson.slice(0, 800)}…`
									: inputJson
								: "";
							stderr(
								`[agent_sdk] <tool_use_error> tool_use_id=${toolUseId || "unknown"} tool=${toolName || "unknown"}\n` +
									(inputPreview ? `input=${inputPreview}\n` : "") +
									content.slice(0, 2000),
							);
						}
					} catch {}
				};

				// 优先使用用户本地安装的 Claude CLI，fallback 到 SDK 内嵌版本
				let pathToClaudeCodeExecutable: string | undefined;
				{
					const userCliPathRow = await options.db.client.execute({
						sql: "SELECT value FROM app_config WHERE key = ?",
						args: ["aiCoding.claude.cliPath"],
					});
					const userCliPath = userCliPathRow.rows.length > 0
						? (userCliPathRow.rows[0].value as string)?.trim()
						: undefined;

					const cliInfo = await detectCliBinary("claude-code", {
						userConfiguredPath: userCliPath || undefined,
					});

					if (cliInfo.path) {
						pathToClaudeCodeExecutable = cliInfo.path;
					} else {
						pathToClaudeCodeExecutable = resolveSdkBundledCli() ?? undefined;
					}
				}

				const cwd =
					input.cwd && input.cwd.trim() ? input.cwd.trim() : process.cwd();
				const userShell =
					typeof process.env.SHELL === "string" ? process.env.SHELL : null;
				const userPath = await resolveUserPathFromShell(userShell);
				const resolvedPath = userPath || process.env.PATH;

				// 读取 Claude Code 代理模式设置：proxy | transparent
				const proxyModeRow = await options.db.client.execute({
					sql: "SELECT value FROM app_config WHERE key = ?",
					args: ["aiCoding.claude.proxyMode"],
				});
				const proxyMode = (proxyModeRow.rows.length > 0
					? (proxyModeRow.rows[0].value as string)?.trim()
					: null) || "transparent";
				const isTransparentMode = proxyMode === "transparent";

				let claudeConfigDir: string | undefined;
				let anthropicBaseUrl: string | undefined;
				let anthropicApiKey: string | undefined;

				if (isTransparentMode) {
					// 透明模式：不覆盖用户的 Claude 配置，让 CLI 使用用户自己的 API key 和 base URL
					console.log("[agent_sdk] Transparent mode: using user's own Claude configuration");
				} else {
					// 代理模式：通过本地代理路由所有 API 流量（支持多 Provider 转发和模型路由）
					claudeConfigDir = cwd;

					// IMPORTANT: pass base URL without "/v1". The Claude Code CLI appends "/v1" itself.
					anthropicBaseUrl = (
						await options.getAnthropicBaseUrl()
					).replace(/\/v1\/?$/i, "");

					const anthropicApiKeyRaw =
						typeof process.env.ANTHROPIC_API_KEY === "string"
							? process.env.ANTHROPIC_API_KEY.trim()
							: "";
					anthropicApiKey =
						anthropicApiKeyRaw ||
						"sk-ant-api03-dummy000000000000000000000000000000000000";

					try {
						await writeClaudeConfigSettings({ claudeConfigDir, anthropicApiKey });
					} catch {}
				}

				logger.info({
					msg: "agent_sdk start",
					scope: "agent",
					runId,
					cwd,
					model: input.model,
					proxyMode,
					anthropicBaseUrl: anthropicBaseUrl ?? "(transparent - user config)",
					claudeConfigDir: claudeConfigDir ?? "(transparent - user config)",
					pathToClaudeCodeExecutable,
					allowed_tools: input.allowed_tools,
					has_system_prompt: !!input.system_prompt,
					interactive_approval:
						typeof input.interactive_approval === "boolean"
							? input.interactive_approval
							: true,
					permission_mode: input.permission_mode,
					additionalDirectoriesCount: Array.isArray(
						(input as any).additional_directories,
					)
						? (input as any).additional_directories.length
						: 0,
					pluginsCount: Array.isArray((input as any).plugins)
						? (input as any).plugins.length
						: 0,
				});

				// 【调试】打印 cwd 到控制台
				console.log(`[agent_sdk] Starting with cwd='${cwd}'`);

				// 检查 skills 目录
				const skillsDir = path.join(cwd, ".claude", "skills");
				try {
					const skillEntries = await fsp.readdir(skillsDir, {
						withFileTypes: true,
					});
					const skillNames = skillEntries
						.filter((e) => e.isDirectory() && !e.name.startsWith("."))
						.map((e) => e.name);
					logger.info({
						msg: "agent_sdk skills directory",
						scope: "agent",
						runId,
						skillsDir,
						skillNames,
					});
				} catch (e) {
					logger.info({
						msg: "agent_sdk skills directory not accessible",
						scope: "agent",
						runId,
						skillsDir,
						error: e instanceof Error ? e.message : String(e),
					});
				}

				// 让 SDK 的 Skill tool 能在 project settings（cwd/.claude/skills）里发现 skills
				await syncSkillsToCwd(cwd, stderr);

				const interactiveApproval =
					typeof input.interactive_approval === "boolean"
						? input.interactive_approval
						: true;
				const hasExplicitAllowedTools = Object.prototype.hasOwnProperty.call(
					input,
					"allowed_tools",
				);
				const allowedRaw = Array.isArray(input.allowed_tools)
					? input.allowed_tools
					: [];
				const allowed = uniqStrings(
					interactiveApproval
						? [...allowedRaw, "AskUserQuestion"]
						: [...allowedRaw],
				);
				const skillsFromInput = normalizeStringArray((input as any).skills);
				const skillsFromProject = await listProjectSkills(cwd);
				const enabledSkills = uniqStrings([
					...skillsFromInput,
					...skillsFromProject,
				]);
				const preferredWritingSkill = pickWritingSkill(enabledSkills);
				const agentModelSettings =
					(await loadAgentModelSettingsFromDb()) as AgentModelSettingsLike | null;
				try {
					const configs = Array.isArray(
						(agentModelSettings as any)?.scenarioConfigs,
					)
						? ((agentModelSettings as any).scenarioConfigs as any[])
						: [];
					const enabledCount = configs.filter(
						(c) => c && c.enabled !== false,
					).length;
					logger.info({
						msg: "agent_sdk scenario+skills loaded",
						scope: "agent",
						runId,
						scenarioConfigsTotal: configs.length,
						scenarioConfigsEnabled: enabledCount,
						projectSkillsCount: skillsFromProject.length,
						inputSkillsCount: skillsFromInput.length,
						enabledSkillsCount: enabledSkills.length,
						enabledSkillsPreview: enabledSkills.slice(0, 20),
					});
				} catch {}
				const scenarioAgents = buildDynamicScenarioAgents({
					settings: agentModelSettings,
					enabledSkills,
					logger,
				});
				const subagentPolicyAppend = buildSubagentPolicyAppend({
					settings: agentModelSettings,
					enabledSkills,
					logger,
				});
				const resumeSessionIdRaw =
					typeof (input as any).resume_session_id === "string"
						? (input as any).resume_session_id.trim()
						: "";
				const resumeSessionId = normalizeSdkSessionId(resumeSessionIdRaw);
				if (resumeSessionIdRaw && !resumeSessionId) {
					logger.warn({
						msg: "agent_sdk invalid resume_session_id dropped",
						scope: "agent",
						runId,
						resumeSessionIdRaw,
					});
				}
				const persistSession =
					typeof (input as any).persist_session === "boolean"
						? (input as any).persist_session
						: undefined;
				const forkSession =
					typeof (input as any).fork_session === "boolean"
						? ((input as any).fork_session as boolean)
						: false;
				const resumeSessionAtRaw =
					typeof (input as any).resume_session_at === "string"
						? String((input as any).resume_session_at).trim()
						: "";
				const resumeSessionAt = resumeSessionAtRaw || undefined;
				const runtimeConfig = (agentModelSettings as any)?.contextRuntime || {};
				const maxTurns =
					normalizeNumber((input as any).max_turns) ??
					normalizeNumber(runtimeConfig?.maxTurns) ??
					24;
				const maxThinkingTokens =
					normalizeNumber((input as any).max_thinking_tokens) ??
					normalizeNumber(runtimeConfig?.maxThinkingTokens) ??
					8192;
				const maxBudgetUsd =
					normalizeNumber((input as any).max_budget_usd) ??
					normalizeNumber(runtimeConfig?.maxBudgetUsd);
				const settingSources = normalizeSettingSources(
					(input as any).setting_sources ?? runtimeConfig?.settingSources,
				);
				const betas = uniqStrings(
					normalizeStringArray(
						(input as any).betas ?? runtimeConfig?.betas ?? [],
					),
				);
				const rawContextPolicy = String(
					(input as any).context_policy ?? runtimeConfig?.contextPolicy ?? "",
				).trim();
				const contextPolicy: "balanced" | "strict" | "aggressive" =
					rawContextPolicy === "strict" || rawContextPolicy === "aggressive"
						? rawContextPolicy
						: "balanced";
				const subagentContextMode =
					String(
						(input as any).subagent_context_mode ??
							runtimeConfig?.subagentContextMode ??
							"capsule",
					).trim() === "inherit"
						? "inherit"
						: "capsule";
				const contextBudgetRaw =
					(input as any).context_budget &&
					typeof (input as any).context_budget === "object"
						? ((input as any).context_budget as Record<string, unknown>)
						: runtimeConfig?.contextBudget &&
								typeof runtimeConfig.contextBudget === "object"
							? (runtimeConfig.contextBudget as Record<string, unknown>)
							: {};
				const contextBudget = {
					max_context_chars: Math.max(
						1000,
						Math.floor(
							normalizeNumber(contextBudgetRaw.max_context_chars) ??
								normalizeNumber((contextBudgetRaw as any).maxContextChars) ??
								16000,
						),
					),
					max_files: Math.max(
						1,
						Math.floor(
							normalizeNumber(contextBudgetRaw.max_files) ??
								normalizeNumber((contextBudgetRaw as any).maxFiles) ??
								12,
						),
					),
					max_file_chars: Math.max(
						500,
						Math.floor(
							normalizeNumber(contextBudgetRaw.max_file_chars) ??
								normalizeNumber((contextBudgetRaw as any).maxFileChars) ??
								6000,
						),
					),
				};
				const enableToolSearch = normalizeToolSearchMode(
					(input as any).enable_tool_search ?? runtimeConfig?.enableToolSearch,
				);
				const experimentalMultiAgent =
					typeof (input as any).experimental_multi_agent === "boolean"
						? (input as any).experimental_multi_agent
						: runtimeConfig?.experimentalMultiAgentEnabled === true;
				const multiAgentMode = normalizeMultiAgentMode(
					(input as any).multi_agent_mode ?? runtimeConfig?.multiAgentMode,
				);
				const maxTeammates =
					normalizeNumber((input as any).max_teammates) ??
					normalizeNumber(runtimeConfig?.maxTeammates) ??
					2;
				const teammateMode = normalizeTeammateMode(
					(input as any).teammate_mode ?? runtimeConfig?.teammateMode,
				);
				const teammateBudgetRaw =
					(input as any).teammate_budget &&
					typeof (input as any).teammate_budget === "object"
						? ((input as any).teammate_budget as Record<string, unknown>)
						: runtimeConfig?.teammateBudget &&
								typeof runtimeConfig.teammateBudget === "object"
							? (runtimeConfig.teammateBudget as Record<string, unknown>)
							: {};
				const leaderSummaryModel =
					typeof (input as any).leader_summary_model === "string" &&
					String((input as any).leader_summary_model).trim()
						? String((input as any).leader_summary_model).trim()
						: typeof runtimeConfig?.leaderSummaryModel === "string" &&
								runtimeConfig.leaderSummaryModel.trim()
							? runtimeConfig.leaderSummaryModel.trim()
							: undefined;
				const teammateExecutionModel =
					typeof (input as any).teammate_execution_model === "string" &&
					String((input as any).teammate_execution_model).trim()
						? String((input as any).teammate_execution_model).trim()
						: typeof runtimeConfig?.teammateExecutionModel === "string" &&
								runtimeConfig.teammateExecutionModel.trim()
							? runtimeConfig.teammateExecutionModel.trim()
							: undefined;
				const multiAgentRuntime = buildMultiAgentRuntime({
					runId,
					resumeSessionId,
					experimentalMultiAgent,
					multiAgentMode,
					maxTeammates,
					teammateMode,
					teammateBudget: teammateBudgetRaw,
					leaderSummaryModel,
					teammateExecutionModel,
				});
				const runtimeMetadata = buildRuntimeMetadata(multiAgentRuntime);
				const stableTaskSpine = buildStableTaskSpine({
					prompt: String(input.prompt ?? ""),
					systemPrompt:
						typeof input.system_prompt === "string"
							? input.system_prompt
							: undefined,
					contextPolicy,
					subagentContextMode,
					runtime: multiAgentRuntime,
				});
				const mcpServers =
					(input as any).mcp_servers &&
					typeof (input as any).mcp_servers === "object"
						? ((input as any).mcp_servers as any)
						: undefined;
				const additionalDirectories = await normalizeAdditionalDirectories(
					cwd,
					(input as any).additional_directories,
				);
				const plugins = await normalizePlugins(cwd, (input as any).plugins);
				const permissionMode =
					typeof input.permission_mode === "string" &&
					input.permission_mode.trim()
						? input.permission_mode.trim()
						: "default";
				const permissionModeForRun =
					multiAgentRuntime.useDelegateMode && permissionMode !== "plan"
						? "delegate"
						: permissionMode;
				const sandboxSettings =
					(input as any).sandbox && typeof (input as any).sandbox === "object"
						? ((input as any).sandbox as Record<string, unknown>)
						: undefined;
				const subagentLifecycleHooks = createSubagentLifecycleHooks({
					logger,
					runId,
					stderr,
					emitLifecycleEvent,
					subagentAdditionalContext: buildSubagentCapsuleContext({
						prompt: String(input.prompt ?? ""),
						runtime: multiAgentRuntime,
					}),
					runtimeMetadata,
				});
				const lifecycleHooks = createLifecycleHooks({
					logger,
					runId,
					stderr,
					emitLifecycleEvent,
					sessionAdditionalContext: stableTaskSpine,
					preCompactAdditionalContext: [
						stableTaskSpine,
						"压缩后必须保留：任务目标、硬性约束、当前进度、未完成事项、协作策略。",
					].join("\n"),
					runtimeMetadata,
					experimentalMultiAgentEnabled:
						multiAgentRuntime.experimentalEnabled,
				});
				const allowedToolsForRun = uniqStrings(
					multiAgentRuntime.experimentalEnabled &&
						multiAgentRuntime.multiAgentMode !== "subagent_only"
						? [...allowed, "Teammate"]
						: [...allowed],
				);

				// 注意: SDK Options 不直接支持 skills 参数
				// Skills 通过 system prompt 和 syncSkillsToCwd 来处理

				// 【调试】确认 canUseTool 被传入 options
				console.log(
					`[agent_sdk] About to call sdk.query with cwd='${cwd}', hasCanUseTool=true`,
				);

				const agentsConfig = {
					...scenarioAgents,
					reader: {
						description:
							"Reads provided files and extracts key facts/summaries.",
						prompt:
							"Read only the minimum necessary from the provided working directory files using Read/Glob/Grep. Return a concise bullet summary and any key quotes only if necessary.",
						model:
							typeof (scenarioAgents as any)?.fast_search?.model === "string"
								? String((scenarioAgents as any).fast_search.model)
								: undefined,
						tools: ["Read", "Glob", "Grep"],
						disallowedTools: ["Task"],
					},
					writer: {
						description:
							"Writes polished content (Xiaohongshu/marketing/copywriting) based on provided facts.",
						prompt:
							"Write in Chinese, follow the user's requested style (e.g., 小红书). Prefer using Skill tool when a matching writing skill is available. Do not paste full source files; use extracted facts only.",
						model:
							typeof (scenarioAgents as any)?.writing?.model === "string"
								? String((scenarioAgents as any).writing.model)
								: undefined,
						tools: ["Skill", "Read", "Glob", "Grep"],
						disallowedTools: ["Task"],
						skills: enabledSkills.length > 0 ? enabledSkills : undefined,
					},
				};
				const subagentAliasToKey = buildSubagentAliasMap(agentsConfig as any);

				// 【调试】记录传递给 SDK 的 agents 配置
				logger.info({
					msg: "agent_sdk agentsConfig before sdk.query",
					scope: "agent",
					runId,
					hasExplicitAllowedTools,
					allowedToolsCount: allowedToolsForRun.length,
					allowedToolsHasTask: allowedToolsForRun.includes("Task"),
					allowedToolsHasTeammate: allowedToolsForRun.includes("Teammate"),
					multiAgentRuntime,
					agentKeys: Object.keys(agentsConfig),
					agentsPreview: Object.entries(agentsConfig).map(([k, v]) => ({
						key: k,
						hasDescription: !!(v as any)?.description,
						hasPrompt: !!(v as any)?.prompt,
						model: (v as any)?.model?.slice?.(0, 50) ?? (v as any)?.model,
					})),
				});
				const userPromptHintFingerprint = new Set<string>();
				const normalizedContextPolicy: "balanced" | "strict" | "aggressive" =
					contextPolicy === "strict" || contextPolicy === "aggressive"
						? contextPolicy
						: "balanced";

				const q = sdk.query({
					prompt: String(input.prompt ?? ""),
					options: {
						abortController,
						cwd,
						model: String(input.model ?? ""),
						resume: resumeSessionId,
						resumeSessionAt,
						forkSession,
						persistSession,
						mcpServers,
						maxTurns,
						maxThinkingTokens,
						maxBudgetUsd,
						betas: betas.length > 0 ? betas : undefined,
						// 必须传入 allowedTools 并包含 Task，否则自定义 agents 无法被调用
						// 参考文档: "The Task tool must be included in allowedTools since Claude invokes subagents through the Task tool."
						allowedTools: hasExplicitAllowedTools
							? allowedToolsForRun
							: multiAgentRuntime.experimentalEnabled
								? allowedToolsForRun
								: undefined,
						agents: agentsConfig as any,
						hooks: {
							...lifecycleHooks,
							...subagentLifecycleHooks,
							// PreToolUse 钩子：在工具执行前拦截并修复文件路径
							PreToolUse: [
								{
									hooks: [
										async (
											hookInput: any,
											_toolUseID: string | undefined,
											_opts: any,
										) => {
											if (hookInput.hook_event_name !== "PreToolUse") {
												return { continue: true };
											}
											const toolName = (hookInput as any).tool_name || "";
											const toolInput = (hookInput as any).tool_input || {};

											console.log(
												`[PreToolUse] Tool='${toolName}', Input=${JSON.stringify(toolInput).slice(0, 200)}`,
											);

											const toolLower = String(toolName).toLowerCase();

											// 处理 Task(subagent) 调用：兼容用户/模型用中文描述填写 subagent_type
											if (
												toolLower === "task" &&
												toolInput &&
												typeof toolInput === "object"
											) {
												const toolUseId = String(
													(hookInput as any).tool_use_id || "",
												).trim();
												const inputAny = toolInput as Record<string, unknown>;
												let normalizedInput: Record<string, unknown> = {
													...inputAny,
												};
												let normalizedChanged = false;
												const rawSubType =
													typeof inputAny.subagent_type === "string"
														? inputAny.subagent_type
														: typeof inputAny.subagentType === "string"
															? inputAny.subagentType
															: null;
												if (rawSubType) {
													const resolved = resolveSubagentType(
														rawSubType,
														agentsConfig,
														subagentAliasToKey,
													);
													if (resolved && resolved !== rawSubType) {
														console.log(
															`[PreToolUse] ✓ subagent_type rewritten: '${rawSubType}' -> '${resolved}'`,
														);
														normalizedInput = {
															...normalizedInput,
															subagent_type: resolved,
															subagentType: resolved,
														};
														normalizedChanged = true;
													}
												}

												// 若 Task prompt 中携带了明确文件路径，强制补充“先 Read 文件再作图/写作”的执行约束
												const taskPrompt =
													typeof normalizedInput.prompt === "string"
														? normalizedInput.prompt
														: "";
												if (taskPrompt) {
													const pathMatches =
														taskPrompt.match(
															/(?:\/Users\/[^\n"'`]+?\.[A-Za-z0-9]{1,8}|\/[^\n"'`]+?\.[A-Za-z0-9]{1,8})/g,
														) || [];
													const existingPaths: string[] = [];
													for (const raw of pathMatches.slice(0, 8)) {
														const candidate = String(raw || "")
															.trim()
															.replace(/[),，。；;:]+$/g, "");
														if (!candidate || existingPaths.includes(candidate))
															continue;
														try {
															if (fs.existsSync(candidate)) {
																existingPaths.push(candidate);
															}
														} catch {}
													}
													const hasReadConstraint =
														/先读取|先用Read|使用 Read|Read 工具|先用 read|read 工具/i.test(
															taskPrompt,
														);
													if (existingPaths.length > 0 && !hasReadConstraint) {
														const readHint =
															`\n\n执行要求：你必须先使用 Read 工具读取以下文件后再继续，不得只根据标题猜测内容：\n` +
															existingPaths.map((p) => `- ${p}`).join("\n");
														normalizedInput = {
															...normalizedInput,
															prompt: `${taskPrompt}${readHint}`,
														};
														normalizedChanged = true;
													}
												}

												const signature =
													buildTaskCallSignature(normalizedInput);
												const state = signature
													? taskCallStateBySignature.get(signature)
													: undefined;
												if (signature && state) {
													return {
														continue: true,
														hookSpecificOutput: {
															hookEventName: "PreToolUse" as const,
															permissionDecision: "deny" as const,
															permissionDecisionReason:
																"检测到重复的 Task 调用（同一子代理 + 同一任务描述），请直接基于已有结果继续回答。",
														},
													};
												}

												if (signature) {
													taskCallStateBySignature.set(signature, "running");
													if (toolUseId) {
														taskCallSignatureByToolUseId.set(
															toolUseId,
															signature,
														);
													}
												}

												// 如有输入规范化（subagent_type / prompt），回写 updatedInput
												if (normalizedChanged) {
													return {
														continue: true,
														hookSpecificOutput: {
															hookEventName: "PreToolUse" as const,
															permissionDecision: "allow" as const,
															updatedInput: normalizedInput,
														},
													};
												}
											}

											// 处理文件读取工具
											if (
												["read", "glob", "grep", "write", "edit"].includes(
													toolLower,
												)
											) {
												const key =
													typeof toolInput.file_path === "string"
														? "file_path"
														: typeof toolInput.path === "string"
															? "path"
															: typeof toolInput.file === "string"
																? "file"
																: null;

												if (key) {
													const rawPath = String(toolInput[key] || "").trim();
													if (rawPath) {
														console.log(
															`[PreToolUse] Resolving path: '${rawPath}' in cwd='${cwd}'`,
														);
														const resolved = await resolveToolFilePath({
															cwd,
															rawPath,
														});
														if (resolved && resolved !== rawPath) {
															console.log(
																`[PreToolUse] ✓ Rewritten: '${rawPath}' -> '${resolved}'`,
															);
															return {
																continue: true,
																hookSpecificOutput: {
																	hookEventName: "PreToolUse" as const,
																	permissionDecision: "allow" as const,
																	updatedInput: {
																		...toolInput,
																		[key]: resolved,
																		file_path: resolved,
																	},
																},
															};
														}
														if (!resolved) {
															console.log(
																`[PreToolUse] ✗ Failed to resolve: '${rawPath}'`,
															);
														}
													}
												}
											}

											// 处理 Bash 命令
											if (
												toolLower === "bash" &&
												typeof toolInput.command === "string"
											) {
												const cmd = String(toolInput.command || "");
												const rewritten =
													await rewriteBashCommandForMissingFile({
														cwd,
														command: cmd,
													});
												if (rewritten && rewritten !== cmd) {
													console.log(
														`[PreToolUse] ✓ Bash rewritten: '${cmd}' -> '${rewritten}'`,
													);
													return {
														continue: true,
														hookSpecificOutput: {
															hookEventName: "PreToolUse" as const,
															permissionDecision: "allow" as const,
															updatedInput: {
																...toolInput,
																command: rewritten,
															},
														},
													};
												}
											}

											return { continue: true };
										},
									],
								},
							],
							PostToolUse: [
								{
									hooks: [
										async (hookInput: any) => {
											if (hookInput.hook_event_name !== "PostToolUse") {
												return { continue: true };
											}
											const toolName = String(
												(hookInput as any).tool_name || "",
											);
											const toolLower = toolName.toLowerCase();
											if (toolLower !== "task") return { continue: true };

											const toolUseId = String(
												(hookInput as any).tool_use_id || "",
											).trim();
											const signature = toolUseId
												? taskCallSignatureByToolUseId.get(toolUseId)
												: undefined;
											if (signature)
												taskCallStateBySignature.set(signature, "completed");

											const response = (hookInput as any).tool_response;
											const dataUrls = collectDataImageUrlsFromUnknown(
												response,
												DATA_IMAGE_URL_LIMIT,
											);
											if (dataUrls.length === 0) return { continue: true };

											const persistedPaths: string[] = [];
											for (const dataUrl of dataUrls) {
												try {
													const saved = await persistDataImageUrlToCwd({
														dataUrl,
														cwd,
														prefix: "subagent-image",
													});
													if (saved) persistedPaths.push(saved);
												} catch (e) {
													stderr(
														`[PostToolUse] persist image failed: ${e instanceof Error ? e.message : String(e)}`,
													);
												}
											}

											const uniqPaths = uniqStrings(persistedPaths);
											if (toolUseId && uniqPaths.length > 0) {
												taskImagePathsByToolUseId.set(toolUseId, uniqPaths);
											}
											if (uniqPaths.length === 0) return { continue: true };

											return {
												continue: true,
												hookSpecificOutput: {
													hookEventName: "PostToolUse" as const,
													additionalContext: `子代理图片已保存到本地路径，请优先使用这些路径并结束回答（不要再次调用画图子代理）：image_paths=${JSON.stringify(uniqPaths)}`,
												},
											};
										},
									],
								},
							],
							PostToolUseFailure: [
								{
									hooks: [
										async (hookInput: any) => {
											if (hookInput.hook_event_name !== "PostToolUseFailure") {
												return { continue: true };
											}
											const toolName = String(
												(hookInput as any).tool_name || "",
											);
											if (toolName.toLowerCase() !== "task") {
												return { continue: true };
											}
											const toolUseId = String(
												(hookInput as any).tool_use_id || "",
											).trim();
											if (!toolUseId) return { continue: true };
											const signature =
												taskCallSignatureByToolUseId.get(toolUseId);
											if (signature) {
												taskCallStateBySignature.delete(signature);
												taskCallSignatureByToolUseId.delete(toolUseId);
											}
											taskImagePathsByToolUseId.delete(toolUseId);
											return { continue: true };
										},
									],
								},
							],
							UserPromptSubmit: [
								{
									hooks: [
										async (hookInput: any) => {
											const promptText =
												hookInput.hook_event_name === "UserPromptSubmit"
													? String((hookInput as any).prompt ?? "")
													: "";
											const inSubagentContext = Boolean(
												(hookInput as any)?.parent_tool_use_id ||
													(hookInput as any)?.agent_id ||
													(hookInput as any)?.agent_type,
											);
											const maxAdditionalChars = 600;
											const additions: string[] = [];
											const pushHint = (
												fingerprint: string,
												content: string,
											) => {
												if (!content.trim()) return;
												if (userPromptHintFingerprint.has(fingerprint)) return;
												userPromptHintFingerprint.add(fingerprint);
												additions.push(content.trim());
											};
											pushHint(
												"read-rule",
												"读取文件请优先使用 Read/Glob/Grep 等内置工具（不要依赖通配符 Bash）。",
											);
											pushHint(
												`context-policy:${normalizedContextPolicy}`,
												`上下文策略：${normalizedContextPolicy}；子代理上下文模式：${subagentContextMode}。`,
											);
											pushHint(
												"context-budget",
												`上下文预算：max_context_chars=${contextBudget.max_context_chars}, max_files=${contextBudget.max_files}, max_file_chars=${contextBudget.max_file_chars}。`,
											);
											pushHint("stable-task-spine", stableTaskSpine);
											if (multiAgentRuntime.experimentalEnabled) {
												pushHint(
													"multi-agent-policy",
													`多 Agent 实验已开启：mode=${multiAgentRuntime.multiAgentMode}, max_teammates=${multiAgentRuntime.maxTeammates}, teammate_mode=${multiAgentRuntime.teammateMode}。优先使用最小 brief 协作；Teammate 不可用时回退 Task。`,
												);
											}

											if (!inSubagentContext) {
												const matchedScenarioAgent =
													matchScenarioAgentForPrompt({
														settings: agentModelSettings,
														promptText,
													});
												if (matchedScenarioAgent) {
													pushHint(
														`subagent-match:${matchedScenarioAgent.agentKey}`,
														`⚠️ 你的请求可能与子代理「${matchedScenarioAgent.description}」语义相关。请优先调用 Task({ subagent_type: "${matchedScenarioAgent.agentKey}", ... })；如需补充上下文，可先做最小必要的 Read/Glob/Grep。`,
													);
												}
											}

											if (
												!inSubagentContext &&
												isLikelyWritingTask(promptText)
											) {
												if (preferredWritingSkill) {
													pushHint(
														"writing-skill-preferred",
														`这是写作任务：请先调用 Skill 工具（skill=\"${preferredWritingSkill}\"）生成初稿/框架，再根据需要整理为最终输出。`,
													);
												} else if (enabledSkills.length > 0) {
													pushHint(
														"writing-skill-any",
														`这是写作任务：如果有合适技能，请先调用 Skill 工具（可用技能：${enabledSkills.slice(0, 8).join(", ")}）。`,
													);
												}

												pushHint(
													"writing-subagent-pattern",
													'为减少上下文污染：请用 Task 工具把"读资料/提炼要点"委派给 reader 子代理，把"写作成文"委派给 writer 子代理，然后你只输出最终结果。',
												);
											}

											let additionalContext = additions.join("\n");
											if (additionalContext.length > maxAdditionalChars) {
												additionalContext =
													additionalContext.slice(0, maxAdditionalChars) +
													"\n...(系统提示已截断)";
											}

											return {
												continue: true,
												hookSpecificOutput: {
													hookEventName: "UserPromptSubmit",
													additionalContext,
												},
											};
										},
									],
								},
							],
						},
						permissionMode: permissionModeForRun as any,
						additionalDirectories:
							additionalDirectories.length > 0
								? additionalDirectories
								: undefined,
						plugins: plugins.length > 0 ? plugins : undefined,
						sandbox: sandboxSettings as any,
						pathToClaudeCodeExecutable,
						// CRITICAL: settingSources 告诉 SDK 从文件系统加载 skills
						// 默认 user+project，可由 UI/调用方覆盖
						settingSources: settingSources as any,
						tools: hasExplicitAllowedTools
							? allowedToolsForRun
							: { type: "preset", preset: "claude_code" },
						extraArgs: multiAgentRuntime.experimentalEnabled
							? {
									"team-name": multiAgentRuntime.teamId,
									"agent-name": "leader",
									"agent-type": "leader",
									"parent-session-id":
										multiAgentRuntime.parentSessionId || null,
									"teammate-mode": multiAgentRuntime.teammateMode,
							  }
							: undefined,
						env: (() => {
							const env: Record<string, string> = {};
							for (const [k, v] of Object.entries(process.env)) {
								if (typeof v === "string") env[k] = v;
							}

							if (resolvedPath) env.PATH = resolvedPath;

							if (isTransparentMode) {
								// 透明模式：保留用户环境中的所有 Claude/Anthropic 配置
								// 不覆盖 ANTHROPIC_BASE_URL、ANTHROPIC_API_KEY、CLAUDE_CONFIG_DIR
								console.log("[agent_sdk] Transparent mode env: keeping user's original config");
							} else {
								// 代理模式：覆盖环境变量以路由流量到本地代理
								// Avoid inheriting user account/session routing that could bypass our proxy.
								delete env.ANTHROPIC_AUTH_TOKEN;
								delete env.CLAUDE_CODE_OAUTH_TOKEN;
								delete env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR;
								delete env.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
								delete env.CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR;
								delete env.CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR;

								if (claudeConfigDir) env.CLAUDE_CONFIG_DIR = claudeConfigDir;
								// CRITICAL: do NOT append "/v1" here. The CLI constructs "/v1/messages" internally.
								if (anthropicBaseUrl) env.ANTHROPIC_BASE_URL = anthropicBaseUrl;
								if (anthropicApiKey) env.ANTHROPIC_API_KEY = anthropicApiKey;
								// Some CLI code paths look at this name instead.
								if (anthropicBaseUrl) env.CLAUDE_CODE_API_BASE_URL = anthropicBaseUrl;
							}

							// Reduce background noise during debugging.
							env.DISABLE_TELEMETRY = "1";
							env.DISABLE_ERROR_REPORTING = "1";
							env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
							env.ENABLE_TOOL_SEARCH = enableToolSearch;

							return env;
						})(),
						stderr,
						includePartialMessages: true,
						// Force streaming if supported by the SDK/API (cast to any to avoid TS error)
						stream: true,
						// 使用精简版系统提示词，移除 Claude Code preset 中不需要的内容
						// 保留工具使用说明、Skill 调用、子代理配置等核心功能
						systemPrompt: buildCustomSystemPrompt({
							cwd,
							model: String(input.model ?? ""),
							appendContent: [
								input.system_prompt,
								subagentPolicyAppend,
								buildLeaderCollaborationPrompt({
									runtime: multiAgentRuntime,
								}),
							]
								.filter((s) => typeof s === "string" && s.trim())
								.join("\n\n"),
						}),
						canUseTool: async (
							toolName: string,
							toolInput: any,
							extra: any,
						) => {
							// 【调试】记录每个工具调用 - 非常醒目的日志
							console.log(
								`\n★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★`,
							);
							console.log(
								`★ [canUseTool CALLED] Tool='${toolName}', AgentID='${(extra as any)?.agentID || "main"}'`,
							);
							console.log(
								`★ Input: ${JSON.stringify(toolInput || {}).slice(0, 200)}`,
							);
							console.log(
								`★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★\n`,
							);
							if (abortController.signal.aborted || extra?.signal?.aborted) {
								return {
									behavior: "deny",
									message: "aborted",
								};
							}
							if (
								hasExplicitAllowedTools &&
								!allowedToolsForRun.includes(toolName)
							) {
								return {
									behavior: "deny",
									message: `Tool disabled: ${toolName}`,
								};
							}

							let rewrittenInput: Record<string, unknown> =
								toolInput && typeof toolInput === "object"
									? { ...(toolInput as Record<string, unknown>) }
									: {};

							// Repair common file-path mistakes for file tools (especially Read).
							// The SDK tools expect a real file path, but the LLM sometimes passes a title.
							// We try to resolve it within the task cwd to avoid repeated <tool_use_error>.
							const toolLower = String(toolName || "").toLowerCase();
							if (
								(toolLower === "read" ||
									toolLower === "glob" ||
									toolLower === "grep" ||
									toolLower === "write" ||
									toolLower === "edit") &&
								toolInput &&
								typeof toolInput === "object"
							) {
								const inputAny = rewrittenInput as Record<string, unknown>;
								const key =
									typeof inputAny.file_path === "string"
										? "file_path"
										: typeof inputAny.path === "string"
											? "path"
											: typeof inputAny.file === "string"
												? "file"
												: null;
								if (!key && toolLower === "read") {
									const guessed = await guessDefaultReadableFilePath(cwd);
									if (guessed) {
										stderr(
											`[agent_sdk] Auto-filled Read file_path='${guessed}' (missing in tool input)`,
										);
										rewrittenInput = { ...inputAny, file_path: guessed };
									}
								}
								if (key) {
									const rawPath = String(inputAny[key] || "").trim();
									if (rawPath) {
										console.log(
											`[agent_sdk] Tool ${toolName}: attempting to resolve path '${rawPath}' in cwd='${cwd}'`,
										);
										const resolved = await resolveToolFilePath({
											cwd,
											rawPath,
										});
										if (resolved && resolved !== rawPath) {
											stderr(
												`[agent_sdk] Auto-resolved ${toolName} input '${rawPath}' -> '${resolved}'`,
											);
											// Keep existing key shape, but also provide file_path for robustness.
											rewrittenInput = {
												...inputAny,
												[key]: resolved,
												file_path: resolved,
											};
										}
										if (!resolved) {
											stderr(
												`[agent_sdk] Failed to resolve ${toolName} path '${rawPath}' within cwd='${cwd}'`,
											);
											return {
												behavior: "deny",
												message:
													`Path not found in agent workspace. Only use files under cwd=${cwd}. ` +
													`Try Glob to list files, then Read using that path.`,
											};
										}
									}
								}
							}

							// Repair common Bash reads like: cat "title..."
							if (
								toolLower === "bash" &&
								toolInput &&
								typeof toolInput === "object" &&
								typeof (rewrittenInput as any).command === "string"
							) {
								const cmd = String((rewrittenInput as any).command || "");
								const rewritten = await rewriteBashCommandForMissingFile({
									cwd,
									command: cmd,
								});
								if (rewritten && rewritten !== cmd) {
									stderr(
										`[agent_sdk] Auto-rewrote Bash command for missing file: '${cmd}' -> '${rewritten}'`,
									);
									rewrittenInput = {
										...(rewrittenInput as any),
										command: rewritten,
									};
								}
							}

							// Skills often take file paths as arguments and validate them internally.
							// When the model passes a title instead of a real path, Skill can fail with
							// "<tool_use_error>File does not exist.</tool_use_error>" and get stuck retrying.
							if (
								toolLower === "skill" &&
								rewrittenInput &&
								typeof rewrittenInput === "object"
							) {
								const rewritten = await rewritePathsDeep({
									cwd,
									value: rewrittenInput,
								});
								if (rewritten !== rewrittenInput) {
									stderr(
										"[agent_sdk] Auto-rewrote Skill input paths within cwd",
									);
									rewrittenInput = rewritten as Record<string, unknown>;
								}
							}

							// AskUserQuestion 不支持在 subagent 内触发，直接拒绝并让主代理继续。
							if (
								toolName === "AskUserQuestion" &&
								typeof extra?.agentID === "string" &&
								extra.agentID.trim()
							) {
								return {
									behavior: "deny",
									message:
										"AskUserQuestion is not supported inside subagents. Continue from the main agent.",
								};
							}

							if (!interactiveApproval) {
								if (toolName === "AskUserQuestion") {
									return {
										behavior: "deny",
										message: "Interactive approval is disabled",
									};
								}
								return { behavior: "allow", updatedInput: rewrittenInput };
							}

							const requestId = randomUUID();
							const timeoutMs = 55_000;
							const toolUseId =
								typeof extra?.toolUseID === "string" ? extra.toolUseID : "";
							const request: AgentSdkInteractionRequestPayload = {
								requestId,
								toolName,
								toolInput: rewrittenInput,
								toolUseId,
								agentId:
									typeof extra?.agentID === "string"
										? extra.agentID
										: undefined,
								description:
									typeof extra?.description === "string"
										? extra.description
										: undefined,
								decisionReason:
									typeof extra?.decisionReason === "string"
										? extra.decisionReason
										: undefined,
								blockedPath:
									typeof extra?.blockedPath === "string"
										? extra.blockedPath
										: undefined,
								suggestions: Array.isArray(extra?.suggestions)
									? extra.suggestions
									: undefined,
								expiresAt: Date.now() + timeoutMs,
							};
							emit(options.getMainWindow, {
								runId,
								type: "interaction_request",
								request,
							});

							const decision = await interactionBroker.createRequest(
								runId,
								requestId,
								timeoutMs,
							);
							if (decision.behavior === "allow") {
								return {
									behavior: "allow",
									updatedInput: decision.updatedInput ?? rewrittenInput,
									updatedPermissions: Array.isArray(decision.updatedPermissions)
										? (decision.updatedPermissions as any)
										: undefined,
								};
							}
							return {
								behavior: "deny",
								message: decision.message || "User denied",
								interrupt: decision.interrupt,
							};
						},
					} as any, // Cast to any to allow stream property
				});
				runRegistry.updateQuery(runId, q as any);

				let sawResult = false;
				// Accumulate token usage from SDK stream events
				let accumulatedInputTokens = 0;
				let accumulatedOutputTokens = 0;
				let accumulatedCacheReadInputTokens = 0;
				let accumulatedCacheCreationInputTokens = 0;
				const contentBlockKindByIndex = new Map<number, string>();
				for await (const msg of q) {
					// Avoid logging every stream delta; it can freeze the app.
					const msgAny = msg as any;
					const debug = process.env.AGENT_SDK_DEBUG === "1";
					if (debug) {
						const t = String(msgAny?.type || "");
						const isTextDelta =
							t === "stream_event" &&
							msgAny?.event?.type === "content_block_delta" &&
							msgAny?.event?.delta?.type === "text_delta";
						if (!isTextDelta) {
							const subtype =
								t === "stream_event"
									? String(msgAny?.event?.type || "")
									: String(msgAny?.subtype || "");
							console.log("[agentSdk] msg:", t, subtype);
						}
					}
					if (
						msgAny?.type === "stream_event" &&
						msgAny?.event?.type === "content_block_start" &&
						msgAny?.event?.content_block?.type === "tool_use"
					) {
						const id = String(msgAny.event.content_block.id || "");
						const name = String(msgAny.event.content_block.name || "");
						if (id) toolNameById.set(id, name);
						const idx = Number(msgAny.event.index);
						if (id && Number.isFinite(idx)) toolUseIdByIndex.set(idx, id);
						// Some upstreams may include input inline; capture if present.
						if (id && msgAny.event.content_block.input) {
							try {
								toolInputJsonById.set(
									id,
									JSON.stringify(msgAny.event.content_block.input ?? {}),
								);
							} catch {}
						}
					}
					if (
						msgAny?.type === "stream_event" &&
						msgAny?.event?.type === "content_block_delta" &&
						msgAny?.event?.delta?.type === "input_json_delta" &&
						typeof msgAny.event.delta.partial_json === "string"
					) {
						const idx = Number(msgAny.event.index);
						const id = Number.isFinite(idx)
							? toolUseIdByIndex.get(idx)
							: undefined;
						if (id) {
							const prev = toolInputJsonById.get(id) || "";
							toolInputJsonById.set(id, prev + msgAny.event.delta.partial_json);
						}
					}
					// Extract token usage from stream events (message_start contains input_tokens, message_delta contains output_tokens)
					if (
						msgAny?.type === "stream_event" &&
						msgAny?.event?.type === "message_start" &&
						msgAny?.event?.message?.usage
					) {
						const usage = msgAny.event.message.usage;
						if (typeof usage.input_tokens === "number") {
							accumulatedInputTokens += usage.input_tokens;
						}
						if (typeof usage.cache_read_input_tokens === "number") {
							accumulatedCacheReadInputTokens += usage.cache_read_input_tokens;
						}
						if (typeof usage.cache_creation_input_tokens === "number") {
							accumulatedCacheCreationInputTokens +=
								usage.cache_creation_input_tokens;
						}
					}
					if (
						msgAny?.type === "stream_event" &&
						msgAny?.event?.type === "message_delta" &&
						msgAny?.event?.usage
					) {
						const usage = msgAny.event.usage;
						if (typeof usage.output_tokens === "number") {
							accumulatedOutputTokens += usage.output_tokens;
						}
						if (typeof usage.cache_read_input_tokens === "number") {
							accumulatedCacheReadInputTokens += usage.cache_read_input_tokens;
						}
						if (typeof usage.cache_creation_input_tokens === "number") {
							accumulatedCacheCreationInputTokens +=
								usage.cache_creation_input_tokens;
						}
					}
					if (msgAny?.type === "assistant" && msgAny?.message) {
						const blocks = Array.isArray(msgAny.message.content)
							? msgAny.message.content
							: [];
						for (const b of blocks) {
							if (b?.type !== "tool_use") continue;
							const id = String(b?.id || "");
							const name = String(b?.name || "");
							if (id && name) toolNameById.set(id, name);
							if (id && b?.input) {
								try {
									toolInputJsonById.set(id, JSON.stringify(b.input ?? {}));
								} catch {}
							}
						}
					}
					if (msgAny?.type === "user" && msgAny?.message) {
						logToolUseError(msgAny);
					}
					emit(options.getMainWindow, {
						runId,
						type: "sdk_message",
						message: msg,
					});
					const uiEvents = toUIEvents(msg as any, {
						rewriteToolResultOutput: (toolUseId, output) => {
							const persistedPaths = taskImagePathsByToolUseId.get(toolUseId);
							if (!persistedPaths || persistedPaths.length === 0) return output;
							return buildUiToolResultOutput(output, persistedPaths);
						},
						contentBlockKindByIndex,
					});
					if (uiEvents.length > 0) {
						emit(options.getMainWindow, {
							runId,
							type: "transformed",
							events: uiEvents,
						});
						// 检查是否有 tool_block_stop 事件，如果有则发送完整的工具输入
						for (const ev of uiEvents) {
							if (
								ev.type === "tool_block_stop" &&
								typeof ev.index === "number"
							) {
								const toolId = toolUseIdByIndex.get(ev.index);
								if (toolId) {
									const inputJsonStr = toolInputJsonById.get(toolId);
									if (inputJsonStr) {
										let parsedInput: Record<string, unknown> = {};
										try {
											parsedInput = JSON.parse(inputJsonStr);
										} catch {}
										// 发送 tool_input_complete 事件
										emit(options.getMainWindow, {
											runId,
											type: "transformed",
											events: [
												{
													type: "tool_input_complete",
													id: toolId,
													input: parsedInput,
												},
											],
										});
									}
								}
							}
						}
					}
					if ((msg as any)?.type === "result") {
						sawResult = true;
						// Attach accumulated usage to the result
						const resultWithUsage = {
							...(msg as any),
							usage:
								accumulatedInputTokens > 0 ||
								accumulatedOutputTokens > 0 ||
								accumulatedCacheReadInputTokens > 0 ||
								accumulatedCacheCreationInputTokens > 0
									? {
											input_tokens: accumulatedInputTokens,
											output_tokens: accumulatedOutputTokens,
											cache_read_input_tokens:
												accumulatedCacheReadInputTokens,
											cache_creation_input_tokens:
												accumulatedCacheCreationInputTokens,
										}
									: (msg as any)?.usage,
						};
						emit(options.getMainWindow, {
							runId,
							type: "done",
							result: resultWithUsage,
						});
					}
				}
				if (!sawResult) {
					emit(options.getMainWindow, {
						runId,
						type: "done",
							result: {
								type: "result",
								subtype: "success",
								is_error: false,
								result: "",
								usage:
									accumulatedInputTokens > 0 ||
									accumulatedOutputTokens > 0 ||
									accumulatedCacheReadInputTokens > 0 ||
									accumulatedCacheCreationInputTokens > 0
										? {
												input_tokens: accumulatedInputTokens,
												output_tokens: accumulatedOutputTokens,
												cache_read_input_tokens:
													accumulatedCacheReadInputTokens,
												cache_creation_input_tokens:
													accumulatedCacheCreationInputTokens,
											}
										: undefined,
							},
					});
				}
			} catch (e) {
				const error = e instanceof Error ? e.message : String(e);
				const retryable = isRetryableError(error);
				logger.error({
					msg: "agent_sdk runner error",
					scope: "agent",
					runId,
					error,
					retryable,
				});
				// 发送错误事件，包含是否可重试的信息
				emit(options.getMainWindow, {
					runId,
					type: "error",
					error,
					retryable,
					retryConfig: retryable
						? {
								maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
								baseDelayMs: DEFAULT_RETRY_CONFIG.baseDelayMs,
							}
						: undefined,
				} as any);
			} finally {
				interactionBroker.clearRun(runId);
				runRegistry.markCompleted(runId);
			}
		})();

		return runId;
	};

	const agent_sdk_abort = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkAbortInput,
	): Promise<AgentSdkAbortOutput> => {
		const run = runRegistry.get(input.runId);
		if (run) {
			run.abortController.abort();
			interactionBroker.clearRun(input.runId);
			runRegistry.delete(input.runId);
		}
		return { success: true };
	};

	const agent_sdk_resolve_interaction = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkResolveInteractionInput,
	): Promise<AgentSdkResolveInteractionOutput> => {
		const resolved = interactionBroker.resolve(
			input.runId,
			input.requestId,
			input.decision,
		);
		return { success: resolved };
	};

	const agent_sdk_control = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkControlInput,
	): Promise<AgentSdkControlOutput> => {
		const run = runRegistry.get(input.runId);
		if (!run?.query) {
			return {
				success: false,
				error: `Run not found: ${input.runId}`,
			};
		}

		try {
			switch (input.action) {
				case "set_permission_mode":
					if (
						typeof input.mode !== "string" ||
						!input.mode.trim() ||
						typeof run.query.setPermissionMode !== "function"
					) {
						return { success: false, error: "Invalid mode" };
					}
					await run.query.setPermissionMode(input.mode.trim());
					return { success: true };
				case "set_model":
					if (typeof run.query.setModel !== "function") {
						return { success: false, error: "setModel not supported" };
					}
					await run.query.setModel(
						typeof input.model === "string" ? input.model : undefined,
					);
					return { success: true };
				case "interrupt":
					if (typeof run.query.interrupt === "function") {
						await run.query.interrupt();
					} else {
						run.abortController.abort();
					}
					return { success: true };
				case "mcp_status":
					if (typeof run.query.mcpServerStatus !== "function") {
						return { success: false, error: "mcpServerStatus not supported" };
					}
					return {
						success: true,
						data: await run.query.mcpServerStatus(),
					};
				case "mcp_reconnect":
					if (
						typeof run.query.reconnectMcpServer !== "function" ||
						typeof input.serverName !== "string" ||
						!input.serverName.trim()
					) {
						return { success: false, error: "Invalid serverName" };
					}
					await run.query.reconnectMcpServer(input.serverName.trim());
					return { success: true };
				case "mcp_toggle":
					if (
						typeof run.query.toggleMcpServer !== "function" ||
						typeof input.serverName !== "string" ||
						!input.serverName.trim() ||
						typeof input.enabled !== "boolean"
					) {
						return { success: false, error: "Invalid mcp_toggle input" };
					}
					await run.query.toggleMcpServer(
						input.serverName.trim(),
						input.enabled,
					);
					return { success: true };
				case "mcp_set_servers":
					if (
						typeof run.query.setMcpServers !== "function" ||
						!input.servers ||
						typeof input.servers !== "object"
					) {
						return { success: false, error: "Invalid servers" };
					}
					return {
						success: true,
						data: await run.query.setMcpServers(
							input.servers as Record<string, unknown>,
						),
					};
				default:
					return {
						success: false,
						error: `Unsupported action: ${String((input as any).action || "")}`,
					};
			}
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	};

	return {
		agent_sdk_start,
		agent_sdk_abort,
		agent_sdk_resolve_interaction,
		agent_sdk_control,
	};
}
