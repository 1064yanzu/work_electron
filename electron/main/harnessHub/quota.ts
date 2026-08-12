/**
 * 额度感知 —— 从**已摄取的真实转录**里检测「这个入口被限额了」的信号。
 *
 * 这是 Hub 最初要解决的那个痛点：codex 干到一半没额度了，只能人肉复述上下文
 * 换个入口重来。知道谁被限额了，路由才能自动绕开，接力才能自动发起。
 *
 * ## 为什么只做「信号检测」而不做「余额估算」
 *
 * 各家都不提供本地可查的余额接口。按 token 用量反推剩余额度需要知道套餐档位、
 * 计费窗口、缓存折算规则——每一项都得猜，猜错就是给用户一个看起来精确的假数字，
 * 比不显示更糟。所以这里只做一件事：**在转录里找到限额提示的原文，把它连同
 * 时间戳如实记下来**。没找到就是 `unknown`，UI 也如实显示"未检测到"。
 */
import type { DbContext } from "../db/client";
import { createLogger } from "../logging/logger";
import { detectLimitSignal } from "./automation/errors";
import type { QuotaState } from "./types";

const logger = createLogger();

// 限额措辞的模式表原本在这里维护了一份，现已并入 automation/errors.ts
// —— 守护层要按同一份措辞做重试决策，两份副本各改各的迟早漂移。
// `detectLimitSignal` 从那里导入并重新导出，历史调用方无需改动。
export { detectLimitSignal };

/** 从提示文案里解析恢复时间；解析不出返回 null（**不猜**）。 */
function parseResetTime(text: string, base: number): number | null {
	// "resets at 3:00 PM" / "resets 15:00"
	const clock = text.match(
		/reset[s]?\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?/i,
	);
	if (clock) {
		const hour12 = Number(clock[1]);
		const minute = Number(clock[2]);
		const suffix = clock[3]?.toLowerCase();
		let hour = hour12;
		if (suffix === "pm" && hour12 < 12) hour += 12;
		if (suffix === "am" && hour12 === 12) hour = 0;
		if (hour <= 23 && minute <= 59) {
			const d = new Date(base);
			d.setHours(hour, minute, 0, 0);
			// 已经过去的时间点视为「明天的这个点」
			if (d.getTime() <= base) d.setDate(d.getDate() + 1);
			return d.getTime();
		}
	}

	// "try again in 2 hours" / "in 35 minutes"
	const relative = text.match(/in\s+(\d{1,3})\s*(minute|min|hour|hr)s?/i);
	if (relative) {
		const amount = Number(relative[1]);
		const unit = relative[2].toLowerCase();
		const ms = unit.startsWith("h") ? amount * 3_600_000 : amount * 60_000;
		return base + ms;
	}

	// ISO 时间戳
	const iso = text.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?/);
	if (iso) {
		const t = Date.parse(iso[0].replace(" ", "T"));
		if (Number.isFinite(t)) return t;
	}

	return null;
}

/** 扫描窗口：只看最近这么久的消息（更早的限额早就恢复了）。 */
const SCAN_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 扫描最近的转录，刷新各入口的额度状态。
 *
 * 幂等：同一条证据反复扫描只会更新 `updated_at`，不会重复告警。
 */
export async function refreshQuotaStates(db: DbContext): Promise<QuotaState[]> {
	const since = Date.now() - SCAN_WINDOW_MS;

	// 只看 assistant/system 消息：限额提示是系统给出的，用户消息里出现
	// "usage limit" 多半是在讨论这个话题本身
	const res = await db.client.execute({
		sql: `SELECT s.harness AS harness, m.content AS content, m.created_at AS created_at
		      FROM harness_messages m
		      JOIN harness_sessions s ON s.id = m.session_id
		      WHERE m.created_at >= ? AND m.role != 'user'
		      ORDER BY m.created_at DESC
		      LIMIT 4000`,
		args: [since],
	});

	/** harness → 最近一次命中 */
	const hits = new Map<string, { at: number; evidence: string }>();
	for (const raw of res.rows) {
		const row = raw as Record<string, unknown>;
		const harness = String(row.harness ?? "");
		if (!harness || hits.has(harness)) continue; // 已有更近的一次
		const evidence = detectLimitSignal(String(row.content ?? ""));
		if (!evidence) continue;
		hits.set(harness, { at: Number(row.created_at ?? 0), evidence });
	}

	const now = Date.now();
	for (const [harness, hit] of hits) {
		const resetsAt = parseResetTime(hit.evidence, hit.at || now);
		await db.client
			.execute({
				sql: `INSERT INTO harness_quota (harness, limit_hit_at, resets_at, evidence, manual_blocked, updated_at)
				      VALUES (?, ?, ?, ?, COALESCE((SELECT manual_blocked FROM harness_quota WHERE harness = ?), 0), ?)
				      ON CONFLICT(harness) DO UPDATE SET
				        limit_hit_at = excluded.limit_hit_at,
				        resets_at = excluded.resets_at,
				        evidence = excluded.evidence,
				        updated_at = excluded.updated_at`,
				args: [harness, hit.at, resetsAt, hit.evidence, harness, now],
			})
			.catch((error: unknown) => {
				logger.warn({
					msg: "写入额度状态失败",
					harness,
					error: error instanceof Error ? error.message : String(error),
				});
			});
	}

	return await listQuotaStates(db);
}

