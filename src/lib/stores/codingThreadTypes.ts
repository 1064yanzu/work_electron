/**
 * 编程线程数据类型定义
 * 支持多线程并行编程的核心数据模型
 */

import type { SessionStatus } from "./codingSessionTypes";
import type { CodingBackend, CodingMode } from "./codingAgentStore";
import type {
	CodingApprovalMode,
	BackendCapabilityMatrix,
} from "../../../electron/shared/coding-workspace";

/** Diff 统计信息 */
export interface DiffStats {
	additions: number;
	deletions: number;
}

/** 线程来源标识 */
export type CodingThreadSource = "local" | "codex-cli" | "claude-code-cli";

/** 编程线程 */
export interface CodingThread {
	id: string;
	/** 线程标题（自动生成或手动命名） */
	title: string;
	/** 始终关联的项目目录 */
	projectPath: string;
	/** 项目名称 */
	projectName: string;
	/** 创建时间 */
	createdAt: number;
	/** 最后更新时间 */
	updatedAt: number;
	/** 后端类型 */
	backend: CodingBackend;
	/** 提供方标识（例如 Anthropic / OpenAI / 本地 provider） */
	providerId?: string;
	/** 当前线程绑定的模型 */
	model: string;
	/** 当前线程权限/审批模式 */
	approvalMode: CodingApprovalMode;
	/** 项目级 workspace profile id */
	workspaceProfileId?: string;
	/** 创建线程时快照的后端能力 */
	capabilitiesSnapshot?: BackendCapabilityMatrix;
	/** 编码模式 */
	codingMode: CodingMode;
	/** SDK session ID，用于 Claude Code resume */
	sdkSessionId?: string;
	/** Codex / 通用 runtime session id */
	runtimeSessionId?: string;
	/** 线程运行状态 */
	status: SessionStatus;
	/** 最近一次运行时间 */
	lastRunAt?: number;
	/** 最近一次运行状态 */
	lastRunStatus?: SessionStatus;
	/** 最近一次运行摘要 */
	lastRunSummary?: string;
	/** Diff 统计 */
	diffStats?: DiffStats;
	/** 线程来源标识：本地创建还是从 CLI 历史导入 */
	source?: CodingThreadSource;
	/** 外部 CLI 的原始线程/会话 ID */
	externalThreadId?: string;
	/** 从哪个线程分叉而来 */
	forkedFrom?: string;
}

/** 线程持久化数据（不含消息体） */
export type CodingThreadPersist = Omit<CodingThread, "status">;
