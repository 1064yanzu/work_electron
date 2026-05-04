// 错误处理工具 — 把开发者风格的 Error 转换成用户能理解的中文提示
//
// 核心思想：用户不需要看到 "TypeError: Cannot read properties of undefined"，
// 应该看到 "操作失败，请稍后再试"。技术细节折叠到 console / 日志里。

const TECHNICAL_NOISE_PATTERNS = [
	/^TypeError:?\s*/i,
	/^ReferenceError:?\s*/i,
	/^SyntaxError:?\s*/i,
	/^RangeError:?\s*/i,
	/^Error:?\s*/i,
	/\bcannot read propert(y|ies)\b/i,
	/\bof undefined\b/i,
	/\bof null\b/i,
	/\bis not (a function|defined)\b/i,
	/\bunexpected token\b/i,
	/\s+at\s+\S+\s+\(.+:\d+:\d+\)/, // stack lines
	/^\s*at\s+/m,
];

const KNOWN_NETWORK_HINTS: Array<[RegExp, string]> = [
	[/network|fetch|ECONN|ENOTFOUND|EHOSTUNREACH|timeout/i, "网络连接异常，请检查网络后重试"],
	[/unauthor|401|forbidden|403/i, "权限不足或登录已过期"],
	[/not\s*found|404/i, "资源不存在或已被删除"],
	[/conflict|409|already exists|duplicate/i, "存在冲突（可能是名称重复）"],
	[/rate.?limit|429|too many/i, "请求过于频繁，请稍后再试"],
	[/internal|500|server error/i, "服务暂时不可用，请稍后再试"],
];

/**
 * 把 Error / unknown 转成用户友好的简短中文提示。
 * - 已知网络/权限错误：返回明确指引
 * - 纯技术栈错误（TypeError 等）：返回 fallback
 * - 业务自定义 Error：返回 message，但去掉技术噪声前缀
 */
export function humanizeError(error: unknown, fallback = "操作失败，请稍后再试"): string {
	const raw =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";

	if (!raw) return fallback;

	// 网络 / HTTP 类的关键字命中先匹配
	for (const [pattern, hint] of KNOWN_NETWORK_HINTS) {
		if (pattern.test(raw)) return hint;
	}

	// 去掉技术噪声前缀
	let cleaned = raw;
	for (const pattern of TECHNICAL_NOISE_PATTERNS) {
		cleaned = cleaned.replace(pattern, "");
	}
	cleaned = cleaned
		.split(/\r?\n/)[0] // 只保留首行（去掉 stack）
		.trim()
		.replace(/^[:\-—]+\s*/, "");

	if (!cleaned || cleaned.length < 4) return fallback;

	// 如果清洗后仍有明显技术英文（看起来不像中文 + 全英文 ASCII），回落 fallback
	const isPureAscii = /^[\x00-\x7F]+$/.test(cleaned);
	const looksTechnical = isPureAscii && !/^[a-zA-Z\s.,'"!?-]+$/.test(cleaned);
	if (looksTechnical) return fallback;

	return cleaned;
}

/**
 * 同时返回友好提示与原始 message — 用于 toast 主文案 + 折叠详情场景。
 */
export function describeError(error: unknown, fallback = "操作失败，请稍后再试") {
	const friendly = humanizeError(error, fallback);
	const raw =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";
	return { friendly, raw, hasDetail: raw && raw !== friendly };
}
