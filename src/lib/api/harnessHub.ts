/**
 * AI Harness Hub 前端 API 封装。
 *
 * 后端契约见 docs/api/harness-hub.md；命令实现在
 * electron/main/ipc/handlers/harnessHub.ts。
 */
import type {
	AiHubSiteRow,
	BrowserCookieSourceRow,
	HarnessDetectionRow,
	HarnessHandoffPackage,
	HarnessHandoffRow,
	HarnessMessageRow,
	HarnessSearchHit,
	HarnessSessionRow,
	HarnessUsageRow,
} from "../../../electron/shared/ipc-schema";
import { safeInvoke } from "../tauriBridge";

export type {
	AiHubSiteRow,
	BrowserCookieSourceRow,
	HarnessDetectionRow,
	HarnessHandoffPackage,
	HarnessHandoffRow,
	HarnessMessageRow,
	HarnessSearchHit,
	HarnessSessionRow,
	HarnessUsageRow,
};

// ==================
// 提取层
// ==================

/** 探测本机已安装的 AI CLI 及其能力。 */
export async function detectHarnesses(): Promise<HarnessDetectionRow[]> {
	const r = await safeInvoke<{ harnesses: HarnessDetectionRow[] }>(
		"harness_detect",
		{},
	);
	return r.harnesses;
}

/**
 * 跨入口用量统计。
 *
 * 返回值里的 `token_basis` / `partial_coverage` 必须在 UI 上如实标注——
 * token 是估算，Web 入口只覆盖用户主动导入过的会话。
 */
export async function getHarnessUsageStats(): Promise<{
	harnesses: HarnessUsageRow[];
	daily: { date: string; messages: number }[];
	generated_at: number;
}> {
	return await safeInvoke("harness_usage_stats", {});
}

/** 列出已摄取的会话。 */ export async function listHarnessSessions(options?: {
	harness?: string;
	cwd?: string;
	limit?: number;
	offset?: number;
}): Promise<{ sessions: HarnessSessionRow[]; total: number }> {
	return await safeInvoke("harness_sessions_list", { ...(options ?? {}) });
}

/** 取单个会话的完整转录。 */
export async function getHarnessSession(
	sessionId: string,
	options?: { limit?: number; offset?: number },
): Promise<{
	session: HarnessSessionRow | null;
	messages: HarnessMessageRow[];
}> {
	return await safeInvoke("harness_session_get", {
		session_id: sessionId,
		...(options ?? {}),
	});
}

/** 全文检索会话消息（FTS5 trigram，支持中文子串）。 */
export async function searchHarnessSessions(
	query: string,
	options?: { harness?: string; limit?: number },
): Promise<HarnessSearchHit[]> {
	const r = await safeInvoke<{ hits: HarnessSearchHit[] }>(
		"harness_sessions_search",
		{ query, ...(options ?? {}) },
	);
	return r.hits;
}

/** 触发一次全量扫描摄取（进度走 harness-ingest-progress 事件）。 */
export async function scanHarnessSessions(options?: {
	include_ipo_sdk?: boolean;
}): Promise<{ updated: number; scanned: number; skipped_lines: number }> {
	return await safeInvoke("harness_ingest_scan", { ...(options ?? {}) });
}

/** 删除一个已摄取的会话（仅删本地记录，不动原始 JSONL）。 */
export async function deleteHarnessSession(
	sessionId: string,
): Promise<boolean> {
	const r = await safeInvoke<{ success: boolean }>("harness_session_delete", {
		session_id: sessionId,
	});
	return r.success;
}

// ==================
// 蒸馏 + 迁移
// ==================

/**
 * 生成 HANDOFF 交接包（进度走 harness-handoff-event 事件）。
 *
 * 返回值里的 `mode` / `reason` 必须展示给用户：
 * native/raw 是无损的，distill 是 LLM 压缩过的，两者可信度不同，
 * 把它们显示成同一个「交接包」会误导人。
 */
export async function createHandoff(input: {
	session_id: string;
	target_harness: string;
	model?: string;
	mode?: "auto" | "native" | "raw" | "distill";
}): Promise<{
	handoff_id: string;
	package: HarnessHandoffPackage;
	mode: "native" | "raw" | "distill";
	reason: string;
	resume_command: string | null;
}> {
	return await safeInvoke("harness_handoff_create", input);
}

/** 更新交接包内容（用户在预览里编辑后保存）。 */
export async function updateHandoff(
	handoffId: string,
	packageMd: string,
): Promise<boolean> {
	const r = await safeInvoke<{ success: boolean }>("harness_handoff_update", {
		handoff_id: handoffId,
		package_md: packageMd,
	});
	return r.success;
}

/** 在 App 内起 pty 跑目标 CLI 并注入交接包。 */
export async function launchHandoff(input: {
	handoff_id: string;
	cwd?: string;
	instruction?: string;
	write_file?: boolean;
}): Promise<{
	pty_id: string;
	handoff_path: string | null;
	ready_detected: boolean;
}> {
	return await safeInvoke("harness_handoff_launch", input);
}

