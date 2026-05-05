import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import { isRetryableError, DEFAULT_RETRY_CONFIG } from "../../utils/retryUtils";
import { isWikiDirExists } from "../../kb/wiki/wikiFs";

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
	uniqStrings,
	normalizeAdditionalDirectories,
	normalizePlugins,
	resolveSkillSettingSources,
	listProjectSkills,
	syncSkillsToCwd,
	writeClaudeConfigSettings,
	loadClaudeMdChain,
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
	resolveToolFilePathEx,
	isSensitivePath,
	isSystemWriteBlocked,
	rewriteBashCommandForMissingFile,
	rewritePathsDeep,
} from "./agentSdk/fileResolver";
import { analyzeBashCommand } from "./agentSdk/bashAnalyzer";
import {
	buildMissingRequiredToolParamsMessage,
	getMissingRequiredToolParams,
	hasRequiredToolParamValue,
	normalizeToolNameKey,
	shouldPreserveEmptyStringParam,
} from "./agentSdk/toolValidation";
import type { AgentModelSettingsLike } from "./agentSdk/scenarioAgents";
import {
	buildMultiAgentRuntime,
	buildRuntimeMetadata,
	normalizeMultiAgentMode,
	normalizeTeammateMode,
} from "./agentSdk/multiAgentRuntime";
import {
	createAgentModelSettingsLoader,
	mergeUpdatedToolInput,
} from "./agentSdk/modelSettingsLoader";

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

	const loadAgentModelSettingsFromDb = createAgentModelSettingsLoader({
		db: options.db,
		logger,
	});

	const agent_sdk_start = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkStartInput,
	): Promise<AgentSdkStartOutput> => {
		const runId = randomUUID();
		const abortController = new AbortController();
		runRegistry.set(runId, { abortController });

		(async () => {
			// 收集 assistant 回复文本用于记忆提取（声明在 try 外层以便 finally 可访问）
			const assistantTextParts: string[] = [];
			try {
				const sdk = await import("@anthropic-ai/claude-agent-sdk");
				// 收集 stderr 关键错误信息，用于在 sawResult=false 时提供更有意义的错误
				const stderrErrors: string[] = [];
				const stderr = (data: string) => {
					const normalizedData =
						typeof data === "string" ? data.slice(0, 20000) : String(data);
					const isErrorLike =
						typeof data === "string" &&
						/error|exception|fail|crash|closed/i.test(data);
					const logPayload = {
						msg: "agent_sdk stderr",
						scope: "agent",
						runId,
						data: normalizedData,
					};
					if (isErrorLike) {
						logger.error(logPayload);
					} else {
						logger.info(logPayload);
					}
					// 收集关键错误信息
					if (isErrorLike) {
						stderrErrors.push(data.slice(0, 500));
					}
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
				const preToolInputByToolUseId = new Map<
					string,
					Record<string, unknown>
				>();
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

				const cwd =
					input.cwd && input.cwd.trim() ? input.cwd.trim() : process.cwd();
				const userShell =
					typeof process.env.SHELL === "string" ? process.env.SHELL : null;
				const userPath = await resolveUserPathFromShell(userShell);
				const resolvedPath = userPath || process.env.PATH;

				// 代理模式：通过本地代理路由所有 API 流量（支持多 Provider 转发和模型路由）
				const claudeConfigDir: string = cwd;

				// IMPORTANT: pass base URL without "/v1". The Claude Code CLI appends "/v1" itself.
				const anthropicBaseUrl = (await options.getAnthropicBaseUrl()).replace(
					/\/v1\/?$/i,
					"",
				);

				const anthropicApiKeyRaw =
					typeof process.env.ANTHROPIC_API_KEY === "string"
						? process.env.ANTHROPIC_API_KEY.trim()
						: "";
				const anthropicApiKey =
					anthropicApiKeyRaw ||
					"sk-ant-api03-dummy000000000000000000000000000000000000";

				try {
					await writeClaudeConfigSettings({
						claudeConfigDir,
						anthropicApiKey,
					});
				} catch {}

				logger.info({
					msg: "agent_sdk start",
					scope: "agent",
					runId,
					cwd,
					model: input.model,
					anthropicBaseUrl,
					claudeConfigDir,
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
				const skillsFromInput = normalizeStringArray((input as any).skills);
				const appSkillSelectionProvided = Array.isArray((input as any).skills);

				// 验证 wiki_scope_path（需要实际存在 .llm-wiki/ 目录才生效）
				const resolvedWikiScopePath =
					input.wiki_scope_path && input.wiki_scope_path.trim()
						? (await isWikiDirExists(input.wiki_scope_path.trim()))
							? input.wiki_scope_path.trim()
							: undefined
						: undefined;

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
				const agentModelSettings =
					(await loadAgentModelSettingsFromDb()) as AgentModelSettingsLike | null;
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
				// 默认不限制主代理轮数（undefined → SDK 不强制截断），让长程任务能完整推进。
				// 调用方/设置面板仍可通过 input.max_turns / runtimeConfig.maxTurns 显式覆盖。
				// 失控保护交给 max_budget_usd 和用户的 abort 能力。
				const maxTurns =
					normalizeNumber((input as any).max_turns) ??
					normalizeNumber(runtimeConfig?.maxTurns);
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
				const effectiveSettingSources = resolveSkillSettingSources(
					settingSources,
					appSkillSelectionProvided ? skillsFromInput : undefined,
				);
				const betas = uniqStrings(
					normalizeStringArray(
						(input as any).betas ?? runtimeConfig?.betas ?? [],
					),
				);
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
				if (appSkillSelectionProvided) {
					await syncSkillsToCwd(cwd, stderr, skillsFromInput);
				}
				const projectSkills = await listProjectSkills(cwd);
				logger.info({
					msg: appSkillSelectionProvided
						? "agent_sdk managed skills prepared"
						: "agent_sdk native skills prepared",
					scope: "agent",
					runId,
					inputSkillsCount: skillsFromInput.length,
					inputSkillsPreview: skillsFromInput.slice(0, 8),
					projectSkillsCount: projectSkills.length,
					projectSkillsPreview: projectSkills.slice(0, 8),
					settingSources,
					effectiveSettingSources,
				});
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
					runtimeMetadata,
				});

				const lifecycleHooks = createLifecycleHooks({
					logger,
					runId,
					stderr,
					emitLifecycleEvent,
					runtimeMetadata,
					experimentalMultiAgentEnabled: multiAgentRuntime.experimentalEnabled,
				});
				const allowedToolsForRun = uniqStrings(
					multiAgentRuntime.experimentalEnabled &&
						multiAgentRuntime.multiAgentMode !== "subagent_only"
						? [...allowed, "Teammate"]
						: [...allowed],
				);

				// 当应用侧传入 skills 数组时，左栏启用状态成为 Skill Tool 的真实边界：
				// 先同步到项目沙盒，再仅从 project settings 加载，避免外部命令/用户级技能漂移。

				// 【调试】确认 canUseTool 被传入 options
				console.log(
					`[agent_sdk] About to call sdk.query with cwd='${cwd}', hasCanUseTool=true`,
				);

				// 【调试】记录传递给 SDK 的 agents 配置
				logger.info({
					msg: "agent_sdk native prompt mode before sdk.query",
					scope: "agent",
					runId,
					hasExplicitAllowedTools,
					settingSources: effectiveSettingSources,
					allowedToolsCount: allowedToolsForRun.length,
					allowedToolsHasTask: allowedToolsForRun.includes("Task"),
					allowedToolsHasTeammate: allowedToolsForRun.includes("Teammate"),
					multiAgentRuntime,
					agents: "filesystem/native",
				});

				// Fix: SDK uses import.meta.url to resolve cli.js at runtime. When the SDK
				// gets bundled into dist-electron/sdk-*.js, import.meta.url points to
				// dist-electron/ instead of node_modules/, causing "Cannot find module
				// dist-electron/cli.js". Passing pathToClaudeCodeExecutable explicitly
				// bypasses the import.meta.url lookup entirely.
				const sdkCliPath = (() => {
					const appRoot = process.env.APP_ROOT ?? "";
					if (!appRoot) return undefined;
					const candidate = path.join(
						appRoot,
						"node_modules",
						"@anthropic-ai",
						"claude-agent-sdk",
						"cli.js",
					);
					return fs.existsSync(candidate) ? candidate : undefined;
				})();

				// 主动加载 CLAUDE.md 链（用户级 + 项目级），与 input.system_prompt
				// 一起注入到 preset 的 append 字段。这是兜底机制：即使 SDK 的
				// settingSources 动态注入失效，CLAUDE.md 也总能被 agent 看到。
				const claudeMdChain = await loadClaudeMdChain(cwd);
				const userSystemPrompt =
					typeof input.system_prompt === "string" && input.system_prompt.trim()
						? input.system_prompt.trim()
						: "";
				const appendBlocks: string[] = [];
				if (claudeMdChain) appendBlocks.push(claudeMdChain);
				if (userSystemPrompt) appendBlocks.push(userSystemPrompt);
				const systemPromptAppend =
					appendBlocks.length > 0
						? appendBlocks.join("\n\n---\n\n")
						: undefined;

				const q = sdk.query({
					prompt: String(input.prompt ?? ""),
					options: {
						abortController,
						cwd,
						pathToClaudeCodeExecutable: sdkCliPath,
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
											const toolUseId =
												typeof (hookInput as any).tool_use_id === "string"
													? String((hookInput as any).tool_use_id).trim()
													: "";

											if (
												toolUseId &&
												toolInput &&
												typeof toolInput === "object"
											) {
												preToolInputByToolUseId.set(toolUseId, {
													...(toolInput as Record<string, unknown>),
												});
											}

											console.log(
												`[PreToolUse] Tool='${toolName}', Input=${JSON.stringify(toolInput).slice(0, 200)}`,
											);

											const toolLower = String(toolName).toLowerCase();

											// 处理 Task(subagent) 调用：仅做重复调用防护，不改写 SDK 原生 subagent 输入。
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
											}

											let effectiveToolInput: Record<string, unknown> =
												toolInput && typeof toolInput === "object"
													? { ...(toolInput as Record<string, unknown>) }
													: {};

											// 通用清洗：移除空字符串参数（如 pages: ""、pattern: "" 等）
											// 模型（尤其非 Claude 模型）经常为可选参数生成空字符串，导致 SDK 校验失败
											if (toolInput && typeof toolInput === "object") {
												const sanitizedInput: Record<string, unknown> = {};
												let hasSanitized = false;
												for (const [k, v] of Object.entries(toolInput)) {
													if (v === "") {
														if (shouldPreserveEmptyStringParam(toolName, k)) {
															sanitizedInput[k] = v;
															continue;
														}
														hasSanitized = true;
														console.log(
															`[PreToolUse] ✓ Stripped empty param '${k}' from ${toolName}`,
														);
														continue;
													}
													sanitizedInput[k] = v;
												}
												effectiveToolInput = sanitizedInput;
												if (
													normalizeToolNameKey(toolName) === "read" &&
													!hasRequiredToolParamValue(effectiveToolInput, {
														name: "file_path",
														aliases: ["path", "file"],
													})
												) {
													const guessed =
														await guessDefaultReadableFilePath(cwd);
													if (guessed) {
														effectiveToolInput = {
															...effectiveToolInput,
															file_path: guessed,
														};
														hasSanitized = true;
														console.log(
															`[PreToolUse] ✓ Auto-filled Read file_path='${guessed}'`,
														);
													}
												}
												const missingRequired = getMissingRequiredToolParams(
													toolName,
													effectiveToolInput,
												);
												if (missingRequired.length > 0) {
													const reason = buildMissingRequiredToolParamsMessage(
														toolName,
														missingRequired,
													);
													stderr(
														`[PreToolUse] Denied invalid ${toolName}: ${reason}`,
													);
													return {
														continue: true,
														hookSpecificOutput: {
															hookEventName: "PreToolUse" as const,
															permissionDecision: "deny" as const,
															permissionDecisionReason: reason,
														},
													};
												}
												if (hasSanitized) {
													if (toolUseId) {
														preToolInputByToolUseId.set(toolUseId, {
															...sanitizedInput,
														});
													}
													return {
														continue: true,
														hookSpecificOutput: {
															hookEventName: "PreToolUse" as const,
															permissionDecision: "allow" as const,
															updatedInput: sanitizedInput,
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
													typeof effectiveToolInput.file_path === "string"
														? "file_path"
														: typeof effectiveToolInput.path === "string"
															? "path"
															: typeof effectiveToolInput.file === "string"
																? "file"
																: null;

												if (key) {
													const rawPath = String(
														effectiveToolInput[key] || "",
													).trim();
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
															const nextUpdatedInput = {
																...effectiveToolInput,
																[key]: resolved,
																file_path: resolved,
															};
															if (toolUseId) {
																preToolInputByToolUseId.set(
																	toolUseId,
																	nextUpdatedInput as Record<string, unknown>,
																);
															}
															return {
																continue: true,
																hookSpecificOutput: {
																	hookEventName: "PreToolUse" as const,
																	permissionDecision: "allow" as const,
																	updatedInput: nextUpdatedInput,
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
													const nextUpdatedInput = {
														...toolInput,
														command: rewritten,
													};
													if (toolUseId) {
														preToolInputByToolUseId.set(
															toolUseId,
															nextUpdatedInput as Record<string, unknown>,
														);
													}
													return {
														continue: true,
														hookSpecificOutput: {
															hookEventName: "PreToolUse" as const,
															permissionDecision: "allow" as const,
															updatedInput: nextUpdatedInput,
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
						},
						permissionMode: permissionModeForRun as any,
						additionalDirectories: (() => {
							const dirs = [...additionalDirectories];
							// 把 wiki scope 目录加入 additionalDirectories，
							// 让 SDK 的文件工具能正确解析该目录下的相对路径，
							// 且读取 raw sources 时不会因路径解析失败被拒绝。
							if (
								resolvedWikiScopePath &&
								!dirs.includes(resolvedWikiScopePath)
							) {
								dirs.push(resolvedWikiScopePath);
							}
							return dirs.length > 0 ? dirs : undefined;
						})(),
						plugins: plugins.length > 0 ? plugins : undefined,
						sandbox: sandboxSettings as any,
						// CRITICAL: settingSources 告诉 SDK 从文件系统加载 skills
						// 应用侧传入 skills 时改为 project-only，确保左栏 Skill 管理真实生效。
						settingSources: effectiveSettingSources as any,
						tools: hasExplicitAllowedTools
							? allowedToolsForRun
							: { type: "preset", preset: "claude_code" },
						extraArgs: multiAgentRuntime.experimentalEnabled
							? {
									"agent-id": runId,
									"team-name": multiAgentRuntime.teamId,
									"agent-name": "leader",
									"agent-type": "leader",
									...(multiAgentRuntime.parentSessionId
										? { "parent-session-id": multiAgentRuntime.parentSessionId }
										: {}),
									"teammate-mode": multiAgentRuntime.teammateMode,
								}
							: undefined,
						env: (() => {
							const env: Record<string, string> = {};
							for (const [k, v] of Object.entries(process.env)) {
								if (typeof v === "string") env[k] = v;
							}

							if (resolvedPath) env.PATH = resolvedPath;

							// 代理模式：覆盖环境变量以路由流量到本地代理
							// Avoid inheriting user account/session routing that could bypass our proxy.
							delete env.ANTHROPIC_AUTH_TOKEN;
							delete env.CLAUDE_CODE_OAUTH_TOKEN;
							delete env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR;
							delete env.CLAUDE_CODE_SESSION_ACCESS_TOKEN;
							delete env.CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR;
							delete env.CLAUDE_CODE_WEBSOCKET_AUTH_FILE_DESCRIPTOR;

							env.CLAUDE_CONFIG_DIR = claudeConfigDir;
							// CRITICAL: do NOT append "/v1" here. The CLI constructs "/v1/messages" internally.
							env.ANTHROPIC_BASE_URL = anthropicBaseUrl;
							env.ANTHROPIC_API_KEY = anthropicApiKey;
							// Some CLI code paths look at this name instead.
							env.CLAUDE_CODE_API_BASE_URL = anthropicBaseUrl;

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
						// 使用 Claude Code 原生 preset，保留动态章节（cwd / git 状态 / TodoWrite 引导
						// / "坚持干完"等指令），这是 agent "活人感"和"自驱续航"的来源。
						// CLAUDE.md（项目+用户）已在主进程显式读取并通过 append 拼接，作为兜底。
						systemPrompt: {
							type: "preset" as const,
							preset: "claude_code" as const,
							...(systemPromptAppend ? { append: systemPromptAppend } : {}),
						},
						canUseTool: async (
							toolName: string,
							toolInput: any,
							extra: any,
						) => {
							console.log(
								`[canUseTool] Tool='${toolName}', AgentID='${(extra as any)?.agentID || "main"}', Input=${JSON.stringify(toolInput || {}).slice(0, 200)}`,
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
							const toolLower = String(toolName || "").toLowerCase();
							const currentToolUseId =
								typeof extra?.toolUseID === "string"
									? String(extra.toolUseID).trim()
									: "";
							const preToolInput =
								currentToolUseId &&
								preToolInputByToolUseId.has(currentToolUseId)
									? preToolInputByToolUseId.get(currentToolUseId)
									: undefined;
							if (
								toolLower === "bash" &&
								typeof rewrittenInput.command !== "string" &&
								preToolInput &&
								typeof preToolInput.command === "string" &&
								preToolInput.command.trim()
							) {
								rewrittenInput = {
									...preToolInput,
									...rewrittenInput,
									command: preToolInput.command,
								};
								stderr(
									`[agent_sdk] Restored missing Bash command from PreToolUse cache (toolUseId=${currentToolUseId})`,
								);
							}

							// 通用清洗：移除空字符串参数（如 pages: ""、pattern: "" 等）
							// 非 Claude 模型（GPT-5.5、Gemini 等）经常为可选参数生成空字符串，
							// 导致 SDK 内部校验失败（如 "Invalid pages parameter: """）。
							// 必须在 canUseTool 中清洗，因为 canUseTool 返回的 updatedInput
							// 优先于 PreToolUse hook 的 updatedInput。
							{
								const keysToRemove: string[] = [];
								for (const [k, v] of Object.entries(rewrittenInput)) {
									if (v === "") {
										if (shouldPreserveEmptyStringParam(toolName, k)) {
											continue;
										}
										keysToRemove.push(k);
									}
								}
								if (keysToRemove.length > 0) {
									for (const k of keysToRemove) {
										delete rewrittenInput[k];
									}
									stderr(
										`[canUseTool] Stripped empty params from ${toolName}: ${keysToRemove.join(", ")}`,
									);
								}
							}

							if (
								toolLower === "read" &&
								!hasRequiredToolParamValue(rewrittenInput, {
									name: "file_path",
									aliases: ["path", "file"],
								})
							) {
								const guessed = await guessDefaultReadableFilePath(cwd);
								if (guessed) {
									stderr(
										`[agent_sdk] Auto-filled Read file_path='${guessed}' (missing in tool input)`,
									);
									rewrittenInput = { ...rewrittenInput, file_path: guessed };
								}
							}

							const missingRequired = getMissingRequiredToolParams(
								toolName,
								rewrittenInput,
							);
							if (missingRequired.length > 0) {
								const message = buildMissingRequiredToolParamsMessage(
									toolName,
									missingRequired,
								);
								stderr(`[canUseTool] Denied invalid ${toolName}: ${message}`);
								return {
									behavior: "deny",
									message,
								};
							}

							// 跟踪工具操作的范围信息（用于前端 UI 展示）
							let toolScope:
								| {
										insideSandbox: boolean;
										targetPath?: string;
										destructiveLevel?: "safe" | "moderate" | "dangerous";
										reason?: string;
								  }
								| undefined;

							// ============================================================
							// 文件工具路径解析 — 支持全局文件访问
							// ============================================================
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
										// 敏感路径检查 — 硬拒绝
										if (isSensitivePath(rawPath)) {
											return {
												behavior: "deny",
												message: `访问被拒绝：该路径包含敏感信息 (${rawPath})`,
											};
										}

										// 使用支持全局访问的路径解析
										const resolved = await resolveToolFilePathEx({
											cwd,
											rawPath,
											allowGlobal: true,
										});

										if (resolved && resolved.path !== rawPath) {
											stderr(
												`[agent_sdk] Resolved ${toolName} path '${rawPath}' -> '${resolved.path}' (sandbox=${resolved.insideSandbox})`,
											);
											rewrittenInput = {
												...inputAny,
												[key]: resolved.path,
												file_path: resolved.path,
											};
										}

										if (!resolved) {
											stderr(
												`[agent_sdk] Failed to resolve ${toolName} path '${rawPath}'`,
											);
											return {
												behavior: "deny",
												message: `文件路径未找到: ${rawPath}。请使用 Glob 工具查找文件，或使用完整的绝对路径。`,
											};
										}

										// 写入操作的额外安全检查
										const isWriteOp =
											toolLower === "write" || toolLower === "edit";
										if (isWriteOp && isSystemWriteBlocked(resolved.path)) {
											return {
												behavior: "deny",
												message: `系统目录写入被禁止: ${resolved.path}`,
											};
										}

										// 设置 scope 信息
										toolScope = {
											insideSandbox: resolved.insideSandbox,
											targetPath: resolved.path,
											destructiveLevel: isWriteOp
												? resolved.insideSandbox
													? "safe"
													: "moderate"
												: "safe",
											reason:
												isWriteOp && !resolved.insideSandbox
													? `写入沙盒外文件: ${resolved.path}`
													: undefined,
										};

										// 读取操作 — 全局自动通过（无需审批）
										if (!isWriteOp) {
											toolScope = undefined;
										}

										// 沙盒内写入 — 自动通过
										if (isWriteOp && resolved.insideSandbox) {
											toolScope = undefined;
										}

										// Wiki 目录写入 — 自动通过
										// Karpathy LLM Wiki 模式：agent 是 wiki 页面的维护者，
										// 必须能自由写入 .llm-wiki/（ingest 一次可更新 10-15 个页面），
										// 如果每次都弹审批会完全阻断 ingest/backfill 工作流。
										// 注意：只自动通过 .llm-wiki/ 目录，raw sources 仍需审批。
										if (isWriteOp && resolvedWikiScopePath && toolScope) {
											const wikiDir = path.join(
												resolvedWikiScopePath,
												".llm-wiki",
											);
											const normalizedTarget = path.normalize(resolved.path);
											const normalizedWikiDir = path.normalize(wikiDir);
											if (
												normalizedTarget === normalizedWikiDir ||
												normalizedTarget.startsWith(
													normalizedWikiDir + path.sep,
												)
											) {
												toolScope = undefined;
											}
										}
									}
								}
							}

							// Bash 命令分析 — 智能权限判断
							// ============================================================
							if (
								toolLower === "bash" &&
								toolInput &&
								typeof toolInput === "object" &&
								typeof (rewrittenInput as any).command === "string"
							) {
								const cmd = String((rewrittenInput as any).command || "");

								// 修复缺失文件的 Bash 命令
								const rewritten = await rewriteBashCommandForMissingFile({
									cwd,
									command: cmd,
								});
								if (rewritten && rewritten !== cmd) {
									stderr(
										`[agent_sdk] Auto-rewrote Bash command: '${cmd}' -> '${rewritten}'`,
									);
									rewrittenInput = {
										...(rewrittenInput as any),
										command: rewritten,
									};
								}

								// 分析 Bash 命令安全性
								const finalCmd = String((rewrittenInput as any).command || cmd);
								const analysis = analyzeBashCommand(finalCmd, cwd);
								stderr(
									`[agent_sdk] Bash analysis: readOnly=${analysis.isReadOnly}, destructive=${analysis.destructiveLevel}, outsideSandbox=${analysis.targetsOutsideSandbox}, reason='${analysis.reason}'`,
								);

								toolScope = {
									insideSandbox: !analysis.targetsOutsideSandbox,
									targetPath: analysis.targetPaths[0],
									destructiveLevel: analysis.destructiveLevel,
									reason: analysis.reason,
								};

								// 只读且安全的命令 — 直接放行，永远不弹审批。
								// 对齐 Claude Code CLI：ls/cat/rg/find/git status 等命令应"按键即过"。
								if (
									analysis.isReadOnly &&
									analysis.destructiveLevel === "safe" &&
									!analysis.targetsOutsideSandbox
								) {
									stderr(
										`[agent_sdk] Bash auto-approved (readOnly + safe): '${finalCmd.slice(0, 120)}'`,
									);
									return {
										behavior: "allow",
										updatedInput: rewrittenInput,
									};
								}

								// 安全命令（非只读但分析判定为 safe，例如 echo/printf）— 也自动通过
								if (
									analysis.isReadOnly &&
									analysis.destructiveLevel === "safe"
								) {
									toolScope = undefined;
								}
							}

							// ============================================================
							// Skill 工具路径重写
							// ============================================================
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

							// AskUserQuestion 在 subagent 内触发时，依然走 interaction_request
							// （前端不区分 main/subagent，可正常弹卡片）。
							// 仅记录来源 agentID，便于排查。
							if (
								toolName === "AskUserQuestion" &&
								typeof extra?.agentID === "string" &&
								extra.agentID.trim()
							) {
								stderr(
									`[agent_sdk] AskUserQuestion triggered inside subagent agentID='${extra.agentID}', forwarding to UI`,
								);
							}

							// ============================================================
							// 非交互模式 — 全部自动通过（AskUserQuestion 除外）
							// ============================================================
							if (!interactiveApproval) {
								if (toolName === "AskUserQuestion") {
									return {
										behavior: "deny",
										message: "Interactive approval is disabled",
									};
								}
								return { behavior: "allow", updatedInput: rewrittenInput };
							}

							// ============================================================
							// AskUserQuestion — 强制走 interaction_request
							// 必须发送给前端，让前端弹出交互式选择卡片
							// ============================================================
							if (toolName === "AskUserQuestion") {
								const askReqId = randomUUID();
								const askTimeout = 55_000;
								const askToolUseId =
									typeof extra?.toolUseID === "string" ? extra.toolUseID : "";
								const askReq: AgentSdkInteractionRequestPayload = {
									requestId: askReqId,
									toolName,
									toolInput: rewrittenInput,
									toolUseId: askToolUseId,
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
									expiresAt: Date.now() + askTimeout,
								};
								emit(options.getMainWindow, {
									runId,
									type: "interaction_request",
									request: askReq,
								});
								const askDec = await interactionBroker.createRequest(
									runId,
									askReqId,
									askTimeout,
								);
								if (askDec.behavior === "allow") {
									const mergedUpdatedInput = mergeUpdatedToolInput(
										rewrittenInput,
										askDec.updatedInput,
									);
									return {
										behavior: "allow",
										updatedInput: mergedUpdatedInput,
										updatedPermissions: Array.isArray(askDec.updatedPermissions)
											? (askDec.updatedPermissions as any)
											: undefined,
									};
								}
								return {
									behavior: "deny",
									message: askDec.message || "User denied AskUserQuestion",
									interrupt: askDec.interrupt,
								};
							}
							// ============================================================
							// 智能自动通过判断
							// ============================================================
							// toolScope 为空表示操作是安全的（读取/沙盒内写入），直接通过
							if (!toolScope) {
								return { behavior: "allow", updatedInput: rewrittenInput };
							}

							// ============================================================
							// 需要用户审批 — 发送交互请求
							// ============================================================
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
								// 附带范围信息给前端
								scope: toolScope,
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
								const mergedUpdatedInput = mergeUpdatedToolInput(
									rewrittenInput,
									decision.updatedInput,
								);
								return {
									behavior: "allow",
									updatedInput: mergedUpdatedInput,
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
							if (b?.type === "text" && typeof b.text === "string") {
								assistantTextParts.push(b.text);
							}
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
											cache_read_input_tokens: accumulatedCacheReadInputTokens,
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
					// 检查是否有 SDK 内部错误（如 "Stream closed"），提供更有意义的错误信息
					const hasStreamClosedError = stderrErrors.some((e) =>
						/stream closed/i.test(e),
					);
					const hasCriticalError = stderrErrors.length > 0;

					if (hasStreamClosedError || hasCriticalError) {
						const errorSummary = hasStreamClosedError
							? "Agent SDK 内部通信流已关闭，可能是模型响应格式不兼容导致。请尝试切换模型或重新运行。"
							: `Agent 运行过程中出现错误: ${stderrErrors[0]?.slice(0, 200)}`;
						logger.warn({
							msg: "agent_sdk completed without result, stderr has errors",
							scope: "agent",
							runId,
							stderrErrorCount: stderrErrors.length,
							firstError: stderrErrors[0]?.slice(0, 300),
						});
						emit(options.getMainWindow, {
							runId,
							type: "error",
							error: errorSummary,
							retryable: true,
							retryConfig: {
								maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
								baseDelayMs: DEFAULT_RETRY_CONFIG.baseDelayMs,
							},
						} as any);
					} else {
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
				// 异步提取记忆（非阻塞）— 启用 LLM 深度提取
				try {
					const { extractAndSaveMemories } = await import(
						"./agentMemoryService"
					);
					const userPrompt = String(input.prompt ?? "");
					if (userPrompt.trim()) {
						const conversationMessages: Array<{
							role: "user" | "assistant";
							content: string;
						}> = [{ role: "user", content: userPrompt }];
						// 加入 assistant 回复以获得更完整的对话上下文
						try {
							const assistantText = assistantTextParts
								.join("\n")
								.slice(0, 5000);
							if (assistantText.trim()) {
								conversationMessages.push({
									role: "assistant",
									content: assistantText,
								});
							}
						} catch {
							// assistantTextParts 可能不在作用域内（try 块外）
						}

						extractAndSaveMemories(options.db, runId, conversationMessages, {
							useLlm: true,
						}).catch((err) => {
							logger.warn({
								msg: "Failed to extract memories after agent run",
								scope: "agent",
								runId,
								error: err instanceof Error ? err.message : String(err),
							});
						});
					}
				} catch {
					// 静默失败
				}
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
