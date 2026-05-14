/**
 * Design 模块前端 API 封装
 *
 * 这层负责把 IPC 调用统一收拢，方便组件直接 await 而不必关心 invoke 命名约定。
 */

import type {
	DesignCritiqueScores,
	DesignDirection,
	DesignExportFormat,
	DesignExportOptions,
	DesignExportTarget,
	DesignLastExport,
	DesignLaunchPayload,
	DesignSession,
	DesignSessionStatus,
	DiscoveryAnswers,
	DiscoveryFormSchema,
	OutputAsset,
} from "../../../electron/shared/types";
import { safeInvoke } from "../tauriBridge";

export type {
	DesignDirection,
	DesignSession,
	DesignSessionStatus,
	DiscoveryAnswers,
	DiscoveryFormSchema,
	DesignExportFormat,
	DesignExportOptions,
	DesignExportTarget,
	DesignLastExport,
	DesignLaunchPayload,
	DesignCritiqueScores,
};

export async function designListDirections(): Promise<DesignDirection[]> {
	return await safeInvoke("design_list_directions", {});
}

export async function designListSessions(input?: {
	limit?: number;
	offset?: number;
}): Promise<DesignSession[]> {
	return await safeInvoke("design_list_sessions", input ?? {});
}

export async function designGetDiscoveryForm(): Promise<DiscoveryFormSchema> {
	return await safeInvoke("design_get_discovery_form", {});
}

export async function designStartSession(input: {
	title?: string;
	initial_brief?: string;
}): Promise<{
	session_id: string;
	work_dir: string;
	discovery_form: DiscoveryFormSchema;
}> {
	return await safeInvoke("design_start_session", input);
}

export async function designSubmitDiscovery(input: {
	session_id: string;
	answers: DiscoveryAnswers;
	direction_id?: string;
	system_id?: string;
	mode?: string;
	skills?: string[];
	model: string;
}): Promise<{ session_id: string; launch_payload: DesignLaunchPayload }> {
	return await safeInvoke("design_submit_discovery", input);
}

export async function designGetSession(sessionId: string): Promise<
	DesignSession & { output_asset?: OutputAsset; files?: string[] }
> {
	return await safeInvoke("design_get_session", { session_id: sessionId });
}

export async function designUpdateSession(input: {
	session_id: string;
	title?: string;
	status?: DesignSessionStatus;
	sdk_session_id?: string | null;
	critique_scores?: DesignCritiqueScores | null;
	brand_spec?: Record<string, unknown> | null;
	last_export?: DesignLastExport | null;
}): Promise<DesignSession> {
	return await safeInvoke("design_update_session", input);
}

export async function designFinalizeSession(input: {
	session_id: string;
	sdk_session_id?: string;
}): Promise<DesignSession & { output_asset?: OutputAsset }> {
	return await safeInvoke("design_finalize_session", input);
}

export async function designDeleteSession(input: {
	session_id: string;
	delete_output?: boolean;
	delete_work_dir?: boolean;
}): Promise<{ success: true }> {
	return await safeInvoke("design_delete_session", input);
}

export async function designRevealWorkDir(
	sessionId: string,
): Promise<{ success: true }> {
	return await safeInvoke("design_reveal_work_dir", { session_id: sessionId });
}

export async function designListExportTargets(input?: {
	current_thread_id?: string;
	current_thread_title?: string;
	current_thread_path?: string;
	recent_threads?: Array<{ id: string; title: string; path: string }>;
	recent_folders?: Array<{ path: string; label: string }>;
}): Promise<{
	current_thread?: { id: string; title: string; path: string };
	recent_threads: Array<{ id: string; title: string; path: string }>;
	recent_folders: Array<{ path: string; label: string }>;
}> {
	return await safeInvoke("design_list_export_targets", input ?? {});
}

export async function designExport(input: {
	session_id: string;
	format: DesignExportFormat;
	target: DesignExportTarget;
	options?: DesignExportOptions;
}): Promise<{ paths: string[]; target_kind: string; target_label: string }> {
	return await safeInvoke("design_export", input);
}

export async function designFinishToThread(input: {
	session_id: string;
	thread_id?: string;
	thread_path?: string;
	subfolder_name?: string;
}): Promise<{ thread_path: string; copied_to: string }> {
	return await safeInvoke("design_finish_to_thread", input);
}

export async function designListSystems(): Promise<
	Array<{
		id: string;
		title: string;
		category: string;
		group: "product" | "style";
		summary: string;
		swatches: string[];
		source?: string;
		license?: string;
	}>
> {
	return await safeInvoke("design_list_systems", {});
}

export async function designGetSystemThumbnail(
	systemId: string,
): Promise<{ path: string; ready: boolean; mtime_ms?: number }> {
	return await safeInvoke("design_get_system_thumbnail", { system_id: systemId });
}

