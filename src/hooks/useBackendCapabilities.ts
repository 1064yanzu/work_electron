/**
 * useBackendCapabilities
 * 提供当前后端能力的便捷 hook，UI 组件用于动态启用/禁用功能
 */

import { useMemo } from "react";
import type {
	BackendCapabilityFlags,
	BackendCapabilityMatrix,
	CodingBackendId,
} from "../../electron/shared/coding-workspace";
import { useCodingRuntimeSelector } from "../lib/stores/codingRuntimeStore";
import { useCodingAgentSelector } from "../lib/stores/codingAgentStore";
import { useCodingThreadSelector } from "../lib/stores/codingThreadStore";
import { codingThreadStore } from "../lib/stores/codingThreadStore";

export interface BackendCapabilities {
	/** 当前活跃后端 ID */
	backend: CodingBackendId;
	/** 后端是否已检测到且可用 */
	available: boolean;
	/** 完整能力矩阵 */
	matrix: BackendCapabilityMatrix | null;
	/** 能力 flags（安全解包，全部默认 false） */
	flags: BackendCapabilityFlags;
	/** 是否 Claude Code */
	isClaudeCode: boolean;
	/** 是否 Codex */
	isCodex: boolean;
	/** 后端版本号 */
	version: string | null;
	/** 是否支持逐条工具审批（仅 Claude Code 支持） */
	supportsInteractiveApproval: boolean;
	/** 是否支持 resume */
	supportsResume: boolean;
	/** 是否支持 rewind */
	supportsRewind: boolean;
	/** 是否支持斜杠命令 */
	supportsSlashCommands: boolean;
	/** 是否支持运行中切换模型 */
	supportsSetModelWhileRunning: boolean;
	/** 是否支持工作区记忆 */
	supportsWorkspaceMemory: boolean;
	/** 工具事件粒度 */
	toolEventGranularity: "none" | "coarse" | "granular";
	/** 模型目录 */
	modelCatalog: string[];
	/** 默认模型 */
	defaultModel: string | null;
}

const DEFAULT_FLAGS: BackendCapabilityFlags = {
	resume: false,
	rewind: false,
	interactiveApproval: false,
	setModelWhileRunning: false,
	slashCommandSupport: false,
	workspaceMemory: false,
	toolEventGranularity: "none",
};

export function useBackendCapabilities(): BackendCapabilities {
	const globalBackend = useCodingAgentSelector((s) => s.codingBackend);
	const activeThreadId = useCodingThreadSelector((s) => s.activeThreadId);
	const capabilities = useCodingRuntimeSelector((s) => s.capabilities);

	const backend: CodingBackendId = useMemo(() => {
		if (activeThreadId) {
			const thread = codingThreadStore.getThread(activeThreadId);
			if (thread) return thread.backend;
		}
		return globalBackend;
	}, [activeThreadId, globalBackend]);

	return useMemo(() => {
		const matrix = capabilities[backend] ?? null;
		const flags = matrix?.capabilities ?? DEFAULT_FLAGS;

		return {
			backend,
			available: matrix?.available ?? false,
			matrix,
			flags,
			isClaudeCode: backend === "claude-code",
			isCodex: backend === "codex",
			version: matrix?.version ?? null,
			supportsInteractiveApproval: flags.interactiveApproval,
			supportsResume: flags.resume,
			supportsRewind: flags.rewind,
			supportsSlashCommands: flags.slashCommandSupport,
			supportsSetModelWhileRunning: flags.setModelWhileRunning,
			supportsWorkspaceMemory: flags.workspaceMemory,
			toolEventGranularity: flags.toolEventGranularity,
			modelCatalog: matrix?.modelCatalog ?? [],
			defaultModel: matrix?.defaultModel ?? null,
		};
	}, [backend, capabilities]);
}

/**
 * 快捷函数：检查指定命令是否被当前后端支持
 * 用于斜杠命令过滤
 */
export function isCommandSupportedByBackend(
	commandBackends: CodingBackendId[] | undefined,
	currentBackend: CodingBackendId,
): boolean {
	if (!commandBackends || commandBackends.length === 0) return true;
	return commandBackends.includes(currentBackend);
}
