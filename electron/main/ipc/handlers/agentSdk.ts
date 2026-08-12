import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import { isRetryableError, DEFAULT_RETRY_CONFIG } from "../../utils/retryUtils";
import { isWikiDirExists } from "../../kb/wiki/wikiFs";

import { interactionBroker } from "./agentSdk/interactionBroker";
import { runRegistry } from "./agentSdk/runRegistry";
import { normalizeSdkSessionId } from "./agentSdk/sessionId";
import {
	resolveUserPathFromShell,
	normalizeStringArray,
	normalizeNumber,
	normalizeSettingSources,
	normalizeToolSearchMode,
	normalizeThinkingLevel,
	type ThinkingLevel,
	uniqStrings,
	normalizeAdditionalDirectories,
	normalizePlugins,
	resolveSkillSettingSources,
	listProjectSkills,
	syncSkillsToCwd,
	prepareIsolatedClaudeConfigDir,
	writeClaudeConfigSettings,
} from "./agentSdk/configManager";
import {
	type AgentSdkInteractionRequestPayload,
	type GetMainWindow,
	emit,
	buildUiToolResultOutput,
	toUIEvents,
} from "./agentSdk/eventTransformer";
import {
	guessDefaultReadableFilePath,
	resolveToolFilePathEx,
	rewritePathsDeep,
} from "./agentSdk/fileResolver";
import {
	buildMissingRequiredToolParamsMessage,
	getMissingRequiredToolParams,
	hasRequiredToolParamValue,
	shouldPreserveEmptyStringParam,
} from "./agentSdk/toolValidation";
import type { AgentModelSettingsLike } from "./agentSdk/scenarioAgents";
import {
	buildMultiAgentRuntime,
	normalizeMultiAgentMode,
	normalizeTeammateMode,
} from "./agentSdk/multiAgentRuntime";
import {
	createAgentModelSettingsLoader,
	mergeUpdatedToolInput,
} from "./agentSdk/modelSettingsLoader";
import {
	createLocalWebSearchMcpServer,
	LOCAL_WEB_SEARCH_MCP_TOOL,
} from "./agentSdk/localWebSearchMcp";
import {
	createHarnessBridgeMcpServer,
	HARNESS_BRIDGE_PROMPT,
} from "./agentSdk/harnessBridgeMcp";
import { isHarnessBridgeEnabled } from "../../harnessHub/settings";
import {
	loadAndFreezeMemorySnapshot,
	releaseSnapshot,
	renderMemoryPromptSection,
} from "./agentSdk/memorySnapshot";
import { createMemoryMcpServer } from "./agentSdk/memoryTool";
import {
	getExpectedClaudeCodeExecutablePath,
	resolveClaudeCodeExecutablePath,
} from "./agentSdk/claudeExecutable";
import { getActiveStylePrompt } from "./styleProfile/styleProfileInjector";

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
type AgentSdkSendFollowupInput = IPCSchema["agent_sdk_send_followup"]["input"];
type AgentSdkSendFollowupOutput =
	IPCSchema["agent_sdk_send_followup"]["output"];
type AgentSdkCheckAliveInput = IPCSchema["agent_sdk_check_alive"]["input"];
type AgentSdkCheckAliveOutput = IPCSchema["agent_sdk_check_alive"]["output"];