export async function designGetDoc(input: {
	kind: "system" | "skill";
	id: string;
}): Promise<{ title?: string; content: string } | null> {
	return await safeInvoke("design_get_doc", input);
}

export interface DesignWorkDirEntry {
	path: string;
	relative: string;
	name: string;
	size: number;
	mtime_ms: number;
	is_dir: boolean;
}

export async function designListWorkDirFiles(
	sessionId: string,
): Promise<DesignWorkDirEntry[]> {
	return await safeInvoke("design_list_work_dir_files", {
		session_id: sessionId,
	});
}

export interface DesignWorkDirFile {
	relative_path: string;
	size: number;
	mtime_ms: number;
	mode: "text" | "binary";
	content?: string;
	base64?: string;
	mime?: string;
}

export async function designReadWorkDirFile(input: {
	session_id: string;
	relative_path: string;
	mode?: "text" | "binary";
}): Promise<DesignWorkDirFile> {
	return await safeInvoke("design_read_work_dir_file", input);
}

export async function designRunCritique(input: {
	session_id: string;
	model?: string;
	gate_mode?: boolean;
}): Promise<{
	scores: {
		philosophy: number;
		hierarchy: number;
		execution: number;
		functional: number;
		innovation: number;
	};
	total: number;
	notes: string;
	fixes: string[];
	passed?: boolean;
	lowest_dim?: string;
	lowest_score?: number;
	regenerate_reason?: string;
}> {
	return await safeInvoke("design_run_critique", input);
}

export async function designListBuiltinSkills(): Promise<
	Array<{
		name: string;
		description: string;
		version: string;
		triggers: string[];
		group?: string;
		default_frame?: string;
		tweaks?: Array<{
			name: string;
			type: "select" | "number";
			values?: string[];
			min?: number;
			max?: number;
			step?: number;
			default?: string | number;
		}>;
	}>
> {
	return await safeInvoke("design_list_builtin_skills", {});
}

export async function designGetSkillResourceMap(skillId: string): Promise<{
	id: string;
	skill_md: string;
	template_html?: string;
	checklist_md?: string;
	layouts_md?: string;
	components_md?: string;
	themes_md?: string;
	example_html?: string;
	frontmatter: {
		name: string;
		description: string;
		version: string;
		triggers: string[];
		group?: string;
		default_frame?: string;
		tweaks?: Array<{
			name: string;
			type: "select" | "number";
			values?: string[];
			min?: number;
			max?: number;
			step?: number;
			default?: string | number;
		}>;
	};
} | null> {
	return await safeInvoke("design_get_skill_resource_map", { skill_id: skillId });
}

export async function designGetTemplate(templateId: string): Promise<{
	html: string;
	placeholders: string[];
}> {
	return await safeInvoke("design_get_template", { template_id: templateId });
}

export async function designExtractBrand(input: {
	session_id: string;
	url: string;
}): Promise<{
	brand_spec_path: string;
	site_name?: string;
	colors: string[];
	fonts: string[];
	logo_url?: string;
	favicon_url?: string;
}> {
	return await safeInvoke("design_extract_brand", input);
}

export async function designApplyTweak(input: {
	session_id: string;
	run_id: string;
	tweak_name: string;
	tweak_value: string | number;
}): Promise<{ success: boolean; error?: string }> {
	return await safeInvoke("design_apply_tweak", input);
}

export async function designApplyAnnotation(input: {
	session_id: string;
	run_id: string;
	selector: string;
	note: string;
}): Promise<{ success: boolean; error?: string }> {
	return await safeInvoke("design_apply_annotation", input);
}

export interface DesignMediaProvider {
	id: string;
	label: string;
	kinds: Array<"image" | "video" | "audio" | "music">;
	requires_key: boolean;
}

export async function designMediaProviders(): Promise<DesignMediaProvider[]> {
	return await safeInvoke("design_media_providers", {});
}

export async function designMediaGenerate(input: {
	session_id: string;
	provider: string;
	kind: "image" | "video" | "audio" | "music";
	prompt: string;
	options?: Record<string, unknown>;
}): Promise<{
	job_id: string;
	status: "queued" | "running" | "done" | "failed";
	asset_paths?: string[];
	error?: string;
}> {
	return await safeInvoke("design_media_generate", input);
}

export async function designMediaHistory(input?: {
	session_id?: string;
	limit?: number;
}): Promise<
	Array<{
		id: string;
		session_id?: string;
		provider: string;
		kind: string;
		prompt: string;
		status: string;
		asset_paths: string[];
		created_at: number;
	}>
> {
	return await safeInvoke("design_media_history", input ?? {});
}
