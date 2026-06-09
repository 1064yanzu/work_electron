/**
 * styleProfile/renderer.ts — 将风格包分析结果渲染为 system prompt XML 注入块
 *
 * 渲染后的块可直接追加到对话 system prompt 末尾或 Agent SDK 的上下文数组中。
 * 强度控制：low（仅方向性提示）/ medium（完整规则）/ high（完整规则 + 负面锚点）
 */
import type { IpcMainInvokeEvent } from "electron";
import type {
	IPCSchema,
	StyleIntensity,
	StyleAxisAnalysis,
} from "../../../../shared/ipc-schema";
import type { DbContext } from "../../../db/client";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

function renderAxisBlock(
	label: string,
	axes: StyleAxisAnalysis[],
	intensity: StyleIntensity,
): string {
	if (!axes || axes.length === 0) return "";

	const filtered =
		intensity === "low"
			? axes.filter(
					(a) => a.intensity === "high" || a.intensity === "medium",
				)
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

function parseAxes(raw: unknown): StyleAxisAnalysis[] {
	if (!raw) return [];
	try {
		return JSON.parse(raw as string) as StyleAxisAnalysis[];
	} catch {
		return [];
	}
}

export function createStyleRendererHandlers(db: DbContext) {
	const renderPrompt: Handler<"style_profile_render_prompt"> = async (
		_event,
		input,
	) => {
		const { profile_id, intensity = "medium" } = input;

		// 获取 profile 信息
		const profileRows = await db.client.execute({
			sql: `SELECT name FROM style_profiles WHERE id = ?`,
			args: [profile_id],
		});
		if (profileRows.rows.length === 0) {
			return { prompt: "" };
		}
		const profileName = (profileRows.rows[0] as Record<string, unknown>).name as string;

		// 获取最新分析结果
		const analysisRows = await db.client.execute({
			sql: `SELECT cognitive_pattern, rhetorical_stance, language_aesthetic, calibration_anchors
            FROM style_analyses WHERE profile_id = ? ORDER BY analysis_version DESC LIMIT 1`,
			args: [profile_id],
		});
		if (analysisRows.rows.length === 0) {
			return { prompt: "" };
		}

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
		const taskAdaptationRules = ar.task_adaptation_rules
			? (() => {
					try {
						return JSON.parse(ar.task_adaptation_rules as string) as Record<string, string>;
					} catch {
						return {};
					}
				})()
			: {};

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

		// 任务适配规则（仅 high 强度）
		if (intensity === "high") {
			const ruleEntries = Object.entries(taskAdaptationRules);
			if (ruleEntries.length > 0) {
				const ruleItems = ruleEntries
					.map(([k, v]) => `    <rule task="${k}">${v}</rule>`)
					.join("\n");
				sections.push(`  <task_adaptation>\n${ruleItems}\n  </task_adaptation>`);
			}
		}

		if (sections.length === 0) return { prompt: "" };

		const intensityComment: Record<StyleIntensity, string> = {
			low: "direction-only",
			medium: "full-rules",
			high: "full-rules+anchors",
		};

		const prompt = `<style_profile name="${profileName}" intensity="${intensity}" mode="${intensityComment[intensity]}">
${sections.join("\n")}
</style_profile>`;

		return { prompt };
	};

	const renderRecipePrompt: Handler<"style_recipe_render_prompt"> = async (
		_event,
		input,
	) => {
		const { recipe_id, intensity: overrideIntensity } = input;

		// 获取配方信息
		const recipeRows = await db.client.execute({
			sql: `SELECT * FROM style_profile_recipes WHERE id = ?`,
			args: [recipe_id],
		});
		if (recipeRows.rows.length === 0) {
			return { prompt: "" };
		}
		const recipe = recipeRows.rows[0] as Record<string, unknown>;
		const recipeName = recipe.name as string;
		const intensity: StyleIntensity =
			overrideIntensity ??
			((recipe.intensity as StyleIntensity) || "medium");

		// 从各来源 profile 获取对应层级的分析数据
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
			const raw = (analysisRows.rows[0] as Record<string, unknown>)[
				layer.field
			];
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
				const rawAnchors = (
					anchorsRows.rows[0] as Record<string, unknown>
				).calibration_anchors;
				const calibrationAnchors = rawAnchors
					? (() => {
							try {
								return JSON.parse(rawAnchors as string) as {
									positive: string[];
									negative: string[];
								};
							} catch {
								return { positive: [], negative: [] };
							}
						})()
					: { positive: [], negative: [] };

				if (calibrationAnchors.positive?.length > 0) {
					const positiveItems = calibrationAnchors.positive
						.map((p) => `    <positive>${p}</positive>`)
						.join("\n");
					let anchorsBlock = `  <calibration_anchors>\n${positiveItems}`;
					if (
						intensity === "high" &&
						calibrationAnchors.negative?.length > 0
					) {
						const negativeItems = calibrationAnchors.negative
							.map((n) => `    <negative>${n}</negative>`)
							.join("\n");
						anchorsBlock += `\n${negativeItems}`;
					}
					anchorsBlock += `\n  </calibration_anchors>`;
					sections.push(anchorsBlock);
				}
			}
		}

		if (sections.length === 0) return { prompt: "" };

		const intensityComment: Record<StyleIntensity, string> = {
			low: "direction-only",
			medium: "full-rules",
			high: "full-rules+anchors",
		};

		const prompt = `<style_profile name="${recipeName}" type="recipe" intensity="${intensity}" mode="${intensityComment[intensity]}">
${sections.join("\n")}
</style_profile>`;

		return { prompt };
	};

	return {
		style_profile_render_prompt: renderPrompt,
		style_recipe_render_prompt: renderRecipePrompt,
	};
}
