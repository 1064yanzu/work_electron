/**
 * Claude Code Session Manager
 * 通过 AgentSdkClient 与 Claude Code CLI 子进程通信
 */

import {
	AgentSdkClient,
	createSdkClient,
	type AgentSdkEventPayload,
} from '../agent/sdkClient';
import type { UIEvent } from '../agent/streamState';
import { codingSessionStore } from '../stores/codingSessionStore';
import type { ICodingSessionManager, SessionSendOptions } from './types';
import { applyModeToPayload } from './modeConfig';
import { buildPromptWithContextFiles } from './contextPrompt';
import { processUIEvents } from './eventMapper';
import type { RuntimeControlAction } from '../../../electron/shared/coding-workspace';

export class ClaudeCodeSessionManager implements ICodingSessionManager {
	private client: AgentSdkClient;
	readonly backend = 'claude-code' as const;

	constructor() {
		this.client = createSdkClient();
	}

	async send(prompt: string, options: SessionSendOptions): Promise<void> {
		const promptWithContext = buildPromptWithContextFiles(
			prompt,
			options.contextFiles,
		);

		// 1. 创建 assistant 占位消息
		codingSessionStore.createAssistantMessage('claude-code');

		// 2. 注册事件回调
		await this.client.startListening((payload: AgentSdkEventPayload) => {
			// 只处理当前 run 的事件
			if (!this.client.isCurrentRun(payload)) return;
			this.handleEvent(payload);
		});

		// 3. 构建 SDK payload
			const modePayload = applyModeToPayload(
				{
					prompt: promptWithContext,
					model: options.model || 'claude-sonnet-4-20250514',
					cwd: options.cwd,
					interactive_approval: true,
				system_prompt: options.workspaceContext || undefined,
			},
			options.mode,
		);

		if (options.approvalMode) {
			modePayload.permission_mode = options.approvalMode;
		}

		// 4. 启动 SDK 运行
		try {
				const startPayload = {
					...modePayload,
					prompt: modePayload.prompt || promptWithContext,
					model: modePayload.model || 'claude-sonnet-4-20250514',
				} as import('../agent/sdkClient').AgentStartPayload;

			// resume_session_id 存在于 IPC schema 但不在 AgentStartPayload 类型中
			if (options.resumeSessionId) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(startPayload as any).resume_session_id = options.resumeSessionId;
			}

			const runId = await this.client.start(startPayload);
			codingSessionStore.setRunId(runId);
		} catch (err) {
			codingSessionStore.setStatus('error');
			codingSessionStore.finalizeStreamingMessage();
			throw err;
		}
	}

	private handleEvent(payload: AgentSdkEventPayload): void {
		switch (payload.type) {
			case 'transformed': {
				// 批量 UIEvent
				if (payload.events && Array.isArray(payload.events)) {
					processUIEvents(payload.events as UIEvent[]);
				}
				break;
			}

			case 'interaction_request': {
				// 权限请求
				if (payload.request) {
					codingSessionStore.setPermission({
						requestId: payload.request.requestId,
						toolName: payload.request.toolName,
						toolInput: payload.request.toolInput,
						description: payload.request.description,
						expiresAt: payload.request.expiresAt,
					});
				}
				break;
			}

			case 'done': {
				// 尝试从 result 中提取 token 用量
				this.extractUsageFromResult(payload.result);
				codingSessionStore.setStatus('completed');
				codingSessionStore.finalizeStreamingMessage();
				this.client.stopListening();
				break;
			}

			case 'error': {
				const errorMsg = payload.error || '未知错误';
				codingSessionStore.appendText(`\n\n**错误**: ${errorMsg}`);
				codingSessionStore.setStatus('error');
				codingSessionStore.finalizeStreamingMessage();
				this.client.stopListening();
				break;
			}

			case 'sdk_message':
			case 'stderr':
				// 可选：日志输出
				break;
		}
	}

	/**
	 * 从 SDK result 载荷中提取 token 用量数据
	 */
	private extractUsageFromResult(result: unknown): void {
		if (!result || typeof result !== 'object') return;
		const r = result as Record<string, unknown>;
		const usage = r.usage as Record<string, unknown> | undefined;
		if (!usage) return;

		const toNum = (v: unknown): number => {
			const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
			return Number.isFinite(n) ? n : 0;
		};

		const inputTokens =
			toNum(usage.prompt_tokens) ||
			toNum(usage.input_tokens) ||
			toNum(usage.inputTokens) ||
			0;
		const outputTokens =
			toNum(usage.completion_tokens) ||
			toNum(usage.output_tokens) ||
			toNum(usage.outputTokens) ||
			0;
		const costUsd =
			toNum(r.total_cost_usd) ||
			toNum(r.totalCostUsd) ||
			0;

		if (inputTokens > 0 || outputTokens > 0) {
			codingSessionStore.updateUsage({
				inputTokens,
				outputTokens,
				costUsd,
			});
		}
	}

	async abort(): Promise<void> {
		await this.client.abort();
		codingSessionStore.setStatus('idle');
		codingSessionStore.finalizeStreamingMessage();
		this.client.stopListening();
	}

	async resume(sessionId: string): Promise<void> {
		codingSessionStore.setSdkSessionId(sessionId);
	}

	async control(action: RuntimeControlAction): Promise<{ success: boolean; error?: string }> {
		switch (action.type) {
			case 'set_model':
				return this.client.control({
					action: 'set_model',
					model: action.model,
				});
			case 'set_approval_mode':
				return this.client.control({
					action: 'set_permission_mode',
					mode: action.approvalMode,
				});
			case 'interrupt':
				return this.client.control({ action: 'interrupt' });
			case 'resume':
				if (action.sessionId) {
					codingSessionStore.setSdkSessionId(action.sessionId);
				}
				return { success: true };
			case 'rewind':
				return { success: false, error: 'Claude Code 当前未暴露 rewind 运行时控制。' };
		}
	}

	async resolvePermission(requestId: string, allow: boolean, message?: string): Promise<void> {
		await this.client.resolveInteraction(requestId, {
			behavior: allow ? 'allow' : 'deny',
			message,
		});
		codingSessionStore.resolvePermission();
	}

	dispose(): void {
		this.client.dispose();
	}

	getSessionId(): string | null {
		return codingSessionStore.getState().sdkSessionId;
	}
}
