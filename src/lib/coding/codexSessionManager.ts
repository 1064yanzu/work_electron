import type {
	CodingApprovalMode,
	RuntimeControlAction,
} from "../../../electron/shared/coding-workspace";
import { controlCodexRuntime } from "./runtimeApi";
import { invoke } from "../tauriCompat";
import { listen, type UnlistenFn } from "../tauriEventCompat";
import { codingSessionStore } from "../stores/codingSessionStore";
import { diffStore } from "../stores/diffStore";
import type { ICodingSessionManager, SessionSendOptions } from "./types";
import { buildPromptWithContextFiles } from "./contextPrompt";

interface CodexSessionEvent {
	runId: string;
	type:
		| "session_meta"
		| "reasoning"
		| "text_delta"
		| "tool_start"
		| "tool_end"
		| "tool_progress"
		| "turn_start"
		| "done"
		| "error"
		| "stderr";
	content?: string;
	sessionId?: string;
	itemId?: string;
	toolName?: string;
	toolInput?: Record<string, unknown>;
	toolOutput?: {
		command?: string;
		output?: string;
		exitCode?: number | null;
		status?: string;
		changes?: Array<{ path: string; kind: string }>;
		result?: unknown;
		error?: string;
		query?: string;
		items?: Array<{ text: string; completed: boolean }>;
	};
	fileChanges?: Array<{ path: string; kind: "add" | "delete" | "update" }>;
	patchStatus?: "completed" | "failed";
	todoItems?: Array<{ text: string; completed: boolean }>;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		cachedInputTokens?: number;
	};
	isError?: boolean;
}

export class CodexSessionManager implements ICodingSessionManager {
	private unlisten: UnlistenFn | null = null;
	private runId: string | null = null;
	private sessionId: string | null = null;
	readonly backend = "codex" as const;

	private cwd: string | null = null;

	async send(prompt: string, options: SessionSendOptions): Promise<void> {
		const promptWithContext = buildPromptWithContextFiles(
			prompt,
			options.contextFiles,
		);

		this.cwd = options.cwd;
		codingSessionStore.createAssistantMessage("codex");

		this.unlisten = await listen<CodexSessionEvent>(
			"codex-session-event",
			(event) => {
				if (event.payload.runId !== this.runId) return;
				this.handleEvent(event.payload);
			},
		);

			try {
				console.log(`[CodexSessionManager] sending with model: ${options.model || "(default)"}, cwd: ${options.cwd}`);
				this.runId = await invoke<string>("codex_session_start", {
					prompt: promptWithContext,
					cwd: options.cwd,
					model: options.model,
				approvalMode: (options.approvalMode as CodingApprovalMode | undefined) ?? "on-request",
				resumeSessionId: options.resumeSessionId,
				workspaceContext: options.workspaceContext,
			});
			codingSessionStore.setRunId(this.runId);
		} catch (error) {
			codingSessionStore.setStatus("error");
			codingSessionStore.finalizeStreamingMessage();
			this.cleanup();
			throw error;
		}
	}

	private handleEvent(event: CodexSessionEvent): void {
		switch (event.type) {
			case "session_meta":
				if (event.sessionId) {
					this.sessionId = event.sessionId;
					codingSessionStore.setSdkSessionId(event.sessionId);
				}
				break;

			case "turn_start":
				// 标记新回合开始，可用于 UI 分隔
				break;

			case "reasoning":
				if (event.content) {
					codingSessionStore.appendThinking(event.content, "Codex 思考");
				}
				break;

			case "text_delta":
				if (event.content) {
					codingSessionStore.appendText(event.content);
				}
				break;

			case "tool_start":
				codingSessionStore.addToolCall({
					id: event.itemId || `codex_tc_${Date.now()}`,
					name: event.toolName || "Unknown",
					input: event.toolInput || {},
					status: "running",
				});
				break;

			case "tool_progress":
				// 中间状态更新 — 仅在 itemId 匹配时刷新
				if (event.itemId) {
					codingSessionStore.updateToolCall(event.itemId, {
						status: "running",
					});
				}
				break;

			case "tool_end":
				if (!event.itemId) break;

				if (event.toolName === "FileChange") {
					this.handleFileChangeEnd(event);
				} else if (event.toolName === "TodoList") {
					codingSessionStore.updateToolCall(event.itemId, {
						status: event.isError ? "error" : "completed",
						output: {
							items: event.todoItems ?? event.toolOutput?.items ?? [],
						},
						isError: event.isError,
					});
				} else if (event.toolName === "WebSearch") {
					codingSessionStore.updateToolCall(event.itemId, {
						status: "completed",
						output: {
							query: event.toolOutput?.query ?? "",
						},
						isError: false,
					});
				} else {
					codingSessionStore.updateToolCall(event.itemId, {
						status: event.isError ? "error" : "completed",
						output: event.toolOutput || {},
						isError: event.isError,
					});
				}
				break;

			case "stderr":
				if (event.content) {
					codingSessionStore.addSystemMessage(event.content);
				}
				break;

			case "done":
				if (event.usage) {
					codingSessionStore.updateUsage({
						inputTokens: event.usage.inputTokens,
						outputTokens: event.usage.outputTokens,
					});
				}
				codingSessionStore.finalizeThinking();
				codingSessionStore.setStatus("completed");
				codingSessionStore.finalizeStreamingMessage();
				this.cleanup();
				break;

			case "error":
				if (event.content) {
					codingSessionStore.appendText(`\n\n${event.content}`);
				}
				codingSessionStore.setStatus("error");
				codingSessionStore.finalizeStreamingMessage();
				this.cleanup();
				break;
		}
	}

