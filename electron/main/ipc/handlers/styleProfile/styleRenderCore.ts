/**
 * styleProfile/styleRenderCore.ts — 风格包渲染核心（单一事实源）
 *
 * 把「分析结果 → 注入用 XML 块」的渲染逻辑集中到这里，供两处复用：
 *   1. rendererV2.ts 的 IPC handler（前端预览用）
 *   2. styleProfileInjector.ts 的 getActiveStylePrompt（实际注入对话用）
 *
 * 历史教训：曾经 injector 与 rendererV2 各写一套渲染，导致 v2 升级只改了
 * rendererV2、漏了 injector，v2 风格包注入对话时输出空字符串。此模块即为消除
 * 该分叉而设。任何渲染规则的变更只改这里。
 */
import type {
	StyleIntensity,
	StyleAxisAnalysis,
	SoulLayerAnalysis,
	ThinkingOperationAnalysis,
	ArticulationPatternAnalysis,
	TextureLayerAnalysis,
	CrossCuttingTopics,
	StyleCalibrationAnchors,
} from "../../../../shared/ipc-schema";
import type { DbContext } from "../../../db/client";

/** v2 渲染所需的分析数据形状 */
export interface V2RenderAnalysis {
	soul_layer?: SoulLayerAnalysis;
	thinking_operation?: ThinkingOperationAnalysis;
	articulation_pattern?: ArticulationPatternAnalysis;
	texture_layer?: TextureLayerAnalysis;
	cross_cutting?: CrossCuttingTopics;
	calibration_anchors: StyleCalibrationAnchors;
}

/** v1 渲染所需的分析数据形状（向后兼容） */
export interface V1RenderAnalysis {
	cognitive_pattern?: StyleAxisAnalysis[];
	rhetorical_stance?: StyleAxisAnalysis[];
	language_aesthetic?: StyleAxisAnalysis[];
	calibration_anchors: StyleCalibrationAnchors;
}

const EMPTY_ANCHORS: StyleCalibrationAnchors = {
	positive: [],
	negative: [],
	missing: [],
};

function safeParse<T>(raw: unknown, fallback: T): T {
	if (!raw) return fallback;
	try {
		return JSON.parse(raw as string) as T;
	} catch {
		return fallback;
	}
}

// ============================================================================
// 纯渲染 - v2「灵魂-骨干-血肉」体系
// ============================================================================

function renderLayerSection(
	label: string,
	layerData: Record<string, StyleAxisAnalysis[]> | undefined,
	intensity: StyleIntensity,
): string {
	if (!layerData) return "";

	const sections: string[] = [];
	for (const [key, axes] of Object.entries(layerData)) {
		if (!axes || axes.length === 0) continue;

		const filtered =
			intensity === "low"
				? axes.filter((a) => a.intensity === "high" || a.intensity === "medium")
				: axes;
		if (filtered.length === 0) continue;

		const items = filtered
			.map((a) => {
				let item = `      <axis name="${a.name}" intensity="${a.intensity}">`;
				item += a.description;
				if (a.conditions) item += ` (条件: ${a.conditions})`;
				if (a.constancy)
					item += ` [${a.constancy === "constant" ? "经" : "变"}]`;
				if (a.variance_note && a.constancy === "variable")
					item += ` (${a.variance_note})`;
				item += `</axis>`;
				return item;
			})
			.join("\n");

		sections.push(`    <${key}>\n${items}\n    </${key}>`);
	}

	if (sections.length === 0) return "";
	return `  <${label}>\n${sections.join("\n")}\n  </${label}>`;
}

function renderCrossCuttingSection(
	crossCutting: CrossCuttingTopics | undefined,
): string {
	if (!crossCutting) return "";

	const sections: string[] = [];

	if (crossCutting.recurring_imagery) {
		sections.push(`    <recurring_imagery>
      <soul>${crossCutting.recurring_imagery.soul}</soul>
      <structure>${crossCutting.recurring_imagery.structure}</structure>
      <texture>${crossCutting.recurring_imagery.texture}</texture>
    </recurring_imagery>`);
	}

	if (crossCutting.humor_irony) {
		sections.push(`    <humor_irony>
      <soul>${crossCutting.humor_irony.soul}</soul>
      <structure>${crossCutting.humor_irony.structure}</structure>
      <texture>${crossCutting.humor_irony.texture}</texture>
    </humor_irony>`);
	}

	if (crossCutting.title_habit) {
		sections.push(`    <title_habit>
      <structure>${crossCutting.title_habit.structure}</structure>
      <texture>${crossCutting.title_habit.texture}</texture>
    </title_habit>`);
	}

	if (crossCutting.meta_commentary) {
		sections.push(`    <meta_commentary>
      <soul>${crossCutting.meta_commentary.soul}</soul>
      <structure>${crossCutting.meta_commentary.structure}</structure>
      <texture>${crossCutting.meta_commentary.texture}</texture>
    </meta_commentary>`);
	}

	if (sections.length === 0) return "";
	return `  <cross_cutting>\n${sections.join("\n")}\n  </cross_cutting>`;
}

