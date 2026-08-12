/**
 * 失败分类器 —— 自动化守护的地基：「这次到底算不算失败，是哪种失败，该不该重试」。
 *
 * ## 为什么单独成文件
 *
 * 在此之前，错误判定散在三个地方且口径互不相通：
 * - `harnessHub/quota.ts` 的 LIMIT_PATTERNS —— 只认转录文本里的限额措辞
 * - `http/anthropicProxy/providerCalls.ts` 的 humanizeUpstreamError —— 只认 HTTP 状态码
 * - `harnessHub/bridge.ts` 的 execFile catch —— 只认子进程报错
 *
 * 守护要在这三种来源之间做统一决策（headless 子进程的退出码、pty 屏幕上的
 * 报错文案、代理层看到的上游状态码，指向的可能是同一件事：上游 529 了），
 * 三份口径就是三种行为，出问题根本查不清是哪一份判的。这里是唯一事实源。
 *
 * ## 硬规则：宁可漏判，不可误判
 *
 * 漏判的代价是回到「没有自动重试」的状态——用户第二天来看到任务停在那儿，
 * 和现在一样。误判的代价是守护把一次**本来成功**的运行判成失败，
 * 重跑一遍烧掉双倍额度，而用户毫不知情。两者不对等，所以模式一律取特异写法：
 * 匹配 `API Error: 429` 而不是裸 `429`，匹配 `rate limit` 而不是 `limit`。
 *
 * ## 只判失败，不判完成
 *
 * 这里没有 `isTaskComplete()` 之类的东西，是有意的。判断一个 agent 是不是
 * 「真的把活干完了」，要么信它自己说完了（不可信），要么要用户额外配一条校验
 * 命令（负担重）。所以自动化的语义是：**跑完这一轮没有可识别的错误信号 =
 * 本轮无错误结束**。UI 也必须如实这么说，不能写成「任务已完成」。
 */

/** 失败类别。决定重试策略，也决定 UI 怎么向用户解释。 */
export type FailureKind =
	/** 429 / usage limit reached / N-hour limit —— 限流或时间窗限额，会自己恢复 */
	| "rate_limit"
	/** 余额不足 / 配额耗尽 —— 需要人去充值或换 key，重试无意义 */
	| "quota_exhausted"
	/** 529 / 5xx / Overloaded —— 上游临时故障 */
	| "overloaded"
	/** 连接中断、DNS 失败、fetch failed —— 网络层问题 */
	| "network"
	/** 401 / 403 / invalid api key —— 鉴权问题，重试无意义 */
	| "auth"
	/** 400 —— 请求本身有问题，重试无意义 */
	| "invalid_request"
	/** 404 —— 模型不存在或已下线，重试无意义 */
	| "not_found"
	/** 超过本次执行的超时预算 */
	| "timeout"
	/** 长时间没有任何输出（卡死）——与 timeout 区分：它可能还活着，只是不动了 */
	| "stalled"
	/** 非零退出且没有任何可识别的信号 */
	| "crash";

/** 一次失败的完整判定结果。 */
export interface FailureSignal {
	kind: FailureKind;
	/** 重试是否有意义。false 的类别再试一万次也是同样的结果，只会浪费额度 */
	retryable: boolean;
	/**
	 * 触发判定的**原文片段**。
	 * 必须如实带上：用户看到「判成了限额」时能自己核对是不是误判，
	 * 而不是只能相信一个不透明的分类结果。
	 */
	evidence: string;
	/** 解析到的 HTTP 状态码；纯文本判定时为 null */
	httpStatus: number | null;
	/** 该类别的**基础**建议等待时长。实际退避由 runner 叠加尝试次数计算 */
	suggestedDelayMs: number;
}

/** 各类别是否值得重试。 */
const RETRYABLE: Record<FailureKind, boolean> = {
	rate_limit: true,
	quota_exhausted: false,
	overloaded: true,
	network: true,
	auth: false,
	invalid_request: false,
	not_found: false,
	timeout: true,
	stalled: true,
	crash: true,
};

/**
 * 各类别的基础等待时长。
 *
 * 限额类给 15 分钟是个保守折中：能解析出恢复时间时 runner 会用真实时间覆盖它，
 * 解析不出才落到这里。给太短会一头撞回限额，给太长会白白空等。
 */
