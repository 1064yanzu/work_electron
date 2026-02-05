import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import { extractIpoSubagentScenario } from "./ipoMarkers";
import type { AnthropicRequest } from "./types";

type AgentModelSettingsLike = {
	defaultModelId?: unknown;
	defaultProviderId?: unknown;
	scenarioConfigs?: unknown;
};

type ScenarioModelConfigLike = {
	scenario?: unknown;
	customName?: unknown;
	modelId?: unknown;
	providerId?: unknown;
	enabled?: unknown;
};

function coerceString(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const s = value.trim();
	return s ? s : null;
}

function pickScenarioModelChoice(
	settings: AgentModelSettingsLike | null,
	subagentKey: string,
): { modelId: string; providerId: string } | null {
	if (!settings) return null;
	const requestedKey = subagentKey.trim();
	const configs = Array.isArray(settings.scenarioConfigs)
		? (settings.scenarioConfigs as ScenarioModelConfigLike[])
		: [];

	// 规范化字符串：去除末尾标点、转小写、去除多余空白
	const normalize = (s: string): string => {
		return s.trim().replace(/[.。!！?？,，;；:：]+$/, "").trim().toLowerCase();
	};
	const normalizedRequestedKey = normalize(requestedKey);

	// 1) custom-N mapping: match N-th enabled custom scenario (stable by UI order).
	const m = requestedKey.match(/^custom-(\d+)$/i);
	if (m?.[1]) {
		const idx = Number.parseInt(m[1], 10);
		if (Number.isFinite(idx) && idx > 0) {
			const enabledCustom = configs.filter((c) => {
				if (!c || typeof c !== "object") return false;
				if ((c as any).enabled === false) return false;
				const configuredScenario = String((c as any).scenario || "").trim();
				return configuredScenario === "custom";
			});
			const target = enabledCustom[idx - 1] as any;
			if (target) {
				const modelId = coerceString(target.modelId);
				const providerId = coerceString(target.providerId);
				if (modelId && providerId) return { modelId, providerId };
				return null;
			}
		}
	}

	// 2) non-custom: direct scenario match
	for (const c of configs) {
		if (!c || typeof c !== "object") continue;
		if ((c as any).enabled === false) continue;

		const configuredScenario = String((c as any).scenario || "").trim();
		if (!configuredScenario) continue;
		if (configuredScenario !== requestedKey) continue;

		const modelId = coerceString((c as any).modelId);
		const providerId = coerceString((c as any).providerId);
		if (modelId && providerId) return { modelId, providerId };
		return null;
	}

	// 3) compatibility fallback: allow matching a custom scenario by its customName
	// 使用规范化匹配，忽略末尾标点符号的差异
	for (const c of configs) {
		if (!c || typeof c !== "object") continue;
		if ((c as any).enabled === false) continue;
		const configuredScenario = String((c as any).scenario || "").trim();
		if (configuredScenario !== "custom") continue;
		const configuredCustomName = coerceString((c as any).customName);
		if (!configuredCustomName) continue;
		
		// 使用规范化比较，忽略末尾标点
		const normalizedConfigName = normalize(configuredCustomName);
		if (normalizedConfigName !== normalizedRequestedKey) continue;

		const modelId = coerceString((c as any).modelId);
		const providerId = coerceString((c as any).providerId);
		if (modelId && providerId) return { modelId, providerId };
		return null;
	}

	return null;
}

function summarizeScenarioConfigState(configs: ScenarioModelConfigLike[]): {
	total: number;
	enabled: number;
	customTotal: number;
	customEnabled: number;
} {
	let enabled = 0;
	let customTotal = 0;
	let customEnabled = 0;
	for (const c of configs) {
		if (!c || typeof c !== "object") continue;
		const scenario = String((c as any).scenario || "").trim();
		if (!scenario) continue;
		if ((c as any).enabled !== false) enabled++;
		if (scenario === "custom") {
			customTotal++;
			if ((c as any).enabled !== false) customEnabled++;
		}
	}
	return { total: configs.length, enabled, customTotal, customEnabled };
}

