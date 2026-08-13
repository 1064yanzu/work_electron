import {
	type AgentMessage,
	ClaudeAgentService,
} from "@/lib/agent/claudeAgentService";
import { deleteCheckpoint, saveCheckpoint } from "@/lib/agent/api";
import { buildRuntimeUserPrompt } from "@/lib/agent/context/userPrompt";
import { agentStore } from "@/lib/agent/store";
import type { AgentTaskStep, ToolCall } from "@/lib/agent/types";
import { agentModelSettingsStore } from "@/lib/models/agentModelSettingsStore";
import { settingsStore } from "@/lib/settingsStore";
import { skillsStore } from "@/lib/skillsStore";
import { safeInvoke } from "@/lib/tauriBridge";
import {
	isContextTooLongError,
	trimConversationContextLines,
} from "./contextTrim";
import {
	createCustomTaskMessageHandler,
	type CustomTaskRunState,
} from "./messageHandler";
import {
	chooseSandboxFileName,
	normalizePathKey,
	simpleFingerprint,
	stripTrailingSlash,
} from "./pathUtils";
import type {
	AgentExecutorConfig,
	ExecuteCustomTaskOptions,
	ExecuteFollowupOptions,
} from "./types";

/**
 * SDK-based Agent Executor
 *
 * Routes ALL models through Claude Agent SDK via local Anthropic proxy.
 * The proxy translates Anthropic API calls to our multi-provider backend.
 */
class AgentExecutor {
	private abortController: AbortController | null = null;
	private sdkService: ClaudeAgentService;

	constructor() {
		this.sdkService = new ClaudeAgentService();
	}