const BASE_DELAY_MS: Record<FailureKind, number> = {
	rate_limit: 15 * 60_000,
	quota_exhausted: 0, // 不重试，值无意义
	overloaded: 5_000,
	network: 5_000,
	auth: 0,
	invalid_request: 0,
	not_found: 0,
	timeout: 10_000,
	stalled: 0, // 中止后立即重试
	crash: 30_000,
};

/** 给 UI 用的中文说明（一句话解释「这是什么问题」）。 */
const KIND_LABELS: Record<FailureKind, string> = {
	rate_limit: "触发限流或额度窗口上限",
	quota_exhausted: "账户余额或配额已耗尽",
	overloaded: "上游服务过载或临时故障",
	network: "网络连接中断",
	auth: "鉴权失败（API Key 无效或过期）",
	invalid_request: "请求参数有误",
	not_found: "模型不存在或已下线",
	timeout: "执行超时",
	stalled: "长时间无输出（疑似卡死）",
	crash: "进程异常退出",
};

/** 取某个失败类别的中文说明。 */
export function describeFailureKind(kind: FailureKind): string {
	return KIND_LABELS[kind] ?? kind;
}

/** 该类别的失败重试是否有意义。 */
export function isRetryableKind(kind: FailureKind): boolean {
	return RETRYABLE[kind] === true;
}

// ============================================================
// 文本模式
// ============================================================

interface TextPattern {
	kind: FailureKind;
	re: RegExp;
}

/**
 * 限额措辞。
 *
 * 全部来自各家 CLI / Web 端的真实输出。`quota.ts` 也用这一份
 * （它原本有一份自己的副本，两处各改各的迟早漂移）。
 *
 * 注意这份表的用途是**额度状态检测**（"这个入口是不是撞限额了"），
 * 覆盖面要全；它被整体并进下面的 TEXT_PATTERNS 时统一归为 `rate_limit`，
 * 而真正需要人工介入的余额耗尽由 TEXT_PATTERNS 里更靠前的
 * `quota_exhausted` 条目先行拦下，不会被这里的宽泛措辞盖过去。
 */
export const LIMIT_PATTERNS: RegExp[] = [
	// Claude / Claude Code
	/\b\d+-hour limit reached\b/i,
	/\busage limit reached\b/i,
	/\bClaude usage limit\b/i,
	// OpenAI / Codex / ChatGPT
	/you'?ve (?:hit|reached) your (?:usage )?limit/i,
	/\brate[- ]limit(?:ed|ing)? (?:exceeded|reached)\b/i,
	/\bquota (?:exceeded|exhausted)\b/i,
	/\byou'?ve reached your (?:plan|daily|weekly) limit\b/i,
	// Gemini
	/\bresource[_ ]exhausted\b/i,
	// 中文站点
	/(?:额度|配额|用量)(?:已)?(?:用尽|耗尽|超限|不足)/,
	/(?:今日|本月|本周)(?:免费)?(?:次数|额度)(?:已)?(?:用完|用尽)/,
];

/**
 * 文本判定模式表。**顺序即优先级**——先命中先返回。
 *
 * 排序原则：越具体越靠前。"credit balance is too low" 必须排在通用的
 * rate limit 之前，否则一个真的没钱了的账户会被判成「等会儿就好」，
 * 守护傻等一夜。
 */
