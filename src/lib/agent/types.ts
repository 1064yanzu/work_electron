// Agent 系统核心类型定义
// 通用工具调用系统，类似 Cursor/Windsurf

// ============ 工具相关类型 ============

// 工具类型枚举
export type ToolType =
	| "web_search" // 网络搜索
	| "kb_search_chunks" // 资料库分块检索
	| "fetch_url" // 抓取网页内容
	| "doc_create" // 创建新文档（编辑器内）
	| "doc_update" // 更新当前文档（编辑器内）
	| "doc_patch" // 对当前文档做小范围补丁（编辑器内）
	| "mcp_call" // MCP 协议调用
	| "file_read" // 读取文件
	| "file_write" // 写入文件
	| "file_list" // 列出目录文件
	| "code_execute" // 执行代码
	| "browser_open" // 打开浏览器
	| "browser_screenshot" // 浏览器截图
	| "llm_call" // LLM 调用
	| "skill_call" // 技能调用（遗留，可能被 skill_invoke 取代）
	| "skill_invoke" // 激活技能：读取 SKILL.md 并注入上下文
	| "custom"; // 自定义工具

// 工具调用状态
export type ToolCallStatus =
	| "pending" // 等待执行
	| "running" // 正在执行
	| "completed" // 执行完成
	| "error" // 执行出错
	| "cancelled"; // 已取消

// 工具调用记录
export interface ToolCall {
	id: string;
	type: ToolType;
	name: string; // 工具显示名称
	description?: string; // 调用描述
	input: Record<string, any>; // 输入参数
	output?: any; // 输出结果
	error?: string; // 错误信息
	status: ToolCallStatus;
	startedAt?: number; // 开始时间
	completedAt?: number; // 完成时间
	duration?: number; // 执行耗时(ms)
	retryCount?: number; // 重试次数
	maxRetries?: number; // 最大重试次数
	reflection?: ToolCallReflection; // 反思信息
	subagentActivities?: AgentThinkingStep[]; // 子代理活动流（思考/工具调用）
	metadata?: Record<string, any>; // 额外元数据
}

// 工具调用反思信息
export interface ToolCallReflection {
	reason: string; // 失败原因分析
	suggestion: string; // 修正建议
	shouldRetry: boolean; // 是否应该重试
	adjustedInput?: Record<string, any>; // 调整后的输入参数
	alternativeTool?: ToolType; // 替代工具建议
}

// 工具定义（用于注册）
export interface ToolDefinition {
	type: ToolType;
	name: string;
	description: string;
	icon?: string; // Lucide 图标名
	inputSchema?: Record<string, any>; // JSON Schema
	execute: (
		input: Record<string, any>,
		context: ToolContext,
	) => Promise<ToolResult>;
}

// 工具执行上下文
export interface ToolContext {
	taskId: string;
	abortSignal?: AbortSignal;
	onProgress?: (progress: number, message?: string) => void;
	browserRef?: React.RefObject<HTMLIFrameElement | null>;
}

// 工具执行结果
export interface ToolResult {
	success: boolean;
	data?: any;
	error?: string;
	artifacts?: ToolArtifact[]; // 产出物（文件、截图等）
}

// 工具产出物
export interface ToolArtifact {
	id: string;
	type: "text" | "image" | "file" | "url" | "code";
	title: string;
	content?: string;
	url?: string;
	mimeType?: string;
	metadata?: Record<string, any>;
}

// ============ Agent 任务相关类型 ============

// 任务状态
export type AgentTaskStatus =
	| "idle" // 空闲
	| "planning" // 规划中
	| "executing" // 执行中
	| "waiting" // 等待用户输入
	| "completed" // 已完成
	| "error" // 出错
	| "cancelled"; // 已取消

// 任务步骤状态
export type AgentTaskStepStatus =
	| "pending" // 待开始
	| "running" // 进行中
	| "completed" // 已完成
	| "error" // 出错
	| "cancelled"; // 已取消

// 任务步骤
export interface AgentTaskStep {
	id: string;
	title: string;
	description?: string;
	status: AgentTaskStepStatus;
	// 用于业务侧自动更新状态（可选）
	kind?: "research" | "analysis" | "write" | "custom" | "other";
}