function logScenarioChoiceMiss(opts: {
	logger?: Logger;
	requestId?: string;
	subagentKey: string;
	currentModel: string;
	settings: AgentModelSettingsLike | null;
}) {
	if (!opts.logger) return;
	const configs = Array.isArray(opts.settings?.scenarioConfigs)
		? (opts.settings?.scenarioConfigs as ScenarioModelConfigLike[])
		: [];
	const summary = summarizeScenarioConfigState(configs);
	const key = opts.subagentKey.trim();

	// Attempt to explain why no mapping happened (most common reasons: disabled config or missing providerId).
	const m = key.match(/^custom-(\d+)$/i);
	if (m?.[1]) {
		const idx = Number.parseInt(m[1], 10);
		const allCustom = configs.filter((c) => {
			if (!c || typeof c !== "object") return false;
			return String((c as any).scenario || "").trim() === "custom";
		}) as any[];
		const enabledCustom = allCustom.filter((c) => (c as any).enabled !== false);
		const targetAll = Number.isFinite(idx) && idx > 0 ? allCustom[idx - 1] : null;
		const targetEnabled =
			Number.isFinite(idx) && idx > 0 ? enabledCustom[idx - 1] : null;

		if (!allCustom.length) {
			opts.logger.warn({
				msg: "anthropic proxy: subagent scenario override not applied (no custom configs)",
				requestId: opts.requestId,
				subagentKey: key,
				currentModel: opts.currentModel,
				scenarioConfigSummary: summary,
			});
			return;
		}

		if (targetAll && !targetEnabled) {
			opts.logger.warn({
				msg: "anthropic proxy: subagent scenario override not applied (custom config disabled or out of enabled range)",
				requestId: opts.requestId,
				subagentKey: key,
				currentModel: opts.currentModel,
				customIndex: idx,
				customTotal: allCustom.length,
				customEnabled: enabledCustom.length,
				targetCustomName: coerceString(targetAll.customName),
				targetEnabled: (targetAll as any).enabled !== false,
				scenarioConfigSummary: summary,
			});
			return;
		}

		opts.logger.warn({
			msg: "anthropic proxy: subagent scenario override not applied (missing/invalid mapping for custom)",
			requestId: opts.requestId,
			subagentKey: key,
			currentModel: opts.currentModel,
			customIndex: idx,
			customTotal: allCustom.length,
			customEnabled: enabledCustom.length,
			scenarioConfigSummary: summary,
		});
		return;
	}

	// Direct scenario match (including disabled)
	const direct = configs.find((c) => {
		if (!c || typeof c !== "object") return false;
		return String((c as any).scenario || "").trim() === key;
	}) as any;
	if (direct) {
		opts.logger.warn({
			msg: "anthropic proxy: subagent scenario override not applied (direct scenario config missing fields or disabled)",
			requestId: opts.requestId,
			subagentKey: key,
			currentModel: opts.currentModel,
			configEnabled: direct.enabled !== false,
			configHasModelId: !!coerceString(direct.modelId),
			configHasProviderId: !!coerceString(direct.providerId),
			scenarioConfigSummary: summary,
		});
		return;
	}

	// CustomName fallback match (including disabled)
	const byName = configs.find((c) => {
		if (!c || typeof c !== "object") return false;
		if (String((c as any).scenario || "").trim() !== "custom") return false;
		return coerceString((c as any).customName) === key;
	}) as any;
	if (byName) {
		opts.logger.warn({
			msg: "anthropic proxy: subagent scenario override not applied (customName match missing fields or disabled)",
			requestId: opts.requestId,
			subagentKey: key,
			currentModel: opts.currentModel,
			configEnabled: byName.enabled !== false,
			configHasModelId: !!coerceString(byName.modelId),
			configHasProviderId: !!coerceString(byName.providerId),
			scenarioConfigSummary: summary,
		});
		return;
	}

	opts.logger.warn({
		msg: "anthropic proxy: subagent scenario override not applied (no matching scenario config)",
		requestId: opts.requestId,
		subagentKey: key,
		currentModel: opts.currentModel,
		scenarioConfigSummary: summary,
	});
}

let cachedAgentModelSettings: { loadedAt: number; settings: any } | null = null;
const AGENT_MODEL_SETTINGS_CACHE_TTL_MS = 5_000;

