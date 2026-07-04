/**
 * styleProfile/analyzerV2.ts — 完整「灵魂-骨干-血肉」体系分析 pipeline
 *
 * 8 步分析：灵魂 → 骨干(思维+篇章) → 血肉 → 横切 → 气韵 → 全息 → 经变
 * 每步完成后推送进度事件（style-analysis-progress）。
 */
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type {
	IPCSchema,
	StyleAnalysisData,
	StyleAxisAnalysis,
	SoulLayerAnalysis,
	ThinkingOperationAnalysis,
	ArticulationPatternAnalysis,
	TextureLayerAnalysis,
	CrossCuttingTopics,
	LayerHarmony,
	HolographicPattern,
	ConstancyVarianceMap,
	StyleCalibrationAnchors,
	StyleAnalysisProgressEvent,
} from "../../../../shared/ipc-schema";
import type { DbContext } from "../../../db/client";
import { randomUUID } from "node:crypto";
import { invokeLlm } from "../../../llm/invoke";
import { sendToLiveWebContents } from "../../../utils/safeWebContentsSend";
import {
	ANALYZE_SYSTEM_PROMPT_V2,
	buildStep1SoulLayerPrompt,
	buildStep2ThinkingOperationPrompt,
	buildStep3ArticulationPatternPrompt,
	buildStep4TextureLayerPrompt,
	buildStep5CrossCuttingPrompt,
	buildStep6LayerHarmonyPrompt,
	buildStep7HolographicPrompt,
	buildStep8ConstancyVariancePrompt,
} from "./analyzePromptsV2";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

/** 最多取前 3 篇样本进行分析，控制 context 长度 */
const MAX_SAMPLES_FOR_ANALYSIS = 3;

/** 单篇样本截取字数上限（约 2000 字） */
const SAMPLE_CHAR_LIMIT = 4000;

function truncateSample(content: string): string {
	return content.length > SAMPLE_CHAR_LIMIT
		? `${content.slice(0, SAMPLE_CHAR_LIMIT)}\n...(已截取前 4000 字)`
		: content;
}

function tryParseJson<T>(text: string): T | null {
	try {
		const cleaned = text
			.replace(/^```json?\n?/, "")
			.replace(/\n?```$/, "")
			.trim();
		return JSON.parse(cleaned) as T;
	} catch {
		return null;
	}
}

/**
 * 把 Step 8 的经变分布回填到各内容层的 axis 上。
 *
 * Step 8 产出的是整体 ConstancyVarianceMap（constants/variables 列表），
 * 而渲染与前端展示按 axis.constancy 逐条读取。这里用 axis.name 与列表项做
 * 宽松子串匹配，best-effort 标注；匹配不上的 axis 保持未标注（不强行猜）。
 */
function backfillConstancy(
	layers: unknown[],
	cv: ConstancyVarianceMap | null,
): void {
	if (!cv) return;
	const constants = Array.isArray(cv.constants) ? cv.constants : [];
	const variables = Array.isArray(cv.variables) ? cv.variables : [];

	const hit = (haystack: string, needle: string): boolean =>
		needle.length >= 2 &&
		(haystack.includes(needle) || needle.includes(haystack));

	for (const layer of layers) {
		if (!layer || typeof layer !== "object") continue;
		for (const axes of Object.values(layer as Record<string, unknown>)) {
			if (!Array.isArray(axes)) continue;
			for (const axis of axes as StyleAxisAnalysis[]) {
				if (!axis?.name || axis.constancy) continue;
				const matchedVar = variables.find(
					(v) =>
						typeof v?.dimension === "string" && hit(v.dimension, axis.name),
				);
				if (matchedVar) {
					axis.constancy = "variable";
					axis.variance_note = matchedVar.range;
					continue;
				}
				if (constants.some((c) => typeof c === "string" && hit(c, axis.name))) {
					axis.constancy = "constant";
				}
			}
		}
	}
}

function sendProgress(
	mainWindow: BrowserWindow | null,
	event: StyleAnalysisProgressEvent,
) {
	if (mainWindow && !mainWindow.isDestroyed()) {
		sendToLiveWebContents(mainWindow, "style-analysis-progress", event);
	}
}

