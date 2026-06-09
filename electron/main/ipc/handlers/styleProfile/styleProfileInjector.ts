/**
 * styleProfileInjector.ts — 在 main process 中读取活跃风格包并渲染注入块
 *
 * 供 agentSdk.ts 等主进程模块调用。
 * 若无活跃风格包或渲染结果为空，返回空字符串（不影响原有 prompt）。
 */
import type { DbContext } from "../../../db/client";
import type { StyleAxisAnalysis, StyleIntensity } from "../../../../shared/ipc-schema";

const ACTIVE_PROFILE_KEY = "active_style_profile_id";
const ACTIVE_INTENSITY_KEY = "active_style_profile_intensity";
const ACTIVE_RECIPE_KEY = "active_style_recipe_id";

async function readConfigValue(
	db: DbContext,
	key: string,
): Promise<string | null> {
	const rows = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ?`,
		args: [key],
	});
	if (rows.rows.length === 0) return null;
	const v = (rows.rows[0] as Record<string, unknown>).value;
	if (typeof v === "string") return v;
	return null;
}

function parseAxes(raw: unknown): StyleAxisAnalysis[] {
	if (!raw) return [];
	try {
		return JSON.parse(raw as string) as StyleAxisAnalysis[];
	} catch {
		return [];
	}
}

function renderAxisBlock(
	label: string,
	axes: StyleAxisAnalysis[],
	intensity: StyleIntensity,
): string {
	// low 强度只渲染 high/medium intensity 维度
	const filtered = intensity === "low"
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

function renderCalibrationAnchors(
	raw: unknown,
	intensity: StyleIntensity,
): string {
	const calibrationAnchors = raw
		? (() => {
				try {
					return JSON.parse(raw as string) as {
						positive: string[];
						negative: string[];
					};
				} catch {
					return { positive: [], negative: [] };
				}
			})()
		: { positive: [], negative: [] };

	if (!calibrationAnchors.positive?.length) return "";

	const positiveItems = calibrationAnchors.positive
		.map((p) => `    <positive>${p}</positive>`)
		.join("\n");
	let anchorsBlock = `  <calibration_anchors>\n${positiveItems}`;
	if (intensity === "high" && calibrationAnchors.negative?.length > 0) {
		const negativeItems = calibrationAnchors.negative
			.map((n) => `    <negative>${n}</negative>`)
			.join("\n");
		anchorsBlock += `\n${negativeItems}`;
	}
	anchorsBlock += `\n  </calibration_anchors>`;
	return anchorsBlock;
}

/**
 * 读取活跃风格包并渲染为 XML 注入块。
 * 优先级：混搭配方 > 单一风格包。
 * 若无活跃配置或尚未完成分析，返回空字符串。
 */
export async function getActiveStylePrompt(db: DbContext): Promise<string> {
	try {
		const intensityRaw = await readConfigValue(db, ACTIVE_INTENSITY_KEY);
		const intensity: StyleIntensity =
			intensityRaw === "low" || intensityRaw === "medium" || intensityRaw === "high"
				? intensityRaw
				: "medium";

		// ── 优先检查混搭配方 ──
		const recipeId = await readConfigValue(db, ACTIVE_RECIPE_KEY);
		if (recipeId) {
			return renderRecipePrompt(db, recipeId, intensity);
		}

		// ── 回退到单一风格包 ──
		const profileId = await readConfigValue(db, ACTIVE_PROFILE_KEY);
		if (!profileId) return "";

		return renderSingleProfilePrompt(db, profileId, intensity);
	} catch {
		// 风格包注入失败不应影响正常对话
		return "";
	}
}

/**
 * 渲染单一风格包的 prompt 注入块
 */
async function renderSingleProfilePrompt(
	db: DbContext,
	profileId: string,
	intensity: StyleIntensity,
): Promise<string> {
	// 获取 profile 名称
	const profileRows = await db.client.execute({
		sql: `SELECT name FROM style_profiles WHERE id = ? AND status = 'active'`,
		args: [profileId],
	});
	if (profileRows.rows.length === 0) return "";
	const profileName = (profileRows.rows[0] as Record<string, unknown>).name as string;

	// 获取最新分析结果
	const analysisRows = await db.client.execute({
		sql: `SELECT cognitive_pattern, rhetorical_stance, language_aesthetic, calibration_anchors
            FROM style_analyses WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
		args: [profileId],
	});
	if (analysisRows.rows.length === 0) return "";

	const ar = analysisRows.rows[0] as Record<string, unknown>;
	const cognitivePattern = parseAxes(ar.cognitive_pattern);
	const rhetoricalStance = parseAxes(ar.rhetorical_stance);
	const languageAesthetic = parseAxes(ar.language_aesthetic);

	const sections: string[] = [];

	const cogBlock = renderAxisBlock("cognitive_pattern", cognitivePattern, intensity);
	if (cogBlock) sections.push(cogBlock);

	const rheBlock = renderAxisBlock("rhetorical_stance", rhetoricalStance, intensity);
	if (rheBlock) sections.push(rheBlock);

	const langBlock = renderAxisBlock("language_aesthetic", languageAesthetic, intensity);
	if (langBlock) sections.push(langBlock);

	const anchorsBlock = renderCalibrationAnchors(ar.calibration_anchors, intensity);
	if (anchorsBlock) sections.push(anchorsBlock);

	if (sections.length === 0) return "";

	const intensityComment: Record<StyleIntensity, string> = {
		low: "direction-only",
		medium: "full-rules",
		high: "full-rules+anchors",
	};

	return `<style_profile name="${profileName}" intensity="${intensity}" mode="${intensityComment[intensity]}">
${sections.join("\n")}
</style_profile>`;
}

