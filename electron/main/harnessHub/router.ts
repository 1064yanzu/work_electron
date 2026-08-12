/**
 * 能力路由 —— 「这活该派给谁」。
 *
 * 各入口不是等价的：Gemini 的上下文窗口最大，Web 端的 ChatGPT 能做深度研究
 * （而且走的是已经付过费的订阅额度，不烧 API token），Claude Code 最擅长大规模
 * 代码改写，Codex 跑批量脚本快，中文站点做中文检索更顺。
 *
 * 路由表把「能力 → 有序入口清单」显式写下来，由用户可改。选择时再叠加两个
 * **运行时事实**：入口是否真的可用（装没装 / 站点启没启用），以及是否正处于
 * 限额中（quota.ts）。
 *
 * 这里没有任何「智能」猜测：路由结果完全由用户配置 + 可用性事实决定，
 * 可解释、可预测。自动学习听起来更聪明，但一个会自己变的路由表在出问题时
 * 无法排查。
 */
import type { DbContext } from "../db/client";
import { detectHarnesses } from "./detect";
import { getQuotaState } from "./quota";
import { findWebSite, loadWebSites } from "./webSites";
import type { RouteRule } from "./types";

/** 内置能力清单。用户可以改每条的入口顺序，但能力本身是固定的一组语义。 */
export const BUILTIN_CAPABILITIES: {
	capability: string;
	label: string;
	description: string;
	/** 默认优先级（只包含真实存在的入口 id） */
	defaults: string[];
}[] = [
	{
		capability: "long-context",
		label: "超长上下文",
		description: "要一次性喂进大量材料（整个仓库、长文档、几百页 PDF）",
		defaults: ["web-gemini", "gemini-cli", "web-kimi", "claude-code"],
	},
	{
		capability: "research",
		label: "联网研究",
		description: "需要实时联网、深度检索、给出可核查来源",
		defaults: ["web-chatgpt", "web-doubao", "web-glm", "ipo-sdk"],
	},
	{
		capability: "refactor",
		label: "代码改写",
		description: "多文件重构、大范围修改、需要严谨执行的工程任务",
		defaults: ["claude-code", "codex", "ipo-sdk"],
	},
	{
		capability: "quick",
		label: "快速问答",
		description: "一句话就能答完，追求响应速度",
		defaults: ["ipo-sdk", "codex", "web-deepseek"],
	},
	{
		capability: "chinese",
		label: "中文语境",
		description: "中文写作、中文互联网检索、本土产品相关",
		defaults: ["web-doubao", "web-kimi", "web-glm", "web-deepseek"],
	},
];

/** 读取路由表；没写过的能力回落到内置默认值。 */
export async function listRoutes(db: DbContext): Promise<RouteRule[]> {
	const res = await db.client.execute(
		`SELECT capability, label, harnesses_json, enabled, updated_at FROM harness_routes`,
	);
	const saved = new Map<string, RouteRule>();
	for (const raw of res.rows) {
		const row = raw as Record<string, unknown>;
		let harnesses: string[] = [];
		try {
			const parsed = JSON.parse(String(row.harnesses_json ?? "[]"));
			if (Array.isArray(parsed)) {
				harnesses = parsed.filter((x): x is string => typeof x === "string");
			}
		} catch {
			harnesses = [];
		}
		const capability = String(row.capability ?? "");
		saved.set(capability, {
			capability,
			label: String(row.label ?? capability),
			harnesses,
			enabled: Number(row.enabled ?? 1) === 1,
			updatedAt: Number(row.updated_at ?? 0),
		});
	}

	return BUILTIN_CAPABILITIES.map(
		(builtin) =>
			saved.get(builtin.capability) ?? {
				capability: builtin.capability,
				label: builtin.label,
				harnesses: builtin.defaults,
				enabled: true,
				updatedAt: 0,
			},
	);
}

