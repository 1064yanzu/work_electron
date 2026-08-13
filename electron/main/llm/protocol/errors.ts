/**
 * 上游 LLM 错误的归一化 —— LLM 调用链路的共享实现。
 *
 * 两条链路（`llm/invoke.ts` 与 `http/anthropicProxy/providerCalls.ts`）都要面对
 * 同一件事：各家供应商的错误体格式五花八门（`{error:{message}}`、`{message}`、
 * `{error:"..."}`、纯文本、甚至 HTML 网关页），但用户只想知道"是 key 不对、
 * 额度不够，还是模型名写错了"。这里把"扒出人话"和"按状态码给出处置建议"
 * 收敛成一处。
 *
 * 与 `llm/llmErrors.ts` 的分工：本文件面向**上游 HTTP 响应**（有 status 有 body），
 * `llmErrors.ts` 面向**已经变成 Error 字符串之后**的二次分类（供渲染端展示）。
 * 前者是后者的上游，不要合并。
 */

/** Anthropic 错误协议的 type 取值（代理要按这个协议回给 Claude Code CLI）。 */
export type UpstreamErrorType =
	| "authentication_error"
	| "invalid_request_error"
	| "rate_limit_error"
	| "api_error";

export interface NormalizedUpstreamError {
	type: UpstreamErrorType;
	message: string;
}

/**
 * 从上游响应体里扒出可读的错误描述。
 *
 * 解析失败（HTML 网关页、纯文本、空体）时回落到原文截断。截断长度可调：
 * 代理侧要把它塞进 SSE 事件，控制在 300 字符；`invoke.ts` 的错误会再经
 * `parseLlmError` 做关键词分类，截断可能切掉关键词，所以传大值保留全文。
 */
export function extractUpstreamErrorMessage(
	bodyText: string,
	maxRawLength = 300,
): string {
	if (!bodyText) return "";
	try {
		const parsed = JSON.parse(bodyText);
		const msg =
			(parsed?.error?.message as string | undefined) ??
			(typeof parsed?.message === "string" ? parsed.message : undefined) ??
			(typeof parsed?.error === "string" ? parsed.error : undefined);
		if (typeof msg === "string" && msg.trim().length > 0) {
			return msg.trim();
		}
	} catch {
		// fallthrough to raw text
	}
	return bodyText.slice(0, maxRawLength);
}

/**
 * 按 HTTP 状态码把上游错误翻译成用户能据以行动的中文说明。
 *
 * 404 特意归到 `api_error`（→ HTTP 500）而不是 `not_found_error`（→ HTTP 404）：
 * Claude Code CLI 会把来自代理的任何 404 解释成"你选的模型有问题"，而实际上
 * 404 可能来自上游供应商本身。回 500 才能让 CLI 把真实错误原文透出来。
 */
export function humanizeUpstreamError(
	status: number,
	bodyText: string,
): NormalizedUpstreamError {
	const upstreamMsg = extractUpstreamErrorMessage(bodyText);
	const lower = upstreamMsg.toLowerCase();

	if (status === 401 || status === 403) {
		return {
			type: "authentication_error",
			message: `上游鉴权失败（${status}）：请检查 API Key 是否正确或已过期。原始信息：${upstreamMsg}`,
		};
	}
	if (status === 404) {
		return {
			type: "api_error",
			message: `模型不存在或已下线（404）：请检查 Provider 配置中的模型 ID。原始信息：${upstreamMsg}`,
		};
	}
	if (status === 429) {
		const isQuota =
			lower.includes("insufficient_quota") ||
			lower.includes("quota") ||
			lower.includes("balance");
		return {
			type: "rate_limit_error",
			message: isQuota
				? `上游 API 配额不足（429）：请检查账户余额或更换 Provider / API Key。原始信息：${upstreamMsg}`
				: `上游限流（429）：请稍后重试或更换 Provider。原始信息：${upstreamMsg}`,
		};
	}
	if (status >= 500 && status <= 599) {
		return {
			type: "api_error",
			message: `上游服务异常（${status}）：${upstreamMsg || "请稍后重试"}`,
		};
	}
	if (status === 400) {
		return {
			type: "invalid_request_error",
			message: `请求参数错误（400）：${upstreamMsg || "请检查模型 ID 和请求体"}`,
		};
	}
	return {
		type: "api_error",
		message: `上游返回错误（${status}）：${upstreamMsg || "未知错误"}`,
	};
}

/**
 * 构造 `invoke.ts` 抛出的错误后缀：`<status> - <人话>`。
 *
 * 保留 `status - ` 前缀是有意的：`llmErrors.parseLlmError()` 靠
 * `/(?:failed|error|status)[:\s]*(\d{3})/` 从消息里回捞状态码做分类，
 * 改格式会让所有错误退化成 "unknown"。
 */
export function formatUpstreamErrorDetail(
	status: number | string,
	bodyText: string,
): string {
	// 不截断：这条消息还要过一轮关键词分类，切掉尾部可能丢掉 quota / rate limit 等词
	const detail = extractUpstreamErrorMessage(bodyText, Number.MAX_SAFE_INTEGER);
	return `${status} - ${detail}`;
}
