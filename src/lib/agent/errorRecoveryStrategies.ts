// 错误恢复策略系统
// 智能分析错误类型并提供恢复建议

import {
	ERROR_CATEGORY_CONFIG,
	type ErrorRecoveryStrategy,
	type RecoverySuggestion,
	type ToolErrorCategory,
	type ToolType,
} from "./types";

// 错误模式匹配规则
interface ErrorPattern {
	pattern: RegExp | string[];
	category: ToolErrorCategory;
}

// 错误模式定义
const ERROR_PATTERNS: ErrorPattern[] = [
	// 网络错误
	{
		pattern: [
			"network",
			"网络",
			"ECONNREFUSED",
			"ENOTFOUND",
			"connection",
			"连接",
			"DNS",
		],
		category: "network",
	},
	// 超时
	{
		pattern: ["timeout", "超时", "ETIMEDOUT", "timed out", "deadline"],
		category: "timeout",
	},
	// 权限
	{
		pattern: [
			"permission",
			"权限",
			"forbidden",
			"403",
			"unauthorized",
			"401",
			"access denied",
			"拒绝",
		],
		category: "permission",
	},
	// 参数错误
	{
		pattern: [
			"invalid",
			"无效",
			"parameter",
			"参数",
			"argument",
			"expected",
			"required",
		],
		category: "parameter",
	},
	// 资源不存在
	{
		pattern: ["not found", "404", "不存在", "no such file", "missing"],
		category: "not_found",
	},
	// 频率限制
	{
		pattern: [
			"rate limit",
			"429",
			"频率",
			"限制",
			"too many requests",
			"throttle",
		],
		category: "rate_limit",
	},
	// 服务器错误
	{
		pattern: [
			"500",
			"502",
			"503",
			"504",
			"server error",
			"服务器",
			"internal error",
		],
		category: "server",
	},
	// 语法错误
	{
		pattern: [
			"syntax",
			"语法",
			"IndentationError",
			"SyntaxError",
			"parse error",
			"unexpected token",
		],
		category: "syntax",
	},
];

// 分类错误
export function classifyError(errorMessage: string): ToolErrorCategory {
	const lowerMessage = errorMessage.toLowerCase();

	for (const { pattern, category } of ERROR_PATTERNS) {
		if (Array.isArray(pattern)) {
			if (pattern.some((p) => lowerMessage.includes(p.toLowerCase()))) {
				return category;
			}
		} else if (pattern.test(errorMessage)) {
			return category;
		}
	}

	return "unknown";
}

// 生成恢复建议
function generateSuggestions(
	category: ToolErrorCategory,
	toolType: ToolType,
	_errorMessage: string,
): RecoverySuggestion[] {
	const suggestions: RecoverySuggestion[] = [];

	switch (category) {
		case "network":
			suggestions.push(
				{
					id: "retry-network",
					label: "重试请求",
					action: "retry",
					description: "等待几秒后重新发起请求",
					isRecommended: true,
				},
				{
					id: "skip-network",
					label: "跳过此步骤",
					action: "skip",
					description: "继续执行后续任务",
				},
			);
			break;

		case "timeout":
			suggestions.push(
				{
					id: "retry-timeout",
					label: "延长超时重试",
					action: "retry",
					description: "增加超时时间后重试",
					isRecommended: true,
				},
				{
					id: "skip-timeout",
					label: "跳过",
					action: "skip",
					description: "目标可能暂时不可用",
				},
			);
			break;

		case "permission":
			suggestions.push(
				{
					id: "manual-permission",
					label: "手动处理",
					action: "manual",
					description: "可能需要检查权限设置",
					isRecommended: true,
				},
				{
					id: "skip-permission",
					label: "跳过",
					action: "skip",
				},
			);
			break;

		case "parameter":
			if (
				/InputValidationError|required parameter|missing required/i.test(
					_errorMessage,
				)
			) {
				suggestions.push(
					{
						id: "manual-param",
						label: "手动处理",
						action: "manual",
						description: "需要补齐工具必填参数后重新执行",
						isRecommended: true,
					},
					{
						id: "skip-param",
						label: "跳过",
						action: "skip",
					},
				);
			} else {
				suggestions.push(
					{
						id: "retry-param",
						label: "修正参数重试",
						action: "retry",
						description: "尝试用修正后的参数重新执行",
						isRecommended: true,
					},
					{
						id: "skip-param",
						label: "跳过",
						action: "skip",
					},
				);
			}
			break;

		case "not_found":
			// 根据工具类型提供替代方案
			if (toolType === "fetch_url") {
				suggestions.push({
					id: "alt-search",
					label: "搜索替代来源",
					action: "alternative",
					description: "使用搜索引擎查找相关内容",
					alternativeTool: "web_search",
					isRecommended: true,
				});
			}
			suggestions.push({
				id: "skip-notfound",
				label: "跳过",
				action: "skip",
				description: "资源可能已被删除或移动",
			});
			break;

		case "rate_limit":
			suggestions.push(
				{
					id: "wait-retry",
					label: "等待后重试",
					action: "retry",
					description: "稍等片刻后自动重试",
					isRecommended: true,
				},
				{
					id: "skip-ratelimit",
					label: "跳过",
					action: "skip",
				},
			);
			break;

		case "server":
			suggestions.push(
				{
					id: "retry-server",
					label: "稍后重试",
					action: "retry",
					description: "服务可能暂时不可用",
					isRecommended: true,
				},
				{
					id: "skip-server",
					label: "跳过",
					action: "skip",
				},
			);
			break;

		case "syntax":
			suggestions.push(
				{
					id: "manual-syntax",
					label: "需要修复代码",
					action: "manual",
					description: "代码存在语法问题，请检查",
					isRecommended: true,
				},
				{
					id: "abort-syntax",
					label: "终止任务",
					action: "abort",
				},
			);
			break;

		default:
			suggestions.push(
				{
					id: "retry-unknown",
					label: "重试",
					action: "retry",
				},
				{
					id: "skip-unknown",
					label: "跳过",
					action: "skip",
				},
				{
					id: "abort-unknown",
					label: "终止任务",
					action: "abort",
				},
			);
	}

	return suggestions;
}

