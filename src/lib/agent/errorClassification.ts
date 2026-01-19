/**
 * Agent Error Classification
 *
 * 错误分类和处理模块。
 * 提供统一的错误类型定义和处理策略。
 */

/**
 * 错误类型枚举
 */
export enum AgentErrorType {
	// 连接错误
	CONNECTION_FAILED = "connection_failed",
	SDK_NOT_FOUND = "sdk_not_found",

	// 认证错误
	AUTH_FAILED = "auth_failed",
	API_KEY_INVALID = "api_key_invalid",

	// 工具错误
	TOOL_VALIDATION_ERROR = "tool_validation_error",
	TOOL_EXECUTION_ERROR = "tool_execution_error",
	TOOL_PERMISSION_DENIED = "tool_permission_denied",
	TOOL_TIMEOUT = "tool_timeout",

	// 限流错误
	RATE_LIMITED = "rate_limited",
	QUOTA_EXCEEDED = "quota_exceeded",

	// 内容错误
	CONTENT_FILTERED = "content_filtered",
	CONTEXT_TOO_LONG = "context_too_long",

	// 系统错误
	INTERNAL_ERROR = "internal_error",
	UNKNOWN_ERROR = "unknown_error",

	// 用户操作
	USER_ABORTED = "user_aborted",
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
	INFO = "info", // 信息性错误，可以继续
	WARNING = "warning", // 警告，可能需要注意
	ERROR = "error", // 错误，当前操作失败
	CRITICAL = "critical", // 严重错误，需要用户干预
}

/**
 * 分类后的错误
 */
export interface ClassifiedError {
	type: AgentErrorType;
	severity: ErrorSeverity;
	message: string;
	originalError?: unknown;
	recoverable: boolean;
	suggestion?: string;
}

/**
 * 错误模式匹配规则
 */
interface ErrorPattern {
	pattern: RegExp | string;
	type: AgentErrorType;
	severity: ErrorSeverity;
	recoverable: boolean;
	suggestion?: string;
}

/**
 * 预定义的错误模式
 */
const ERROR_PATTERNS: ErrorPattern[] = [
	// 连接错误
	{
		pattern: /SDK not found|claude.*not found|command not found/i,
		type: AgentErrorType.SDK_NOT_FOUND,
		severity: ErrorSeverity.CRITICAL,
		recoverable: false,
		suggestion: "请安装 Claude Code CLI: brew install --cask claude-code",
	},
	{
		pattern: /ECONNREFUSED|connection refused|network error/i,
		type: AgentErrorType.CONNECTION_FAILED,
		severity: ErrorSeverity.ERROR,
		recoverable: true,
		suggestion: "请检查网络连接和代理设置",
	},

	// 认证错误
	{
		pattern: /API key.*invalid|authentication.*failed|unauthorized/i,
		type: AgentErrorType.API_KEY_INVALID,
		severity: ErrorSeverity.CRITICAL,
		recoverable: false,
		suggestion: "请检查 API 密钥配置",
	},

	// 工具错误
	{
		pattern: /InputValidationError|tool_use_error|invalid.*input/i,
		type: AgentErrorType.TOOL_VALIDATION_ERROR,
		severity: ErrorSeverity.WARNING,
		recoverable: true,
		suggestion: "Agent 将尝试修复工具参数",
	},
	{
		pattern: /permission.*denied|access.*denied/i,
		type: AgentErrorType.TOOL_PERMISSION_DENIED,
		severity: ErrorSeverity.WARNING,
		recoverable: true,
		suggestion: "请授予相应权限",
	},
	{
		pattern: /timeout|timed out/i,
		type: AgentErrorType.TOOL_TIMEOUT,
		severity: ErrorSeverity.WARNING,
		recoverable: true,
		suggestion: "操作超时，将重试",
	},

	// 限流错误
	{
		pattern: /rate.*limit|too many requests|429/i,
		type: AgentErrorType.RATE_LIMITED,
		severity: ErrorSeverity.WARNING,
		recoverable: true,
		suggestion: "请求频率过高，请稍后重试",
	},
	{
		pattern: /quota.*exceeded|credit.*exhausted/i,
		type: AgentErrorType.QUOTA_EXCEEDED,
		severity: ErrorSeverity.CRITICAL,
		recoverable: false,
		suggestion: "配额已用尽，请充值或等待重置",
	},

	// 内容错误
	{
		pattern: /content.*filter|safety.*filter|blocked/i,
		type: AgentErrorType.CONTENT_FILTERED,
		severity: ErrorSeverity.WARNING,
		recoverable: false,
		suggestion: "内容被过滤，请修改请求",
	},
	{
		pattern: /context.*too long|max.*tokens|token.*limit/i,
		type: AgentErrorType.CONTEXT_TOO_LONG,
		severity: ErrorSeverity.WARNING,
		recoverable: true,
		suggestion: "上下文过长，将自动压缩",
	},

	// 用户操作
	{
		pattern: /aborted|cancelled|user.*cancel/i,
		type: AgentErrorType.USER_ABORTED,
		severity: ErrorSeverity.INFO,
		recoverable: false,
		suggestion: undefined,
	},
];

