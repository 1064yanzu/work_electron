/**
 * Claude Code CLI Session Manager
 *
 * 直接通过 IPC 调用后端 claudeCodeSession handler，
 * 后端会 spawn 用户本地的 `claude` CLI 二进制文件。
 *
 * 参照 codexSessionManager.ts 的模式实现，
 * 与旧版 SDK 模式（AgentSdkClient）完全解耦。
 */

import type {
	ClaudeCodeApprovalMode,
	RuntimeControlAction,
} from "../../../electron/shared/coding-workspace";
import { invoke } from "../tauriCompat";
import { listen, type UnlistenFn } from "../tauriEventCompat";
import type { UIEvent } from "../agent/streamState";
import { codingSessionStore } from "../stores/codingSessionStore";
import type { ICodingSessionManager, SessionSendOptions } from "./types";
import { buildPromptWithContextFiles } from "./contextPrompt";
import { processUIEvents } from "./eventMapper";

/**
 * 后端 claudeCodeSession 通过 IPC 发送的事件结构
 */
interface ClaudeCodeSessionEvent {
	runId: string;
	type: "ui_events" | "done" | "error" | "stderr" | "session_init" | "permission_request";
	events?: UIEvent[];
	sessionId?: string;
	result?: unknown;
	content?: string;
	isError?: boolean;
	usage?: {
		inputTokens: number;
		outputTokens: number;
		costUsd?: number;
	};
	// 权限请求专用字段
	requestId?: string;
	toolName?: string;
	toolInput?: Record<string, unknown>;
	description?: string;
	timeoutMs?: number;
}

export class ClaudeCodeSessionManager implements ICodingSessionManager {
	private unlisten: UnlistenFn | null = null;
	private runId: string | null = null;
	private sessionId: string | null = null;
	readonly backend = "claude-code" as const;

	async send(prompt: string, options: SessionSendOptions): Promise<void> {
		const promptWithContext = buildPromptWithContextFiles(
			prompt,
			options.contextFiles,
		);

		// 1. 创建 assistant 占位消息
		codingSessionStore.createAssistantMessage("claude-code");

		// 2. 注册 IPC 事件监听
		this.unlisten = await listen<ClaudeCodeSessionEvent>(
			"claude-code-session-event",
			(event) => {
				if (event.payload.runId !== this.runId) return;
				this.handleEvent(event.payload);
			},
		);

		// 3. 启动 Claude Code CLI 会话
		try {
			console.log(
				`[ClaudeCodeSessionManager] sending with model: ${options.model || "(default)"}, cwd: ${options.cwd}`,
			);
			this.runId = await invoke<string>("claude_code_session_start", {
				prompt: promptWithContext,
				cwd: options.cwd,
				model: options.model,
				permissionMode:
					(options.approvalMode as ClaudeCodeApprovalMode | undefined) ??
					"default",
				systemPrompt: options.workspaceContext || undefined,
				resumeSessionId: options.resumeSessionId || undefined,
			});
			codingSessionStore.setRunId(this.runId);
		} catch (error) {
			codingSessionStore.setStatus("error");
			codingSessionStore.finalizeStreamingMessage();
			this.cleanup();
			throw error;
		}
	}

	private handleEvent(event: ClaudeCodeSessionEvent): void {
		switch (event.type) {
			case "session_init":
				if (event.sessionId) {
					this.sessionId = event.sessionId;
					codingSessionStore.setSdkSessionId(event.sessionId);
				}
				break;

			case "ui_events":
				// 批量 UIEvent 直接透传给 eventMapper
				if (event.events && Array.isArray(event.events)) {
					processUIEvents(event.events);
				}
				break;

			case "done":
				if (event.usage) {
					codingSessionStore.updateUsage({
						inputTokens: event.usage.inputTokens,
						outputTokens: event.usage.outputTokens,
						costUsd: event.usage.costUsd ?? 0,
					});
				}
				codingSessionStore.finalizeThinking();
				codingSessionStore.setStatus("completed");
				codingSessionStore.finalizeStreamingMessage();
				this.cleanup();
				break;

			case "error":
				if (event.content) {
					codingSessionStore.appendText(`\n\n**错误**: ${event.content}`);
				}
				codingSessionStore.setStatus("error");
				codingSessionStore.finalizeStreamingMessage();
				this.cleanup();
				break;

			case "stderr":
				if (event.content) {
					// 内部日志仅写入 console，不暴露给用户
					console.debug('[Claude CLI stderr]', event.content);
					// 仅真正的错误才展示在聊天流中
					if (event.isError) {
						codingSessionStore.addSystemMessage(event.content);
					}
				}
				break;

			case "permission_request":
				if (event.requestId && event.toolName) {
					codingSessionStore.setPermission({
						requestId: event.requestId,
						toolName: event.toolName,
						toolInput: event.toolInput ?? {},
						description: event.description,
						expiresAt: Date.now() + (event.timeoutMs ?? 60000),
					});
				}
				break;
		}
	}

	async abort(): Promise<void> {
		codingSessionStore.setPermission(null);
		if (this.runId) {
			await invoke("claude_code_session_abort", { runId: this.runId });
		}
		codingSessionStore.setStatus("idle");
		codingSessionStore.finalizeStreamingMessage();
		this.cleanup();
	}

	async resume(sessionId: string): Promise<void> {
		this.sessionId = sessionId;
		codingSessionStore.setSdkSessionId(sessionId);
	}

	async control(
		action: RuntimeControlAction,
	): Promise<{ success: boolean; error?: string }> {
		if (!this.runId) {
			if (action.type === "resume" && action.sessionId) {
				this.sessionId = action.sessionId;
				codingSessionStore.setSdkSessionId(action.sessionId);
				return { success: true };
			}
			return {
				success: false,
				error: "当前没有运行中的 Claude Code 会话。",
			};
		}

		try {
			return await invoke<{ success: boolean; error?: string }>(
				"claude_code_runtime_control",
				{ runId: this.runId, action },
			);
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	async resolvePermission(
		requestId: string,
		allow: boolean,
		_message?: string,
	): Promise<void> {
		if (this.runId) {
			await invoke("claude_code_permission_respond", {
				runId: this.runId,
				requestId,
				allow,
			});
		}
		codingSessionStore.resolvePermission();
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
