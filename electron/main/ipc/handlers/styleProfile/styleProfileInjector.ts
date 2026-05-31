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

/**
 * 读取活跃风格包并渲染为 XML 注入块。
 * 若无活跃风格包或尚未完成分析，返回空字符串。
 */
export async function getActiveStylePrompt(db: DbContext): Promise<string> {
	try {
		const profileId = await readConfigValue(db, ACTIVE_PROFILE_KEY);
		if (!profileId) return "";

		const intensityRaw = await readConfigValue(db, ACTIVE_INTENSITY_KEY);
		const intensity: StyleIntensity =
			intensityRaw === "low" || intensityRaw === "medium" || intensityRaw === "high"
				? intensityRaw
				: "medium";

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
		const calibrationAnchors = ar.calibration_anchors
			? (() => {
					try {
						return JSON.parse(ar.calibration_anchors as string) as {
							positive: string[];
							negative: string[];
						};
					} catch {
						return { positive: [], negative: [] };
					}
				})()
			: { positive: [], negative: [] };

		const sections: string[] = [];

		const cogBlock = renderAxisBlock("cognitive_pattern", cognitivePattern, intensity);
		if (cogBlock) sections.push(cogBlock);

		const rheBlock = renderAxisBlock("rhetorical_stance", rhetoricalStance, intensity);
		if (rheBlock) sections.push(rheBlock);

		const langBlock = renderAxisBlock("language_aesthetic", languageAesthetic, intensity);
		if (langBlock) sections.push(langBlock);

		if (calibrationAnchors.positive?.length > 0) {
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
			sections.push(anchorsBlock);
		}

		if (sections.length === 0) return "";

		const intensityComment: Record<StyleIntensity, string> = {
			low: "direction-only",
			medium: "full-rules",
			high: "full-rules+anchors",
		};

		return `<style_profile name="${profileName}" intensity="${intensity}" mode="${intensityComment[intensity]}">
${sections.join("\n")}
</style_profile>`;
	} catch {
		// 风格包注入失败不应影响正常对话
		return "";
	}
}
