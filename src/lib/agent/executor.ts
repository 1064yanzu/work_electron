/**
 * Agent Executor - SDK Version with Anthropic Proxy
 *
 * Uses Claude Agent SDK for ALL models by routing through the local Anthropic proxy
 * which translates requests to our multi-provider LLM backend.
 *
 * Architecture:
 *   SDK -> ANTHROPIC_BASE_URL (http://127.0.0.1:8765) -> Anthropic Proxy -> Multi-Provider LLM
 */

import { settingsStore } from "../settingsStore";
import { skillsStore } from "../skillsStore";
import { safeInvoke } from "../tauriBridge";
import { type AgentMessage, ClaudeAgentService } from "./claudeAgentService";
import { agentStore } from "./store";
import type { AgentTaskStep } from "./types";
import { getAgentSandboxDir } from "../api";

function sanitizeFilename(name: string): string {
	const base = String(name || "file").trim();
	const normalized = base.replace(/[/\\]/g, "_").replace(/\0/g, "");
	const safe = normalized.replace(/[^a-zA-Z0-9._-]/g, "_");
	return safe.length > 0 ? safe : "file";
}

function ensureExtension(name: string, ext: string): string {
	const e = ext.startsWith(".") ? ext : `.${ext}`;
	if (name.toLowerCase().endsWith(e.toLowerCase())) return name;
	return `${name}${e}`;
}

function getBasename(p: string): string {
	const s = String(p || "");
	const parts = s.split(/[/\\]/).filter(Boolean);
	return parts.length > 0 ? (parts[parts.length - 1] as string) : s;
}

function stripTrailingSlash(p: string): string {
	return String(p || "").replace(/[\\/]+$/, "");
}

// Agent 执行配置
interface AgentExecutorConfig {
	maxToolCalls?: number;
	timeout?: number;
	autoExecute?: boolean;
}

/**
 * Build skills context from enabled skills for system prompt
 * This provides detailed skill information since SDK's built-in Skill tool
 * cannot automatically discover our skills directory
 */
