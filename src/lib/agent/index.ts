// Agent 模块导出

export {
	AgentLoop,
	type AgentLoopConfig,
	cancelCurrentAgent,
	createAgentLoop,
	getCurrentAgentLoop,
	runAgent,
	runResearchAgent,
} from "./agentLoop";
// 核心智能模块
export * from "./core";
export {
	createLinearDAG,
	createParallelDAG,
	DAGExecutor,
	type DAGNode,
	type DAGNodeStatus,
	type ExecutionBudget,
} from "./dagEngine";
export { agentExecutor } from "./executor";
// 智能执行器（新架构）
export {
	createIntelligentExecutor,
	intelligentExecutor,
} from "./intelligentExecutor";
export { permissionStore, usePermissionStore } from "./permissionStore";
export {
	agentPersistence,
	disableAutoSave,
	enableAutoSave,
	getSessionHistory,
	resumePersistentSession,
	startPersistentSession,
} from "./persistence";
export { registerTool, registerTools, toolRegistry } from "./registry";
export { agentStore, useAgentStore } from "./store";
export { builtinTools } from "./tools";
export * from "./types";

// 初始化函数：注册所有内置工具
import { toolRegistry } from "./registry";
import { builtinTools } from "./tools";

export function initializeAgent() {
	console.log("[Agent] 初始化 Agent 系统...");
	toolRegistry.registerAll(builtinTools);
	console.log(`[Agent] 已注册 ${builtinTools.length} 个内置工具`);
}