function renderCalibrationAnchors(
	anchors: StyleCalibrationAnchors,
	intensity: StyleIntensity,
): string {
	const sections: string[] = [];

	// 正向 / 负向锚点
	if (anchors.positive?.length > 0) {
		const items = anchors.positive
			.map((p) => `      <positive>${p}</positive>`)
			.join("\n");
		const block = [`    <anchors>\n${items}`];
		// 负向锚点（仅 high 强度）
		if (intensity === "high" && anchors.negative?.length > 0) {
			block.push(
				anchors.negative
					.map((n) => `      <negative>${n}</negative>`)
					.join("\n"),
			);
		}
		block.push(`    </anchors>`);
		sections.push(block.join("\n"));
	}

	// 关系性维度 - 气韵
	if (anchors.layer_harmony?.description) {
		sections.push(
			`    <layer_harmony>${anchors.layer_harmony.description}</layer_harmony>`,
		);
	}

	// 关系性维度 - 全息性
	if (anchors.holographic_patterns && anchors.holographic_patterns.length > 0) {
		const patterns = anchors.holographic_patterns
			.map((p) => {
				let item = `      <pattern name="${p.name}">\n        <description>${p.description}</description>`;
				if (p.sentence_level)
					item += `\n        <sentence_level>${p.sentence_level}</sentence_level>`;
				if (p.paragraph_level)
					item += `\n        <paragraph_level>${p.paragraph_level}</paragraph_level>`;
				if (p.article_level)
					item += `\n        <article_level>${p.article_level}</article_level>`;
				item += `\n      </pattern>`;
				return item;
			})
			.join("\n");
		sections.push(
			`    <holographic_patterns>\n${patterns}\n    </holographic_patterns>`,
		);
	}

	// 关系性维度 - 经变分布（summary + 经/变明细）
	const cv = anchors.constancy_variance;
	if (cv) {
		const inner: string[] = [];
		if (cv.summary) inner.push(`      <summary>${cv.summary}</summary>`);
		if (cv.constants?.length > 0) {
			const constItems = cv.constants
				.map((c) => `        <constant>${c}</constant>`)
				.join("\n");
			inner.push(`      <constants>\n${constItems}\n      </constants>`);
		}
		if (cv.variables?.length > 0) {
			const varItems = cv.variables
				.map(
					(v) =>
						`        <variable dimension="${v.dimension}">${v.range}</variable>`,
				)
				.join("\n");
			inner.push(`      <variables>\n${varItems}\n      </variables>`);
		}
		if (inner.length > 0) {
			sections.push(
				`    <constancy_variance>\n${inner.join("\n")}\n    </constancy_variance>`,
			);
		}
	}

	if (sections.length === 0) return "";
	return `  <calibration>\n${sections.join("\n")}\n  </calibration>`;
}

/** 渲染 v2 风格块（灵魂/骨干/血肉/横切/关系性） */
export function renderV2Prompt(
	profileName: string,
	analysis: V2RenderAnalysis,
	intensity: StyleIntensity,
): string {
	const sections: string[] = [];

	const soulBlock = renderLayerSection(
		"soul_layer",
		analysis.soul_layer as unknown as Record<string, StyleAxisAnalysis[]>,
		intensity,
	);
	if (soulBlock) sections.push(soulBlock);

	const thinkingBlock = renderLayerSection(
		"thinking_operation",
		analysis.thinking_operation as unknown as Record<
			string,
			StyleAxisAnalysis[]
		>,
		intensity,
	);
	if (thinkingBlock) sections.push(thinkingBlock);

	const articulationBlock = renderLayerSection(
		"articulation_pattern",
		analysis.articulation_pattern as unknown as Record<
			string,
			StyleAxisAnalysis[]
		>,
		intensity,
	);
	if (articulationBlock) sections.push(articulationBlock);

	const textureBlock = renderLayerSection(
		"texture_layer",
		analysis.texture_layer as unknown as Record<string, StyleAxisAnalysis[]>,
		intensity,
	);
	if (textureBlock) sections.push(textureBlock);

	const crossCuttingBlock = renderCrossCuttingSection(analysis.cross_cutting);
	if (crossCuttingBlock) sections.push(crossCuttingBlock);

	const calibrationBlock = renderCalibrationAnchors(
		analysis.calibration_anchors ?? EMPTY_ANCHORS,
		intensity,
	);
	if (calibrationBlock) sections.push(calibrationBlock);

	if (sections.length === 0) return "";

	const intensityComment: Record<StyleIntensity, string> = {
		low: "direction-only",
		medium: "full-rules",
		high: "full-rules+anchors+relational",
	};

	return `<style_profile name="${profileName}" schema="v2" intensity="${intensity}" mode="${intensityComment[intensity]}">
${sections.join("\n")}
</style_profile>`;
}

