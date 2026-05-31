/**
 * styleProfile/analyzer.ts — 分步 LLM 分析 pipeline
 *
 * 依次执行 4 个步骤，每步完成后推送进度事件（style-analysis-progress）。
 * 若某步 JSON 解析失败，则跳过该步并在结果中标注缺失。
 */
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type {
	IPCSchema,
	StyleAnalysisData,
	StyleAxisAnalysis,
	StyleCalibrationAnchors,
	StyleAnalysisProgressEvent,
} from "../../../../shared/ipc-schema";
import type { DbContext } from "../../../db/client";
import { randomUUID } from "node:crypto";
import { invokeLlm } from "../../../llm/invoke";
import { sendToLiveWebContents } from "../../../utils/safeWebContentsSend";
import {
	ANALYZE_SYSTEM_PROMPT,
	buildStep1Prompt,
	buildStep2Prompt,
	buildStep3Prompt,
	buildStep4Prompt,
} from "./analyzePrompts";

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

function sendProgress(
	mainWindow: BrowserWindow | null,
	event: StyleAnalysisProgressEvent,
) {
	if (mainWindow && !mainWindow.isDestroyed()) {
		sendToLiveWebContents(mainWindow, "style-analysis-progress", event);
	}
}

export function createStyleAnalyzerHandlers(
	db: DbContext,
	getMainWindow: () => BrowserWindow | null,
) {
	const startAnalysis: Handler<"style_analysis_start"> = async (
		_event,
		input,
	) => {
		const jobId = randomUUID();

		// 异步执行分析 pipeline，立即返回 job_id
		void runAnalysisPipeline(db, getMainWindow, input.profile_id, input.model_id, jobId);

		return { job_id: jobId };
	};

	const getAnalysis: Handler<"style_analysis_get"> = async (_event, input) => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM style_analyses WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
			args: [input.profile_id],
		});
		if (rows.rows.length === 0) return null;

		const ar = rows.rows[0] as Record<string, unknown>;
		return {
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
		} as StyleAnalysisData;
	};

	return {
		style_analysis_start: startAnalysis,
		style_analysis_get: getAnalysis,
	};
}

async function runAnalysisPipeline(
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
			total_steps: 4,
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
			emit(1, "准备样本", "error", undefined, "没有可用的样本，请先添加至少一篇样本文章");
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
				model = (profileRows.rows[0] as Record<string, unknown>).analyze_model_id as string | undefined ?? "";
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

		const systemContext = [ANALYZE_SYSTEM_PROMPT];

		// Step 1: 文本认知模式
		emit(1, "分析文本认知模式", "running");
		const step1Result = await invokeLlm(db, {
			model: model ?? "",
			prompt: buildStep1Prompt(samplesText),
			context: systemContext,
			temperature: 0.3,
		});
		const cognitivePattern =
			tryParseJson<StyleAxisAnalysis[]>(step1Result.content) ?? [];
		emit(1, "分析文本认知模式", "done", { cognitive_pattern: cognitivePattern });

		// Step 2: 话语姿态
		emit(2, "分析话语姿态", "running");
		const step2Result = await invokeLlm(db, {
			model: model ?? "",
			prompt: buildStep2Prompt(
				samplesText,
				JSON.stringify(cognitivePattern, null, 2),
			),
			context: systemContext,
			temperature: 0.3,
		});
		const rhetoricalStance =
			tryParseJson<StyleAxisAnalysis[]>(step2Result.content) ?? [];
		emit(2, "分析话语姿态", "done", { rhetorical_stance: rhetoricalStance });

		// Step 3: 语言审美
		emit(3, "分析语言审美", "running");
		const step3Result = await invokeLlm(db, {
			model: model ?? "",
			prompt: buildStep3Prompt(
				samplesText,
				JSON.stringify(cognitivePattern, null, 2),
				JSON.stringify(rhetoricalStance, null, 2),
			),
			context: systemContext,
			temperature: 0.3,
		});
		const languageAesthetic =
			tryParseJson<StyleAxisAnalysis[]>(step3Result.content) ?? [];
		emit(3, "分析语言审美", "done", { language_aesthetic: languageAesthetic });

		// Step 4: 校准锚点
		emit(4, "生成校准锚点", "running");
		const step4Result = await invokeLlm(db, {
			model: model ?? "",
			prompt: buildStep4Prompt(
				samplesText,
				JSON.stringify(cognitivePattern, null, 2),
				JSON.stringify(rhetoricalStance, null, 2),
				JSON.stringify(languageAesthetic, null, 2),
			),
			context: systemContext,
			temperature: 0.3,
		});
		const calibrationAnchors = tryParseJson<StyleCalibrationAnchors>(
			step4Result.content,
		) ?? { positive: [], negative: [], missing: [] };
		emit(4, "生成校准锚点", "done", {
			calibration_anchors: calibrationAnchors,
		});

		// 写入数据库
		const now = Date.now();
		const analysisId = randomUUID();

		// 查询是否已有分析记录
		const existingRows = await db.client.execute({
			sql: `SELECT id, analysis_version FROM style_analyses WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
			args: [profileId],
		});

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
					JSON.stringify(cognitivePattern),
					JSON.stringify(rhetoricalStance),
					JSON.stringify(languageAesthetic),
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
          VALUES (?, ?, ?, ?, ?, ?, '{}', 1, ?, ?)`,
				args: [
					analysisId,
					profileId,
					JSON.stringify(cognitivePattern),
					JSON.stringify(rhetoricalStance),
					JSON.stringify(languageAesthetic),
					JSON.stringify(calibrationAnchors),
					now,
					now,
				],
			});
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
			total_steps: 4,
			step_name: "分析失败",
			status: "error",
			error: errMsg,
		});
	}
}
