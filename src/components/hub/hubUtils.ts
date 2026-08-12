/**
 * Hub 视图的共享类型与纯函数。
 */
import type {
	HarnessDetectionRow,
	HarnessQuotaRow,
	AiHubSiteRow,
} from "../../lib/api";

/** 本应用自身的 harness 标识。 */
export const APP_HARNESS = "ipo-sdk";

/** 时间线一次拉取的会话数。 */
export const TIMELINE_LIMIT = 120;

/** 一个可作为接力目标 / 议会成员的入口。 */
export interface HubEntry {
	/** 用于接力与桥接的标识：CLI 是 harness id，Web 是站点 id */
	id: string;
	/** canonical 表里的 harness 值（Web 站点是 `web-<id>`） */
	harness: string;
	label: string;
	kind: "cli" | "web" | "app";
	/** 本机可用（CLI 已安装 / 站点已启用） */
	available: boolean;
	/** 已摄取的会话数 */
	sessionCount: number;
	/** 处于限额中 */
	blocked: boolean;
	/** 限额判定的依据（原文片段），供用户自己判断是否误判 */
	blockedEvidence: string | null;
}

/** 把探测结果 + 站点清单 + 额度状态合成一组入口。 */
export function buildEntries(input: {
	detections: HarnessDetectionRow[];
	sites: AiHubSiteRow[];
	quotas: HarnessQuotaRow[];
	extraCounts: Record<string, number>;
}): HubEntry[] {
	const quotaByHarness = new Map(input.quotas.map((q) => [q.harness, q]));
	const quotaOf = (harness: string) => quotaByHarness.get(harness);

	const cli: HubEntry[] = input.detections.map((d) => {
		const quota = quotaOf(d.harness);
		return {
			id: d.harness,
			harness: d.harness,
			label: d.label,
			kind: "cli",
			available: d.can_inject,
			sessionCount: d.session_count,
			blocked: quota?.blocked ?? false,
			blockedEvidence: quota?.evidence ?? null,
		};
	});

	const web: HubEntry[] = input.sites.map((site) => {
		const quota = quotaOf(site.harness);
		return {
			id: site.id,
			harness: site.harness,
			label: site.label,
			kind: "web",
			available: site.enabled,
			sessionCount: input.extraCounts[site.harness] ?? 0,
			blocked: quota?.blocked ?? false,
			blockedEvidence: quota?.evidence ?? null,
		};
	});

	const app: HubEntry = {
		id: APP_HARNESS,
		harness: APP_HARNESS,
		label: "本应用 Copilot",
		kind: "app",
		available: true,
		sessionCount: input.extraCounts[APP_HARNESS] ?? 0,
		blocked: quotaOf(APP_HARNESS)?.blocked ?? false,
		blockedEvidence: quotaOf(APP_HARNESS)?.evidence ?? null,
	};

	return [...cli, ...web, app];
}

/** 接力档位 → 展示用的名称与可信度说明。 */
export const MODE_META: Record<
	"native" | "raw" | "distill",
	{ label: string; lossless: boolean; hint: string }
> = {
	native: {
		label: "原生续接",
		lossless: true,
		hint: "直接载入原会话，上下文完全无损，零成本",
	},
	raw: {
		label: "原文接力",
		lossless: true,
		hint: "原样搬运转录，不经 LLM 压缩，无信息损失",
	},
	distill: {
		label: "蒸馏接力",
		lossless: false,
		hint: "用 LLM 压缩成结构化交接包，会丢失细节",
	},
};

/** 白板条目类型 → 展示名。 */
export const BOARD_KIND_LABEL: Record<string, string> = {
	goal: "目标",
	decision: "决策",
	pitfall: "踩坑",
	next: "待办",
	note: "备注",
};

/** 毫秒时长 → 紧凑展示。 */
export function formatDuration(ms: number): string {
	if (!ms || ms < 0) return "—";
	if (ms < 1000) return `${ms}ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	return `${minutes}m${Math.round(seconds % 60)}s`;
}

/** 时间戳 → 「今天 14:03」这类紧凑表述。 */
export function formatStamp(ts: number): string {
	if (!ts) return "";
	const date = new Date(ts);
	const now = new Date();
	const sameDay =
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate();
	const time = date.toLocaleTimeString("zh-CN", {
		hour: "2-digit",
		minute: "2-digit",
	});
	if (sameDay) return `今天 ${time}`;
	return `${date.toLocaleDateString("zh-CN", {
		month: "numeric",
		day: "numeric",
	})} ${time}`;
}

/** 拖拽会话时写进 DataTransfer 的 MIME。 */
export const SESSION_DRAG_MIME = "application/x-aihub-session";

// ============================================================
// 会话展示
// ============================================================

/** 毫秒时间戳 → 相对时间。 */
export function formatRelativeTime(ts: number): string {
	if (!ts) return "";
	const delta = Date.now() - ts;
	if (delta < 0) return "刚刚";
	const min = Math.floor(delta / 60_000);
	if (min < 1) return "刚刚";
	if (min < 60) return `${min} 分钟前`;
	const hour = Math.floor(min / 60);
	if (hour < 24) return `${hour} 小时前`;
	const day = Math.floor(hour / 24);
	if (day < 7) return `${day} 天前`;
	return new Date(ts).toLocaleDateString("zh-CN");
}

/** 取 cwd 的最后两段路径，超出部分用 … 省略。 */
export function shortCwd(cwd: string | null): string {
	if (!cwd) return "";
	const segments = cwd.split(/[/\\]/).filter(Boolean);
	if (segments.length === 0) return cwd;
	const tail = segments.slice(-2).join("/");
	return segments.length > 2 ? `…/${tail}` : tail;
}

/** 会话展示标题（后端可能没抓到标题）。 */
export function sessionTitle(session: {
	title: string | null;
	cwd: string | null;
}): string {
	const title = session.title?.trim();
	if (title) return title;
	const cwd = shortCwd(session.cwd);
	return cwd ? `${cwd} 的会话` : "未命名会话";
}