	/**
	 * Execute a custom task using Claude Agent SDK
	 */
	async executeCustomTask(
		query: string,
		systemPrompt?: string,
		_config: AgentExecutorConfig = {},
		options?: ExecuteCustomTaskOptions,
	): Promise<{ sdkSessionId?: string; sandboxDir?: string }> {
		// Ensure skills & model stores are initialized
		await skillsStore.init();
		await agentModelSettingsStore.init();

		// Model selection priority:
		// 1) User-selected active model (UI dropdown) - highest priority
		// 2) Smart scenario suggestion (when enabled and user hasn't selected)
		// 3) Agent settings default model
		// 4) Hardcoded fallback
		const userSelectedModel = settingsStore.getActiveModel();
		const smartEnabled =
			agentModelSettingsStore.getSettings().enableSmartScenarioSwitch === true;
		const modelConfig = agentModelSettingsStore.getModelForTask(query);

		// Only use smart scenario override when user hasn't explicitly selected a model
		const shouldUseSmartScenario =
			!userSelectedModel &&
			smartEnabled &&
			!!modelConfig?.modelId &&
			modelConfig.scenario !== "default";

		// Priority: User selection > Smart scenario > Agent default > Hardcoded fallback
		const activeModel =
			userSelectedModel ||
			(shouldUseSmartScenario ? modelConfig?.modelId : null) ||
			modelConfig?.modelId ||
			"claude-sonnet-4-5";

		console.log("[AgentExecutor SDK] Model selection:", {
			userSelectedModel: userSelectedModel || null,
			smartEnabled,
			shouldUseSmartScenario,
			smartScenario: modelConfig?.scenario || null,
			smartModel: modelConfig?.modelId || null,
			finalActiveModel: activeModel,
		});

		const enabledSkills = skillsStore.getEnabledSkills();
		console.log(
			"[AgentExecutor SDK] Enabled skills:",
			enabledSkills.map((s) => s.name),
		);

		// Start task in UI store
		const task = agentStore.startTask("custom", query);

		// Build initial steps for UI
		const analysisStep: AgentTaskStep = {
			id: "analysis-step",
			title: "分析任务",
			status: "running",
			kind: "analysis",
		};
		agentStore.setTaskSteps([analysisStep]);

		this.abortController = new AbortController();
		options = options || {};

		const runtimeConfig = agentModelSettingsStore.getSettings().contextRuntime;
		const resolvedContextPolicy =
			options.contextPolicy ||
			runtimeConfig?.contextPolicy ||
			("balanced" as const);
		const resolvedSubagentContextMode =
			options.subagentContextMode ||
			runtimeConfig?.subagentContextMode ||
			("capsule" as const);
		const resolvedContextBudget = {
			maxContextChars:
				options.contextBudget?.maxContextChars ||
				runtimeConfig?.contextBudget?.maxContextChars ||
				16000,
			maxFiles:
				options.contextBudget?.maxFiles ||
				runtimeConfig?.contextBudget?.maxFiles ||
				12,
			maxFileChars:
				options.contextBudget?.maxFileChars ||
				runtimeConfig?.contextBudget?.maxFileChars ||
				6000,
		};
		const resolvedSettingSources = options.settingSources?.length
			? options.settingSources
			: runtimeConfig?.settingSources?.length
				? runtimeConfig.settingSources
				: (["user", "project"] as Array<"user" | "project" | "local">);
		const resolvedMaxTurns = options.maxTurns ?? runtimeConfig?.maxTurns ?? 100;
		const resolvedThinkingLevel =
			options.thinkingLevel ?? runtimeConfig?.thinkingLevel;
		const resolvedMaxBudgetUsd =
			options.maxBudgetUsd ?? runtimeConfig?.maxBudgetUsd;
		const resolvedBetas =
			options.betas && options.betas.length > 0
				? options.betas
				: runtimeConfig?.betas || [];
		const resolvedEnableToolSearch =
			options.enableToolSearch ||
			runtimeConfig?.enableToolSearch ||
			("auto:5" as const);
		const conversationContextBeforeChars = String(
			(options.conversationContext || []).join("\n"),
		).length;
		const attachedFilesBefore = options.attachedFiles?.length || 0;
		const attachedContextsBefore = options.attachedContexts?.length || 0;
		agentStore.setTaskMetadata({
			contextPolicy: resolvedContextPolicy,
			subagentContextMode: resolvedSubagentContextMode,
			contextCharsBefore: conversationContextBeforeChars,
			attachedFilesBefore: attachedFilesBefore + attachedContextsBefore,
			degradeLevel: 0,
			compactionCount: 0,
			agentRole: "leader",
			parentSessionId: options.parentSdkSessionId,
		});

		// Agent 工作目录：必须由 caller 传入用户选定的真实目录（session.cwd）。
		// 不再 fallback 到 userData/agent-sandboxes/{taskId} 隔离沙盒——和
		// Claude Code CLI 一致：直接在用户目录里干活，产物落在用户目录。
		// 没传就用进程 cwd 兜底，避免 SDK 因 cwd 缺失炸掉。
		const sandboxDir =
			options?.workingDirectory && options.workingDirectory.trim()
				? options.workingDirectory.trim()
				: undefined;
		if (sandboxDir) {
			agentStore.setTaskMetadata({ sandboxDir });
		}

		let dedupeHitCount = 0;
		if (options?.attachedFiles?.length) {
			const pathSeen = new Set<string>();
			const dedupedFiles: NonNullable<typeof options.attachedFiles> = [];
			for (const file of options.attachedFiles) {
				const pathKey = normalizePathKey(file.path);
				if (pathKey && pathSeen.has(pathKey)) {
					dedupeHitCount++;
					continue;
				}
				if (pathKey) pathSeen.add(pathKey);
				dedupedFiles.push(file);
			}
			options.attachedFiles = dedupedFiles;
		}
		if (options?.attachedContexts?.length) {
			const ctxSeen = new Set<string>();
			const dedupedContexts: NonNullable<typeof options.attachedContexts> = [];
			for (const ctx of options.attachedContexts) {
				const content = String(ctx.content || "");
				const fingerprint = `${ctx.title}::${simpleFingerprint(content)}`;
				if (ctxSeen.has(fingerprint)) {
					dedupeHitCount++;
					continue;
				}
				ctxSeen.add(fingerprint);
				dedupedContexts.push({
					...ctx,
					content:
						content.length > resolvedContextBudget.maxFileChars
							? `${content.slice(0, resolvedContextBudget.maxFileChars)}\n...(已按上下文预算截断)`
							: content,
				});
			}
			options.attachedContexts = dedupedContexts;
		}
		const allowedFiles = Math.max(1, resolvedContextBudget.maxFiles);
		if ((options?.attachedFiles?.length || 0) > allowedFiles) {
			dedupeHitCount += (options?.attachedFiles?.length || 0) - allowedFiles;
			options.attachedFiles = (options?.attachedFiles || []).slice(
				0,
				allowedFiles,
			);
		}
		const remainForContexts = Math.max(
			0,
			allowedFiles - (options?.attachedFiles?.length || 0),
		);
		if ((options?.attachedContexts?.length || 0) > remainForContexts) {
			dedupeHitCount +=
				(options?.attachedContexts?.length || 0) - remainForContexts;
			options.attachedContexts = (options?.attachedContexts || []).slice(
				0,
				remainForContexts,
			);
		}

		// attachedContexts 是用户在 UI 里贴的临时文本（无原路径），写到 cwd/.agent-attachments/
		// 让 agent 能 Read。其余真实 attachedFiles 直接传原路径，**不再拷贝到沙盒**——
		// 与 Claude Code CLI 一致，让 agent 在用户真实目录里直接操作原文件。
		if (sandboxDir && options?.attachedContexts?.length) {
			const attachmentsDir = `${stripTrailingSlash(sandboxDir)}/.agent-attachments`;
			const seen = new Map<string, number>();
			options.attachedFiles = options.attachedFiles || [];
			for (const ctx of options.attachedContexts) {
				const baseTitle = ctx.title || "document";
				const safeBase = chooseSandboxFileName({
					title: baseTitle,
					sourcePath: baseTitle,
					mimeType: "text/markdown",
				});
				const count = (seen.get(safeBase) ?? 0) + 1;
				seen.set(safeBase, count);
				const dot = safeBase.lastIndexOf(".");
				const stem = dot > 0 ? safeBase.slice(0, dot) : safeBase;
				const ext = dot > 0 ? safeBase.slice(dot) : "";
				const name = count === 1 ? safeBase : `${stem}-${count}${ext}`;
				const dest = `${attachmentsDir}/${name}`;
				try {
					await safeInvoke<{ success: boolean }>("write_file_safe", {
						payload: {
							path: dest,
							content: ctx.content,
							encoding: "utf-8",
							create_dirs: true,
						},
					});
					options.attachedFiles.push({
						title: ctx.title,
						path: dest,
						type: "document",
						mimeType: "text/markdown",
						size: ctx.content.length,
						isBinary: false,
					});
				} catch {}
			}
			options.attachedContexts = [];
		}

		// attachedFiles：用户从 UI 里选的真实文件，直接保留原路径不拷贝。

		let degradeLevel = 0;
		const getConversationContextForRun = () => {
			const source = options?.conversationContext || [];
			if (degradeLevel <= 0) return source;
			if (degradeLevel === 1)
				return trimConversationContextLines(source, 8, 220);
			return trimConversationContextLines(source, 4, 160);
		};
		const getAttachedForRun = () => {
			const files = [...(options?.attachedFiles || [])];
			const contexts = [...(options?.attachedContexts || [])];
			if (degradeLevel < 3) return { files, contexts };
			const maxFilesOnDegrade = Math.max(
				1,
				Math.floor(resolvedContextBudget.maxFiles / 2),
			);
			return {
				files: files.slice(0, maxFilesOnDegrade),
				contexts: contexts.slice(
					0,
					Math.max(0, maxFilesOnDegrade - files.length),
				),
			};
		};
		const buildEnhancedPromptForRun = () => {
			return systemPrompt || "";
		};

		let finalResult = "";
		let sdkSessionId: string | undefined;
		const runState: CustomTaskRunState = {
			toolStepCounter: 0,
			lastToolCallId: null,
		};
		const processedToolResultIds = new Set<string>();
		let shouldRetryWithoutResume = false;
		// 检查点相关：跟踪已完成的工具调用
		const completedToolCalls: string[] = [];

		const isResumeFailure = (text: string) => {
			const t = String(text || "");
			return (
				t.includes("--resume requires a valid session ID") ||
				t.includes("No conversation found with session ID")
			);
		};

		const handleSdkMessage = createCustomTaskMessageHandler({
			taskId: task.id,
			sandboxDir,
			activeModel,
			query,
			systemPrompt,
			conversationSessionId: options?.conversationSessionId,
			runState,
			processedToolResultIds,
			completedToolCalls,
			getSdkSessionId: () => sdkSessionId,
			getFinalResult: () => finalResult,
			onMessage: options?.onMessage,
			onThoughtChunk: options?.onThoughtChunk,
		});

		const runOnce = async (resumeSessionId?: string) => {
			shouldRetryWithoutResume = false;
			const conversationContextForRun = getConversationContextForRun();
			const attachedForRun = getAttachedForRun();
			const enhancedPrompt = buildEnhancedPromptForRun();
			const userPromptForRun = buildRuntimeUserPrompt({
				query,
				resumeSessionId,
				conversationContext: conversationContextForRun,
				attachedFiles: attachedForRun.files,
				attachedContexts: attachedForRun.contexts,
				contextBudget: {
					// 历史代码硬截断到 6000 字符（≈1500 token），导致多轮对话上下文被砍光、
					// 模型每次"冷启动"。直接用用户配置的 maxContextChars（默认 16000）。
					// degradeLevel ≥1 时仍会通过 maxContextLines 自动降级，无需在这里再叠加上限。
					maxContextChars: resolvedContextBudget.maxContextChars,
					maxContextLines: degradeLevel >= 2 ? 4 : degradeLevel >= 1 ? 8 : 16,
					maxFiles:
						attachedForRun.files.length + attachedForRun.contexts.length,
				},
			});
			agentStore.setTaskMetadata({
				contextCharsAfter: userPromptForRun.length,
				attachedFilesAfter:
					attachedForRun.files.length + attachedForRun.contexts.length,
				dedupeHitCount,
				degradeLevel,
			});
			await this.sdkService.execute({
				prompt: userPromptForRun,
				systemPrompt: enhancedPrompt || undefined,
				workingDirectory: sandboxDir,
				resumeSessionId,
				persistSession: options?.persistSession,
				forkSession: options?.forkSession,
				resumeSessionAt: options?.resumeSessionAt,
				model: activeModel,
				skills: enabledSkills.map((s) => s.name),
				maxTurns: resolvedMaxTurns,
				thinkingLevel: resolvedThinkingLevel,
				maxBudgetUsd: resolvedMaxBudgetUsd,
				settingSources: resolvedSettingSources,
				betas: resolvedBetas,
				contextPolicy: resolvedContextPolicy,
				subagentContextMode: resolvedSubagentContextMode,
				contextBudget: {
					max_context_chars: resolvedContextBudget.maxContextChars,
					max_files: resolvedContextBudget.maxFiles,
					max_file_chars: resolvedContextBudget.maxFileChars,
				},
				enableToolSearch: resolvedEnableToolSearch,
				planMode: options?.planMode,
				confirmedPlan: options?.confirmedPlan,
				abortController: this.abortController ?? undefined,

				onChunk: (text) => {
					finalResult += text;
					options?.onChunk?.(text);
				},

				onMessage: handleSdkMessage,

				onComplete: async (result) => {
					sdkSessionId = result.sessionId;
					if (sdkSessionId) {
						agentStore.setTaskMetadata({ sdkSessionId });
					}
					if (result.usage) {
						agentStore.setTaskMetadata({ tokenUsage: result.usage });
					}

					// Save SDK session data to database
					if (task?.id && (result.sessionId || result.usage || activeModel)) {
						try {
							const updateData: {
								id: string;
								sdk_session_id?: string;
								model?: string;
								total_prompt_tokens?: number;
								total_completion_tokens?: number;
								total_tokens?: number;
							} = { id: task.id };

							if (result.sessionId) {
								updateData.sdk_session_id = result.sessionId;
							}
							if (activeModel) {
								updateData.model = activeModel;
							}
							if (result.usage) {
								updateData.total_prompt_tokens = result.usage.promptTokens;
								updateData.total_completion_tokens =
									result.usage.completionTokens;
								updateData.total_tokens = result.usage.totalTokens;
							}

							// await safeInvoke('agent_update_session', updateData);
							console.log("[AgentExecutor] Saved session data:", updateData);
						} catch (err) {
							console.error(
								"[AgentExecutor] Failed to save session data:",
								err,
							);
						}
					}

					if (result.success) {
						// Mark analysis step as complete
						agentStore.updateTaskStepByKind("analysis", "completed");
						agentStore.completeTask(
							finalResult || result.summary || "Task completed",
						);
						// 任务成功，删除检查点
						deleteCheckpoint(task.id).catch((err) => {
							console.warn("[AgentExecutor] Failed to delete checkpoint:", err);
						});
					} else {
						if (
							resumeSessionId &&
							isResumeFailure(result.summary || "") &&
							!shouldRetryWithoutResume
						) {
							shouldRetryWithoutResume = true;
							return;
						}
						// 任务失败，保存检查点以便断点续传
						saveCheckpoint({
							task_id: task.id,
							session_id: options?.conversationSessionId || task.id,
							sdk_session_id: sdkSessionId,
							sandbox_dir: sandboxDir,
							last_tool_call_id: runState.lastToolCallId || undefined,
							tool_calls_completed: completedToolCalls,
							accumulated_result: finalResult,
							metadata: {
								query,
								systemPrompt,
								model: activeModel,
								error: result.summary,
							},
						}).catch((err) => {
							console.warn(
								"[AgentExecutor] Failed to save checkpoint on failure:",
								err,
							);
						});
						agentStore.failTask(result.summary || "Task failed");
					}
				},
			});
		};

		try {
			await runOnce(options?.resumeSessionId);
		} catch (error) {
			let errorMessage = error instanceof Error ? error.message : "执行失败";
			if (isContextTooLongError(errorMessage) && degradeLevel < 3) {
				while (degradeLevel < 3) {
					degradeLevel += 1;
					agentStore.setTaskMetadata({ degradeLevel });
					console.warn(
						`[AgentExecutor SDK] Context too long, retry with degrade level=${degradeLevel}`,
					);
					try {
						finalResult = "";
						runState.toolStepCounter = 0;
						runState.lastToolCallId = null;
						await runOnce(options?.resumeSessionId);
						return { sdkSessionId, sandboxDir };
					} catch (retryError) {
						errorMessage =
							retryError instanceof Error ? retryError.message : "执行失败";
						if (!isContextTooLongError(errorMessage)) break;
					}
				}
			}
			if (options?.resumeSessionId && shouldRetryWithoutResume) {
				try {
					finalResult = "";
					runState.toolStepCounter = 0;
					runState.lastToolCallId = null;
					await runOnce(undefined);
					return { sdkSessionId, sandboxDir };
				} catch (e) {
					const second = e instanceof Error ? e.message : "执行失败";
					console.error("[AgentExecutor SDK] Error:", second);
					agentStore.failTask(second);
					return { sdkSessionId, sandboxDir };
				}
			}
			console.error("[AgentExecutor SDK] Error:", errorMessage);
			agentStore.failTask(errorMessage);
			return { sdkSessionId, sandboxDir };
		} finally {
			this.abortController = null;
		}

		return { sdkSessionId, sandboxDir };
	}

