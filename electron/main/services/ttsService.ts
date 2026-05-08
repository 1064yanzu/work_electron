/**
 * TTSService — 单例：tts_settings 读写、provider 配置缓存与解析
 *
 * 不直接处理 IPC，由 handler 层调用。负责：
 *  - 把 tts_settings 单行表与 TTSSettings 结构化对象互转
 *  - 提供 getProviderById / getDefaultProvider 给上游
 *  - 缓存（10 秒 TTL，更新时主动 invalidate）
 */
import type { DbContext } from "../db/client";
import {
	DEFAULT_CAPABILITIES,
	DEFAULT_TTS_SETTINGS,
	type TTSCapabilities,
	type TTSProviderConfig,
	type TTSScenePetFilter,
	type TTSSettings,
} from "../tts/types";
import { invalidateVoiceCache } from "../tts/voiceManager";

const SETTINGS_CACHE_TTL_MS = 10_000;

let cachedSettings: TTSSettings | null = null;
let cachedAt = 0;

function clamp(v: unknown, min: number, max: number, fallback: number): number {
	const n = typeof v === "number" ? v : Number(v);
	if (!Number.isFinite(n)) return fallback;
	return Math.max(min, Math.min(max, n));
}

function parseProviders(raw: string | null | undefined): TTSProviderConfig[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const out: TTSProviderConfig[] = [];
		for (const p of parsed) {
			if (!p || typeof p !== "object") continue;
			const r = p as Record<string, unknown>;
			const id = typeof r.id === "string" ? r.id : "";
			const type = r.type as TTSProviderConfig["type"];
			if (!id || !type) continue;
			out.push({
				id,
				type,
				name: typeof r.name === "string" ? r.name : id,
				api_key: typeof r.api_key === "string" ? r.api_key : undefined,
				api_base: typeof r.api_base === "string" ? r.api_base : undefined,
				model: typeof r.model === "string" ? r.model : undefined,
				voice: typeof r.voice === "string" ? r.voice : undefined,
				metadata:
					r.metadata && typeof r.metadata === "object"
						? (r.metadata as Record<string, unknown>)
						: undefined,
				is_enabled: r.is_enabled !== false,
				capabilities:
					r.capabilities && typeof r.capabilities === "object"
						? (r.capabilities as TTSCapabilities)
						: undefined,
			});
		}
		return out;
	} catch {
		return [];
	}
}

function parsePetFilter(raw: string | null | undefined): TTSScenePetFilter[] {
	if (!raw) return ["reminder", "approval"];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return ["reminder", "approval"];
		const allowed: TTSScenePetFilter[] = [
			"reminder",
			"approval",
			"done",
			"error",
			"progress",
			"task_start",
			"thinking",
		];
		const out: TTSScenePetFilter[] = [];
		for (const f of parsed) {
			if (typeof f === "string" && allowed.includes(f as TTSScenePetFilter)) {
				out.push(f as TTSScenePetFilter);
			}
		}
		return out;
	} catch {
		return ["reminder", "approval"];
	}
}

function rowToSettings(row: Record<string, unknown>): TTSSettings {
	return {
		default_provider_id:
			(row.default_provider_id as string | null | undefined) ?? null,
		default_voice_id:
			(row.default_voice_id as string | null | undefined) ?? null,
		rate: clamp(row.rate, 0.5, 2.5, 1.0),
		volume: clamp(row.volume, 0, 1, 1.0),
		pitch: clamp(row.pitch, 0, 2, 1.0),
		scene_reader_enabled: Number(row.scene_reader_enabled ?? 1) === 1,
		scene_reader_voice_id:
			(row.scene_reader_voice_id as string | null | undefined) ?? null,
		scene_chat_enabled: Number(row.scene_chat_enabled ?? 0) === 1,
		scene_chat_auto: Number(row.scene_chat_auto ?? 0) === 1,
		scene_chat_voice_id:
			(row.scene_chat_voice_id as string | null | undefined) ?? null,
		scene_pet_enabled: Number(row.scene_pet_enabled ?? 0) === 1,
		scene_pet_filter: parsePetFilter(row.scene_pet_filter as string),
		scene_pet_verbosity: row.scene_pet_verbosity === "full" ? "full" : "title",
		scene_pet_voice_id:
			(row.scene_pet_voice_id as string | null | undefined) ?? null,
		scene_pet_persona_enabled: Number(row.scene_pet_persona_enabled ?? 0) === 1,
		scene_pet_persona_prompt:
			(row.scene_pet_persona_prompt as string | null | undefined) ?? null,
		scene_pet_persona_provider_id:
			(row.scene_pet_persona_provider_id as string | null | undefined) ?? null,
		scene_pet_persona_model:
			(row.scene_pet_persona_model as string | null | undefined) ?? null,
		providers: parseProviders(row.providers as string),
		updated_at:
			typeof row.updated_at === "number" ? (row.updated_at as number) : null,
	};
}