const TEXT_PATTERNS: TextPattern[] = [
	// ---------- 余额 / 配额耗尽（需要人工介入，最优先识别） ----------
	{ kind: "quota_exhausted", re: /\bcredit balance is too low\b/i },
	{ kind: "quota_exhausted", re: /\binsufficient[_ ]quota\b/i },
	{ kind: "quota_exhausted", re: /\bquota (?:exceeded|exhausted)\b/i },
	{ kind: "quota_exhausted", re: /\bbilling (?:hard )?limit\b/i },
	{ kind: "quota_exhausted", re: /(?:余额|欠费)(?:已)?(?:不足|用尽|耗尽)/ },

	// ---------- 鉴权 ----------
	{ kind: "auth", re: /\bAPI Error:?\s*40[13]\b/i },
	{ kind: "auth", re: /\binvalid[_ ]api[_ ]key\b/i },
	{ kind: "auth", re: /\bauthentication[_ ]error\b/i },
	{ kind: "auth", re: /\bunauthorized\b/i },
	{ kind: "auth", re: /\bpermission[_ ]error\b/i },
	{ kind: "auth", re: /(?:鉴权|认证)失败/ },

	// ---------- 限流 / 时间窗限额 ----------
	{ kind: "rate_limit", re: /\bAPI Error:?\s*429\b/i },
	{ kind: "rate_limit", re: /\b429\s+Too Many Requests\b/i },
	{ kind: "rate_limit", re: /\brate[_ ]limit[_ ]error\b/i },
	{ kind: "rate_limit", re: /\btoo many requests\b/i },
	...LIMIT_PATTERNS.map((re) => ({ kind: "rate_limit" as FailureKind, re })),

	// ---------- 上游过载 / 5xx ----------
	{ kind: "overloaded", re: /\bAPI Error:?\s*5\d{2}\b/i },
	{ kind: "overloaded", re: /\boverloaded[_ ]error\b/i },
	{ kind: "overloaded", re: /\bOverloaded\b/ },
	{
		kind: "overloaded",
		re: /\b5(?:00|02|03|29)\s+(?:Internal|Bad Gateway|Service Unavailable|Server Error)\b/i,
	},
	{ kind: "overloaded", re: /\binternal server error\b/i },
	{ kind: "overloaded", re: /\bservice unavailable\b/i },
	{ kind: "overloaded", re: /\bbad gateway\b/i },
	{ kind: "overloaded", re: /上游(?:服务)?(?:异常|过载|不可用)/ },

	// ---------- 网络 ----------
	{ kind: "network", re: /\bECONNRESET\b/ },
	{ kind: "network", re: /\bECONNREFUSED\b/ },
	{ kind: "network", re: /\bETIMEDOUT\b/ },
	{ kind: "network", re: /\bENOTFOUND\b/ },
	{ kind: "network", re: /\bEPIPE\b/ },
	{ kind: "network", re: /\bEAI_AGAIN\b/ },
	{ kind: "network", re: /\bfetch failed\b/i },
	{ kind: "network", re: /\bconnection (?:error|reset|closed|refused)\b/i },
	{ kind: "network", re: /\bnetwork (?:error|timeout)\b/i },
	{ kind: "network", re: /\bsocket hang up\b/i },
	{ kind: "network", re: /(?:连接|网络)(?:超时|中断|失败)/ },

	// ---------- 超时 ----------
	{ kind: "timeout", re: /\brequest timed out\b/i },
	{ kind: "timeout", re: /\bexecution timed out\b/i },
	{ kind: "timeout", re: /\b执行超时\b/ },

	// ---------- 模型不存在 ----------
	{ kind: "not_found", re: /\bAPI Error:?\s*404\b/i },
	{ kind: "not_found", re: /\bmodel[_ ]not[_ ]found\b/i },
	{ kind: "not_found", re: /模型(?:不存在|已下线)/ },

	// ---------- 请求非法 ----------
	{ kind: "invalid_request", re: /\bAPI Error:?\s*400\b/i },
	{ kind: "invalid_request", re: /\binvalid[_ ]request[_ ]error\b/i },
];

/** 命中位置前后各截一段作为证据，让用户能自己判断是不是误判。 */
function sliceEvidence(text: string, index: number): string {
	const start = Math.max(0, index - 120);
	return text.slice(start, start + 320).trim();
}

/**
 * 在一段文本里找限额信号，命中则返回原文片段。
 *
 * `quota.ts` 用它做额度状态检测（只关心限额，不关心其他失败类别）。
 */
export function detectLimitSignal(text: string): string | null {
	if (!text) return null;
	for (const pattern of LIMIT_PATTERNS) {
		const match = pattern.exec(text);
		if (!match) continue;
		return sliceEvidence(text, match.index ?? 0);
	}
	return null;
}

// ============================================================
// HTTP 状态码
// ============================================================

