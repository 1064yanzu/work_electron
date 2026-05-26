import type { DbContext } from "../db/client";
import type { AppCloseBehavior } from "../../shared/ipc-schema";

export const APP_CLOSE_BEHAVIOR_CONFIG_KEY = "app.closeBehavior.windows";

export const DEFAULT_APP_CLOSE_BEHAVIOR: AppCloseBehavior = "ask";

const VALID_CLOSE_BEHAVIORS: readonly AppCloseBehavior[] = [
	"ask",
	"hide_to_tray",
	"quit",
];

function normalizeCloseBehavior(value: unknown): AppCloseBehavior {
	return VALID_CLOSE_BEHAVIORS.includes(value as AppCloseBehavior)
		? (value as AppCloseBehavior)
		: DEFAULT_APP_CLOSE_BEHAVIOR;
}

export async function getWindowsCloseBehavior(
	db: DbContext,
): Promise<AppCloseBehavior> {
	const result = await db.client.execute({
		sql: "SELECT value FROM app_config WHERE key = ? LIMIT 1",
		args: [APP_CLOSE_BEHAVIOR_CONFIG_KEY],
	});
	const value = result.rows[0]?.value;
	return normalizeCloseBehavior(value);
}

export async function setWindowsCloseBehavior(
	db: DbContext,
	behavior: AppCloseBehavior,
): Promise<AppCloseBehavior> {
	const normalized = normalizeCloseBehavior(behavior);
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [APP_CLOSE_BEHAVIOR_CONFIG_KEY, normalized, Date.now()],
	});
	return normalized;
}