/** 关闭一个 harness pty。 */
export async function closeHarnessPty(ptyId: string): Promise<boolean> {
	const r = await safeInvoke<{ success: boolean }>("harness_pty_close", {
		pty_id: ptyId,
	});
	return r.success;
}

/** 列出历史迁移记录。 */
export async function listHandoffs(options?: {
	session_id?: string;
	limit?: number;
}): Promise<HarnessHandoffRow[]> {
	const r = await safeInvoke<{ handoffs: HarnessHandoffRow[] }>(
		"harness_handoff_list",
		{ ...(options ?? {}) },
	);
	return r.handoffs;
}

/** 取单条迁移记录。 */
export async function getHandoff(
	handoffId: string,
): Promise<HarnessHandoffRow | null> {
	const r = await safeInvoke<{ handoff: HarnessHandoffRow | null }>(
		"harness_handoff_get",
		{ handoff_id: handoffId },
	);
	return r.handoff;
}

// ==================
// AI Hub（内嵌 Web 站点）
// ==================

/** 列出可用的 Web AI 站点。 */
export async function listAiHubSites(): Promise<AiHubSiteRow[]> {
	const r = await safeInvoke<{ sites: AiHubSiteRow[] }>("aihub_sites_list", {});
	return r.sites;
}

/** 保存站点清单覆盖（设置面板用）。 */
export async function saveAiHubSites(
	sites: AiHubSiteRow[],
): Promise<AiHubSiteRow[]> {
	const r = await safeInvoke<{ success: boolean; sites: AiHubSiteRow[] }>(
		"aihub_sites_save",
		{ sites },
	);
	return r.sites;
}

/** 在中栏挂载并显示某站点。 */
export async function openAiHubSite(
	siteId: string,
	bounds: { x: number; y: number; width: number; height: number },
): Promise<boolean> {
	const r = await safeInvoke<{ success: boolean }>("aihub_open", {
		site_id: siteId,
		bounds,
	});
	return r.success;
}

/** 更新某个站点内嵌视图的 bounds（分屏各自独立上报）。 */
export async function setAiHubBounds(
	siteId: string,
	bounds: {
		x: number;
		y: number;
		width: number;
		height: number;
	},
): Promise<boolean> {
	const r = await safeInvoke<{ success: boolean }>("aihub_set_bounds", {
		site_id: siteId,
		bounds,
	});
	return r.success;
}

/**
 * 从中栏移除内嵌视图（保活页面与登录态）。
 * 不传 siteId 表示摘掉全部。
 */
export async function closeAiHub(siteId?: string): Promise<boolean> {
	const r = await safeInvoke<{ success: boolean }>(
		"aihub_close",
		siteId ? { site_id: siteId } : {},
	);
	return r.success;
}

/** 把交接包注入站点输入框；DOM 失败自动降级剪贴板。 */
export async function injectToAiHub(
	siteId: string,
	text: string,
): Promise<{ ok: boolean; method: "dom" | "clipboard" }> {
	return await safeInvoke("aihub_inject", { site_id: siteId, text });
}

/** 从站点当前对话提取消息。 */
export async function extractFromAiHub(
	siteId: string,
): Promise<{ ok: boolean; messages: { role: string; content: string }[] }> {
	return await safeInvoke("aihub_extract", { site_id: siteId });
}

/** 把提取到的 Web 对话存成一个 canonical 会话。 */
export async function importAiHubSession(input: {
	site_id: string;
	title?: string;
	messages: { role: string; content: string }[];
}): Promise<string> {
	const r = await safeInvoke<{ session_id: string }>(
		"aihub_import_session",
		input,
	);
	return r.session_id;
}

/**
 * 列出本机可导入登录态的浏览器 profile。
 *
 * 传 siteId 时后端会顺带统计每个 profile 有多少条该站点的有效 cookie，
 * 并按条数降序返回——用户才能看出哪个 profile 真的登录过。
 */
export async function listCookieSources(
	siteId?: string,
): Promise<BrowserCookieSourceRow[]> {
	const r = await safeInvoke<{ sources: BrowserCookieSourceRow[] }>(
		"aihub_cookie_sources",
		siteId ? { site_id: siteId } : {},
	);
	return r.sources;
}

/**
 * 从本机浏览器导入某站点的登录态。
 * 只搬运该站点注册域及其子域的 cookie。
 */
export async function importAiHubCookies(input: {
	site_id: string;
	browser: string;
	profile: string;
}): Promise<{
	ok: boolean;
	imported: number;
	skipped: number;
	error?: string;
}> {
	return await safeInvoke("aihub_import_cookies", input);
}

/** 重新加载某站点页面（导入登录态后必须走一次才会生效）。 */
export async function reloadAiHubSite(siteId: string): Promise<boolean> {
	const r = await safeInvoke<{ ok: boolean }>("aihub_reload", {
		site_id: siteId,
	});
	return r.ok;
}
