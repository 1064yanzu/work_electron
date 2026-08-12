/**
 * AI Hub 的可配置项 —— 集中读写 app_config，供设置面板、桥接层、Agent 运行时共用。
 *
 * 单独成文件而不是散在各处，是因为这些开关会被三个方向读到（IPC handler、
 * Agent SDK 启动路径、反向 MCP Server），各自写一份 SELECT 迟早漂移，
 * 而「默认值不一致」这类 bug 极难发现。
 */
import type { DbContext } from "../db/client";

const KEYS = {
	bridgeEnabled: "harness_bridge_enabled",
	bridgeAllowWrite: "harness_bridge_allow_write",
	bridgeCliTimeout: "harness_bridge_cli_timeout_ms",
	bridgeWebTimeout: "harness_bridge_web_timeout_ms",
	handoffPolicy: "harness_handoff_policy",
	autoBoardSync: "harness_auto_board_sync",
	automationEnabled: "harness_automation_enabled",
	automationMaxConcurrent: "harness_automation_max_concurrent",
	automationPreventSleep: "harness_automation_prevent_sleep",
	automationSkipOnBattery: "harness_automation_skip_on_battery",
	automationStalledThreshold: "harness_automation_stalled_threshold_ms",
	automationDefaultMaxAttempts: "harness_automation_default_max_attempts",
	automationNotifyOnFailure: "harness_automation_notify_on_failure",
} as const;

/** AI Hub 的全部可配置项。 */
export interface HarnessHubSettings {
	/** 是否把「其他入口」作为工具挂给本应用 Agent */
	bridgeEnabled: boolean;
	/** 桥接调用是否允许目标 agent 改文件（默认否——程序化调用没人逐条审阅） */
	bridgeAllowWrite: boolean;
	/** CLI 桥接超时（毫秒） */
	bridgeCliTimeoutMs: number;
	/** Web 桥接超时（毫秒） */
	bridgeWebTimeoutMs: number;
	/** 接力策略：auto = 自动选档 */
	handoffPolicy: "auto" | "native" | "raw" | "distill";
	/** 接力时是否自动把白板写进目标工作目录 */
	autoBoardSync: boolean;

	// ---------- 自动化 ----------
	/** 自动化总开关。关掉后调度器不再触发任何定时任务（手动运行仍可用） */
	automationEnabled: boolean;
	/** 同时最多跑几个任务 */
	automationMaxConcurrent: number;
	/** 有任务在跑时阻止系统挂起应用（费电，但夜间任务的成败常取决于它） */
	automationPreventSleep: boolean;
	/** 电池供电时跳过定时触发 */
	automationSkipOnBattery: boolean;
	/** 多久没有任何输出算「卡死」（毫秒） */
	automationStalledThresholdMs: number;
	/** 新建任务时默认的最大尝试次数 */
	automationDefaultMaxAttempts: number;
	/** 任务失败 / 需人工介入时给系统通知 */
	automationNotifyOnFailure: boolean;
}

export const DEFAULT_HARNESS_HUB_SETTINGS: HarnessHubSettings = {
	bridgeEnabled: true,
	bridgeAllowWrite: false,
	bridgeCliTimeoutMs: 300_000,
	bridgeWebTimeoutMs: 180_000,
	handoffPolicy: "auto",
	autoBoardSync: true,
	automationEnabled: true,
	automationMaxConcurrent: 2,
	automationPreventSleep: true,
	automationSkipOnBattery: true,
	automationStalledThresholdMs: 10 * 60_000,
	automationDefaultMaxAttempts: 5,
	automationNotifyOnFailure: true,
};

async function readConfig(
	db: DbContext,
	keys: string[],
): Promise<Map<string, string>> {
	if (!keys.length) return new Map();
	const placeholders = keys.map(() => "?").join(", ");
	const res = await db.client.execute({
		sql: `SELECT key, value FROM app_config WHERE key IN (${placeholders})`,
		args: keys,
	});
	const map = new Map<string, string>();
	for (const raw of res.rows) {
		const row = raw as Record<string, unknown>;
		map.set(String(row.key), String(row.value ?? ""));
	}
	return map;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined) return fallback;
	return value === "1" || value === "true";
}

