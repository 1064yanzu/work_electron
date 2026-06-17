/**
 * styleProfileInjector.ts — 在 main process 中读取活跃风格包并渲染注入块
 *
 * 供 agentSdk.ts 等主进程模块调用。
 * 渲染逻辑统一走 styleRenderCore（与前端预览用的 rendererV2 共用同一实现，
 * 自动按 schema_version 选择 v1 / v2），避免两套渲染分叉。
 * 若无活跃风格包或渲染结果为空，返回空字符串（不影响原有 prompt）。
 */
import type { DbContext } from "../../../db/client";
import type { StyleIntensity } from "../../../../shared/ipc-schema";
import { loadAndRenderProfile, loadAndRenderRecipe } from "./styleRenderCore";

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
			return await loadAndRenderRecipe(db, recipeId, intensity, {
				typeAttr: true,
			});
		}

		// ── 回退到单一风格包（仅注入 active 状态）──
		const profileId = await readConfigValue(db, ACTIVE_PROFILE_KEY);
		if (!profileId) return "";

		return await loadAndRenderProfile(db, profileId, intensity, {
			requireActive: true,
		});
	} catch {
		// 风格包注入失败不应影响正常对话
		return "";
	}
}