function rowToState(row: Record<string, unknown>): QuotaState {
	const now = Date.now();
	const limitHitAt = row.limit_hit_at ? Number(row.limit_hit_at) : null;
	const resetsAt = row.resets_at ? Number(row.resets_at) : null;
	const manualBlocked = Number(row.manual_blocked ?? 0) === 1;

	// 判定「当前是否应避免派活」：
	// - 手动标记 → 一直阻塞，直到用户自己解除
	// - 有恢复时间 → 到点即解除
	// - 没有恢复时间 → 用 4 小时保守窗口（各家限额窗口普遍是 3–5 小时；
	//   猜长了会白白绕开可用入口，猜短了会撞回限额，4 小时是折中）
	let blocked = manualBlocked;
	if (!blocked && limitHitAt) {
		blocked = resetsAt ? now < resetsAt : now - limitHitAt < 4 * 3_600_000;
	}

	return {
		harness: String(row.harness ?? ""),
		limitHitAt,
		resetsAt,
		evidence: (row.evidence as string) ?? null,
		manualBlocked,
		blocked,
	};
}

/** 列出所有已记录的额度状态。 */
export async function listQuotaStates(db: DbContext): Promise<QuotaState[]> {
	const res = await db.client.execute(
		`SELECT harness, limit_hit_at, resets_at, evidence, manual_blocked, updated_at
		 FROM harness_quota ORDER BY updated_at DESC`,
	);
	return res.rows.map((r) => rowToState(r as Record<string, unknown>));
}

/** 取单个入口的额度状态；没有记录时返回一个「未检测到」的状态。 */
export async function getQuotaState(
	db: DbContext,
	harness: string,
): Promise<QuotaState> {
	const res = await db.client.execute({
		sql: `SELECT harness, limit_hit_at, resets_at, evidence, manual_blocked, updated_at
		      FROM harness_quota WHERE harness = ?`,
		args: [harness],
	});
	const row = res.rows[0] as Record<string, unknown> | undefined;
	if (!row) {
		return {
			harness,
			limitHitAt: null,
			resetsAt: null,
			evidence: null,
			manualBlocked: false,
			blocked: false,
		};
	}
	return rowToState(row);
}

/** 用户手动标记 / 解除某入口不可用。 */
export async function setManualBlock(
	db: DbContext,
	harness: string,
	blocked: boolean,
): Promise<QuotaState> {
	const now = Date.now();
	await db.client.execute({
		sql: `INSERT INTO harness_quota (harness, limit_hit_at, resets_at, evidence, manual_blocked, updated_at)
		      VALUES (?, NULL, NULL, NULL, ?, ?)
		      ON CONFLICT(harness) DO UPDATE SET
		        manual_blocked = excluded.manual_blocked,
		        updated_at = excluded.updated_at`,
		args: [harness, blocked ? 1 : 0, now],
	});
	return await getQuotaState(db, harness);
}

/** 清除某入口的自动检测记录（用户确认是误判时）。 */
export async function clearQuotaSignal(
	db: DbContext,
	harness: string,
): Promise<QuotaState> {
	await db.client.execute({
		sql: `UPDATE harness_quota
		      SET limit_hit_at = NULL, resets_at = NULL, evidence = NULL, updated_at = ?
		      WHERE harness = ?`,
		args: [Date.now(), harness],
	});
	return await getQuotaState(db, harness);
}
