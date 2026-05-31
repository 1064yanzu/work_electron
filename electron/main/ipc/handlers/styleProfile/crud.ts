/**
 * styleProfile/crud.ts — 风格包基本 CRUD 操作
 */
import type { IpcMainInvokeEvent } from "electron";
import type {
	IPCSchema,
	StyleProfile,
	StyleAnalysisData,
	StyleSample,
	StyleProfileDetail,
} from "../../../../shared/ipc-schema";
import type { DbContext } from "../../../db/client";
import { randomUUID } from "node:crypto";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function rowToProfile(row: Record<string, unknown>): StyleProfile {
	return {
		id: row.id as string,
		name: row.name as string,
		description: (row.description as string | null) ?? null,
		status: (row.status as StyleProfile["status"]) ?? "active",
		language: (row.language as string) ?? "zh",
		generation_config: row.generation_config
			? JSON.parse(row.generation_config as string)
			: {},
		analyze_model_id: (row.analyze_model_id as string | null) ?? null,
		is_default: Boolean(row.is_default),
		created_at: row.created_at as number,
		updated_at: row.updated_at as number,
	};
}

function rowToSample(row: Record<string, unknown>): StyleSample {
	return {
		id: row.id as string,
		profile_id: row.profile_id as string,
		title: (row.title as string | null) ?? null,
		content: row.content as string,
		content_type:
			(row.content_type as StyleSample["content_type"]) ?? "article",
		authorization_status:
			(row.authorization_status as StyleSample["authorization_status"]) ??
			"self_authored",
		word_count: (row.word_count as number) ?? 0,
		created_at: row.created_at as number,
	};
}

export function createStyleProfileCrudHandlers(db: DbContext) {
	const createProfile: Handler<"style_profile_create"> = async (
		_event,
		input,
	) => {
		const id = randomUUID();
		const now = Date.now();
		const generationConfig = JSON.stringify({ default_intensity: "medium" });

		await db.client.execute({
			sql: `INSERT INTO style_profiles
        (id, name, description, status, language, generation_config, analyze_model_id, is_default, created_at, updated_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?, 0, ?, ?)`,
			args: [
				id,
				input.name,
				input.description ?? null,
				input.language ?? "zh",
				generationConfig,
				input.analyze_model_id ?? null,
				now,
				now,
			],
		});

		const rows = await db.client.execute({
			sql: `SELECT * FROM style_profiles WHERE id = ?`,
			args: [id],
		});
		return rowToProfile(rows.rows[0] as Record<string, unknown>);
	};

	const listProfiles: Handler<"style_profile_list"> = async (
		_event,
		input,
	) => {
		const includeArchived = input.include_archived ?? false;
		const rows = await db.client.execute({
			sql: includeArchived
				? `SELECT * FROM style_profiles ORDER BY is_default DESC, updated_at DESC`
				: `SELECT * FROM style_profiles WHERE status = 'active' ORDER BY is_default DESC, updated_at DESC`,
			args: [],
		});
		return rows.rows.map((r) =>
			rowToProfile(r as Record<string, unknown>),
		);
	};

	const getProfile: Handler<"style_profile_get"> = async (_event, input) => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM style_profiles WHERE id = ?`,
			args: [input.id],
		});
		if (rows.rows.length === 0) {
			throw new Error(`Style profile not found: ${input.id}`);
		}
		const profile = rowToProfile(rows.rows[0] as Record<string, unknown>);

		// 查询分析结果
		const analysisRows = await db.client.execute({
			sql: `SELECT * FROM style_analyses WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
			args: [input.id],
		});
		let analysis: StyleAnalysisData | null = null;
		if (analysisRows.rows.length > 0) {
			const ar = analysisRows.rows[0] as Record<string, unknown>;
			analysis = {
				cognitive_pattern: ar.cognitive_pattern
					? JSON.parse(ar.cognitive_pattern as string)
					: [],
				rhetorical_stance: ar.rhetorical_stance
					? JSON.parse(ar.rhetorical_stance as string)
					: [],
				language_aesthetic: ar.language_aesthetic
					? JSON.parse(ar.language_aesthetic as string)
					: [],
				calibration_anchors: ar.calibration_anchors
					? JSON.parse(ar.calibration_anchors as string)
					: { positive: [], negative: [], missing: [] },
				task_adaptation_rules: ar.task_adaptation_rules
					? JSON.parse(ar.task_adaptation_rules as string)
					: {},
			};
		}

		// 查询样本列表
		const sampleRows = await db.client.execute({
			sql: `SELECT id, profile_id, title, content, content_type, authorization_status, word_count, created_at FROM style_samples WHERE profile_id = ? ORDER BY created_at ASC`,
			args: [input.id],
		});
		const samples = sampleRows.rows.map((r) =>
			rowToSample(r as Record<string, unknown>),
		);

		const detail: StyleProfileDetail = { ...profile, analysis, samples };
		return detail;
	};

	const updateProfile: Handler<"style_profile_update"> = async (
		_event,
		input,
	) => {
		const now = Date.now();
		const sets: string[] = ["updated_at = ?"];
		// Use (string | number | null)[] to satisfy @libsql/client InArgs
		const args: (string | number | null)[] = [now];

		if (input.name !== undefined) {
			sets.push("name = ?");
			args.push(input.name);
		}
		if (input.description !== undefined) {
			sets.push("description = ?");
			args.push(input.description);
		}
		if (input.language !== undefined) {
			sets.push("language = ?");
			args.push(input.language);
		}
		if (input.analyze_model_id !== undefined) {
			sets.push("analyze_model_id = ?");
			args.push(input.analyze_model_id);
		}
		if (input.generation_config !== undefined) {
			sets.push("generation_config = ?");
			args.push(JSON.stringify(input.generation_config));
		}
		if (input.is_default !== undefined) {
			if (input.is_default) {
				// 先清除其他默认
				await db.client.execute({
					sql: `UPDATE style_profiles SET is_default = 0`,
					args: [],
				});
			}
			sets.push("is_default = ?");
			args.push(input.is_default ? 1 : 0);
		}

		args.push(input.id);
		await db.client.execute({
			sql: `UPDATE style_profiles SET ${sets.join(", ")} WHERE id = ?`,
			args,
		});

		const rows = await db.client.execute({
			sql: `SELECT * FROM style_profiles WHERE id = ?`,
			args: [input.id],
		});
		return rowToProfile(rows.rows[0] as Record<string, unknown>);
	};

	const deleteProfile: Handler<"style_profile_delete"> = async (
		_event,
		input,
	) => {
		await db.client.execute({
			sql: `DELETE FROM style_profiles WHERE id = ?`,
			args: [input.id],
		});
		return { success: true };
	};

	const archiveProfile: Handler<"style_profile_archive"> = async (
		_event,
		input,
	) => {
		const now = Date.now();
		await db.client.execute({
			sql: `UPDATE style_profiles SET status = ?, updated_at = ? WHERE id = ?`,
			args: [input.archive ? "archived" : "active", now, input.id],
		});
		const rows = await db.client.execute({
			sql: `SELECT * FROM style_profiles WHERE id = ?`,
			args: [input.id],
		});
		return rowToProfile(rows.rows[0] as Record<string, unknown>);
	};

	return {
		style_profile_create: createProfile,
		style_profile_list: listProfiles,
		style_profile_get: getProfile,
		style_profile_update: updateProfile,
		style_profile_delete: deleteProfile,
		style_profile_archive: archiveProfile,
	};
}