export function createStyleAnalyzerHandlersV2(
	db: DbContext,
	getMainWindow: () => BrowserWindow | null,
) {
	const startAnalysis: Handler<"style_analysis_start"> = async (
		_event,
		input,
	) => {
		const jobId = randomUUID();

		// 异步执行分析 pipeline，立即返回 job_id
		void runAnalysisPipelineV2(
			db,
			getMainWindow,
			input.profile_id,
			input.model_id,
			jobId,
		);

		return { job_id: jobId };
	};

	const getAnalysis: Handler<"style_analysis_get"> = async (_event, input) => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM style_analyses WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
			args: [input.profile_id],
		});
		if (rows.rows.length === 0) return null;

		const ar = rows.rows[0] as Record<string, unknown>;

		// 优先读取新字段，若无则fallback到旧字段
		const data: StyleAnalysisData = {
			schema_version:
				ar.schema_version === "v2"
					? "v2"
					: ar.schema_version === "v1"
						? "v1"
						: undefined,
			calibration_anchors: ar.calibration_anchors
				? JSON.parse(ar.calibration_anchors as string)
				: { positive: [], negative: [], missing: [] },
			task_adaptation_rules: ar.task_adaptation_rules
				? JSON.parse(ar.task_adaptation_rules as string)
				: {},
		};

		// v2 新字段
		if (ar.soul_layer) data.soul_layer = JSON.parse(ar.soul_layer as string);
		if (ar.thinking_operation)
			data.thinking_operation = JSON.parse(ar.thinking_operation as string);
		if (ar.articulation_pattern)
			data.articulation_pattern = JSON.parse(ar.articulation_pattern as string);
		if (ar.texture_layer)
			data.texture_layer = JSON.parse(ar.texture_layer as string);
		if (ar.cross_cutting)
			data.cross_cutting = JSON.parse(ar.cross_cutting as string);

		// v1 旧字段（向后兼容）
		if (ar.cognitive_pattern)
			data.cognitive_pattern = JSON.parse(ar.cognitive_pattern as string);
		if (ar.rhetorical_stance)
			data.rhetorical_stance = JSON.parse(ar.rhetorical_stance as string);
		if (ar.language_aesthetic)
			data.language_aesthetic = JSON.parse(ar.language_aesthetic as string);

		return data;
	};

	return {
		style_analysis_start: startAnalysis,
		style_analysis_get: getAnalysis,
	};
}

