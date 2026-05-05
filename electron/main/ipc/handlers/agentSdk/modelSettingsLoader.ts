import type { DbContext } from "../../../db/client";
import type { Logger } from "../../../logging/types";

const AGENT_MODEL_SETTINGS_CACHE_TTL_MS = 5_000;

/**
 * 读取 app_config.agent.model_settings 并带 TTL 缓存。
 * 注意：该缓存是"每个 createAgentSdkHandlers 工厂调用一次"的 closure 实例——
 * 避免全局状态跨 DbContext 泄漏。
 */
export function createAgentModelSettingsLoader(params: {
	db: DbContext;
	logger: Logger;
}) {
	const { db, logger } = params;
	let cached: { loadedAt: number; settings: any } | null = null;

	return async function loadAgentModelSettingsFromDb(): Promise<any | null> {
		const now = Date.now();
		if (cached && now - cached.loadedAt < AGENT_MODEL_SETTINGS_CACHE_TTL_MS) {
			return cached.settings;
		}

		try {
			const rows = await db.client.execute({
				sql: `SELECT value FROM app_config WHERE key = ?`,
				args: ["agent.model_settings"],
			});
			const raw = rows.rows.length > 0 ? (rows.rows[0].value as unknown) : null;

			let parsed: any = null;
			try {
				if (typeof raw === "string") parsed = JSON.parse(raw);
				else if (raw && typeof raw === "object") parsed = raw;
			} catch {
				parsed = null;
			}

			cached = { loadedAt: now, settings: parsed };
			logger.info({
				msg: "agent_sdk loadAgentModelSettingsFromDb result",
				scope: "agent",
				hasSettings: !!parsed,
				scenarioConfigsCount: Array.isArray(parsed?.scenarioConfigs)
					? parsed.scenarioConfigs.length
					: 0,
				scenarioConfigsPreview: Array.isArray(parsed?.scenarioConfigs)
					? parsed.scenarioConfigs.slice(0, 3).map((c: any) => ({
							scenario: c?.scenario,
							customName: c?.customName,
							enabled: c?.enabled,
							modelId: c?.modelId,
							providerId: c?.providerId,
						}))
					: [],
			});
			return parsed;
		} catch {
			cached = { loadedAt: now, settings: null };
			return null;
		}
	};
}

/** 将工具调用更新 (updatedInput) 合并进既有的 baseInput。 */
export function mergeUpdatedToolInput(
	baseInput: Record<string, unknown>,
	updatedInput?: Record<string, unknown>,
): Record<string, unknown> {
	if (!updatedInput || typeof updatedInput !== "object") {
		return baseInput;
	}
	return {
		...baseInput,
		...updatedInput,
	};
}