/**
 * 分类错误
 */
export function classifyError(error: unknown): ClassifiedError {
	const errorStr = extractErrorMessage(error);

	// 尝试匹配预定义模式
	for (const pattern of ERROR_PATTERNS) {
		const regex =
			typeof pattern.pattern === "string"
				? new RegExp(pattern.pattern, "i")
				: pattern.pattern;

		if (regex.test(errorStr)) {
			return {
				type: pattern.type,
				severity: pattern.severity,
				message: errorStr,
				originalError: error,
				recoverable: pattern.recoverable,
				suggestion: pattern.suggestion,
			};
		}
	}

	// 未匹配到任何模式
	return {
		type: AgentErrorType.UNKNOWN_ERROR,
		severity: ErrorSeverity.ERROR,
		message: errorStr,
		originalError: error,
		recoverable: false,
		suggestion: "请检查错误详情或重试",
	};
}

/**
 * 提取错误消息
 */
function extractErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	if (error && typeof error === "object") {
		if ("message" in error && typeof (error as any).message === "string") {
			return (error as any).message;
		}
		if ("error" in error && typeof (error as any).error === "string") {
			return (error as any).error;
		}
	}
	return String(error);
}

/**
 * 获取用户友好的错误描述
 */
export function getUserFriendlyMessage(classified: ClassifiedError): string {
	const typeMessages: Record<AgentErrorType, string> = {
		[AgentErrorType.CONNECTION_FAILED]: "连接失败",
		[AgentErrorType.SDK_NOT_FOUND]: "SDK 未安装",
		[AgentErrorType.AUTH_FAILED]: "认证失败",
		[AgentErrorType.API_KEY_INVALID]: "API 密钥无效",
		[AgentErrorType.TOOL_VALIDATION_ERROR]: "工具参数无效",
		[AgentErrorType.TOOL_EXECUTION_ERROR]: "工具执行失败",
		[AgentErrorType.TOOL_PERMISSION_DENIED]: "权限被拒绝",
		[AgentErrorType.TOOL_TIMEOUT]: "操作超时",
		[AgentErrorType.RATE_LIMITED]: "请求频率受限",
		[AgentErrorType.QUOTA_EXCEEDED]: "配额已用尽",
		[AgentErrorType.CONTENT_FILTERED]: "内容被过滤",
		[AgentErrorType.CONTEXT_TOO_LONG]: "上下文过长",
		[AgentErrorType.INTERNAL_ERROR]: "内部错误",
		[AgentErrorType.UNKNOWN_ERROR]: "未知错误",
		[AgentErrorType.USER_ABORTED]: "用户取消",
	};

	const typeMsg = typeMessages[classified.type] || "错误";
	const suggestion = classified.suggestion
		? `\n💡 ${classified.suggestion}`
		: "";

	return `${typeMsg}: ${classified.message}${suggestion}`;
}

/**
 * 检查错误是否应该自动重试
 */
export function shouldAutoRetry(
	classified: ClassifiedError,
	retryCount: number,
): boolean {
	if (!classified.recoverable) return false;
	if (retryCount >= 3) return false;

	const retryableTypes = [
		AgentErrorType.TOOL_VALIDATION_ERROR,
		AgentErrorType.TOOL_TIMEOUT,
		AgentErrorType.RATE_LIMITED,
		AgentErrorType.CONTEXT_TOO_LONG,
	];

	return retryableTypes.includes(classified.type);
}
