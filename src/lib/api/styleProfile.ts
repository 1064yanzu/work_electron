/**
 * src/lib/api/styleProfile.ts — 语言风格包前端 API 封装
 */
import type {
	StyleProfile,
	StyleProfileDetail,
	StyleProfileRecipe,
	StyleSample,
	StyleSampleContentType,
	StyleSampleAuthStatus,
	StyleAnalysisData,
	StyleAnalysisProgressEvent,
	StyleFeedback,
	StyleFeedbackType,
	StyleIntensity,
} from "../../../electron/shared/ipc-schema";
import { safeInvoke } from "../tauriBridge";
import { listen } from "../tauriEventCompat";
import type { UnlistenFn } from "../tauriEventCompat";

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function createStyleProfile(input: {
	name: string;
	description?: string;
	language?: string;
	analyze_model_id?: string;
	generation_config?: { default_intensity?: StyleIntensity };
}): Promise<StyleProfile> {
	return safeInvoke("style_profile_create", input);
}

export async function listStyleProfiles(): Promise<StyleProfile[]> {
	return safeInvoke("style_profile_list");
}

export async function getStyleProfile(id: string): Promise<StyleProfileDetail> {
	return safeInvoke("style_profile_get", { id });
}

export async function updateStyleProfile(
	id: string,
	updates: {
		name?: string;
		description?: string;
		language?: string;
		analyze_model_id?: string;
		generation_config?: { default_intensity?: StyleIntensity };
		is_default?: boolean;
	},
): Promise<StyleProfile> {
	return safeInvoke("style_profile_update", { id, ...updates });
}

export async function deleteStyleProfile(id: string): Promise<void> {
	return safeInvoke("style_profile_delete", { id });
}

export async function archiveStyleProfile(
	id: string,
	archived: boolean,
): Promise<StyleProfile> {
	return safeInvoke("style_profile_archive", { id, archived });
}

// ── 样本管理 ─────────────────────────────────────────────────────────────────

export async function addStyleSample(input: {
	profile_id: string;
	title?: string;
	content: string;
	content_type?: StyleSampleContentType;
	authorization_status?: StyleSampleAuthStatus;
}): Promise<StyleSample> {
	return safeInvoke("style_sample_add", input);
}

export async function removeStyleSample(id: string): Promise<void> {
	return safeInvoke("style_sample_remove", { id });
}

export async function listStyleSamples(profileId: string): Promise<StyleSample[]> {
	return safeInvoke("style_sample_list", { profile_id: profileId });
}

export async function parseStyleSampleFile(
	filePath: string,
): Promise<{ title: string; content: string; word_count: number }> {
	return safeInvoke("style_sample_parse_file", { file_path: filePath });
}

export async function importStyleSamplesFromZip(
	profileId: string,
	zipPath: string,
): Promise<{
	imported: number;
	failed: number;
	results: Array<{ file: string; success: boolean; error?: string }>;
}> {
	return safeInvoke("style_sample_import_from_zip", {
		profile_id: profileId,
		zip_path: zipPath,
	});
}

// ── 分析 ─────────────────────────────────────────────────────────────────────

export async function startStyleAnalysis(
	profileId: string,
	modelId?: string,
): Promise<{ job_id: string }> {
	return safeInvoke("style_analysis_start", {
		profile_id: profileId,
		model_id: modelId,
	});
}

export async function getStyleAnalysis(
	profileId: string,
): Promise<StyleAnalysisData | null> {
	return safeInvoke("style_analysis_get", { profile_id: profileId });
}

export async function updateStyleAnalysis(
	profileId: string,
	data: Partial<StyleAnalysisData>,
): Promise<StyleAnalysisData> {
	return safeInvoke("style_analysis_update", { profile_id: profileId, data });
}

/**
 * 订阅分析进度事件。返回取消订阅函数。
 */
export async function onStyleAnalysisProgress(
	handler: (event: StyleAnalysisProgressEvent) => void,
): Promise<UnlistenFn> {
	return listen<StyleAnalysisProgressEvent>(
		"style-analysis-progress",
		(e) => handler(e.payload),
	);
}

// ── 渲染 ─────────────────────────────────────────────────────────────────────

export async function renderStyleProfilePrompt(
	profileId: string,
	intensity?: StyleIntensity,
): Promise<string> {
	const result = await safeInvoke<{ prompt: string }>(
		"style_profile_render_prompt",
		{ profile_id: profileId, intensity },
	);
	return result.prompt;
}

// ── 反馈 ─────────────────────────────────────────────────────────────────────

export async function submitStyleFeedback(input: {
	profile_id: string;
	feedback_type: StyleFeedbackType;
	session_context?: string;
	note?: string;
}): Promise<StyleFeedback> {
	return safeInvoke("style_feedback_submit", input);
}

export async function listStyleFeedback(
	profileId: string,
	limit?: number,
): Promise<StyleFeedback[]> {
	return safeInvoke("style_feedback_list", { profile_id: profileId, limit });
}

// ── 混搭配方（Recipe）──────────────────────────────────────────────────────

export async function createStyleRecipe(input: {
	name: string;
	description?: string;
	cognitive_profile_id?: string | null;
	rhetorical_profile_id?: string | null;
	aesthetic_profile_id?: string | null;
	anchors_profile_id?: string | null;
	intensity?: StyleIntensity;
}): Promise<StyleProfileRecipe> {
	return safeInvoke("style_recipe_create", input);
}

export async function listStyleRecipes(): Promise<StyleProfileRecipe[]> {
	return safeInvoke("style_recipe_list");
}

export async function getStyleRecipe(id: string): Promise<StyleProfileRecipe> {
	return safeInvoke("style_recipe_get", { id });
}

export async function updateStyleRecipe(
	id: string,
	updates: {
		name?: string;
		description?: string;
		cognitive_profile_id?: string | null;
		rhetorical_profile_id?: string | null;
		aesthetic_profile_id?: string | null;
		anchors_profile_id?: string | null;
		intensity?: StyleIntensity;
	},
): Promise<StyleProfileRecipe> {
	return safeInvoke("style_recipe_update", { id, ...updates });
}

export async function deleteStyleRecipe(id: string): Promise<void> {
	return safeInvoke("style_recipe_delete", { id });
}

export async function renderStyleRecipePrompt(
	recipeId: string,
	intensity?: StyleIntensity,
): Promise<string> {
	const result = await safeInvoke<{ prompt: string }>(
		"style_recipe_render_prompt",
		{ recipe_id: recipeId, intensity },
	);
	return result.prompt;
}