	/**
	 * 处理 file_change tool_end：
	 * 更新工具调用状态 + 尝试读取文件生成 diff
	 */
	private handleFileChangeEnd(event: CodexSessionEvent): void {
		const itemId = event.itemId!;
		const changes = event.fileChanges ?? [];
		const patchStatus = event.patchStatus ?? "completed";

		codingSessionStore.updateToolCall(itemId, {
			status: patchStatus === "failed" ? "error" : "completed",
			output: {
				changes,
				patchStatus,
			},
			isError: patchStatus === "failed",
		});

		// 为每个变更文件尝试生成 diff
		for (const change of changes) {
			this.tryGenerateFileDiff(itemId, change.path, change.kind);
		}
	}

	/**
	 * 尝试通过 IPC 读取文件当前内容，生成 diff 记录
	 */
	private async tryGenerateFileDiff(
		toolCallId: string,
		filePath: string,
		kind: string,
	): Promise<void> {
		try {
			const fullPath = this.cwd
				? `${this.cwd}/${filePath}`.replace(/\/\//g, "/")
				: filePath;

			if (kind === "delete") {
				// 删除操作：记录为 oldContent 有值，newContent 为空
				const diffId = `diff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
				diffStore.addDiff({
					id: diffId,
					filePath,
					oldContent: "(文件已删除)",
					newContent: "",
					status: "pending",
					timestamp: Date.now(),
					toolCallId,
					toolName: "FileChange",
				});
				codingSessionStore.updateToolCall(toolCallId, { diffId });
				return;
			}

			// add / update：读取当前文件内容
			const result = await invoke<{ content: string; error?: string }>(
				"coding_read_file",
				{ path: fullPath },
			);

			if (result?.content != null) {
				const diffId = `diff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
				const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
				diffStore.addDiff({
					id: diffId,
					filePath,
					oldContent: kind === "add" ? "" : "(变更前内容不可用)",
					newContent: result.content,
					status: "pending",
					timestamp: Date.now(),
					toolCallId,
					toolName: "FileChange",
					language: ext,
				});
				codingSessionStore.updateToolCall(toolCallId, { diffId });
			}
		} catch {
			// 文件读取失败时静默处理，不影响主流程
		}
	}

	async abort(): Promise<void> {
		if (this.runId) {
			await invoke("codex_session_abort", { runId: this.runId });
		}
		codingSessionStore.setStatus("idle");
		codingSessionStore.finalizeStreamingMessage();
		this.cleanup();
	}

	async resume(sessionId: string): Promise<void> {
		this.sessionId = sessionId;
		codingSessionStore.setSdkSessionId(sessionId);
	}

	async control(action: RuntimeControlAction): Promise<{ success: boolean; error?: string }> {
		if (!this.runId) {
			if (action.type === "resume" && action.sessionId) {
				this.sessionId = action.sessionId;
				codingSessionStore.setSdkSessionId(action.sessionId);
				return { success: true };
			}
			return { success: false, error: "当前没有运行中的 Codex 会话。" };
		}
		return controlCodexRuntime({ runId: this.runId, action });
	}

	async resolvePermission(): Promise<void> {
		// Codex 通过 approval policy 预先定义权限策略，不支持逐条工具审批。
	}

	dispose(): void {
		this.cleanup();
	}

	getSessionId(): string | null {
		return this.sessionId;
	}

	private cleanup(): void {
		if (this.unlisten) {
			this.unlisten();
			this.unlisten = null;
		}
		this.runId = null;
	}
}