// Agent 任务
export interface AgentTask {
	id: string;
	type: "research" | "write" | "analyze" | "custom"; // 任务类型
	title: string; // 任务标题
	query: string; // 用户原始请求
	status: AgentTaskStatus;
	toolCalls: ToolCall[]; // 工具调用历史
	artifacts: ToolArtifact[]; // 收集的资料/产出物
	steps: AgentTaskStep[]; // 任务步骤
	result?: string; // 最终结果
	error?: string; // 错误信息
	createdAt: number;
	updatedAt: number;
	completedAt?: number;
	metadata?: Record<string, any>;
}

// ============ Agent 消息类型 ============

// Agent 思考/规划消息
export interface AgentThought {
	id: string;
	type: "thinking" | "planning" | "deciding" | "summarizing";
	content: string;
	timestamp: number;
}

// ============ 思考阶段类型 ============

// 思考阶段
export type ThinkingPhase =
	| "analyzing" // 分析问题
	| "planning" // 制定计划
	| "executing" // 执行中
	| "reflecting" // 反思检查
	| "concluding"; // 总结输出

// 思考阶段配置
export const THINKING_PHASE_CONFIG: Record<
	ThinkingPhase,
	{
		emoji: string;
		label: string;
		color: string;
	}
> = {
	analyzing: { emoji: "🔍", label: "分析问题", color: "text-purple-500" },
	planning: { emoji: "📋", label: "制定计划", color: "text-blue-500" },
	executing: { emoji: "⚙️", label: "执行中", color: "text-amber-500" },
	reflecting: { emoji: "🤔", label: "检查结果", color: "text-teal-500" },
	concluding: { emoji: "✨", label: "整理答案", color: "text-green-500" },
};

// 思考步骤记录
export interface AgentThinkingStep {
	id: string;
	phase: ThinkingPhase;
	content: string;
	timestamp: number;
	duration?: number;
}

// ============ 任务进度类型 ============

// 任务进度状态
export interface TaskProgress {
	// 总体进度 (0-100)
	overallProgress: number;
	// 当前阶段
	currentPhase: ThinkingPhase;
	// 阶段进度 (0-100)
	phaseProgress: number;
	// 预估剩余时间（秒）
	estimatedTimeRemaining?: number;
	// 当前操作描述
	currentOperation?: string;
	// 各阶段完成状态
	phaseStatus: Record<
		ThinkingPhase,
		"pending" | "running" | "completed" | "skipped"
	>;
	// 工具调用统计
	toolCallStats: {
		total: number;
		completed: number;
		failed: number;
	};
}

// 创建默认进度状态
export function createDefaultProgress(): TaskProgress {
	return {
		overallProgress: 0,
		currentPhase: "analyzing",
		phaseProgress: 0,
		phaseStatus: {
			analyzing: "pending",
			planning: "pending",
			executing: "pending",
			reflecting: "pending",
			concluding: "pending",
		},
		toolCallStats: {
			total: 0,
			completed: 0,
			failed: 0,
		},
	};
}

// ============ 错误恢复类型 ============

// 错误类型分类
export type ToolErrorCategory =
	| "network" // 网络错误
	| "timeout" // 超时
	| "permission" // 权限不足
	| "parameter" // 参数错误
	| "not_found" // 资源不存在
	| "rate_limit" // 频率限制
	| "server" // 服务端错误
	| "syntax" // 语法错误
	| "unknown"; // 未知错误

// 错误恢复策略
export interface ErrorRecoveryStrategy {
	category: ToolErrorCategory;
	title: string;
	description: string;
	icon: string;
	suggestions: RecoverySuggestion[];
	canAutoRetry: boolean;
	retryDelay?: number; // 重试延迟（毫秒）
}

// 恢复建议
export interface RecoverySuggestion {
	id: string;
	label: string;
	action: "retry" | "skip" | "alternative" | "manual" | "abort";
	description?: string;
	isRecommended?: boolean;
	alternativeTool?: ToolType;
	adjustedInput?: Record<string, any>;
}

// 错误类型配置
export const ERROR_CATEGORY_CONFIG: Record<
	ToolErrorCategory,
	{
		label: string;
		icon: string;
		color: string;
	}