function formatUnknownError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function safeJsonPreview(value: unknown, maxLength = 500): string {
	const seen = new WeakSet<object>();
	let text: string;
	try {
		text = JSON.stringify(value, (_key, nextValue) => {
			if (typeof nextValue === "bigint") return nextValue.toString();
			if (nextValue && typeof nextValue === "object") {
				if (seen.has(nextValue)) return "[Circular]";
				seen.add(nextValue);
			}
			return nextValue;
		});
	} catch (error) {
		text = `[Unserializable: ${formatUnknownError(error)}]`;
	}
	if (typeof text !== "string") text = String(value);
	return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

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
		runRegistry.set(runId, { abortController, alive: false });

		(async () => {
			try {
				const sdk = await import("@anthropic-ai/claude-agent-sdk");
				// 收集 stderr 关键错误信息，用于在 sawResult=false 时提供更有意义的错误
				const stderrErrors: string[] = [];
				const stderr = (data: string) => {
					try {
						const rawData = typeof data === "string" ? data : String(data);
						const normalizedData = rawData.slice(0, 20000);
						const isErrorLike = /error|exception|fail|crash|closed/i.test(
							rawData,
						);
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
							stderrErrors.push(rawData.slice(0, 500));
						}
						emit(options.getMainWindow, {
							runId,
							type: "stderr",
							error: rawData,
						});
					} catch (error) {
						try {
							console.error(
								"[agent_sdk] stderr forwarding failed:",
								formatUnknownError(error),
							);
						} catch {}
					}
				};
				const toolNameById = new Map<string, string>();
				const toolUseIdByIndex = new Map<number, string>();
				const toolInputJsonById = new Map<string, string>();
				const preToolInputByToolUseId = new Map<
					string,
					Record<string, unknown>
				>();
				const taskImagePathsByToolUseId = new Map<string, string[]>();
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

				// 与 Claude Code CLI 对齐：使用真实的用户级配置目录 ~/.claude，
				// 这样 SDK 能加载用户的 CLAUDE.md / agents / commands / skills /
				// output-styles / settings.json。实际传给 SDK 的是去掉 hooks 的托管镜像：
				// 保留资源能力，隔离外部 shell hooks，避免 hook_1 崩溃打断消息发送。
				const userClaudeConfigDir: string = path.join(os.homedir(), ".claude");
				const claudeConfigDir = await prepareIsolatedClaudeConfigDir({
					sourceClaudeConfigDir: userClaudeConfigDir,
				});

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

				// 默认 false：与 Claude Code CLI 的 --dangerously-skip-permissions 等效。
				// 把权限决策权交还给 SDK 的 permissionMode（bypassPermissions）和 OS 文件权限，
				// 不再用上层弹卡阻断 agent 的工作流。AskUserQuestion 仍走交互通道。
				const interactiveApproval =
					typeof input.interactive_approval === "boolean"
						? input.interactive_approval
						: false;
				// 仅当调用方显式给出 allowed_tools 数组时才进入"显式裁剪"分支。
				// undefined / null / 非数组都走 SDK 的 preset (claude_code) 默认全工具集，
				// 这是让 agent 接近 Claude Code 体验的关键路径。
				const hasExplicitAllowedTools = Array.isArray(
					(input as any).allowed_tools,
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
				const thinkingLevel: ThinkingLevel | undefined =
					normalizeThinkingLevel((input as any).thinking_level) ??
					normalizeThinkingLevel(runtimeConfig?.thinkingLevel);
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
				// Teammate / multi-agent 实验功能已下线：主进程不再从 input 或独立 config 读取
				// experimental_multi_agent / multi_agent_mode / max_teammates / teammate_mode /
				// teammate_budget / leader_summary_model / teammate_execution_model。
				// 保留 buildMultiAgentRuntime 调用以兼容下游引用（experimentalEnabled 永远为 false）。
				const multiAgentRuntime = buildMultiAgentRuntime({
					runId,
					resumeSessionId,
					experimentalMultiAgent: false,
					multiAgentMode: normalizeMultiAgentMode(undefined),
					maxTeammates: 2,
					teammateMode: normalizeTeammateMode(undefined),
					teammateBudget: {},
					leaderSummaryModel: undefined,
					teammateExecutionModel: undefined,
				});
				const inputMcpServers =
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
				// 默认 bypassPermissions：等价于 claude --dangerously-skip-permissions，
				// SDK 内部不再对 Read/Write/Edit/Bash 弹询问。caller 仍可显式覆盖（如 plan 模式）。
				const permissionMode =
					typeof input.permission_mode === "string" &&
					input.permission_mode.trim()
						? input.permission_mode.trim()
						: "bypassPermissions";
				const permissionModeForRun =
					multiAgentRuntime.useDelegateMode && permissionMode !== "plan"
						? "delegate"
						: permissionMode;
				const sandboxSettings =
					(input as any).sandbox && typeof (input as any).sandbox === "object"
						? ((input as any).sandbox as Record<string, unknown>)
						: undefined;
				const allowedToolsForRun = uniqStrings(
					multiAgentRuntime.experimentalEnabled &&
						multiAgentRuntime.multiAgentMode !== "subagent_only"
						? [...allowed, "Teammate", LOCAL_WEB_SEARCH_MCP_TOOL]
						: [...allowed, LOCAL_WEB_SEARCH_MCP_TOOL],
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
					thinkingLevel,
					multiAgentRuntime,
					agents: "filesystem/native",
				});

				// SDK 0.2.139+ ships platform-native Claude Code binaries as optional
				// packages. Always pass the physical binary path so spawn never targets
				// app.asar virtual paths in packaged Electron builds.
				const sdkCliPath = resolveClaudeCodeExecutablePath();
				if (!sdkCliPath) {
					logger.error({
						msg: "Claude Code native executable is missing",
						scope: "agent",
						runId,
						expectedPath: getExpectedClaudeCodeExecutablePath(),
						platform: process.platform,
						arch: process.arch,
					});
				}

				// CLAUDE_CONFIG_DIR 已指向 ~/.claude，SDK 通过 settingSources 自动加载
				// user-level / project-level CLAUDE.md。这里仅在 caller 显式传入
				// system_prompt（plan mode、scenario agent 等场景）时 append，避免
				// 与 SDK 自加载的内容重复，也不再用 # Source: ... 这种硬标题挤压
				// preset 的语气指令权重。
				// 另外，本应用维护的 SOUL/USER/MEMORY 三件套（<userData>/agent-memory/）
				// 在每个 run 启动时一次性冻结，整个 run 内不变化，避免 Agent 在自身写
				// 入条目后立刻被自己的快照污染。
				const memorySnapshot = await loadAndFreezeMemorySnapshot(runId).catch(
					(err) => {
						logger.warn({
							msg: "Failed to load memory snapshot",
							scope: "agent",
							runId,
							error: err instanceof Error ? err.message : String(err),
						});
						return null;
					},
				);
				const memorySection = memorySnapshot
					? renderMemoryPromptSection(memorySnapshot)
					: "";
				const userSystemPrompt =
					typeof input.system_prompt === "string" && input.system_prompt.trim()
						? input.system_prompt.trim()
						: "";
				const localWebSearchPrompt = [
					"联网搜索说明：本应用已提供本地 MCP 搜索工具",
					`${LOCAL_WEB_SEARCH_MCP_TOOL}。`,
					"需要实时联网搜索时优先调用该工具，它会返回真实 URL 和摘要。",
					"不要调用内置 WebSearch；如果看到 WebSearch 不可用或没有搜索工具的文本，不要把它当作搜索结果。",
				].join(" ");
				const memoryToolPrompt = [
					"长期记忆工具说明：本应用提供 mcp__ipo_agent_memory__memory 工具，用于显式管理你的长期记忆。",
					"当用户明确要求「记住」某事、或者你判断某条信息对未来会话有长期价值时，调用该工具的 add/replace/remove 动作写入 user 或 memory 文件。",
					"不要把一次性任务结果、当前对话临时状态写入记忆。SOUL 文件由用户独占编辑，工具不可写。",
				].join(" ");
				const thinkingLevelMarker = thinkingLevel
					? `<!-- ipo-thinking-level:${thinkingLevel} -->`
					: "";
				const activeStylePrompt = await getActiveStylePrompt(options.db);

				// 跨入口桥接：把用户的其他 AI 入口（Web 产品 / 本机 coding agent）
				// 作为工具挂给本 Agent。默认开启——「各入口互为工具」正是 AI Hub
				// 的核心价值；不想要的用户可以在设置里关掉整组工具。
				const harnessBridgeEnabled = await isHarnessBridgeEnabled(
					options.db,
				).catch(() => true);

				const appendParts = [
					memorySection,
					userSystemPrompt,
					activeStylePrompt,
					localWebSearchPrompt,
					memoryToolPrompt,
					harnessBridgeEnabled ? HARNESS_BRIDGE_PROMPT : "",
					thinkingLevelMarker,
				].filter((s) => s && s.trim().length > 0);
				const systemPromptAppend = appendParts.join("\n\n");
				const localWebSearchMcpServer = createLocalWebSearchMcpServer(
					sdk as any,
				);
				const memoryMcpServer = createMemoryMcpServer(sdk as any);
				const mcpServers = {
					...(inputMcpServers || {}),
					ipo_browser_search: localWebSearchMcpServer,
					ipo_agent_memory: memoryMcpServer,
					...(harnessBridgeEnabled
						? {
								ipo_harness_bridge: createHarnessBridgeMcpServer(
									sdk as any,
									options.db,
								),
							}
						: {}),
				};

				const q = sdk.query({
					// 先使用 SDK 最稳定的首轮字符串 prompt。0.2.132 的
					// AsyncIterable prompt 在 Electron 子进程里会把部分首轮运行
					// 直接归类为 "Claude Code process aborted by user"，导致前端收不到
					// 任何 agent 消息；多轮上下文继续依赖 resume_session_id。
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
						// 思考档位 → SDK 字段（不再用 deprecated 的 maxThinkingTokens）
						...(thinkingLevel === "off"
							? { thinking: { type: "disabled" as const } }
							: thinkingLevel
								? { effort: thinkingLevel }
								: {}),
						maxBudgetUsd,
						settings: {
							skipWebFetchPreflight: true,
						} as any,
						betas: betas.length > 0 ? betas : undefined,
						// 必须传入 allowedTools 并包含 Task，否则自定义 agents 无法被调用
						// 参考文档: "The Task tool must be included in allowedTools since Claude invokes subagents through the Task tool."
						allowedTools: hasExplicitAllowedTools
							? allowedToolsForRun
							: multiAgentRuntime.experimentalEnabled
								? allowedToolsForRun
								: undefined,
						disallowedTools: ["WebSearch"],
						/*
						 * SDK JS hooks are intentionally disabled in the App runtime.
						 *
						 * Claude Code currently aborts the whole run when its hook bridge
						 * reports "Error in hook callback hook_1: Stream closed". That makes
						 * non-essential lifecycle/PostToolUse helpers block normal messaging.
						 * Keep the critical permission/path logic in canUseTool below instead.
						 *
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
												`[PreToolUse] Tool='${toolName}', Input=${safeJsonPreview(toolInput, 200)}`,
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
												if (signature) {
													const now = Date.now();
													const timestamps = (
														taskCallTimestampsBySignature.get(signature) || []
													).filter((t) => now - t < TASK_REPEAT_WINDOW_MS);
													timestamps.push(now);
													taskCallTimestampsBySignature.set(
														signature,
														timestamps,
													);

													if (timestamps.length >= TASK_REPEAT_HARD_LIMIT) {
														return {
															continue: true,
															hookSpecificOutput: {
																hookEventName: "PreToolUse" as const,
																permissionDecision: "deny" as const,
																permissionDecisionReason: `检测到 60 秒内对同一子代理 + 同一任务描述发起了 ${timestamps.length} 次完全相同的 Task 调用，疑似死循环。请基于已有结果继续推进。`,
															},
														};
													}

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

											if (toolLower === "websearch") {
												try {
													const fallback = await resolveWebSearchFallback({
														toolName,
														toolInput: (hookInput as any).tool_input,
														toolResponse: (hookInput as any).tool_response,
														toolUseId: String(
															(hookInput as any).tool_use_id || "",
														).trim(),
													});
													if (fallback.kind === "fallback") {
														logger.warn({
															msg: "agent_sdk WebSearch native result invalid; using local browser_search fallback",
															scope: "agent",
															runId,
															query: fallback.query,
															resultCount: fallback.results.length,
														});
														return {
															continue: true,
															hookSpecificOutput: {
																hookEventName: "PostToolUse" as const,
																updatedToolOutput: fallback.updatedToolOutput,
																additionalContext: fallback.additionalContext,
															},
														};
													}
												} catch (e) {
													stderr(
														`[PostToolUse] WebSearch fallback failed: ${e instanceof Error ? e.message : String(e)}`,
													);
												}
												return { continue: true };
											}

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
													additionalContext: `子代理图片已保存到本地路径，请优先使用这些路径并结束回答（不要再次调用画图子代理）：image_paths=${safeJsonPreview(uniqPaths, 1000)}`,
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
											const errorText = String(
												(hookInput as any).error ||
													(hookInput as any).tool_response ||
													"",
											);
											if (
												toolName.toLowerCase() === "webfetch" &&
												/error in hook callback|unable to verify if domain|safe to fetch|claude\.ai/i.test(
													errorText,
												)
											) {
												return {
													continue: true,
													hookSpecificOutput: {
														hookEventName: "PostToolUseFailure" as const,
														additionalContext:
															"WebFetch 未能完成域名安全校验，这是 Claude Code SDK 的网络/安全校验失败，不代表该公开网页不可用。请不要重复调用同一个 WebFetch；改用 WebSearch 搜索同一主题，或在 Bash 中用 curl / npm registry / GitHub API 获取公开页面内容后继续完成任务。",
													},
												};
											}
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
						 */
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
						// 使用 Claude Code 原生 preset，保留动态章节（cwd / git 状态 / TodoWrite 引导
						// / "坚持干完"等指令），这是 agent "活人感"和"自驱续航"的来源。
						// settingSources=["user","project"] 让 SDK 自动加载 ~/.claude/CLAUDE.md
						// 与 <cwd>/CLAUDE.md / AGENTS.md；本应用维护的 SOUL/USER/MEMORY 三件套
						// 由 systemPromptAppend 注入（详见 memorySnapshot.ts）。
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
								`[canUseTool] Tool='${toolName}', AgentID='${(extra as any)?.agentID || "main"}', Input=${safeJsonPreview(toolInput || {}, 200)}`,
							);
							if (abortController.signal.aborted || extra?.signal?.aborted) {
								return {
									behavior: "deny",
									message: "aborted",
								};
							}
							const isLocalWebSearchTool =
								toolName === LOCAL_WEB_SEARCH_MCP_TOOL ||
								toolName === "web_search";
							if (
								hasExplicitAllowedTools &&
								!isLocalWebSearchTool &&
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
							if (toolLower === "websearch") {
								return {
									behavior: "deny",
									message: `内置 WebSearch 在当前供应商下会返回伪搜索文本，请改用 ${LOCAL_WEB_SEARCH_MCP_TOOL} 获取真实搜索结果。`,
								};
							}
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

							// 通用清洗：移除空字符串参数（如 pages: ""、pattern: "" 等）。
							// 非 Claude 模型经常为可选参数生成空字符串，导致 SDK 内部校验失败。
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

							// Read 缺 file_path 时，自动猜一个 cwd 下可读的文件
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

							// 文件工具相对路径 → 绝对路径解析（仅纠错，不再做沙盒围栏）。
							// 与 Claude Code CLI 一致：把权限决策交给 permissionMode (bypassPermissions)
							// 与 OS 文件权限，主进程不再做路径黑名单。
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
								if (key) {
									const rawPath = String(inputAny[key] || "").trim();
									if (rawPath) {
										const resolved = await resolveToolFilePathEx({
											cwd,
											rawPath,
											allowGlobal: true,
										});
										if (resolved && resolved.path !== rawPath) {
											stderr(
												`[agent_sdk] Resolved ${toolName} path '${rawPath}' -> '${resolved.path}'`,
											);
											rewrittenInput = {
												...inputAny,
												[key]: resolved.path,
												file_path: resolved.path,
											};
										} else if (
											!resolved &&
											(toolLower === "write" || toolLower === "edit") &&
											!path.isAbsolute(rawPath)
										) {
											// 写操作的目标不存在是正常情况（新建文件）：
											// 把相对路径补成绝对路径，让 SDK 自然处理。
											const absRaw = path.join(cwd, rawPath);
											rewrittenInput = {
												...inputAny,
												[key]: absRaw,
												file_path: absRaw,
											};
										}
									}
								}
							}

							// Skill 工具路径重写
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

							// AskUserQuestion — 始终转发到前端弹卡，超时放宽到 5 分钟以贴合人类操作节奏。
							if (toolName === "AskUserQuestion") {
								if (
									typeof extra?.agentID === "string" &&
									extra.agentID.trim()
								) {
									stderr(
										`[agent_sdk] AskUserQuestion triggered inside subagent agentID='${extra.agentID}', forwarding to UI`,
									);
								}
								const askReqId = randomUUID();
								const askTimeout = 5 * 60_000;
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

							// 其余工具：默认放行（与 permissionMode=bypassPermissions 行为一致）。
							return { behavior: "allow", updatedInput: rewrittenInput };
						},
					} as any, // SDK Options 的 betas / hooks 字面量约束较紧，保留 cast
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
									safeJsonPreview(
										msgAny.event.content_block.input ?? {},
										Number.MAX_SAFE_INTEGER,
									),
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
									toolInputJsonById.set(
										id,
										safeJsonPreview(b.input ?? {}, Number.MAX_SAFE_INTEGER),
									);
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
							result: { ...resultWithUsage, run_alive: false },
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
				// 通知前端 run 已结束（记忆系统不再做后台 LLM 自动提取，
				// 写入完全由 Agent 显式调用 memory 工具触发）
				try {
					emit(options.getMainWindow, {
						runId,
						type: "memory:session_ended",
					} as any);
				} catch {
					// 静默
				}
				interactionBroker.clearRun(runId);
				runRegistry.markCompleted(runId);
				releaseSnapshot(runId);
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
				case "stop_task":
					// Claude Code 2.1.139+：`/goal` 和子任务的中断入口。
					// task_id 来自前端透传的 task_started/task_progress 事件。
					if (typeof run.query.stopTask !== "function") {
						return { success: false, error: "stopTask not supported" };
					}
					if (typeof input.taskId !== "string" || !input.taskId.trim()) {
						return { success: false, error: "Invalid taskId" };
					}
					await run.query.stopTask(input.taskId.trim());
					return { success: true };
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

	const agent_sdk_send_followup = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkSendFollowupInput,
	): Promise<AgentSdkSendFollowupOutput> => {
		const run = runRegistry.get(input.runId);
		if (!run) {
			return { success: false, error: "Run not found" };
		}
		if (!run.alive || !run.pushController || run.pushController.closed) {
			return { success: false, error: "Run is not alive" };
		}
		if (run.abortController.signal.aborted) {
			return { success: false, error: "Run was aborted" };
		}

		let messageContent = String(input.message ?? "");
		if (input.attachments && input.attachments.length > 0) {
			const attachmentLines = input.attachments
				.map((a) => `[Attached: ${a.title || a.path}] → ${a.path}`)
				.join("\n");
			messageContent = `${messageContent}\n\n${attachmentLines}`;
		}

		try {
			run.pushController.push({
				type: "user",
				message: { role: "user", content: messageContent },
				parent_tool_use_id: null,
			} as any);
			logger.info({
				msg: "agent_sdk_send_followup pushed",
				scope: "agent",
				runId: input.runId,
				messageLength: messageContent.length,
			});
			return { success: true };
		} catch (e) {
			return {
				success: false,
				error: e instanceof Error ? e.message : String(e),
			};
		}
	};

	const agent_sdk_check_alive = async (
		_event: IpcMainInvokeEvent,
		input: AgentSdkCheckAliveInput,
	): Promise<AgentSdkCheckAliveOutput> => {
		return { alive: runRegistry.isAlive(input.runId) };
	};

	return {
		agent_sdk_start,
		agent_sdk_abort,
		agent_sdk_resolve_interaction,
		agent_sdk_control,
		agent_sdk_send_followup,
		agent_sdk_check_alive,
	};
}
