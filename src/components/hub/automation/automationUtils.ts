/**
 * 自动化视图的共享展示逻辑。
 *
 * 所有「状态 → 措辞 / 颜色」的映射集中在这里，避免运行监视、任务列表、
 * 运行历史三个地方各写一套，出现同一个状态在不同面板叫不同名字的情况。
 *
 * 措辞上有一条必须守住：`succeeded` 的含义是**本轮无错误结束**，不是
 * 「任务完成」。自动化只判定错误信号，不判定语义完成度——写成「已完成」
 * 就是在替 agent 打它自己都没打的包票。
 */
import type {
	HarnessFailureKind,
	HarnessJobRunStatus,
	HarnessRuntimeState,
} from "../../../lib/api/harnessAutomation";

/** 执行体状态 → 展示名与色调。 */
export const RUNTIME_STATE_META: Record<
	HarnessRuntimeState,
	{ label: string; dot: string; text: string }
> = {
	starting: {
		label: "启动中",
		dot: "bg-text-light",
		text: "text-text-light",
	},
	working: {
		label: "运行中",
		dot: "bg-success",
		text: "text-success",
	},
	idle: {
		label: "空闲等待",
		dot: "bg-info",
		text: "text-info",
	},
	error: {
		label: "出错",
		dot: "bg-error",
		text: "text-error",
	},
	stalled: {
		label: "无响应",
		dot: "bg-warning",
		text: "text-warning",
	},
	exited: {
		label: "已结束",
		dot: "bg-text-light",
		text: "text-text-light",
	},
};

/** 运行状态 → 展示名与色调。 */
export const RUN_STATUS_META: Record<
	HarnessJobRunStatus,
	{ label: string; dot: string; text: string; hint: string }
> = {
	queued: {
		label: "排队中",
		dot: "bg-text-light",
		text: "text-text-light",
		hint: "等待空闲的执行位",
	},
	running: {
		label: "执行中",
		dot: "bg-success",
		text: "text-success",
		hint: "正在跑",
	},
	waiting: {
		label: "等待重试",
		dot: "bg-warning",
		text: "text-warning",
		hint: "上一次失败了，正在按策略等待下一次尝试",
	},
	succeeded: {
		// 刻意不叫「已完成」——见文件头
		label: "无错误结束",
		dot: "bg-success",
		text: "text-success",
		hint: "这一轮跑完没有出现可识别的错误信号。任务本身做到什么程度，请看输出",
	},
	failed: {
		label: "失败",
		dot: "bg-error",
		text: "text-error",
		hint: "重试次数用尽，仍在失败",
	},
	blocked: {
		label: "需人工处理",
		dot: "bg-error",
		text: "text-error",
		hint: "遇到重试解决不了的问题（如鉴权失败、余额耗尽）",
	},
	cancelled: {
		label: "已取消",
		dot: "bg-text-light",
		text: "text-text-light",
		hint: "被手动取消",
	},
};

/** 失败类别 → 一句话解释 + 是否值得重试。 */
export const FAILURE_KIND_META: Record<
	HarnessFailureKind,
	{ label: string; retryable: boolean; advice: string }
> = {
	rate_limit: {
		label: "触发限流 / 额度窗口上限",
		retryable: true,
		advice: "会自己恢复，等到恢复时间后自动继续",
	},
	quota_exhausted: {
		label: "余额或配额已耗尽",
		retryable: false,
		advice: "需要充值或更换 API Key，重试解决不了",
	},
	overloaded: {
		label: "上游服务过载 / 临时故障",
		retryable: true,
		advice: "按指数退避重试",
	},
	network: {
		label: "网络连接中断",
		retryable: true,
		advice: "按指数退避重试",
	},
	auth: {
		label: "鉴权失败",
		retryable: false,
		advice: "检查 API Key 是否正确或已过期",
	},
	invalid_request: {
		label: "请求参数有误",
		retryable: false,
		advice: "多为任务配置问题，改完再跑",
	},
	not_found: {
		label: "模型不存在或已下线",
		retryable: false,
		advice: "检查 Provider 配置里的模型 ID",
	},
	timeout: {
		label: "执行超时",
		retryable: true,
		advice: "可以调大任务的超时时间",
	},
	stalled: {
		label: "长时间无输出（疑似卡死）",
		retryable: true,
		advice: "已中止并重新发起",
	},
	crash: {
		label: "进程异常退出",
		retryable: true,
		advice: "按指数退避重试",
	},
};

/** 毫秒时长 → 「2 小时 15 分」这类人话。 */
export function formatWait(ms: number | null | undefined): string {
	if (ms === null || ms === undefined) return "—";
	if (ms <= 0) return "立即";
	const minutes = Math.round(ms / 60_000);
	if (minutes < 1) return `${Math.round(ms / 1000)} 秒`;
	if (minutes < 60) return `${minutes} 分钟`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
}

/** 已运行时长。 */
export function formatElapsed(
	startedAt: number,
	endedAt?: number | null,
): string {
	if (!startedAt) return "—";
	return formatWait((endedAt || Date.now()) - startedAt);
}

/** 未来时刻 → 「今天 02:00」/「明天 02:00」/「3 天后」。 */
export function formatSchedule(at: number | null): string {
	if (!at) return "不再自动触发";
	const date = new Date(at);
	const now = new Date();
	const dayDiff = Math.round(
		(new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
			new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
			86_400_000,
	);
	const time = date.toLocaleTimeString("zh-CN", {
		hour: "2-digit",
		minute: "2-digit",
	});
	if (dayDiff === 0) return `今天 ${time}`;
	if (dayDiff === 1) return `明天 ${time}`;
	if (dayDiff > 1 && dayDiff < 7) return `${dayDiff} 天后 ${time}`;
	return `${date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })} ${time}`;
}

/** 执行形态 → 展示名。 */
export const EXEC_MODE_LABEL: Record<string, string> = {
	headless: "后台无头",
	pty: "可视终端",
};