export async function getTtsSettings(db: DbContext): Promise<TTSSettings> {
	const now = Date.now();
	if (cachedSettings && now - cachedAt < SETTINGS_CACHE_TTL_MS) {
		return cachedSettings;
	}

	const res = await db.client.execute({
		sql: "SELECT * FROM tts_settings WHERE id = 1 LIMIT 1",
		args: [],
	});

	if (res.rows.length === 0) {
		// 兜底：插入默认行
		await db.client.execute({
			sql: "INSERT OR IGNORE INTO tts_settings (id, updated_at) VALUES (1, ?)",
			args: [now],
		});
		cachedSettings = { ...DEFAULT_TTS_SETTINGS, updated_at: now };
	} else {
		cachedSettings = rowToSettings(
			res.rows[0] as unknown as Record<string, unknown>,
		);
	}
	cachedAt = now;
	return cachedSettings;
}

export async function updateTtsSettings(
	db: DbContext,
	patch: Partial<TTSSettings>,
): Promise<TTSSettings> {
	const current = await getTtsSettings(db);
	const next: TTSSettings = {
		...current,
		...patch,
		// 数字字段做 clamp 保护
		rate:
			patch.rate !== undefined
				? clamp(patch.rate, 0.5, 2.5, current.rate)
				: current.rate,
		volume:
			patch.volume !== undefined
				? clamp(patch.volume, 0, 1, current.volume)
				: current.volume,
		pitch:
			patch.pitch !== undefined
				? clamp(patch.pitch, 0, 2, current.pitch)
				: current.pitch,
		providers:
			patch.providers !== undefined ? patch.providers : current.providers,
		scene_pet_filter:
			patch.scene_pet_filter !== undefined
				? patch.scene_pet_filter
				: current.scene_pet_filter,
		updated_at: Date.now(),
	};

	await db.client.execute({
		sql: `INSERT INTO tts_settings (
			id, default_provider_id, default_voice_id, rate, volume, pitch,
			scene_reader_enabled, scene_reader_voice_id,
			scene_chat_enabled, scene_chat_auto, scene_chat_voice_id,
			scene_pet_enabled, scene_pet_filter, scene_pet_verbosity, scene_pet_voice_id,
			scene_pet_persona_enabled, scene_pet_persona_prompt, scene_pet_persona_provider_id, scene_pet_persona_model,
			providers, updated_at
		) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			default_provider_id = excluded.default_provider_id,
			default_voice_id = excluded.default_voice_id,
			rate = excluded.rate,
			volume = excluded.volume,
			pitch = excluded.pitch,
			scene_reader_enabled = excluded.scene_reader_enabled,
			scene_reader_voice_id = excluded.scene_reader_voice_id,
			scene_chat_enabled = excluded.scene_chat_enabled,
			scene_chat_auto = excluded.scene_chat_auto,
			scene_chat_voice_id = excluded.scene_chat_voice_id,
			scene_pet_enabled = excluded.scene_pet_enabled,
			scene_pet_filter = excluded.scene_pet_filter,
			scene_pet_verbosity = excluded.scene_pet_verbosity,
			scene_pet_voice_id = excluded.scene_pet_voice_id,
			scene_pet_persona_enabled = excluded.scene_pet_persona_enabled,
			scene_pet_persona_prompt = excluded.scene_pet_persona_prompt,
			scene_pet_persona_provider_id = excluded.scene_pet_persona_provider_id,
			scene_pet_persona_model = excluded.scene_pet_persona_model,
			providers = excluded.providers,
			updated_at = excluded.updated_at
		`,
		args: [
			next.default_provider_id,
			next.default_voice_id,
			next.rate,
			next.volume,
			next.pitch,
			next.scene_reader_enabled ? 1 : 0,
			next.scene_reader_voice_id,
			next.scene_chat_enabled ? 1 : 0,
			next.scene_chat_auto ? 1 : 0,
			next.scene_chat_voice_id,
			next.scene_pet_enabled ? 1 : 0,
			JSON.stringify(next.scene_pet_filter),
			next.scene_pet_verbosity,
			next.scene_pet_voice_id,
			next.scene_pet_persona_enabled ? 1 : 0,
			next.scene_pet_persona_prompt,
			next.scene_pet_persona_provider_id,
			next.scene_pet_persona_model,
			JSON.stringify(next.providers),
			next.updated_at,
		],
	});

	cachedSettings = next;
	cachedAt = Date.now();
	if (patch.providers !== undefined) {
		invalidateVoiceCache();
	}
	return next;
}

export async function getProviderById(
	db: DbContext,
	providerId: string,
): Promise<TTSProviderConfig | null> {
	const settings = await getTtsSettings(db);
	const found = settings.providers.find((p) => p.id === providerId);
	return found ?? null;
}

export function resolveCapabilities(
	provider: TTSProviderConfig,
): TTSCapabilities {
	if (provider.capabilities) return provider.capabilities;
	return DEFAULT_CAPABILITIES[provider.type];
}

/** 主进程也要在事件中读 settings；保留一个 hard invalidate 入口 */
export function invalidateTtsSettingsCache(): void {
	cachedSettings = null;
	cachedAt = 0;
}
