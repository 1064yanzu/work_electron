/**
 * Coding Session Manager 接口定义
 * 统一的后端抽象层，Claude Code 和 Codex 均实现此接口
 */

import type {
	CodingApprovalMode,
	RuntimeControlAction,
} from '../../../electron/shared/coding-workspace';

/** 发送消息时的选项 */
export interface SessionSendOptions {
	/** 工作目录 */
	cwd: string;
	/** 编码模式 */
	mode: 'code' | 'plan' | 'ask';
	/** 附加的上下文文件 */
	contextFiles?: Array<{ path: string; name: string; content?: string }>;
	/** 恢复会话 ID */
	resumeSessionId?: string;
	/** 指定模型 */
	model?: string;
	/** 权限 / 审批模式 */
	approvalMode?: CodingApprovalMode;
	/** workspace/memory 合并后的注入上下文 */
	workspaceContext?: string;
}

/** Session Manager 接口 */
export interface ICodingSessionManager {
	/** 发送用户消息 */
	send(prompt: string, options: SessionSendOptions): Promise<void>;
	/** 中止当前运行 */
	abort(): Promise<void>;
	/** 恢复会话 */
	resume(sessionId: string): Promise<void>;
	/** 运行时控制 */
	control(action: RuntimeControlAction): Promise<{ success: boolean; error?: string }>;
	/** 审批权限请求 */
	resolvePermission(requestId: string, allow: boolean, message?: string): Promise<void>;
	/** 当前 backend session id（Claude sdkSessionId / Codex thread id） */
	getSessionId(): string | null;
	/** 释放资源 */
	dispose(): void;
	/** 后端标识 */
	readonly backend: 'claude-code' | 'codex';
}