> = {
	network: { label: "网络错误", icon: "Wifi", color: "text-red-500" },
	timeout: { label: "请求超时", icon: "Clock", color: "text-amber-500" },
	permission: { label: "权限不足", icon: "Lock", color: "text-orange-500" },
	parameter: {
		label: "参数错误",
		icon: "AlertTriangle",
		color: "text-yellow-500",
	},
	not_found: {
		label: "资源不存在",
		icon: "FileQuestion",
		color: "text-gray-500",
	},
	rate_limit: {
		label: "请求过于频繁",
		icon: "Gauge",
		color: "text-purple-500",
	},
	server: { label: "服务器错误", icon: "Server", color: "text-red-600" },
	syntax: { label: "代码语法错误", icon: "Code", color: "text-pink-500" },
	unknown: { label: "未知错误", icon: "HelpCircle", color: "text-gray-400" },
};

// Agent 事件（用于实时更新 UI）
export type AgentEvent =
	| { type: "task_started"; task: AgentTask }
	| { type: "task_updated"; taskId: string; updates: Partial<AgentTask> }
	| { type: "task_completed"; taskId: string; result: string }
	| { type: "task_error"; taskId: string; error: string }
	| { type: "tool_started"; taskId: string; toolCall: ToolCall }
	| { type: "tool_input_updated"; taskId: string; toolCall: ToolCall }
	| {
			type: "tool_progress";
			taskId: string;
			toolCallId: string;
			progress: number;
			message?: string;
	  }
	| {
			type: "tool_completed";
			taskId: string;
			toolCallId: string;
			result: ToolResult;
	  }
	| { type: "tool_error"; taskId: string; toolCallId: string; error: string }
	| { type: "artifact_added"; taskId: string; artifact: ToolArtifact }
	| { type: "thought"; taskId: string; thought: AgentThought }
	| {
			type: "thinking_phase_changed";
			taskId: string;
			phase: ThinkingPhase;
			content?: string;
	  }
	| { type: "progress_updated"; taskId: string; progress: TaskProgress }
	| {
			type: "error_recovery";
			taskId: string;
			toolCallId: string;
			strategy: ErrorRecoveryStrategy;
	  };

// ============ 辅助函数 ============

// 创建新的工具调用
export function createToolCall(
	type: ToolType,
	name: string,
	input: Record<string, any>,
	description?: string,
): ToolCall {
	return {
		id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		type,
		name,
		description,
		input,
		status: "pending",
	};
}

