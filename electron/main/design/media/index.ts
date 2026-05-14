/**
 * Design Media 模块（M3）
 *
 * 提供一个 provider 注册表 + 历史记录表 + 简单的 dispatch 入口。
 *
 * 当前阶段：
 * - 注册表内置 6 个 provider（gpt-image-2 / seedance / hyper-frames / elevenlabs / suno / udio）
 *   每个 provider 只有元信息（id / label / kinds / requires_key），不直接调外部 API
 * - runMediaJob 会把任务写入 design_media_history 表，状态默认 'queued'
 *   等后续接入实际 provider 时改 status 即可
 * - 不打包任何外部 SDK；密钥走 keytar/settings（由 settings 面板配置）
 */

import { randomUUID } from "node:crypto";
import type { DbContext } from "../../db/client";

export interface MediaProvider {
	id: string;
	label: string;
	kinds: Array<"image" | "video" | "audio" | "music">;
	requires_key: boolean;
}

const PROVIDERS: MediaProvider[] = [
	{ id: "gpt-image-2", label: "GPT-Image-2", kinds: ["image"], requires_key: true },
	{ id: "seedance", label: "Seedance", kinds: ["video"], requires_key: true },
	{ id: "hyper-frames", label: "HyperFrames", kinds: ["video"], requires_key: true },
	{ id: "elevenlabs", label: "ElevenLabs", kinds: ["audio"], requires_key: true },
	{ id: "suno", label: "Suno", kinds: ["music"], requires_key: true },
	{ id: "udio", label: "Udio", kinds: ["music"], requires_key: true },
];

let schemaEnsured = false;

export async function ensureMediaSchema(db: DbContext): Promise<void> {
	if (schemaEnsured) return;
	await db.client.execute(`
		CREATE TABLE IF NOT EXISTS design_media_history (
			id TEXT PRIMARY KEY,
			session_id TEXT,
			provider TEXT NOT NULL,
			kind TEXT NOT NULL,
			prompt TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'queued',
			asset_paths TEXT NOT NULL DEFAULT '[]',
			options TEXT,
			error TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)
	`);
	await db.client.execute(
		"CREATE INDEX IF NOT EXISTS idx_design_media_history_session ON design_media_history(session_id, created_at DESC)",
	);
	schemaEnsured = true;
}

export function listMediaProviders(): MediaProvider[] {
	return PROVIDERS;
}

export interface RunMediaJobInput {
	session_id?: string;
	provider: string;
	kind: "image" | "video" | "audio" | "music";
	prompt: string;
	options?: Record<string, unknown>;
}

export interface RunMediaJobOutput {
	job_id: string;
	status: "queued" | "running" | "done" | "failed";
	asset_paths?: string[];
	error?: string;
}

export async function runMediaJob(
	db: DbContext,
	input: RunMediaJobInput,
): Promise<RunMediaJobOutput> {
	await ensureMediaSchema(db);

	const provider = PROVIDERS.find((p) => p.id === input.provider);
	if (!provider) {
		return { job_id: "", status: "failed", error: `Unknown provider: ${input.provider}` };
	}
	if (!provider.kinds.includes(input.kind)) {
		return {
			job_id: "",
			status: "failed",
			error: `Provider ${input.provider} 不支持 ${input.kind}`,
		};
	}

	const ts = Date.now();
	const id = randomUUID();
	// 默认 queued；真正接入 provider 时把这里改成异步派发并回写
	await db.client.execute({
		sql: `INSERT INTO design_media_history (id, session_id, provider, kind, prompt, status, asset_paths, options, created_at, updated_at)
		      VALUES (?, ?, ?, ?, ?, 'queued', '[]', ?, ?, ?)`,
		args: [
			id,
			input.session_id ?? null,
			input.provider,
			input.kind,
			input.prompt,
			JSON.stringify(input.options ?? {}),
			ts,
			ts,
		],
	});

	return {
		job_id: id,
		status: "queued",
	};
}

export interface MediaHistoryItem {
	id: string;
	session_id?: string;
	provider: string;
	kind: string;
	prompt: string;
	status: string;
	asset_paths: string[];
	created_at: number;
}

export async function listMediaHistory(
	db: DbContext,
	input: { session_id?: string; limit?: number },
): Promise<MediaHistoryItem[]> {
	await ensureMediaSchema(db);
	const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
	const r = input.session_id
		? await db.client.execute({
				sql: "SELECT * FROM design_media_history WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
				args: [input.session_id, limit],
			})
		: await db.client.execute({
				sql: "SELECT * FROM design_media_history ORDER BY created_at DESC LIMIT ?",
				args: [limit],
			});
	return r.rows.map((row) => {
		const r = row as Record<string, unknown>;
		let assets: string[] = [];
		try {
			assets = JSON.parse(String(r.asset_paths ?? "[]"));
		} catch {
			assets = [];
		}
		return {
			id: String(r.id),
			session_id: (r.session_id as string | null) ?? undefined,
			provider: String(r.provider),
			kind: String(r.kind),
			prompt: String(r.prompt),
			status: String(r.status),
			asset_paths: assets,
			created_at: Number(r.created_at ?? 0),
		};
	});
}