// ============================================================================
// 纯渲染 - v1（向后兼容）
// ============================================================================

function renderAxisBlock(
	label: string,
	axes: StyleAxisAnalysis[],
	intensity: StyleIntensity,
): string {
	if (!axes || axes.length === 0) return "";

	const filtered =
		intensity === "low"
			? axes.filter((a) => a.intensity === "high" || a.intensity === "medium")
			: axes;
	if (filtered.length === 0) return "";

	const items = filtered
		.map(
			(a) =>
				`    <axis name="${a.name}" intensity="${a.intensity}">${a.description}</axis>`,
		)
		.join("\n");

	return `  <${label}>\n${items}\n  </${label}>`;
}

/** 渲染 v1 风格块（认知/话语/审美） */
export function renderV1Prompt(
	profileName: string,
	analysis: V1RenderAnalysis,
	intensity: StyleIntensity,
	opts?: { type?: string },
): string {
	const sections: string[] = [];

	const cogBlock = renderAxisBlock(
		"cognitive_pattern",
		analysis.cognitive_pattern ?? [],
		intensity,
	);
	if (cogBlock) sections.push(cogBlock);

	const rheBlock = renderAxisBlock(
		"rhetorical_stance",
		analysis.rhetorical_stance ?? [],
		intensity,
	);
	if (rheBlock) sections.push(rheBlock);

	const langBlock = renderAxisBlock(
		"language_aesthetic",
		analysis.language_aesthetic ?? [],
		intensity,
	);
	if (langBlock) sections.push(langBlock);

	const anchors = analysis.calibration_anchors ?? EMPTY_ANCHORS;
	if (anchors.positive?.length > 0) {
		const positiveItems = anchors.positive
			.map((p) => `    <positive>${p}</positive>`)
			.join("\n");
		let anchorsBlock = `  <calibration_anchors>\n${positiveItems}`;
		if (intensity === "high" && anchors.negative?.length > 0) {
			const negativeItems = anchors.negative
				.map((n) => `    <negative>${n}</negative>`)
				.join("\n");
			anchorsBlock += `\n${negativeItems}`;
		}
		anchorsBlock += `\n  </calibration_anchors>`;
		sections.push(anchorsBlock);
	}

	if (sections.length === 0) return "";

	const intensityComment: Record<StyleIntensity, string> = {
		low: "direction-only",
		medium: "full-rules",
		high: "full-rules+anchors",
	};

	const typeAttr = opts?.type ? ` type="${opts.type}"` : "";
	return `<style_profile name="${profileName}"${typeAttr} schema="v1" intensity="${intensity}" mode="${intensityComment[intensity]}">
${sections.join("\n")}
</style_profile>`;
}

// ============================================================================
// 读库 + 渲染（供 IPC handler 与 injector 共用）
// ============================================================================

/**
 * 读取单个风格包的最新分析结果并渲染为注入块。
 * @param requireActive 为 true 时仅渲染 status='active' 的风格包（注入路径用）
 */
export async function loadAndRenderProfile(
	db: DbContext,
	profileId: string,
	intensity: StyleIntensity,
	opts?: { requireActive?: boolean },
): Promise<string> {
	const requireActive = opts?.requireActive ?? false;
	const profileRows = await db.client.execute({
		sql: requireActive
			? `SELECT name FROM style_profiles WHERE id = ? AND status = 'active'`
			: `SELECT name FROM style_profiles WHERE id = ?`,
		args: [profileId],
	});
	if (profileRows.rows.length === 0) return "";
	const profileName = (profileRows.rows[0] as Record<string, unknown>)
		.name as string;

	const analysisRows = await db.client.execute({
		sql: `SELECT * FROM style_analyses WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
		args: [profileId],
	});
	if (analysisRows.rows.length === 0) return "";

	const ar = analysisRows.rows[0] as Record<string, unknown>;
	const schemaVersion = (ar.schema_version as string) || "v1";

	if (schemaVersion === "v2") {
		return renderV2Prompt(
			profileName,
			{
				soul_layer: safeParse(ar.soul_layer, undefined),
				thinking_operation: safeParse(ar.thinking_operation, undefined),
				articulation_pattern: safeParse(ar.articulation_pattern, undefined),
				texture_layer: safeParse(ar.texture_layer, undefined),
				cross_cutting: safeParse(ar.cross_cutting, undefined),
				calibration_anchors: safeParse(ar.calibration_anchors, EMPTY_ANCHORS),
			},
			intensity,
		);
	}

	return renderV1Prompt(
		profileName,
		{
			cognitive_pattern: safeParse(ar.cognitive_pattern, []),
			rhetorical_stance: safeParse(ar.rhetorical_stance, []),
			language_aesthetic: safeParse(ar.language_aesthetic, []),
			calibration_anchors: safeParse(ar.calibration_anchors, EMPTY_ANCHORS),
		},
		intensity,
	);
}

/** 读取某 profile 最新分析的单个层字段（JSON 解析后返回） */
async function readLayerField<T>(
	db: DbContext,
	profileId: string,
	field: string,
): Promise<T | undefined> {
	const rows = await db.client.execute({
		sql: `SELECT ${field} FROM style_analyses WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
		args: [profileId],
	});
	if (rows.rows.length === 0) return undefined;
	const raw = (rows.rows[0] as Record<string, unknown>)[field];
	return safeParse<T | undefined>(raw, undefined);
}