/**
 * HTTP 状态码 → 失败类别。
 *
 * 与 `anthropicProxy/providerCalls.ts` 的 humanizeUpstreamError 保持同一口径：
 * 同一个状态码在代理层和守护层必须得出同一个结论，否则代理告诉用户「限流了」
 * 而守护判成「崩溃」并立刻重试，两边行为对不上。
 */
export function kindFromHttpStatus(status: number): FailureKind | null {
	if (status >= 200 && status < 300) return null;
	if (status === 401 || status === 403) return "auth";
	if (status === 404) return "not_found";
	if (status === 400) return "invalid_request";
	if (status === 408) return "timeout";
	if (status === 429) return "rate_limit";
	if (status >= 500 && status <= 599) return "overloaded";
	return "crash";
}

/** 从文本里捞一个 HTTP 状态码（仅在有明确上下文时，避免把随便一个三位数当状态码）。 */
function extractHttpStatus(text: string): number | null {
	const match = text.match(
		/(?:API Error:?\s*|HTTP\s*|status(?:\s*code)?[:=]\s*)(\d{3})\b/i,
	);
	if (!match) return null;
	const status = Number(match[1]);
	return status >= 100 && status <= 599 ? status : null;
}

// ============================================================
// 统一入口
// ============================================================

export interface ClassifyInput {
	/** 待检文本：stdout / stderr / pty 屏幕尾部 / 错误消息 */
	text?: string | null;
	/** 子进程退出码。null/undefined 表示未知（如 pty 还没退出） */
	exitCode?: number | null;
	/** 已知的上游 HTTP 状态码（代理层能直接拿到，最可靠） */
	httpStatus?: number | null;
	/** 调用方已经确定这是一次超时 */
	timedOut?: boolean;
	/** 调用方已经确定这是一次卡死 */
	stalled?: boolean;
}

function build(
	kind: FailureKind,
	evidence: string,
	httpStatus: number | null,
): FailureSignal {
	return {
		kind,
		retryable: RETRYABLE[kind],
		evidence: evidence.slice(0, 500),
		httpStatus,
		suggestedDelayMs: BASE_DELAY_MS[kind],
	};
}

/**
 * 判定一次执行是否失败、属于哪一类。
 *
 * @returns 没有任何可识别的失败信号时返回 `null`——即「本轮无错误结束」。
 *          注意这**不等于**「任务完成了」，见文件头说明。
 *
 * 判定顺序（先明确后模糊）：
 *   1. 调用方已确定的 timeout / stalled
 *   2. 已知的 HTTP 状态码（最可靠）
 *   3. 文本模式
 *   4. 非零退出码兜底 → crash
 */
export function classifyFailure(input: ClassifyInput): FailureSignal | null {
	const text = (input.text ?? "").trim();

	// 1. 调用方已经知道答案的情况，不必再猜
	if (input.stalled) {
		return build("stalled", text.slice(-320) || "长时间没有任何输出", null);
	}
	if (input.timedOut) {
		return build("timeout", text.slice(-320) || "超过执行超时预算", null);
	}

	// 2. 明确的状态码
	if (typeof input.httpStatus === "number") {
		const kind = kindFromHttpStatus(input.httpStatus);
		if (kind) {
			// 429 还要再分一层：是限流还是真的没额度了
			if (kind === "rate_limit" && /quota|balance|insufficient/i.test(text)) {
				return build("quota_exhausted", text.slice(0, 320), input.httpStatus);
			}
			return build(
				kind,
				text.slice(0, 320) || `上游返回 ${input.httpStatus}`,
				input.httpStatus,
			);
		}
	}

	// 3. 文本模式
	if (text) {
		for (const { kind, re } of TEXT_PATTERNS) {
			const match = re.exec(text);
			if (!match) continue;
			return build(
				kind,
				sliceEvidence(text, match.index ?? 0),
				extractHttpStatus(text),
			);
		}
	}

	// 4. 非零退出码兜底。
	//    注意反过来不成立：退出码为 0 但输出里有 API Error 的情况很常见
	//    （CLI 把错误打在 stdout 上然后正常退出），所以文本判定在前。
	if (typeof input.exitCode === "number" && input.exitCode !== 0) {
		return build(
			"crash",
			text.slice(-320) || `进程以退出码 ${input.exitCode} 结束`,
			null,
		);
	}

	return null;
}