// 生成错误恢复策略
export function generateErrorRecoveryStrategy(
	errorMessage: string,
	toolType: ToolType,
	toolName: string,
	retryCount: number = 0,
	maxRetries: number = 3,
): ErrorRecoveryStrategy {
	const category = classifyError(errorMessage);
	const config = ERROR_CATEGORY_CONFIG[category];
	const suggestions = generateSuggestions(category, toolType, errorMessage);

	// 判断是否可以自动重试
	const canAutoRetry =
		retryCount < maxRetries &&
		["network", "timeout", "rate_limit", "server"].includes(category);

	// 计算重试延迟
	let retryDelay = 1000;
	if (category === "rate_limit") {
		retryDelay = 5000 + retryCount * 2000; // 递增延迟
	} else if (category === "timeout") {
		retryDelay = 2000 + retryCount * 1000;
	} else if (category === "server") {
		retryDelay = 3000 + retryCount * 2000;
	}

	return {
		category,
		title: `${toolName} 执行失败`,
		description: getErrorDescription(category, errorMessage),
		icon: config.icon,
		suggestions,
		canAutoRetry,
		retryDelay,
	};
}

// 获取错误描述
function getErrorDescription(
	category: ToolErrorCategory,
	errorMessage: string,
): string {
	const shortMessage =
		errorMessage.length > 100
			? errorMessage.slice(0, 100) + "..."
			: errorMessage;

	switch (category) {
		case "network":
			return `网络连接失败，可能是网络不稳定或目标服务不可达。\n错误详情: ${shortMessage}`;
		case "timeout":
			return `请求超时，目标响应时间过长。\n错误详情: ${shortMessage}`;
		case "permission":
			return `没有足够的权限执行此操作。\n错误详情: ${shortMessage}`;
		case "parameter":
			return `输入参数有误，请检查参数格式。\n错误详情: ${shortMessage}`;
		case "not_found":
			return `请求的资源不存在。\n错误详情: ${shortMessage}`;
		case "rate_limit":
			return `请求太频繁，已触发限流保护。\n错误详情: ${shortMessage}`;
		case "server":
			return `目标服务器发生错误。\n错误详情: ${shortMessage}`;
		case "syntax":
			return `代码存在语法错误。\n错误详情: ${shortMessage}`;
		default:
			return `发生了未知错误。\n错误详情: ${shortMessage}`;
	}
}

// 判断是否应该自动重试（不需要用户确认）
export function shouldAutoRetry(
	category: ToolErrorCategory,
	retryCount: number,
	maxRetries: number = 3,
): boolean {
	if (retryCount >= maxRetries) return false;

	// 这些类型的错误可以自动重试
	const autoRetryCategories: ToolErrorCategory[] = [
		"network",
		"timeout",
		"rate_limit",
		"server",
	];
	return autoRetryCategories.includes(category);
}

// 获取重试延迟
export function getRetryDelay(
	category: ToolErrorCategory,
	retryCount: number,
): number {
	const baseDelay: Record<ToolErrorCategory, number> = {
		network: 1000,
		timeout: 2000,
		permission: 0,
		parameter: 0,
		not_found: 0,
		rate_limit: 5000,
		server: 3000,
		syntax: 0,
		unknown: 1000,
	};

	// 指数退避
	return baseDelay[category] * 1.5 ** retryCount;
}

// 导出便捷函数
export const errorRecovery = {
	classifyError,
	generateStrategy: generateErrorRecoveryStrategy,
	shouldAutoRetry,
	getRetryDelay,
};