function toInt(value: string | undefined, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

/** 读取全部设置（缺失项回落默认值）。 */
export async function loadHarnessHubSettings(
	db: DbContext,
): Promise<HarnessHubSettings> {
	const map = await readConfig(db, Object.values(KEYS));
	const policy = map.get(KEYS.handoffPolicy);
	return {
		bridgeEnabled: toBool(
			map.get(KEYS.bridgeEnabled),
			DEFAULT_HARNESS_HUB_SETTINGS.bridgeEnabled,
		),
		bridgeAllowWrite: toBool(
			map.get(KEYS.bridgeAllowWrite),
			DEFAULT_HARNESS_HUB_SETTINGS.bridgeAllowWrite,
		),
		bridgeCliTimeoutMs: toInt(
			map.get(KEYS.bridgeCliTimeout),
			DEFAULT_HARNESS_HUB_SETTINGS.bridgeCliTimeoutMs,
		),
		bridgeWebTimeoutMs: toInt(
			map.get(KEYS.bridgeWebTimeout),
			DEFAULT_HARNESS_HUB_SETTINGS.bridgeWebTimeoutMs,
		),
		handoffPolicy:
			policy === "native" || policy === "raw" || policy === "distill"
				? policy
				: "auto",
		autoBoardSync: toBool(
			map.get(KEYS.autoBoardSync),
			DEFAULT_HARNESS_HUB_SETTINGS.autoBoardSync,
		),
		automationEnabled: toBool(
			map.get(KEYS.automationEnabled),
			DEFAULT_HARNESS_HUB_SETTINGS.automationEnabled,
		),
		automationMaxConcurrent: toInt(
			map.get(KEYS.automationMaxConcurrent),
			DEFAULT_HARNESS_HUB_SETTINGS.automationMaxConcurrent,
		),
		automationPreventSleep: toBool(
			map.get(KEYS.automationPreventSleep),
			DEFAULT_HARNESS_HUB_SETTINGS.automationPreventSleep,
		),
		automationSkipOnBattery: toBool(
			map.get(KEYS.automationSkipOnBattery),
			DEFAULT_HARNESS_HUB_SETTINGS.automationSkipOnBattery,
		),
		automationStalledThresholdMs: toInt(
			map.get(KEYS.automationStalledThreshold),
			DEFAULT_HARNESS_HUB_SETTINGS.automationStalledThresholdMs,
		),
		automationDefaultMaxAttempts: toInt(
			map.get(KEYS.automationDefaultMaxAttempts),
			DEFAULT_HARNESS_HUB_SETTINGS.automationDefaultMaxAttempts,
		),
		automationNotifyOnFailure: toBool(
			map.get(KEYS.automationNotifyOnFailure),
			DEFAULT_HARNESS_HUB_SETTINGS.automationNotifyOnFailure,
		),
	};
}

/** 只读桥接开关（Agent 启动路径上的热路径，不必读全套）。 */
export async function isHarnessBridgeEnabled(db: DbContext): Promise<boolean> {
	const map = await readConfig(db, [KEYS.bridgeEnabled]);
	return toBool(
		map.get(KEYS.bridgeEnabled),
		DEFAULT_HARNESS_HUB_SETTINGS.bridgeEnabled,
	);
}

/** 保存部分设置（未传的项保持原值）。 */
export async function saveHarnessHubSettings(
	db: DbContext,
	patch: Partial<HarnessHubSettings>,
): Promise<HarnessHubSettings> {
	const now = Date.now();
	const writes: { key: string; value: string }[] = [];

	if (patch.bridgeEnabled !== undefined) {
		writes.push({
			key: KEYS.bridgeEnabled,
			value: patch.bridgeEnabled ? "1" : "0",
		});
	}
	if (patch.bridgeAllowWrite !== undefined) {
		writes.push({
			key: KEYS.bridgeAllowWrite,
			value: patch.bridgeAllowWrite ? "1" : "0",
		});
	}
	if (patch.bridgeCliTimeoutMs !== undefined) {
		writes.push({
			key: KEYS.bridgeCliTimeout,
			value: String(Math.max(10_000, Math.round(patch.bridgeCliTimeoutMs))),
		});
	}
	if (patch.bridgeWebTimeoutMs !== undefined) {
		writes.push({
			key: KEYS.bridgeWebTimeout,
			value: String(Math.max(10_000, Math.round(patch.bridgeWebTimeoutMs))),
		});
	}
	if (patch.handoffPolicy !== undefined) {
		writes.push({ key: KEYS.handoffPolicy, value: patch.handoffPolicy });
	}
	if (patch.autoBoardSync !== undefined) {
		writes.push({
			key: KEYS.autoBoardSync,
			value: patch.autoBoardSync ? "1" : "0",
		});
	}
	if (patch.automationEnabled !== undefined) {
		writes.push({
			key: KEYS.automationEnabled,
			value: patch.automationEnabled ? "1" : "0",
		});
	}
	if (patch.automationMaxConcurrent !== undefined) {
		// 上限 8：再多也只是让几个 agent 互相抢 CPU 和额度，不会更快
		writes.push({
			key: KEYS.automationMaxConcurrent,
			value: String(
				Math.max(1, Math.min(8, Math.round(patch.automationMaxConcurrent))),
			),
		});
	}
	if (patch.automationPreventSleep !== undefined) {
		writes.push({
			key: KEYS.automationPreventSleep,
			value: patch.automationPreventSleep ? "1" : "0",
		});
	}
	if (patch.automationSkipOnBattery !== undefined) {
		writes.push({
			key: KEYS.automationSkipOnBattery,
			value: patch.automationSkipOnBattery ? "1" : "0",
		});
	}
	if (patch.automationStalledThresholdMs !== undefined) {
		// 下限 1 分钟：再短会把正常的长思考误判成卡死
		writes.push({
			key: KEYS.automationStalledThreshold,
			value: String(
				Math.max(60_000, Math.round(patch.automationStalledThresholdMs)),
			),
		});
	}
	if (patch.automationDefaultMaxAttempts !== undefined) {
		writes.push({
			key: KEYS.automationDefaultMaxAttempts,
			value: String(
				Math.max(
					1,
					Math.min(50, Math.round(patch.automationDefaultMaxAttempts)),
				),
			),
		});
	}
	if (patch.automationNotifyOnFailure !== undefined) {
		writes.push({
			key: KEYS.automationNotifyOnFailure,
			value: patch.automationNotifyOnFailure ? "1" : "0",
		});
	}

	for (const write of writes) {
		await db.client.execute({
			sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
			      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			args: [write.key, write.value, now],
		});
	}

	return await loadHarnessHubSettings(db);
}
