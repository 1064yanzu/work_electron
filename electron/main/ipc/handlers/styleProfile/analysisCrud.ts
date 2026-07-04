/**
 * styleProfile/analysisCrud.ts — 分析结果的读写操作
 *
 * 独立于 analyzer.ts（后者负责 LLM 分步分析 pipeline）。
 * 本文件只做 DB 层的读取和手动更新（校准）。
 */
import type { IpcMainInvokeEvent } from "electron";
import type {
	IPCSchema,
	StyleAnalysisData,
} from "../../../../shared/ipc-schema";
import type { DbContext } from "../../../db/client";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function rowToAnalysis(row: Record<string, unknown>): StyleAnalysisData {
	return {
		cognitive_pattern: row.cognitive_pattern
			? JSON.parse(row.cognitive_pattern as string)
			: [],
		rhetorical_stance: row.rhetorical_stance
			? JSON.parse(row.rhetorical_stance as string)
			: [],
		language_aesthetic: row.language_aesthetic
			? JSON.parse(row.language_aesthetic as string)
			: [],
		calibration_anchors: row.calibration_anchors
			? JSON.parse(row.calibration_anchors as string)
			: { positive: [], negative: [], missing: [] },
		task_adaptation_rules: row.task_adaptation_rules
			? JSON.parse(row.task_adaptation_rules as string)
			: {},
	};
}

export function createStyleAnalysisCrudHandlers(db: DbContext) {
	/** 获取最新分析结果 */
	const getAnalysis: Handler<"style_analysis_get"> = async (_event, input) => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM style_analyses WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
			args: [input.profile_id],
		});
		if (rows.rows.length === 0) return null;
		return rowToAnalysis(rows.rows[0] as Record<string, unknown>);
	};

	/**
	 * 手动更新（校准）分析结果。
	 * 策略：读取当前最新版本，merge patch，写入同一行（UPSERT）。
	 * 没有分析结果时先用空白结构初始化再写入。
	 */
	const updateAnalysis: Handler<"style_analysis_update"> = async (
		_event,
		input,
	) => {
		const now = Date.now();

		// 读当前最新
		const existing = await getAnalysis(_event, {
			profile_id: input.profile_id,
		});

		const merged: StyleAnalysisData = {
			cognitive_pattern:
				input.data.cognitive_pattern ?? existing?.cognitive_pattern ?? [],
			rhetorical_stance:
				input.data.rhetorical_stance ?? existing?.rhetorical_stance ?? [],
			language_aesthetic:
				input.data.language_aesthetic ?? existing?.language_aesthetic ?? [],
			calibration_anchors: input.data.calibration_anchors ??
				existing?.calibration_anchors ?? {
					positive: [],
					negative: [],
					missing: [],
				},
			task_adaptation_rules:
				input.data.task_adaptation_rules ??
				existing?.task_adaptation_rules ??
				{},
		};

		// UPSERT（若无行则插入 version=1，否则更新最新版本行）
		const existingRows = await db.client.execute({
			sql: `SELECT rowid, analysis_version FROM style_analyses WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
			args: [input.profile_id],
		});

		if (existingRows.rows.length === 0) {
			// 插入新行
			await db.client.execute({
				sql: `INSERT INTO style_analyses
					(profile_id, analysis_version, cognitive_pattern, rhetorical_stance, language_aesthetic,
					 calibration_anchors, task_adaptation_rules, created_at, updated_at)
					VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`,
				args: [
					input.profile_id,
					JSON.stringify(merged.cognitive_pattern),
					JSON.stringify(merged.rhetorical_stance),
					JSON.stringify(merged.language_aesthetic),
					JSON.stringify(merged.calibration_anchors),
					JSON.stringify(merged.task_adaptation_rules),
					now,
					now,
				],
			});
		} else {
			const version = existingRows.rows[0].analysis_version as number;
			await db.client.execute({
				sql: `UPDATE style_analyses SET
					cognitive_pattern = ?, rhetorical_stance = ?, language_aesthetic = ?,
					calibration_anchors = ?, task_adaptation_rules = ?, updated_at = ?
					WHERE profile_id = ? AND analysis_version = ?`,
				args: [
					JSON.stringify(merged.cognitive_pattern),
					JSON.stringify(merged.rhetorical_stance),
					JSON.stringify(merged.language_aesthetic),
					JSON.stringify(merged.calibration_anchors),
					JSON.stringify(merged.task_adaptation_rules),
					now,
					input.profile_id,
					version,
				],
			});
		}

		return merged;
	};

	return {
		style_analysis_get: getAnalysis,
		style_analysis_update: updateAnalysis,
	};
}