function buildSkillsContext(): string {
	const enabledSkills = skillsStore.getEnabledSkills();

	if (enabledSkills.length === 0) {
		return "";
	}

	let context = "\n\n## 可用技能 (Available Skills)\n\n";
	context += "你可以使用 Skill 工具来调用以下已启用的技能。\n\n";
	context += "**调用方式**: 使用 Skill 工具，参数 `skill` 设置为技能名称。\n\n";
	context += "**可用技能列表**:\n\n";

	for (const skill of enabledSkills) {
		context += `- **${skill.name}**: ${skill.description || "无描述"}\n`;
	}

	context += "\n**示例调用**:\n";
	context += "```json\n";
	context += `{ \"skill\": \"${enabledSkills[0]?.name || "skill-name"}\", \"args\": \"optional arguments\" }\n`;
	context += "```\n\n";

	context += "**重要提示**: \n";
	context += "- 当用户请求使用某个技能时,使用 Skill 工具调用它\n";
	context += "- 技能名称必须完全匹配上述列表中的名称\n";
	context += `- 当前可用技能: ${enabledSkills.map((s) => s.name).join(", ")}\n`;

	return context;
}

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
		options?: {
			conversationContext?: string[];
			fallbackSearchQuery?: string | null;
			activeDocContent?: string | null;
			attachedContexts?: Array<{ title: string; content: string }>;
			attachedFiles?: Array<{
				title: string;
				path: string;
				type?: "file" | "document";
				mimeType?: string;
				size?: number;
				isBinary?: boolean;
			}>;
			workingDirectory?: string;
			onChunk?: (chunk: string) => void;
		},
	): Promise<void> {
		// Ensure skills store is initialized
		await skillsStore.init();

		const activeModel = settingsStore.getActiveModel();
		console.log("[AgentExecutor SDK] Active model:", activeModel);

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

		let sandboxDir = options?.workingDirectory;
		if (!sandboxDir) {
			try {
				const res = await getAgentSandboxDir(task.id);
				sandboxDir = res.path;
			} catch {}
		}
		if (sandboxDir) {
			agentStore.setTaskMetadata({ sandboxDir });
		}

		if (sandboxDir && options?.attachedContexts?.length) {
			const seen = new Map<string, number>();
			options.attachedFiles = options.attachedFiles || [];
			for (const ctx of options.attachedContexts) {
				const baseTitle = ctx.title || "document";
				const safeBase = ensureExtension(sanitizeFilename(baseTitle), ".md");
				const count = (seen.get(safeBase) ?? 0) + 1;
				seen.set(safeBase, count);
				const dot = safeBase.lastIndexOf(".");
				const stem = dot > 0 ? safeBase.slice(0, dot) : safeBase;
				const ext = dot > 0 ? safeBase.slice(dot) : "";
				const name = count === 1 ? safeBase : `${stem}-${count}${ext}`;
				const dest = `${sandboxDir}/${name}`;
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

		if (sandboxDir && options?.attachedFiles?.length) {
			const seen = new Map<string, number>();
			for (const file of options.attachedFiles) {
				const srcPath = String(file.path || "").trim();
				const baseFromPath = getBasename(stripTrailingSlash(srcPath));
				const safeBase = sanitizeFilename(baseFromPath || file.title || "file");
				const count = (seen.get(safeBase) ?? 0) + 1;
				seen.set(safeBase, count);
				const dot = safeBase.lastIndexOf(".");
				const stem = dot > 0 ? safeBase.slice(0, dot) : safeBase;
				const ext = dot > 0 ? safeBase.slice(dot) : "";
				const name = count === 1 ? safeBase : `${stem}-${count}${ext}`;
				const dest = `${sandboxDir}/${name}`;
				if (
					typeof file.path === "string" &&
					file.path.startsWith(`${sandboxDir}/`)
				) {
					continue;
				}
				try {
					try {
						const entries = await safeInvoke<
							Array<{
								path: string;
								name: string;
								is_file: boolean;
								is_dir: boolean;
								size?: number;
							}>
						>("list_files_safe", {
							payload: {
								path: srcPath,
								recursive: true,
							},
						});

						const dirRoot = stripTrailingSlash(srcPath);
						const folderName = sanitizeFilename(
							baseFromPath || file.title || "dir",
						);
						for (const e of entries) {
							if (!e.is_file) continue;
							const rel = String(e.path).startsWith(dirRoot)
								? String(e.path)
										.slice(dirRoot.length)
										.replace(/^[/\\]+/, "")
								: getBasename(e.path);
							const out = `${sandboxDir}/${folderName}/${rel}`;
							try {
								await safeInvoke<{ success: boolean }>("copy_file_safe", {
									src: e.path,
									dest: out,
									create_dirs: true,
								});
							} catch {}
						}
						file.path = `${sandboxDir}/${folderName}`;
						file.type = file.type || "file";
					} catch {
						await safeInvoke<{ success: boolean }>("copy_file_safe", {
							src: srcPath,
							dest,
							create_dirs: true,
						});
						file.path = dest;
					}
				} catch {}
			}
		}

		if (sandboxDir) {
			try {
				const files = await safeInvoke<
					Array<{
						path: string;
						name: string;
						is_file: boolean;
						is_dir: boolean;
						size?: number;
					}>
				>("list_files_safe", {
					payload: {
						path: sandboxDir,
						recursive: true,
					},
				});

				const fileRows = files
					.filter((f) => f.is_file)
					.map((f) => {
						const size = typeof f.size === "number" ? ` (${f.size} bytes)` : "";
						return `- ${f.path}${size}`;
					});

				const manifest =
					`# Sandbox Attachments\n\n` +
					`工作目录：${sandboxDir}\n\n` +
					`以下为本次任务在沙盒中的所有文件（包含隐藏文件）。\n\n` +
					(fileRows.length > 0 ? fileRows.join("\n") : "- (no files)\n");

				const manifestPath = `${sandboxDir}/ATTACHMENTS.md`;
				await safeInvoke<{ success: boolean }>("write_file_safe", {
					payload: {
						path: manifestPath,
						content: manifest,
						encoding: "utf-8",
						create_dirs: true,
					},
				});

				options.attachedFiles = options.attachedFiles || [];
				if (!options.attachedFiles.some((f) => f.path === manifestPath)) {
					options.attachedFiles.unshift({
						title: "ATTACHMENTS.md",
						path: manifestPath,
						type: "document",
						mimeType: "text/markdown",
						size: manifest.length,
						isBinary: false,
					});
				}
			} catch {}
		}

		// Build enhanced system prompt with context and skills
		let enhancedPrompt = systemPrompt || "";

		// Add skills context
		enhancedPrompt += buildSkillsContext();

		// Add conversation context if available
		if (options?.conversationContext?.length) {
			enhancedPrompt +=
				"\n\n## 对话历史\n" + options.conversationContext.join("\n");
		}

		if (sandboxDir) {
			enhancedPrompt += `\n\n## 工作目录\n当前任务的工作目录（沙盒）为：${sandboxDir}\n请优先在该目录中读写与列举文件，避免访问其他路径。`;
		}

		// Add attached file references (paths only; no content injection)
		if (options?.attachedFiles?.length) {
			enhancedPrompt +=
				"\n\n## 用户附加的文件\n" +
				"以下是用户附加的文件路径列表。请不要假设你已读到文件内容。\n" +
				"- 若需要阅读文本文件内容，请使用 Read 工具读取对应路径。\n" +
				"- 若用户要求上传/处理文件（例如上传到 NotebookLM），请直接把文件路径作为参数传给对应 Skill 工具。\n\n";
			for (const file of options.attachedFiles) {
				const metaParts = [
					file.type ? `type=${file.type}` : null,
					file.mimeType ? `mime=${file.mimeType}` : null,
					typeof file.size === "number" ? `size=${file.size}` : null,
					file.isBinary ? "binary" : null,
				].filter(Boolean);
				const meta = metaParts.length ? ` (${metaParts.join(", ")})` : "";
				enhancedPrompt += `- ${file.title}: ${file.path}${meta}\n`;
			}
		}

		// Add active document context
		if (options?.activeDocContent) {
			enhancedPrompt +=
				"\n\n## 当前编辑器文档\n```\n" + options.activeDocContent + "\n```";
		}

		let finalResult = "";
		let toolStepCounter = 0;
		let lastToolCallId: string | null = null;

		// 构建增强版用户 prompt - 当有附件时,让模型明确知道有哪些文件
		let enhancedUserPrompt = query;
		if (options?.attachedFiles?.length || options?.attachedContexts?.length) {
			const fileList: string[] = [];
			if (options?.attachedFiles?.length) {
				for (const file of options.attachedFiles) {
					fileList.push(
						`- ${file.title} (文件路径: ${file.path})${
							file.type ? ` [${file.type}]` : ""
						}`,
					);
				}
			}
			if (options?.attachedContexts?.length) {
				for (const ctx of options.attachedContexts) {
					fileList.push(`- ${ctx.title}`);
				}
			}
			if (fileList.length > 0) {
				enhancedUserPrompt += `\n\n【用户附加的文件/资料】\n${fileList.join("\n")}\n\n注意：这些文件以“路径”形式提供。若需要查看内容，请使用 Read 工具读取文件；若需要上传/处理文件，请将文件路径作为参数传递给对应 Skill 工具。`;
			}
		}

		try {
			await this.sdkService.execute({
				prompt: enhancedUserPrompt,
				systemPrompt: enhancedPrompt || undefined,
				workingDirectory: sandboxDir,
				abortController: this.abortController,

				onChunk: (text) => {
					finalResult += text;
					options?.onChunk?.(text);
				},

				onMessage: (message: AgentMessage) => {
					// Update UI based on message type
					switch (message.type) {
						case "tool_call": {
							toolStepCounter++;
							const toolCallId = `sdk-tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

							// 构建工具描述，包含参数信息
							let description =
								message.content || `Calling ${message.toolName || "Tool"}...`;
							if (
								message.toolInput &&
								Object.keys(message.toolInput).length > 0
							) {
								const inputDesc = Object.entries(message.toolInput)
									.map(
										([k, v]) =>
											`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`,
									)
									.slice(0, 3) // 最多显示3个参数
									.join(", ");
								description = inputDesc;
							}

							// 推断工具类型
							const inferToolType = (
								name: string,
							): import("./types").ToolType => {
								const lower = name?.toLowerCase() || "";
								if (
									lower === "bash" ||
									lower.includes("terminal") ||
									lower.includes("shell")
								)
									return "code_execute";
								if (lower.includes("skill")) return "skill_call";
								if (lower.includes("search")) return "web_search";
								if (lower.includes("read") || lower.includes("view"))
									return "file_read";
								if (lower.includes("write") || lower.includes("edit"))
									return "file_write";
								if (lower.includes("list") || lower.includes("ls"))
									return "file_list";
								return "custom";
							};

							// 创建并添加 ToolCall 到 store，这会触发 tool_started 事件
							const toolCall: import("./types").ToolCall = {
								id: toolCallId,
								type: inferToolType(message.toolName || ""),
								name: message.toolName || "Tool",
								description: description,
								input: message.toolInput || {},
								status: "running",
								startedAt: Date.now(),
							};
							console.log("[AgentExecutor SDK] Adding ToolCall to store:", {
								id: toolCall.id,
								name: toolCall.name,
								type: toolCall.type,
								hasCurrentTask: !!agentStore.getState().currentTask,
							});
							agentStore.addToolCall(toolCall);

							// 同时添加任务步骤到 UI
							const toolStep: AgentTaskStep = {
								id: `tool-step-${toolStepCounter}`,
								title: message.toolName || "Tool",
								description: description,
								status: "running",
								kind: "custom",
							};

							// Get current steps and append
							const currentSteps =
								agentStore.getState().currentTask?.steps || [];
							agentStore.setTaskSteps([...currentSteps, toolStep]);

							// 保存 toolCallId 以便 tool_result 使用
							lastToolCallId = toolCallId;
							break;
						}

						case "tool_result": {
							// 更新最新的工具调用状态
							if (lastToolCallId) {
								agentStore.updateToolCall(lastToolCallId, {
									output: message.toolOutput,
									status: message.status === "error" ? "error" : "completed",
									completedAt: Date.now(),
								});
							}

							// 更新最新的工具步骤状态和描述
							const steps = agentStore.getState().currentTask?.steps || [];
							if (steps.length > 0) {
								const lastStep = steps[steps.length - 1];
								if (
									lastStep.status === "running" ||
									lastStep.status === "pending"
								) {
									// 格式化输出内容
									const outputStr =
										typeof message.toolOutput === "string"
											? message.toolOutput
											: JSON.stringify(message.toolOutput, null, 2);

									// 追加结果到描述中（限制长度避免 UI 爆炸）
									const truncatedOutput =
										outputStr.length > 1000
											? outputStr.slice(0, 1000) + "\n...(truncated)"
											: outputStr;

									const newDescription = `${lastStep.description}\n\n**Result:**\n\`\`\`\n${truncatedOutput}\n\`\`\``;

									const updatedSteps = [...steps];
									updatedSteps[updatedSteps.length - 1] = {
										...lastStep,
										description: newDescription,
										status: message.status === "error" ? "error" : "completed",
									};
									agentStore.setTaskSteps(updatedSteps);
								}
							}
							break;
						}

						case "assistant":
							// Text content - already handled by onChunk
							break;

						case "result":
							if (message.status === "completed") {
								agentStore.updateTaskStepByKind("analysis", "completed");
							}
							break;

						case "system":
							console.log(
								"[AgentExecutor SDK] System message:",
								message.content,
							);
							break;
					}
				},

				onComplete: (result) => {
					if (result.success) {
						// Mark analysis step as complete
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
			const errorMessage = error instanceof Error ? error.message : "执行失败";
			console.error("[AgentExecutor SDK] Error:", errorMessage);
			agentStore.failTask(errorMessage);
		} finally {
			this.abortController = null;
		}
	}

	/**
	 * Execute a research task
	 */
	async executeResearchTask(
		query: string,
		config: AgentExecutorConfig = {},
	): Promise<void> {
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
	cancel(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
		agentStore.cancelTask();
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
