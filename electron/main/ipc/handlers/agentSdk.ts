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
import { type GetMainWindow, emit } from "./agentSdk/eventTransformer";
import type { AgentModelSettingsLike } from "./agentSdk/scenarioAgents";
import {
	buildMultiAgentRuntime,
	normalizeMultiAgentMode,
	normalizeTeammateMode,
} from "./agentSdk/multiAgentRuntime";
import { createAgentModelSettingsLoader } from "./agentSdk/modelSettingsLoader";
import { createLocalWebSearchMcpServer } from "./agentSdk/localWebSearchMcp";
import { createHarnessBridgeMcpServer } from "./agentSdk/harnessBridgeMcp";
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
import { formatUnknownError } from "./agentSdk/safeJson";
import {
	createCanUseTool,
	resolvePermissionMode,
} from "./agentSdk/permissionPolicy";
import {
	buildMcpServers,
	buildSdkEnv,
	buildSystemPromptAppend,
	normalizeSandboxSettings,
	resolveAdditionalDirectories,
	resolveAllowedTools,
} from "./agentSdk/runOptionsBuilder";
import {
	consumeSdkStream,
	hasUsage,
	toAnthropicUsage,
} from "./agentSdk/streamConsumer";

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

export function createAgentSdkHandlers(options: {
	getMainWindow: GetMainWindow;
	getAnthropicBaseUrl: () => Promise<string>;
	/**
	 * 本地 Anthropic 代理的访问 token。代理已改为强制鉴权，SDK 子进程要靠它
	 * （经 `ANTHROPIC_API_KEY` → `x-api-key`）通过闸门。
	 */
	getAnthropicProxyToken: () => Promise<string>;
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
				/**
				 * PreToolUse 钩子缓存的原始工具入参。SDK hooks 在本应用整体停用
				 * （原因见下方 sdk.query 处的说明），所以这张表当前恒为空；
				 * 保留声明是为了 hooks 恢复时 Bash `command` 丢失的兜底路径能立刻生效。
				 */
				const preToolInputByToolUseId = new Map<
					string,
					Record<string, unknown>
				>();
				/** Task 工具落盘的图片路径，供事件循环改写 tool_result。 */
				const taskImagePathsByToolUseId = new Map<string, string[]>();

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

				// 代理要求鉴权后，这里下发的就是代理 token 本身（SDK 会把它作为
				// x-api-key 发过来）。拿不到 token 时回落到 env 里的真 key / 占位串，
				// 让"代理还没起来"的极端路径至少能给出可读的 401 而不是静默挂起。
				const proxyToken = (await options.getAnthropicProxyToken()).trim();
				const anthropicApiKeyRaw =
					proxyToken ||
					(typeof process.env.ANTHROPIC_API_KEY === "string"
						? process.env.ANTHROPIC_API_KEY.trim()
						: "");
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
				const { permissionModeForRun } = resolvePermissionMode({
					requested: input.permission_mode,
					useDelegateMode: multiAgentRuntime.useDelegateMode,
				});
				const sandboxSettings = normalizeSandboxSettings(
					(input as any).sandbox,
				);
				const { hasExplicitAllowedTools, allowedToolsForRun } =
					resolveAllowedTools({
						rawAllowedTools: (input as any).allowed_tools,
						interactiveApproval,
						multiAgentRuntime,
					});

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
				const activeStylePrompt = await getActiveStylePrompt(options.db);

				// 跨入口桥接：把用户的其他 AI 入口（Web 产品 / 本机 coding agent）
				// 作为工具挂给本 Agent。默认开启——「各入口互为工具」正是 AI Hub
				// 的核心价值；不想要的用户可以在设置里关掉整组工具。
				const harnessBridgeEnabled = await isHarnessBridgeEnabled(
					options.db,
				).catch(() => true);

				const systemPromptAppend = buildSystemPromptAppend({
					memorySection,
					userSystemPrompt,
					activeStylePrompt,
					harnessBridgeEnabled,
					thinkingLevel,
				});
				const mcpServers = buildMcpServers({
					sdk,
					db: options.db,
					inputMcpServers,
					harnessBridgeEnabled,
					createLocalWebSearchMcpServer,
					createMemoryMcpServer,
					createHarnessBridgeMcpServer,
				});

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
						 * SDK JS hooks 在本应用运行时刻意停用。
						 *
						 * Claude Code 的 hook 桥一旦报 "Error in hook callback hook_1: Stream closed"
						 * 就会中止整个 run —— 于是那些「可有可无」的 lifecycle / PostToolUse
						 * 辅助逻辑反而会把正常消息流打断。关键的权限与路径逻辑因此全部放在
						 * 下面的 canUseTool（见 agentSdk/permissionPolicy.ts）里。
						 *
						 * 原先这里保留着约 420 行注释掉的 hooks 实现；已随本次重构删除，
						 * 需要时从 git 历史取回即可。
						 */
						permissionMode: permissionModeForRun as any,
						additionalDirectories: resolveAdditionalDirectories(
							additionalDirectories,
							resolvedWikiScopePath,
						),
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
						env: buildSdkEnv({
							resolvedPath,
							claudeConfigDir,
							anthropicBaseUrl,
							anthropicApiKey,
							enableToolSearch,
						}),
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
						canUseTool: createCanUseTool({
							runId,
							cwd,
							abortController,
							getMainWindow: options.getMainWindow,
							stderr,
							hasExplicitAllowedTools,
							allowedToolsForRun,
							preToolInputByToolUseId,
						}),
					} as any, // SDK Options 的 betas / hooks 字面量约束较紧，保留 cast
				});
				runRegistry.updateQuery(runId, q as any);

				const { sawResult, usage } = await consumeSdkStream({
					runId,
					query: q as AsyncIterable<unknown>,
					getMainWindow: options.getMainWindow,
					stderr,
					taskImagePathsByToolUseId,
				});
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
								usage: hasUsage(usage) ? toAnthropicUsage(usage) : undefined,
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