/**
 * 渲染混搭配方的 prompt 注入块
 */
async function renderRecipePrompt(
	db: DbContext,
	recipeId: string,
	intensity: StyleIntensity,
): Promise<string> {
	const recipeRows = await db.client.execute({
		sql: `SELECT * FROM style_profile_recipes WHERE id = ?`,
		args: [recipeId],
	});
	if (recipeRows.rows.length === 0) return "";
	const recipe = recipeRows.rows[0] as Record<string, unknown>;
	const recipeName = recipe.name as string;

	const layerConfigs = [
		{
			profileId: recipe.cognitive_profile_id as string | null,
			field: "cognitive_pattern",
			label: "cognitive_pattern",
		},
		{
			profileId: recipe.rhetorical_profile_id as string | null,
			field: "rhetorical_stance",
			label: "rhetorical_stance",
		},
		{
			profileId: recipe.aesthetic_profile_id as string | null,
			field: "language_aesthetic",
			label: "language_aesthetic",
		},
	] as const;

	const sections: string[] = [];

	for (const layer of layerConfigs) {
		if (!layer.profileId) continue;
		const analysisRows = await db.client.execute({
			sql: `SELECT ${layer.field} FROM style_analyses
				WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
			args: [layer.profileId],
		});
		if (analysisRows.rows.length === 0) continue;
		const raw = (analysisRows.rows[0] as Record<string, unknown>)[layer.field];
		const axes = parseAxes(raw);
		const block = renderAxisBlock(layer.label, axes, intensity);
		if (block) sections.push(block);
	}

	// 校准锚点
	const anchorsProfileId = recipe.anchors_profile_id as string | null;
	if (anchorsProfileId) {
		const anchorsRows = await db.client.execute({
			sql: `SELECT calibration_anchors FROM style_analyses
				WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
			args: [anchorsProfileId],
		});
		if (anchorsRows.rows.length > 0) {
			const rawAnchors = (anchorsRows.rows[0] as Record<string, unknown>).calibration_anchors;
			const anchorsBlock = renderCalibrationAnchors(rawAnchors, intensity);
			if (anchorsBlock) sections.push(anchorsBlock);
		}
	}

	if (sections.length === 0) return "";

	const intensityComment: Record<StyleIntensity, string> = {
		low: "direction-only",
		medium: "full-rules",
		high: "full-rules+anchors",
	};

	return `<style_profile name="${recipeName}" type="recipe" intensity="${intensity}" mode="${intensityComment[intensity]}">
${sections.join("\n")}
</style_profile>`;
}

