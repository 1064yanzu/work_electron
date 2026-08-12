/**
 * AI Hub 互通升级的前端 API 封装。
 *
 * 后端契约见 `docs/api/harness-hub.md`；实现在
 * `electron/main/ipc/handlers/harnessBridge.ts`（互为工具 / 议会 / 白板 /
 * 路由 / 额度 / 反向 MCP）与 `harnessHub.ts`（接力 / 交换格式）。
 */
import type {
	HarnessBoardEntryRow,
	HarnessBridgeCallRow,
	HarnessBridgeResult,
	HarnessCouncilAnswerRow,
	HarnessCouncilRunRow,
	HarnessHandoffPlan,
	HarnessHubSettingsRow,
	HarnessMcpStatusRow,
	HarnessQuotaRow,
	HarnessRouteCandidateRow,
	HarnessRouteRow,
} from "../../../electron/shared/ipc-schema";
import { safeInvoke } from "../tauriBridge";

export type {
	HarnessBoardEntryRow,
	HarnessBridgeCallRow,
	HarnessBridgeResult,
	HarnessCouncilAnswerRow,
	HarnessCouncilRunRow,
	HarnessHandoffPlan,
	HarnessHubSettingsRow,
	HarnessMcpStatusRow,
	HarnessQuotaRow,
	HarnessRouteCandidateRow,
	HarnessRouteRow,
};

// ==================
// 接力（三档策略）
// ==================

/**
 * 预演接力方案：只算「会走哪一档、为什么」，不真正生成交接包。
 * 在用户点确认之前调用，避免先花钱蒸馏再发现本可以无损续接。
 */
export async function planHandoff(input: {
	session_id: string;
	target_harness: string;
	mode?: "auto" | "native" | "raw" | "distill";
}): Promise<HarnessHandoffPlan> {
	return await safeInvoke("harness_handoff_plan", input);
}

/** 原生续接：起 pty 直接跑 `claude --resume` / `codex resume`。 */
export async function launchNativeResume(input: {
	session_id: string;
	fork?: boolean;
	cwd?: string;
}): Promise<{ pty_id: string; command: string; ready_detected: boolean }> {
	return await safeInvoke("harness_resume_launch", input);
}

// ==================
// 交换格式
// ==================

/** 导出会话为交换文件。 */
export async function exportSession(input: {
	session_id: string;
	format?: "json" | "markdown";
	include_handoff?: boolean;
	dir?: string;
}): Promise<{
	path: string;
	file_name: string;
	bytes: number;
	message_count: number;
}> {
	return await safeInvoke("harness_session_export", input);
}

/** 导入外部会话文件（本格式 / ChatGPT 导出 / Claude Code / Codex 原生）。 */
export async function importSession(input: {
	path?: string;
	text?: string;
	index?: number;
}): Promise<{
	session_id: string;
	detected_format: string;
	message_count: number;
	sibling_count: number;
	title: string | null;
}> {
	return await safeInvoke("harness_session_import", input);
}

/** 列出 ChatGPT 导出包里的会话，供用户挑一段导入。 */
export async function listImportCandidates(path: string): Promise<
	{
		index: number;
		title: string;
		message_count: number;
		updated_at: number;
	}[]
> {
	const r = await safeInvoke<{
		conversations: {
			index: number;
			title: string;
			message_count: number;
			updated_at: number;
		}[];
	}>("harness_import_candidates", { path });
	return r.conversations;
}

/** 把一段会话作为附件送进 Web 站点并填入引导语。 */
export async function sendSessionToWeb(input: {
	site_id: string;
	session_id: string;
	prompt?: string;
	include_handoff?: boolean;
}): Promise<{
	ok: boolean;
	method: "attachment" | "inline" | "clipboard";
	path: string | null;
	error: string | null;
}> {
	return await safeInvoke("aihub_send_session", input);
}

// ==================
// 互为工具
// ==================

/** 把另一个入口当工具调用一次。 */
export async function bridgeCall(input: {
	target: string;
	kind: "cli" | "web" | "app";
	prompt: string;
	cwd?: string;
	timeout_ms?: number;
	allow_write?: boolean;
}): Promise<HarnessBridgeResult> {
	return await safeInvoke("harness_bridge_call", input);
}

/** 跨入口调用审计。 */
export async function listBridgeCalls(options?: {
	limit?: number;
	target?: string;
}): Promise<HarnessBridgeCallRow[]> {
	const r = await safeInvoke<{ calls: HarnessBridgeCallRow[] }>(
		"harness_bridge_calls_list",
		{ ...(options ?? {}) },
	);
	return r.calls;
}

// ==================
// 反向 MCP
// ==================

export async function getMcpStatus(): Promise<HarnessMcpStatusRow> {
	return await safeInvoke("harness_mcp_status", {});
}