// 创建新的 Agent 任务
export function createAgentTask(
	type: AgentTask["type"],
	query: string,
	title?: string,
): AgentTask {
	return {
		id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		type,
		title: title || query.slice(0, 50) + (query.length > 50 ? "..." : ""),
		query,
		status: "idle",
		toolCalls: [],
		artifacts: [],
		steps: [],
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
}

// 创建产出物
export function createArtifact(
	type: ToolArtifact["type"],
	title: string,
	content?: string,
	url?: string,
): ToolArtifact {
	return {
		id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		type,
		title,
		content,
		url,
	};
}

// 工具类型到图标的映射
export const TOOL_ICONS: Record<ToolType, string> = {
	web_search: "Search",
	kb_search_chunks: "BookOpen",
	fetch_url: "Globe",
	doc_create: "FilePlus",
	doc_update: "FileEdit",
	doc_patch: "PenLine",
	mcp_call: "Plug",
	file_read: "FileText",
	file_write: "FilePlus",
	file_list: "FolderOpen",
	code_execute: "Terminal",
	browser_open: "ExternalLink",
	browser_screenshot: "Camera",
	llm_call: "MessageSquare",
	skill_call: "PenLine",
	skill_invoke: "Zap",
	custom: "Wrench",
};

// 工具类型到显示名称的映射
export const TOOL_NAMES: Record<ToolType, string> = {
	web_search: "网络搜索",
	kb_search_chunks: "资料库检索",
	fetch_url: "抓取网页",
	doc_create: "创建文档",
	doc_update: "更新文档",
	doc_patch: "小改动补丁",
	mcp_call: "MCP 调用",
	file_read: "读取文件",
	file_write: "写入文件",
	file_list: "列出文件",
	code_execute: "执行代码",
	browser_open: "打开浏览器",
	browser_screenshot: "浏览器截图",
	llm_call: "AI 分析",
	skill_call: "执行技能",
	skill_invoke: "激活技能",
	custom: "自定义工具",
};

// ============ 工具权限相关类型 ============

// 工具风险等级
export type ToolRiskLevel = "L0" | "L1" | "L2";

// 权限策略模式
export type PermissionMode =
	| "ask" // 每次询问
	| "auto_approve" // 自动批准
	| "deny"; // 默认拒绝

// 工具风险等级定义（默认值，可在设置中调整）
export const DEFAULT_TOOL_RISK_LEVELS: Record<ToolType, ToolRiskLevel> = {
	kb_search_chunks: "L0", // 纯读，低风险
	llm_call: "L0", // 纯计算
	doc_create: "L0", // 应用内编辑器操作（仍会走 UI 提案/事件）
	doc_update: "L0", // 应用内编辑器操作（仍会走 UI 提案/事件）
	doc_patch: "L0", // 应用内编辑器操作（仍会走 UI 提案/事件）
	web_search: "L0", // 外部网络请求（读取信息，低风险）
	fetch_url: "L0", // 外部网络请求（读取信息，低风险）
	browser_open: "L0", // 打开浏览器（只读操作，低风险）
	browser_screenshot: "L0", // 截图（只读操作，低风险）
	mcp_call: "L0", // MCP 调用（默认 L0，可按 server 覆盖）
	file_read: "L0", // 读取文件（只读操作，低风险）
	file_list: "L0", // 列出目录文件（只读操作，低风险）
	file_write: "L2", // 写文件，高风险（可能修改系统状态）
	code_execute: "L0", // 执行代码（沙箱环境，有超时控制，低风险）
	skill_call: "L0", // 技能调用（默认 L0）
	skill_invoke: "L0", // 激活技能（只读 SKILL.md，低风险）
	custom: "L0", // 自定义工具默认 L0
};

// 工具风险等级（从 localStorage 加载，如果没有则使用默认值）
let cachedToolRiskLevels: Record<ToolType, ToolRiskLevel> | null = null;

export function getToolRiskLevels(): Record<ToolType, ToolRiskLevel> {
	if (cachedToolRiskLevels) return cachedToolRiskLevels;

	try {
		const stored = localStorage.getItem("agent-tool-risk-levels");
		if (stored) {
			const parsed = JSON.parse(stored);
			// 合并默认值和存储的值，确保所有工具都有风险等级
			const merged = { ...DEFAULT_TOOL_RISK_LEVELS, ...parsed } as Record<
				ToolType,
				ToolRiskLevel
			>;
			cachedToolRiskLevels = merged;
			return merged;
		}
	} catch (e) {
		console.warn("Failed to load tool risk levels:", e);
	}

	const fallback = { ...DEFAULT_TOOL_RISK_LEVELS } as Record<
		ToolType,
		ToolRiskLevel
	>;
	cachedToolRiskLevels = fallback;
	return fallback;
}

export function setToolRiskLevel(toolType: ToolType, riskLevel: ToolRiskLevel) {
	const current = getToolRiskLevels();
	current[toolType] = riskLevel;
	cachedToolRiskLevels = { ...current }; // 创建新对象，确保引用变化
	try {
		localStorage.setItem(
			"agent-tool-risk-levels",
			JSON.stringify(cachedToolRiskLevels),
		);
		// 触发 storage 事件，通知其他组件
		window.dispatchEvent(
			new StorageEvent("storage", {
				key: "agent-tool-risk-levels",
				newValue: JSON.stringify(cachedToolRiskLevels),
			}),
		);
	} catch (e) {
		console.warn("Failed to save tool risk levels:", e);
	}
}

export function resetToolRiskLevels() {
	cachedToolRiskLevels = { ...DEFAULT_TOOL_RISK_LEVELS };
	try {
		localStorage.setItem(
			"agent-tool-risk-levels",
			JSON.stringify(cachedToolRiskLevels),
		);
	} catch (e) {
		console.warn("Failed to reset tool risk levels:", e);
	}
}

// 向后兼容：导出 TOOL_RISK_LEVELS 作为 getter
export const TOOL_RISK_LEVELS = new Proxy(
	{} as Record<ToolType, ToolRiskLevel>,
	{
		get(_target, prop) {
			return getToolRiskLevels()[prop as ToolType] || "L0";
		},
	},
);

// 权限请求
export interface PermissionRequest {
	id: string; // requestId
	toolCallId: string; // 关联的工具调用 ID
	toolName: string; // 工具名称
	toolType: ToolType; // 工具类型
	riskLevel: ToolRiskLevel; // 风险等级
	inputPreview: string; // 参数预览（截断后）
	reason?: string; // 请求原因
	createdAt: number; // 创建时间
	expiresAt: number; // 过期时间（超时自动拒绝）
	/** Scope information — whether the operation targets files outside the sandbox */
	scope?: {
		insideSandbox: boolean;
		targetPath?: string;
		destructiveLevel?: "safe" | "moderate" | "dangerous";
		reason?: string;
	};
}

// 权限响应
export interface PermissionResponse {
	requestId: string;
	decision: "allowed" | "denied";
	decidedBy: "user" | "policy" | "timeout" | "aborted";
	reason?: string;
	message?: string;
	updatedInput?: Record<string, unknown>;
	updatedPermissions?: unknown[];
	rememberForSession?: boolean; // 本次会话记住选择
	rememberForTool?: boolean; // 对该工具记住选择
}

// 权限结果（广播给 UI）
export interface PermissionResult {
	requestId: string;
	toolCallId: string;
	decision: "allowed" | "denied";
	decidedBy: "user" | "policy" | "timeout" | "aborted" | "no_window";
	reason?: string;
}

// 工具权限策略配置
export interface ToolPermissionPolicy {
	// 全局默认策略
	defaultMode: PermissionMode;

	// 按风险等级的策略
	levelPolicies: {
		L0: PermissionMode; // 低风险：默认自动批准
		L1: PermissionMode; // 中风险：默认询问
		L2: PermissionMode; // 高风险：默认拒绝
	};

	// 按工具覆盖
	toolOverrides: Record<
		string,
		{
			enabled: boolean;
			mode: PermissionMode;
		}
	>;

	// 权限超时（秒）
	timeoutSeconds: number;

	// 参数预览最大长度
	inputPreviewMaxLength: number;
}

// 默认权限策略
export const DEFAULT_PERMISSION_POLICY: ToolPermissionPolicy = {
	defaultMode: "ask",
	levelPolicies: {
		L0: "auto_approve",
		L1: "ask",
		L2: "deny",
	},
	toolOverrides: {},
	timeoutSeconds: 120,
	inputPreviewMaxLength: 2000,
};

// 权限事件
export type PermissionEvent =
	| { type: "permission_requested"; request: PermissionRequest }
	| { type: "permission_response"; response: PermissionResponse }
	| { type: "permission_result"; result: PermissionResult };

// 创建权限请求
export function createPermissionRequest(
	toolCallId: string,
	toolName: string,
	toolType: ToolType,
	input: Record<string, any>,
	policy: ToolPermissionPolicy,
): PermissionRequest {
	const riskLevel = getToolRiskLevels()[toolType] || "L0";
	const inputStr = JSON.stringify(input, null, 2);
	const inputPreview =
		inputStr.length > policy.inputPreviewMaxLength
			? inputStr.slice(0, policy.inputPreviewMaxLength) + "...(truncated)"
			: inputStr;

	const now = Date.now();
	return {
		id: `perm-${now}-${Math.random().toString(36).slice(2, 7)}`,
		toolCallId,
		toolName,
		toolType,
		riskLevel,
		inputPreview,
		createdAt: now,
		expiresAt: now + policy.timeoutSeconds * 1000,
	};
}

// 根据策略判断是否需要请求权限
export function shouldRequestPermission(
	toolType: ToolType,
	toolName: string,
	policy: ToolPermissionPolicy,
): { needsPermission: boolean; autoDecision?: "allowed" | "denied" } {
	// 检查工具覆盖
	const override =
		policy.toolOverrides[toolName] || policy.toolOverrides[toolType];
	if (override) {
		if (!override.enabled) {
			return { needsPermission: false, autoDecision: "denied" };
		}
		if (override.mode === "auto_approve") {
			return { needsPermission: false, autoDecision: "allowed" };
		}
		if (override.mode === "deny") {
			return { needsPermission: false, autoDecision: "denied" };
		}
		return { needsPermission: true };
	}

	// 检查风险等级策略（使用动态获取的风险等级）
	const riskLevel = getToolRiskLevels()[toolType] || "L0";
	const levelMode = policy.levelPolicies[riskLevel];

	if (levelMode === "auto_approve") {
		return { needsPermission: false, autoDecision: "allowed" };
	}
	if (levelMode === "deny") {
		return { needsPermission: false, autoDecision: "denied" };
	}

	return { needsPermission: true };
}