/** 保存一条路由规则。 */
export async function saveRoute(
	db: DbContext,
	rule: { capability: string; harnesses: string[]; enabled?: boolean },
): Promise<void> {
	const builtin = BUILTIN_CAPABILITIES.find(
		(c) => c.capability === rule.capability,
	);
	await db.client.execute({
		sql: `INSERT INTO harness_routes (capability, label, harnesses_json, enabled, updated_at)
		      VALUES (?, ?, ?, ?, ?)
		      ON CONFLICT(capability) DO UPDATE SET
		        harnesses_json = excluded.harnesses_json,
		        enabled = excluded.enabled,
		        updated_at = excluded.updated_at`,
		args: [
			rule.capability,
			builtin?.label ?? rule.capability,
			JSON.stringify(rule.harnesses),
			rule.enabled === false ? 0 : 1,
			Date.now(),
		],
	});
}

/** 恢复某条能力的默认顺序。 */
export async function resetRoute(
	db: DbContext,
	capability: string,
): Promise<void> {
	await db.client.execute({
		sql: `DELETE FROM harness_routes WHERE capability = ?`,
		args: [capability],
	});
}

/** 单个候选入口的可用性判定结果。 */
export interface RouteCandidate {
	harness: string;
	label: string;
	kind: "cli" | "web" | "app";
	available: boolean;
	/** 不可用的原因（如实展示，不藏） */
	reason: string | null;
	blockedByQuota: boolean;
}

/**
 * 按能力解析出候选入口，并标注每个的可用性。
 *
 * 返回**全部候选**而不是只返回赢家：UI 要能解释"为什么选了它、为什么跳过了前面
 * 那个"，只给一个结果的路由是黑箱。
 */
export async function resolveRoute(
	db: DbContext,
	capability: string,
): Promise<{
	capability: string;
	label: string;
	candidates: RouteCandidate[];
}> {
	const routes = await listRoutes(db);
	const rule =
		routes.find((r) => r.capability === capability) ??
		({
			capability,
			label: capability,
			harnesses: [],
			enabled: true,
			updatedAt: 0,
		} satisfies RouteRule);

	const [detections, sites] = await Promise.all([
		detectHarnesses(),
		loadWebSites(db),
	]);

	const candidates: RouteCandidate[] = [];
	for (const harness of rule.harnesses) {
		const quota = await getQuotaState(db, harness);
		// 「用户手动标记的」和「从转录里检测到的」要分开说：前者是用户自己的决定，
		// 说成"检测到限额提示"会让他以为系统误判了，跑去查证据结果什么也没有。
		const quotaReason = quota.blocked
			? quota.manualBlocked
				? "已被你手动标记为不可用"
				: "检测到限额提示"
			: null;

		if (harness === "ipo-sdk") {
			candidates.push({
				harness,
				label: "本应用 Agent",
				kind: "app",
				available: !quota.blocked,
				reason: quotaReason,
				blockedByQuota: quota.blocked,
			});
			continue;
		}

		if (harness.startsWith("web-")) {
			const site = findWebSite(sites, harness);
			const available = Boolean(site?.enabled) && !quota.blocked;
			candidates.push({
				harness,
				label: site?.label ?? harness,
				kind: "web",
				available,
				reason: !site
					? "站点不存在"
					: !site.enabled
						? "站点已禁用"
						: quotaReason,
				blockedByQuota: quota.blocked,
			});
			continue;
		}

		const detected = detections.find((d) => d.harness === harness);
		const available = Boolean(detected?.canInject) && !quota.blocked;
		candidates.push({
			harness,
			label: detected?.label ?? harness,
			kind: "cli",
			available,
			reason: !detected?.installed
				? "本机未安装"
				: !detected.canInject
					? "找不到可执行文件"
					: quotaReason,
			blockedByQuota: quota.blocked,
		});
	}

	return { capability: rule.capability, label: rule.label, candidates };
}

/**
 * 按能力挑一个可用入口。全部不可用时返回 null（**不硬塞一个不可用的**）。
 */
export async function pickForCapability(
	db: DbContext,
	capability: string,
): Promise<RouteCandidate | null> {
	const { candidates } = await resolveRoute(db, capability);
	return candidates.find((c) => c.available) ?? null;
}