export async function setMcpEnabled(
	enabled: boolean,
): Promise<HarnessMcpStatusRow> {
	return await safeInvoke("harness_mcp_set_enabled", { enabled });
}

export async function rotateMcpToken(): Promise<HarnessMcpStatusRow> {
	return await safeInvoke("harness_mcp_rotate_token", {});
}

// ==================
// 议会
// ==================

export async function runCouncil(input: {
	question: string;
	members: { harness: string; kind: "cli" | "web" | "app"; label: string }[];
	cwd?: string;
	skip_verdict?: boolean;
	timeout_ms?: number;
}): Promise<{
	run_id: string;
	answers: HarnessCouncilAnswerRow[];
	verdict: string;
	status: string;
	error: string | null;
}> {
	return await safeInvoke("harness_council_run", input);
}

export async function listCouncilRuns(
	limit?: number,
): Promise<HarnessCouncilRunRow[]> {
	const r = await safeInvoke<{ runs: HarnessCouncilRunRow[] }>(
		"harness_council_list",
		{ limit },
	);
	return r.runs;
}

export async function getCouncilRun(
	runId: string,
): Promise<HarnessCouncilAnswerRow[]> {
	const r = await safeInvoke<{ answers: HarnessCouncilAnswerRow[] }>(
		"harness_council_get",
		{ run_id: runId },
	);
	return r.answers;
}

// ==================
// 共享白板
// ==================

export async function listBoardEntries(options?: {
	cwd?: string;
	include_done?: boolean;
}): Promise<{
	entries: HarnessBoardEntryRow[];
	markdown: string;
	file_path: string | null;
}> {
	return await safeInvoke("harness_board_list", { ...(options ?? {}) });
}

export async function addBoardEntry(input: {
	cwd?: string;
	kind: string;
	content: string;
	author?: string;
	session_id?: string;
}): Promise<HarnessBoardEntryRow> {
	const r = await safeInvoke<{ entry: HarnessBoardEntryRow }>(
		"harness_board_add",
		input,
	);
	return r.entry;
}

export async function updateBoardEntry(input: {
	id: string;
	content?: string;
	state?: "open" | "done";
}): Promise<boolean> {
	const r = await safeInvoke<{ success: boolean }>(
		"harness_board_update",
		input,
	);
	return r.success;
}

export async function removeBoardEntry(id: string): Promise<boolean> {
	const r = await safeInvoke<{ success: boolean }>("harness_board_remove", {
		id,
	});
	return r.success;
}

// ==================
// 能力路由
// ==================

export async function listRoutes(): Promise<{
	routes: HarnessRouteRow[];
	capabilities: { capability: string; label: string; description: string }[];
}> {
	return await safeInvoke("harness_routes_list", {});
}

export async function saveRoute(input: {
	capability: string;
	harnesses: string[];
	enabled?: boolean;
}): Promise<HarnessRouteRow[]> {
	const r = await safeInvoke<{ routes: HarnessRouteRow[] }>(
		"harness_route_save",
		input,
	);
	return r.routes;
}

export async function resetRoute(
	capability: string,
): Promise<HarnessRouteRow[]> {
	const r = await safeInvoke<{ routes: HarnessRouteRow[] }>(
		"harness_route_reset",
		{ capability },
	);
	return r.routes;
}

export async function resolveRoute(capability: string): Promise<{
	capability: string;
	label: string;
	candidates: HarnessRouteCandidateRow[];
}> {
	return await safeInvoke("harness_route_resolve", { capability });
}

// ==================
// 额度
// ==================

export async function listQuotas(): Promise<HarnessQuotaRow[]> {
	const r = await safeInvoke<{ quotas: HarnessQuotaRow[] }>(
		"harness_quota_list",
		{},
	);
	return r.quotas;
}

export async function refreshQuotas(): Promise<HarnessQuotaRow[]> {
	const r = await safeInvoke<{ quotas: HarnessQuotaRow[] }>(
		"harness_quota_refresh",
		{},
	);
	return r.quotas;
}

export async function setQuotaBlock(
	harness: string,
	blocked: boolean,
): Promise<HarnessQuotaRow> {
	const r = await safeInvoke<{ quota: HarnessQuotaRow }>(
		"harness_quota_set_block",
		{ harness, blocked },
	);
	return r.quota;
}

export async function clearQuotaSignal(
	harness: string,
): Promise<HarnessQuotaRow> {
	const r = await safeInvoke<{ quota: HarnessQuotaRow }>(
		"harness_quota_clear",
		{ harness },
	);
	return r.quota;
}

// ==================
// 设置
// ==================

export async function getHubSettings(): Promise<HarnessHubSettingsRow> {
	return await safeInvoke("harness_settings_get", {});
}

export async function saveHubSettings(
	patch: Partial<HarnessHubSettingsRow>,
): Promise<HarnessHubSettingsRow> {
	return await safeInvoke("harness_settings_save", patch);
}