async function loadAgentModelSettings(db: DbContext): Promise<any | null> {
	const now = Date.now();
	if (
		cachedAgentModelSettings &&
		now - cachedAgentModelSettings.loadedAt < AGENT_MODEL_SETTINGS_CACHE_TTL_MS
	) {
		return cachedAgentModelSettings.settings;
	}

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

	cachedAgentModelSettings = { loadedAt: now, settings: parsed };
	return parsed;
}

/**
 * Legacy fallback: detect subagent scenario via in-prompt markers and map to user settings.
 *
 * This is kept for backward compatibility with old sessions/prompts that injected IPO_SUBAGENT_SCENARIO.
 * New subagent routing should rely on AgentDefinition.model encoding (see modelRouting.ts).
 */
export async function resolveSubagentScenarioModel(opts: {
	db: DbContext;
	anthropicReq: AnthropicRequest;
	currentModel: string;
	logger?: Logger;
	requestId?: string;
}): Promise<{
	subagentKey: string;
	modelId: string;
	providerId: string;
} | null> {
	// 【调试】记录请求内容以追踪子代理场景识别
	const sysContent = (opts.anthropicReq as any)?.system;
	const sysPreview =
		typeof sysContent === "string"
			? sysContent.slice(0, 500)
			: Array.isArray(sysContent)
				? JSON.stringify(sysContent).slice(0, 500)
				: String(sysContent || "").slice(0, 500);
	const messagesPreview = (opts.anthropicReq.messages || [])
		.slice(0, 3)
		.map((m: any) => {
			const content = m?.content;
			if (typeof content === "string") return content.slice(0, 200);
			if (Array.isArray(content)) {
				return content
					.filter((b: any) => b?.type === "text")
					.map((b: any) => String(b?.text || "").slice(0, 100))
					.join(" | ");
			}
			return "";
		})
		.join(" /// ");

	// 检查是否包含子代理标记
	const hasIpoMarker =
		sysPreview.includes("ipo-subagent") ||
		sysPreview.includes("IPO_SUBAGENT") ||
		messagesPreview.includes("ipo-subagent") ||
		messagesPreview.includes("IPO_SUBAGENT");

	// 【调试】始终记录请求概要，以便追踪子代理场景识别
	opts.logger?.info({
		msg: "anthropic proxy: resolving subagent scenario",
		requestId: opts.requestId,
		model: opts.currentModel,
		hasSysContent: !!sysContent,
		hasIpoMarker,
		messagesCount: opts.anthropicReq.messages?.length || 0,
		sysPreviewShort: sysPreview.slice(0, 100),
	});

	if (hasIpoMarker) {
		opts.logger?.info({
			msg: "anthropic proxy: IPO MARKER DETECTED in request",
			requestId: opts.requestId,
			model: opts.currentModel,
			sysPreview,
			messagesPreview,
		});
	}

	const subagentKey = extractIpoSubagentScenario(opts.anthropicReq);

	// 【调试】记录场景提取结果
	if (subagentKey) {
		opts.logger?.info({
			msg: "anthropic proxy: Scenario extracted from request",
			requestId: opts.requestId,
			scenario: subagentKey,
			currentModel: opts.currentModel,
		});
	}
	if (!subagentKey) return null;

	const settings = (await loadAgentModelSettings(
		opts.db,
	)) as AgentModelSettingsLike;
	const choice = pickScenarioModelChoice(settings, subagentKey);
	if (!choice?.modelId || !choice.providerId) {
		logScenarioChoiceMiss({
			logger: opts.logger,
			requestId: opts.requestId,
			subagentKey,
			currentModel: opts.currentModel,
			settings,
		});
		return null;
	}

	opts.logger?.info({
		msg: "anthropic proxy: subagent scenario detected",
		requestId: opts.requestId,
		subagentKey,
		currentModel: opts.currentModel,
		overrideModel: choice.modelId,
		overrideProviderId: choice.providerId,
	});

	opts.logger?.info({
		msg: "anthropic proxy: subagent scenario model override",
		requestId: opts.requestId,
		subagentKey,
		currentModel: opts.currentModel,
		overrideModel: choice.modelId,
		overrideProviderId: choice.providerId,
	});

	return {
		subagentKey,
		modelId: choice.modelId,
		providerId: choice.providerId,
	};
}