/**
 * 读取混搭配方并渲染为注入块。
 * 通过 soul_profile_id 是否存在判定 v2 / v1。
 */
export async function loadAndRenderRecipe(
	db: DbContext,
	recipeId: string,
	overrideIntensity?: StyleIntensity,
	opts?: { typeAttr?: boolean },
): Promise<string> {
	const recipeRows = await db.client.execute({
		sql: `SELECT * FROM style_profile_recipes WHERE id = ?`,
		args: [recipeId],
	});
	if (recipeRows.rows.length === 0) return "";
	const recipe = recipeRows.rows[0] as Record<string, unknown>;
	const recipeName = recipe.name as string;
	const intensity: StyleIntensity =
		overrideIntensity ?? ((recipe.intensity as StyleIntensity) || "medium");
	const isV2 = !!recipe.soul_profile_id;

	if (isV2) {
		const analysis: V2RenderAnalysis = {
			calibration_anchors: { ...EMPTY_ANCHORS },
		};

		const layerConfigs: Array<{
			profileId: string | null;
			field: keyof V2RenderAnalysis;
		}> = [
			{
				profileId: recipe.soul_profile_id as string | null,
				field: "soul_layer",
			},
			{
				profileId: recipe.thinking_profile_id as string | null,
				field: "thinking_operation",
			},
			{
				profileId: recipe.articulation_profile_id as string | null,
				field: "articulation_pattern",
			},
			{
				profileId: recipe.texture_profile_id as string | null,
				field: "texture_layer",
			},
		];

		for (const layer of layerConfigs) {
			if (!layer.profileId) continue;
			const value = await readLayerField(db, layer.profileId, layer.field);
			if (value) {
				// @ts-expect-error 动态 field 赋值，运行期与类型对应
				analysis[layer.field] = value;
			}
		}

		// 关系性层：同时承载校准锚点（含气韵/全息/经变）与横切话题
		const relationalProfileId = recipe.relational_profile_id as string | null;
		if (relationalProfileId) {
			const anchors = await readLayerField<StyleCalibrationAnchors>(
				db,
				relationalProfileId,
				"calibration_anchors",
			);
			if (anchors) analysis.calibration_anchors = anchors;
			const crossCutting = await readLayerField<CrossCuttingTopics>(
				db,
				relationalProfileId,
				"cross_cutting",
			);
			if (crossCutting) analysis.cross_cutting = crossCutting;
		}

		return renderV2Prompt(recipeName, analysis, intensity);
	}

	// v1 配方
	const analysis: V1RenderAnalysis = {
		calibration_anchors: { ...EMPTY_ANCHORS },
	};
	const layerConfigs: Array<{
		profileId: string | null;
		field: keyof V1RenderAnalysis;
	}> = [
		{
			profileId: recipe.cognitive_profile_id as string | null,
			field: "cognitive_pattern",
		},
		{
			profileId: recipe.rhetorical_profile_id as string | null,
			field: "rhetorical_stance",
		},
		{
			profileId: recipe.aesthetic_profile_id as string | null,
			field: "language_aesthetic",
		},
	];

	for (const layer of layerConfigs) {
		if (!layer.profileId) continue;
		const value = await readLayerField<StyleAxisAnalysis[]>(
			db,
			layer.profileId,
			layer.field,
		);
		if (value) {
			// @ts-expect-error 动态 field 赋值，运行期与类型对应
			analysis[layer.field] = value;
		}
	}

	const anchorsProfileId = recipe.anchors_profile_id as string | null;
	if (anchorsProfileId) {
		const anchors = await readLayerField<StyleCalibrationAnchors>(
			db,
			anchorsProfileId,
			"calibration_anchors",
		);
		if (anchors) analysis.calibration_anchors = anchors;
	}

	return renderV1Prompt(recipeName, analysis, intensity, {
		type: opts?.typeAttr ? "recipe" : undefined,
	});
}
