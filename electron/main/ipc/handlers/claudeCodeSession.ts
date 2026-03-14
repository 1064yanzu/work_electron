/**
 * Claude Code Session IPC Handlers
 *
 * 提供 Claude Code 的 IPC 接口。
 * 优先使用 SDK 模式（@anthropic-ai/claude-agent-sdk），支持交互式权限审批；
 * SDK 不可用时自动 fallback 到 CLI spawn 模式。
 */

import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type {
	ClaudeCodeApprovalMode,
	RuntimeControlAction,
} from "../../../shared/coding-workspace";
import { getBackendCapabilityMatrix } from "../../services/codingWorkspaceService";
import {
	findClaudeCodeBinary,
	spawnClaudeCodeSession,
	spawnClaudeCodeSessionSdk,
	type ClaudeCodeOutputEvent,
	type ClaudeCodeSessionOptions,
} from "../../services/claudeCodeService";
import {
	getClaudeAuthStatus,
	readUserCliConfig,
} from "../../services/claudeAuthDetector";
import { interactionBroker } from "./agentSdk/interactionBroker";

/** 统一的会话 handle，内部使用 */
interface SessionHandle {
	abort: () => void;
}

const activeSessions = new Map<string, SessionHandle>();

interface ClaudeCodeHandlerDeps {
	getMainWindow: () => BrowserWindow | null;
}

function emitClaudeCodeEvent(
	window: BrowserWindow | null,
	runId: string,
	event: ClaudeCodeOutputEvent,
) {
	window?.webContents?.send("claude-code-session-event", {
		runId,
		...event,
	});
}

export function createClaudeCodeSessionHandlers(deps: ClaudeCodeHandlerDeps) {
	return {
		claude_code_check_available: async (_event: IpcMainInvokeEvent) => {
			const binary = await findClaudeCodeBinary();
			return { available: !!binary, path: binary };
		},

		claude_code_get_capabilities: async (_event: IpcMainInvokeEvent) => {
			return getBackendCapabilityMatrix("claude-code");
		},

		claude_code_session_start: async (
			_event: IpcMainInvokeEvent,
			input: {
				prompt: string;
				cwd: string;
				model?: string;
				permissionMode?: ClaudeCodeApprovalMode;
				systemPrompt?: string;
				allowedTools?: string[];
				disallowedTools?: string[];
				additionalDirectories?: string[];
				mcpConfig?: string;
				resumeSessionId?: string;
				continueSession?: boolean;
				maxTurns?: number;
				maxBudgetUsd?: number;
				settingSources?: string[];
				betas?: string[];
				agents?: Record<string, unknown>;
				dangerouslySkipPermissions?: boolean;
				extraArgs?: string[];
			},
		) => {
			const runId = `claude_code_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
			const win = deps.getMainWindow();
			const options: ClaudeCodeSessionOptions = {
				prompt: input.prompt,
				cwd: input.cwd,
				model: input.model,
				permissionMode: input.permissionMode,
				systemPrompt: input.systemPrompt,
				allowedTools: input.allowedTools,
				disallowedTools: input.disallowedTools,
				additionalDirectories: input.additionalDirectories,
				mcpConfig: input.mcpConfig,
				resumeSessionId: input.resumeSessionId,
				continueSession: input.continueSession,
				maxTurns: input.maxTurns,
				maxBudgetUsd: input.maxBudgetUsd,
				settingSources: input.settingSources,
				betas: input.betas,
				agents: input.agents,
				dangerouslySkipPermissions: input.dangerouslySkipPermissions,
				extraArgs: input.extraArgs,
			};

			const onEvent = (event: ClaudeCodeOutputEvent) => {
				emitClaudeCodeEvent(win, runId, event);
				if (event.type === "done" || event.type === "error") {
					activeSessions.delete(runId);
					interactionBroker.clearRun(runId);
				}
			};

			// 优先尝试 SDK 模式
			try {
				const onPermissionRequest = async (
					requestId: string,
					toolName: string,
					toolInput: Record<string, unknown>,
					timeoutMs: number,
				): Promise<boolean> => {
					// 推权限请求事件给前端
					emitClaudeCodeEvent(win, runId, {
						type: "permission_request",
						requestId,
						toolName,
						toolInput,
						timeoutMs,
					});
					// 挂起等待前端响应
					const decision = await interactionBroker.createRequest(
						runId,
						requestId,
						timeoutMs,
					);
					return decision.behavior === "allow";
				};

				// SDK 模式不需要 binary，传空字符串
				const abortController = await spawnClaudeCodeSessionSdk("", options, {
					onEvent,
					onPermissionRequest,
				});
				activeSessions.set(runId, {
					abort: () => abortController.abort(),
				});
				return runId;
			} catch (sdkErr) {
				console.warn(
					`[claude-code] SDK 模式启动失败，fallback 到 CLI 模式: ${sdkErr instanceof Error ? sdkErr.message : String(sdkErr)}`,
				);
			}

			// Fallback: CLI spawn 模式
			const binary = await findClaudeCodeBinary();
			if (!binary) {
				throw new Error("Claude Code CLI 未找到，请先安装 Claude Code。");
			}

			const proc = spawnClaudeCodeSession(binary, options, onEvent);
			activeSessions.set(runId, {
				abort: () => proc.kill("SIGTERM"),
			});
			return runId;
		},

		claude_code_session_abort: async (
			_event: IpcMainInvokeEvent,
			input: { runId: string },
		) => {
			const handle = activeSessions.get(input.runId);
			if (handle) {
				handle.abort();
				activeSessions.delete(input.runId);
				interactionBroker.clearRun(input.runId);
			}
			return { success: true };
		},

		claude_code_runtime_control: async (
			_event: IpcMainInvokeEvent,
			input: { runId: string; action: RuntimeControlAction },
		) => {
			const handle = activeSessions.get(input.runId);
			if (!handle) {
				return {
					success: false,
					error: "未找到对应的 Claude Code 运行实例。",
				};
			}

			if (input.action.type === "interrupt") {
				handle.abort();
				activeSessions.delete(input.runId);
				interactionBroker.clearRun(input.runId);
				return { success: true };
			}

			return {
				success: false,
				error: `Claude Code 当前不支持运行中执行 ${input.action.type} 控制。`,
			};
		},

		/** 响应前端对交互式权限请求的审批结果 */
		claude_code_permission_respond: async (
			_event: IpcMainInvokeEvent,
			input: { runId: string; requestId: string; allow: boolean },
		) => {
			const resolved = interactionBroker.resolve(input.runId, input.requestId, {
				behavior: input.allow ? "allow" : "deny",
			});
			return { success: resolved };
		},

		/** 读取 ~/.claude.json 和 ~/.claude/settings.json 的认证与配置状态 */
		claude_code_auth_status: async (_event: IpcMainInvokeEvent) => {
			return getClaudeAuthStatus();
		},

		/** 读取用户本机 CLI 配置（Claude Code + Codex），用于同步到应用设置 */
		coding_read_user_cli_config: async (_event: IpcMainInvokeEvent) => {
			return readUserCliConfig();
		},
	};
}
