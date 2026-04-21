/**
 * LLM 错误解析与友好提示
 * 将原始 API 错误转换为用户可理解的信息
 */

export interface LlmErrorInfo {
	/** 错误代码，用于前端匹配 */
	code: LlmErrorCode;
	/** 用户友好的标题 */
	title: string;
	/** 用户友好的详细描述 */
	message: string;
	/** 建议的解决方式 */
	suggestion: string;
	/** 原始错误信息（用于调试） */
	rawError: string;
	/** HTTP 状态码（如果有） */
	httpStatus?: number;
}

export type LlmErrorCode =
	| "auth_forbidden"
	| "auth_unauthorized"
	| "auth_invalid_key"
	| "rate_limit"
	| "quota_exceeded"
	| "model_not_found"
	| "context_too_long"
	| "server_error"
	| "timeout"
	| "network_error"
	| "no_provider"
	| "unknown";

/**
 * 从原始错误字符串中提取 HTTP 状态码
 */
function extractHttpStatus(errorMsg: string): number | undefined {
	// 匹配 "403 -", "status: 403", "HTTP 403" 等模式
	const match = errorMsg.match(/(?:failed|error|status)[:\s]*(\d{3})\b/i);
	return match ? Number.parseInt(match[1], 10) : undefined;
}

/**
 * 解析 LLM 错误，返回结构化的友好错误信息
 */
export function parseLlmError(error: Error | string): LlmErrorInfo {
	const rawError = error instanceof Error ? error.message : String(error);
	const lowerMsg = rawError.toLowerCase();
	const httpStatus = extractHttpStatus(rawError);

	// 1. 无可用 Provider
	if (lowerMsg.includes("no enabled provider")) {
		return {
			code: "no_provider",
			title: "未找到可用的 AI 服务",
			message: "没有找到已启用的 AI 服务商来处理此模型。",
			suggestion:
				"请前往「设置 → AI 服务」检查是否已正确配置并启用了相关的 Provider。",
			rawError,
		};
	}

	// 2. 403 Forbidden
	if (httpStatus === 403 || lowerMsg.includes("forbidden")) {
		return {
			code: "auth_forbidden",
			title: "API 访问被拒绝",
			message:
				"API 服务商拒绝了此请求（HTTP 403），可能是 API Key 无权限、已过期或账户被禁用。",
			suggestion:
				"请检查：①  API Key 是否正确 ② 账户是否有足够余额 ③ 该 Key 是否有权限调用所选模型。",
			rawError,
			httpStatus: 403,
		};
	}

	// 3. 401 Unauthorized
	if (
		httpStatus === 401 ||
		lowerMsg.includes("unauthorized") ||
		lowerMsg.includes("invalid.*api.?key") ||
		lowerMsg.includes("invalid_api_key") ||
		lowerMsg.includes("authentication")
	) {
		return {
			code: "auth_unauthorized",
			title: "认证失败",
			message: "API Key 无效或未正确配置。",
			suggestion:
				"请前往「设置 → AI 服务」检查对应 Provider 的 API Key 是否正确填写。",
			rawError,
			httpStatus: httpStatus || 401,
		};
	}

	// 4. 429 Rate Limit
	if (
		httpStatus === 429 ||
		lowerMsg.includes("rate limit") ||
		lowerMsg.includes("too many requests")
	) {
		return {
			code: "rate_limit",
			title: "请求频率过高",
			message: "当前 API 调用过于频繁，已超出服务商的速率限制。",
			suggestion:
				"请稍后再试。如果问题持续出现，可以考虑升级 API 套餐或添加多个 Key 进行轮询。",
			rawError,
			httpStatus: 429,
		};
	}

	// 5. Quota Exceeded / 余额不足
	if (
		lowerMsg.includes("quota") ||
		lowerMsg.includes("insufficient") ||
		lowerMsg.includes("billing") ||
		lowerMsg.includes("exceeded") ||
		lowerMsg.includes("balance")
	) {
		return {
			code: "quota_exceeded",
			title: "配额已用尽",
			message: "API 账户的调用额度已耗尽或余额不足。",
			suggestion: "请前往 API 服务商后台充值或检查当前套餐的使用额度。",
			rawError,
			httpStatus,
		};
	}

	// 6. Model Not Found
	if (
		httpStatus === 404 ||
		lowerMsg.includes("model not found") ||
		lowerMsg.includes("not_found") ||
		lowerMsg.includes("does not exist")
	) {
		return {
			code: "model_not_found",
			title: "模型不存在",
			message: "请求的模型在服务商处不可用或模型名称有误。",
			suggestion: "请检查模型名称是否正确，或尝试切换到其他可用模型。",
			rawError,
			httpStatus: httpStatus || 404,
		};
	}

	// 7. Context Too Long
	if (
		lowerMsg.includes("context length") ||
		lowerMsg.includes("too long") ||
		lowerMsg.includes("max.*token") ||
		lowerMsg.includes("maximum.*length")
	) {
		return {
			code: "context_too_long",
			title: "内容过长",
			message: "发送的内容超出了模型的最大上下文长度限制。",
			suggestion:
				"请缩短输入内容或减少上下文引用量，也可以尝试使用支持更长上下文的模型。",
			rawError,
			httpStatus,
		};
	}

	// 8. Server Error (5xx)
	if (httpStatus && httpStatus >= 500 && httpStatus < 600) {
		return {
			code: "server_error",
			title: "服务端错误",
			message: `API 服务商返回了 ${httpStatus} 错误，服务暂时不可用。`,
			suggestion:
				"这通常是服务商的临时问题，请稍后重试。如果使用的是中转服务，请检查中转服务是否正常运行。",
			rawError,
			httpStatus,
		};
	}

	// 9. Timeout
	if (
		lowerMsg.includes("timeout") ||
		lowerMsg.includes("timed out") ||
		lowerMsg.includes("aborterror")
	) {
		return {
			code: "timeout",
			title: "请求超时",
			message: "AI 服务响应时间过长，请求已超时。",
			suggestion:
				"这可能是因为输入内容过长或服务商负载过高。请缩短内容后重试，或稍后再试。",
			rawError,
		};
	}

	// 10. Network Error
	if (
		lowerMsg.includes("network") ||
		lowerMsg.includes("econnrefused") ||
		lowerMsg.includes("econnreset") ||
		lowerMsg.includes("fetch failed") ||
		lowerMsg.includes("dns") ||
		lowerMsg.includes("socket")
	) {
		return {
			code: "network_error",
			title: "网络连接失败",
			message: "无法连接到 AI 服务，请检查网络连接或服务地址是否正确。",
			suggestion:
				"请确认：① 网络连接正常 ② API Base URL 配置正确 ③ 如果使用代理或 VPN，请检查其是否正常工作。",
			rawError,
		};
	}

	// 11. Unknown Error
	return {
		code: "unknown",
		title: "调用失败",
		message: "AI 服务调用时发生了意外错误。",
		suggestion:
			"请查看错误详情并重试。如果问题持续出现，请检查 Provider 配置是否正确。",
		rawError,
		httpStatus,
	};
}

/**
 * 将 LlmErrorInfo 格式化为用户友好的标记文本（传递给前端）
 */
export function formatLlmErrorForStream(errorInfo: LlmErrorInfo): string {
	return JSON.stringify({
		__llm_error__: true,
		code: errorInfo.code,
		title: errorInfo.title,
		message: errorInfo.message,
		suggestion: errorInfo.suggestion,
		httpStatus: errorInfo.httpStatus,
		rawError: errorInfo.rawError,
	});
}