	/**
	 * 检查是否有存活的 run 可以接收 followup 消息。
	 * 如果有，caller 应该用 executeFollowup 代替 executeCustomTask。
	 */
	get canFollowup(): boolean {
		return this.sdkService.alive && !!this.sdkService.activeRunId;
	}

	/**
	 * 向存活的 run 发送 followup 消息。
	 * 不再拼 conversationContext——进程内存中已有完整历史，直接发送本轮 query。
	 */
	async executeFollowup(
		query: string,
		options?: ExecuteFollowupOptions,
	): Promise<{ sdkSessionId?: string }> {
		agentStore.startTask("custom", query);
		const analysisStep: AgentTaskStep = {
			id: "analysis-step",
			title: "分析任务",
			status: "running",
			kind: "analysis",
		};
		agentStore.setTaskSteps([analysisStep]);

		this.abortController = new AbortController();
		let finalResult = "";
		let sdkSessionId: string | undefined;

		try {
			await this.sdkService.sendFollowup({
				message: query,
				abortController: this.abortController,
				onChunk: (text) => {
					finalResult += text;
					options?.onChunk?.(text);
				},
				onMessage: async (message: AgentMessage) => {
					options?.onMessage?.(message);
					// 复用 executeCustomTask 中的消息处理逻辑
					switch (message.type) {
						case "tool_call": {
							const toolCallId = `sdk-tool-${message.toolCallId || Date.now()}`;
							const toolCall: ToolCall = {
								id: toolCallId,
								type: "custom",
								name: message.toolName || "Tool",
								description: message.content || "",
								input: message.toolInput || {},
								status: "running",
								startedAt: Date.now(),
							};
							agentStore.addToolCall(toolCall);
							break;
						}
						case "tool_result": {
							const resolvedId = message.toolCallId
								? `sdk-tool-${message.toolCallId}`
								: null;
							if (resolvedId) {
								agentStore.updateToolCall(resolvedId, {
									output: message.toolOutput,
									status: message.status === "error" ? "error" : "completed",
									completedAt: Date.now(),
								});
							}
							break;
						}
						case "thought_delta":
							options?.onThoughtChunk?.(message.content, message.thoughtMeta);
							break;
						case "result":
							if (message.status === "completed") {
								agentStore.updateTaskStepByKind("analysis", "completed");
							}
							break;
					}
				},
				onComplete: (result) => {
					if (result.sessionId) {
						sdkSessionId = result.sessionId;
					}
					if (result.success) {
						agentStore.updateTaskStepByKind("analysis", "completed");
						agentStore.completeTask(
							finalResult || result.summary || "Task completed",
						);
					} else {
						agentStore.failTask(result.summary || "Task failed");
					}
				},
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Followup failed";
			console.error("[AgentExecutor] Followup error:", errorMessage);
			agentStore.failTask(errorMessage);
		} finally {
			this.abortController = null;
		}

		return { sdkSessionId };
	}

	/**
	 * Execute a research task
	 */
	async executeResearchTask(
		query: string,
		config: AgentExecutorConfig = {},
	): Promise<{ sdkSessionId?: string; sandboxDir?: string }> {
		// Research task is just a custom task with research-focused prompt
		const researchPrompt = `你是一个研究助手。请对以下主题进行深入研究：

${query}

请使用 WebSearch 工具搜索相关信息，然后综合整理成一份全面的研究报告。`;

		return this.executeCustomTask(query, researchPrompt, config);
	}

	/**
	 * Abort current execution (alias for cancel)
	 */
	abort(): void {
		this.cancel();
	}

	/**
	 * Cancel current execution
	 */
	cancel(options?: { updateStore?: boolean }): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		if (options?.updateStore !== false) {
			agentStore.cancelTask();
		}
	}

	async setRuntimePermissionMode(mode: string): Promise<boolean> {
		const result = await this.sdkService.control({
			action: "set_permission_mode",
			mode,
		});
		return result.success;
	}

	async setRuntimeModel(model: string): Promise<boolean> {
		const result = await this.sdkService.control({
			action: "set_model",
			model,
		});
		return result.success;
	}

	async interruptRuntime(): Promise<boolean> {
		const result = await this.sdkService.control({
			action: "interrupt",
		});
		return result.success;
	}

	async getRuntimeMcpStatus(): Promise<unknown[] | null> {
		const result = await this.sdkService.control({
			action: "mcp_status",
		});
		if (!result.success || !Array.isArray(result.data)) return null;
		return result.data as unknown[];
	}

	/**
	 * Check if currently executing
	 */
	isExecuting(): boolean {
		return this.abortController !== null;
	}
}

// Export singleton instance
export const agentExecutor = new AgentExecutor();