async function runAnalysisPipelineV2(
	db: DbContext,
	getMainWindow: () => BrowserWindow | null,
	profileId: string,
	modelId: string | undefined,
	_jobId: string,
) {
	const mainWindow = getMainWindow();

	const emit = (
		step: number,
		stepName: string,
		status: StyleAnalysisProgressEvent["status"],
		partialResult?: Partial<StyleAnalysisData>,
		error?: string,
	) => {
		sendProgress(mainWindow, {
			profile_id: profileId,
			step,
			total_steps: 8,
			step_name: stepName,
			status,
			partial_result: partialResult,
			error,
		});
	};

	try {
		// 获取样本
		const sampleRows = await db.client.execute({
			sql: `SELECT content, title FROM style_samples WHERE profile_id = ? ORDER BY created_at ASC LIMIT ?`,
			args: [profileId, MAX_SAMPLES_FOR_ANALYSIS],
		});

		if (sampleRows.rows.length === 0) {
			emit(
				1,
				"准备样本",
				"error",
				undefined,
				"没有可用的样本，请先添加至少一篇样本文章",
			);
			return;
		}

		// 获取分析用模型
		let model = modelId;
		if (!model) {
			const profileRows = await db.client.execute({
				sql: `SELECT analyze_model_id FROM style_profiles WHERE id = ?`,
				args: [profileId],
			});
			if (profileRows.rows.length > 0) {
				model =
					((profileRows.rows[0] as Record<string, unknown>).analyze_model_id as
						| string
						| undefined) ?? "";
			}
		}

		// 拼接样本
		const samplesText = sampleRows.rows
			.map((r, i) => {
				const row = r as Record<string, unknown>;
				const title = (row.title as string | null) ?? `样本 ${i + 1}`;
				return `【${title}】\n${truncateSample(row.content as string)}`;
			})
			.join("\n\n---\n\n");

		const systemContext = [ANALYZE_SYSTEM_PROMPT_V2];

		// Step 1: 灵魂层
		emit(1, "分析灵魂层（世界观与根本姿态）", "running");
		const step1Result = await invokeLlm(db, {
			model: model ?? "",
			prompt: buildStep1SoulLayerPrompt(samplesText),
			context: systemContext,
			temperature: 0.3,
		});
		const soulLayer = tryParseJson<SoulLayerAnalysis>(step1Result.content);
		emit(1, "分析灵魂层", "done", { soul_layer: soulLayer ?? undefined });

		// Step 2: 骨干层 - 思维运作
		emit(2, "分析骨干层·思维运作", "running");
		const step2Result = await invokeLlm(db, {
			model: model ?? "",
			prompt: buildStep2ThinkingOperationPrompt(
				samplesText,
				JSON.stringify(soulLayer, null, 2),
			),
			context: systemContext,
			temperature: 0.3,
		});
		const thinkingOperation = tryParseJson<ThinkingOperationAnalysis>(
			step2Result.content,
		);
		emit(2, "分析骨干层·思维运作", "done", {
			thinking_operation: thinkingOperation ?? undefined,
		});

		// Step 3: 骨干层 - 篇章外化
		emit(3, "分析骨干层·篇章外化", "running");
		const step3Result = await invokeLlm(db, {
			model: model ?? "",
			prompt: buildStep3ArticulationPatternPrompt(
				samplesText,
				JSON.stringify(soulLayer, null, 2),
				JSON.stringify(thinkingOperation, null, 2),
			),
			context: systemContext,
			temperature: 0.3,
		});
		const articulationPattern = tryParseJson<ArticulationPatternAnalysis>(
			step3Result.content,
		);
		emit(3, "分析骨干层·篇章外化", "done", {
			articulation_pattern: articulationPattern ?? undefined,
		});

		// Step 4: 血肉层
		emit(4, "分析血肉层（语言质感与指纹）", "running");
		const step4Result = await invokeLlm(db, {
			model: model ?? "",
			prompt: buildStep4TextureLayerPrompt(
				samplesText,
				JSON.stringify(soulLayer, null, 2),
				JSON.stringify(thinkingOperation, null, 2),
				JSON.stringify(articulationPattern, null, 2),
			),
			context: systemContext,
			temperature: 0.3,
		});
		const textureLayer = tryParseJson<TextureLayerAnalysis>(
			step4Result.content,
		);
		emit(4, "分析血肉层", "done", {
			texture_layer: textureLayer ?? undefined,
		});

		// Step 5: 横切话题
		emit(5, "识别横切话题", "running");
		const step5Result = await invokeLlm(db, {
			model: model ?? "",
			prompt: buildStep5CrossCuttingPrompt(
				samplesText,
				JSON.stringify(soulLayer, null, 2),
				JSON.stringify(thinkingOperation, null, 2),
				JSON.stringify(articulationPattern, null, 2),
				JSON.stringify(textureLayer, null, 2),
			),
			context: systemContext,
			temperature: 0.3,
		});
		const crossCutting = tryParseJson<CrossCuttingTopics>(step5Result.content);
		emit(5, "识别横切话题", "done", {
			cross_cutting: crossCutting ?? undefined,
		});

		// Step 6: 气韵（跨层）
		emit(6, "生成气韵（跨层关系）", "running");
		const step6Result = await invokeLlm(db, {
			model: model ?? "",
			prompt: buildStep6LayerHarmonyPrompt(
				samplesText,
				JSON.stringify(soulLayer, null, 2),
				JSON.stringify(thinkingOperation, null, 2),
				JSON.stringify(articulationPattern, null, 2),
				JSON.stringify(textureLayer, null, 2),
			),
			context: systemContext,
			temperature: 0.3,
		});
		const layerHarmony = tryParseJson<LayerHarmony>(step6Result.content);

		// Step 7: 全息性（跨尺度）
		emit(7, "识别全息性（跨尺度复现）", "running");
		const step7Result = await invokeLlm(db, {
			model: model ?? "",
			prompt: buildStep7HolographicPrompt(
				samplesText,
				JSON.stringify(soulLayer, null, 2),
				JSON.stringify(thinkingOperation, null, 2),
				JSON.stringify(articulationPattern, null, 2),
				JSON.stringify(textureLayer, null, 2),
			),
			context: systemContext,
			temperature: 0.3,
		});
		const holographicPatterns = tryParseJson<HolographicPattern[]>(
			step7Result.content,
		);

		// Step 8: 经变分布（跨篇）
		emit(8, "标注经变分布（跨篇稳定性）", "running");
		const allPreviousJson = JSON.stringify(
			{
				soul_layer: soulLayer,
				thinking_operation: thinkingOperation,
				articulation_pattern: articulationPattern,
				texture_layer: textureLayer,
				cross_cutting: crossCutting,
			},
			null,
			2,
		);
		const step8Result = await invokeLlm(db, {
			model: model ?? "",
			prompt: buildStep8ConstancyVariancePrompt(samplesText, allPreviousJson),
			context: systemContext,
			temperature: 0.3,
		});
		const constancyVariance = tryParseJson<ConstancyVarianceMap>(
			step8Result.content,
		);

		// 把经变分布回填到各内容层的 axis（供逐条「经/变」标注的渲染与展示）
		backfillConstancy(
			[soulLayer, thinkingOperation, articulationPattern, textureLayer],
			constancyVariance,
		);

		// 合并校准锚点（含关系性维度）
		const calibrationAnchors: StyleCalibrationAnchors = {
			positive: [],
			negative: [],
			missing: [],
			layer_harmony: layerHarmony ?? undefined,
			holographic_patterns: holographicPatterns ?? undefined,
			constancy_variance: constancyVariance ?? undefined,
		};

		emit(8, "标注经变分布", "done", {
			calibration_anchors: calibrationAnchors,
		});

		// 写入数据库
		const now = Date.now();
		const analysisId = randomUUID();

		// 检查表结构是否支持新字段
		const tableInfoRows = await db.client.execute({
			sql: `PRAGMA table_info(style_analyses)`,
		});
		const columns = tableInfoRows.rows.map(
			(r) => (r as Record<string, unknown>).name as string,
		);
		const hasV2Columns = columns.includes("soul_layer");

		// 查询是否已有分析记录
		const existingRows = await db.client.execute({
			sql: `SELECT id, analysis_version FROM style_analyses WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
			args: [profileId],
		});

		if (hasV2Columns) {
			// 使用新表结构
			if (existingRows.rows.length > 0) {
				const existing = existingRows.rows[0] as Record<string, unknown>;
				const nextVersion = (existing.analysis_version as number) + 1;
				await db.client.execute({
					sql: `UPDATE style_analyses SET
            schema_version = ?,
            soul_layer = ?, thinking_operation = ?, articulation_pattern = ?,
            texture_layer = ?, cross_cutting = ?,
            calibration_anchors = ?, task_adaptation_rules = '{}',
            analysis_version = ?, updated_at = ?
            WHERE id = ?`,
					args: [
						"v2",
						JSON.stringify(soulLayer),
						JSON.stringify(thinkingOperation),
						JSON.stringify(articulationPattern),
						JSON.stringify(textureLayer),
						JSON.stringify(crossCutting),
						JSON.stringify(calibrationAnchors),
						nextVersion,
						now,
						existing.id as string,
					],
				});
			} else {
				await db.client.execute({
					sql: `INSERT INTO style_analyses
            (id, profile_id, schema_version,
             soul_layer, thinking_operation, articulation_pattern,
             texture_layer, cross_cutting,
             calibration_anchors, task_adaptation_rules, analysis_version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', 1, ?, ?)`,
					args: [
						analysisId,
						profileId,
						"v2",
						JSON.stringify(soulLayer),
						JSON.stringify(thinkingOperation),
						JSON.stringify(articulationPattern),
						JSON.stringify(textureLayer),
						JSON.stringify(crossCutting),
						JSON.stringify(calibrationAnchors),
						now,
						now,
					],
				});
			}
		} else {
			// 兼容旧表结构（写入旧字段）
			// 这里简化处理：将新数据映射回旧结构
			if (existingRows.rows.length > 0) {
				const existing = existingRows.rows[0] as Record<string, unknown>;
				const nextVersion = (existing.analysis_version as number) + 1;
				await db.client.execute({
					sql: `UPDATE style_analyses SET
            cognitive_pattern = ?, rhetorical_stance = ?, language_aesthetic = ?,
            calibration_anchors = ?, task_adaptation_rules = '{}',
            analysis_version = ?, updated_at = ?
            WHERE id = ?`,
					args: [
						JSON.stringify([]), // 占位
						JSON.stringify([]), // 占位
						JSON.stringify([]), // 占位
						JSON.stringify(calibrationAnchors),
						nextVersion,
						now,
						existing.id as string,
					],
				});
			} else {
				await db.client.execute({
					sql: `INSERT INTO style_analyses
            (id, profile_id, cognitive_pattern, rhetorical_stance, language_aesthetic,
             calibration_anchors, task_adaptation_rules, analysis_version, created_at, updated_at)
            VALUES (?, ?, '[]', '[]', '[]', ?, '{}', 1, ?, ?)`,
					args: [
						analysisId,
						profileId,
						JSON.stringify(calibrationAnchors),
						now,
						now,
					],
				});
			}
		}

		// 更新 profile updated_at
		await db.client.execute({
			sql: `UPDATE style_profiles SET updated_at = ? WHERE id = ?`,
			args: [now, profileId],
		});
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		sendProgress(mainWindow, {
			profile_id: profileId,
			step: 0,
			total_steps: 8,
			step_name: "分析失败",
			status: "error",
			error: errMsg,
		});
	}
}
