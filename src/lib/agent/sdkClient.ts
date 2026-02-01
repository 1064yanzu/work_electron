/**
 * Agent SDK Client
 *
 * 负责与 Tauri 后端的 IPC 通信。
 * 这是一个纯粹的通信层，不包含业务逻辑。
 */

import { invoke } from "../tauriCompat";
import { listen, type UnlistenFn } from "../tauriEventCompat";

/**
 * SDK 启动参数
 */
export interface AgentStartPayload {
	prompt: string;
	model: string;
	cwd?: string;
	permission_mode?: string;
	allowed_tools?: string[];
	system_prompt?: string;
}

/**
 * SDK 事件类型
 */
export interface AgentSdkEventPayload {
	runId: string;
	type: "sdk_message" | "transformed" | "stderr" | "done" | "error";
	message?: unknown;
	events?: unknown[];
	result?: unknown;
	error?: string;
	/** 错误是否可重试 */
	retryable?: boolean;
	/** 重试配置（仅当 retryable 为 true 时存在） */
	retryConfig?: {
		maxRetries: number;
		baseDelayMs: number;
	};
}

/**
 * Agent SDK Client
 *
 * 提供与后端 SDK manager 的通信接口。
 */
export class AgentSdkClient {
	private unlisten: UnlistenFn | null = null;
	private runId: string | null = null;
	private eventHandler: ((payload: AgentSdkEventPayload) => void) | null = null;

	/**
	 * 开始监听 SDK 事件
	 */
	async startListening(
		handler: (payload: AgentSdkEventPayload) => void,
	): Promise<void> {
		if (this.unlisten) {
			this.unlisten();
		}

		this.eventHandler = handler;
		this.unlisten = await listen<AgentSdkEventPayload>(
			"agent-sdk-event",
			(event) => {
				this.eventHandler?.(event.payload);
			},
		);
	}

	/**
	 * 停止监听 SDK 事件
	 */
	stopListening(): void {
		if (this.unlisten) {
			this.unlisten();
			this.unlisten = null;
		}
		this.eventHandler = null;
	}

	/**
	 * 启动 SDK 运行
	 */
	async start(payload: AgentStartPayload): Promise<string> {
		const runId = await invoke<string>("agent_sdk_start", { payload });
		this.runId = runId;
		return runId;
	}

	/**
	 * 中止当前运行
	 */
	async abort(): Promise<void> {
		if (this.runId) {
			await invoke("agent_sdk_abort", { runId: this.runId });
			this.runId = null;
		}
	}

	/**
	 * 获取当前运行 ID
	 */
	getRunId(): string | null {
		return this.runId;
	}

	/**
	 * 检查事件是否属于当前运行
	 */
	isCurrentRun(payload: AgentSdkEventPayload): boolean {
		return this.runId !== null && payload.runId === this.runId;
	}

	/**
	 * 清理资源
	 */
	dispose(): void {
		this.stopListening();
		this.runId = null;
	}
}

/**
 * 创建一个新的客户端实例
 */
export function createSdkClient(): AgentSdkClient {
	return new AgentSdkClient();
}
