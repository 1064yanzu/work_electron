/**
 * AI Harness Hub 互通升级的 IPC Handlers。
 *
 * 与 `harnessHub.ts`（会话摄取 / 检索 / 接力 / 内嵌站点）分文件，是因为这一层
 * 关注的是**入口之间的关系**而不是单个会话：互为工具、议会、共享白板、
 * 能力路由、额度状态、反向 MCP。硬塞进去会让那个文件逼近两千行。
 *
 * 契约见 `docs/api/harness-hub.md`。
 */
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type {
	HarnessBoardEntryRow,
	HarnessBridgeCallRow,
	HarnessCouncilAnswerRow,
	HarnessHubSettingsRow,
	HarnessMcpStatusRow,
	HarnessQuotaRow,
	HarnessRouteRow,
	IPCSchema,
} from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import { harnessRuntimeMonitor } from "../../harnessHub/automation/runtimeMonitor";
import { runBridgeCall } from "../../harnessHub/bridge";
import {
	addBoardEntry,
	listBoardEntries,
	normalizeScope,
	removeBoardEntry,
	renderBoardMarkdown,
	syncBoardFile,
	BOARD_DIR,
	BOARD_FILE,
	updateBoardEntry,
} from "../../harnessHub/board";
import {
	getCouncilRun,
	listCouncilRuns,
	runCouncil,
} from "../../harnessHub/council";
import {
	clearQuotaSignal,
	listQuotaStates,
	refreshQuotaStates,
	setManualBlock,
} from "../../harnessHub/quota";
import {
	BUILTIN_CAPABILITIES,
	listRoutes,
	resetRoute,
	resolveRoute,
	saveRoute,
} from "../../harnessHub/router";
import {
	loadHarnessHubSettings,
	saveHarnessHubSettings,
} from "../../harnessHub/settings";
import type { BoardEntry, QuotaState, RouteRule } from "../../harnessHub/types";
import {
	getHarnessMcpStatus,
	updateHarnessMcpToken,
} from "../../http/startHarnessMcpServer";
import {
	isMcpEnabled,
	listMcpToolSummaries,
	rotateMcpToken,
	setMcpEnabled,
} from "../../http/routers/harnessMcpRouter";
import path from "node:path";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

// ============================================================
// 行转换
// ============================================================

function toBoardRow(entry: BoardEntry): HarnessBoardEntryRow {
	return {
		id: entry.id,
		scope: entry.scope,
		kind: entry.kind,
		content: entry.content,
		author: entry.author,
		session_id: entry.sessionId,
		state: entry.state,
		created_at: entry.createdAt,
		updated_at: entry.updatedAt,
	};
}

function toRouteRow(rule: RouteRule): HarnessRouteRow {
	return {
		capability: rule.capability,
		label: rule.label,
		harnesses: rule.harnesses,
		enabled: rule.enabled,
		updated_at: rule.updatedAt,
	};
}

function toQuotaRow(state: QuotaState): HarnessQuotaRow {
	return {
		harness: state.harness,
		limit_hit_at: state.limitHitAt,
		resets_at: state.resetsAt,
		evidence: state.evidence,
		manual_blocked: state.manualBlocked,
		blocked: state.blocked,
	};
}

function toSettingsRow(
	s: Awaited<ReturnType<typeof loadHarnessHubSettings>>,
): HarnessHubSettingsRow {
	return {
		bridge_enabled: s.bridgeEnabled,
		bridge_allow_write: s.bridgeAllowWrite,
		bridge_cli_timeout_ms: s.bridgeCliTimeoutMs,
		bridge_web_timeout_ms: s.bridgeWebTimeoutMs,
		handoff_policy: s.handoffPolicy,
		auto_board_sync: s.autoBoardSync,
		automation_enabled: s.automationEnabled,
		automation_max_concurrent: s.automationMaxConcurrent,
		automation_prevent_sleep: s.automationPreventSleep,
		automation_skip_on_battery: s.automationSkipOnBattery,
		automation_stalled_threshold_ms: s.automationStalledThresholdMs,
		automation_default_max_attempts: s.automationDefaultMaxAttempts,
		automation_notify_on_failure: s.automationNotifyOnFailure,
	};
}

/**
 * 组装一键接入命令。
 *
 * 三家的 CLI 语法各不相同，与其在设置面板里写一段"请参考各自文档"，
 * 不如把能直接粘贴执行的命令算好——接入门槛越低，这个能力才越可能被用起来。
 */
function buildInstallCommands(
	endpoint: string,
	token: string,
): { label: string; command: string }[] {
	const auth = `Authorization: Bearer ${token}`;
	return [
		{
			label: "Claude Code",
			command: `claude mcp add --transport http aihub ${endpoint} --header "${auth}"`,
		},
		{
			label: "Codex",
			command: `codex mcp add aihub --transport http --url ${endpoint} --header "${auth}"`,
		},
		{
			label: "Gemini CLI",
			command: `gemini mcp add --transport http aihub ${endpoint} --header "${auth}"`,
		},
	];
}

export function createHarnessBridgeHandlers(
	db: DbContext,
	deps: { getMainWindow: () => BrowserWindow | null },
) {
	// ---------------------------------------------------------
	// 互为工具
	// ---------------------------------------------------------

	const harness_bridge_call: Handler<"harness_bridge_call"> = async (
		_event,
		input,
	) => {
		const result = await runBridgeCall(
			db,
			{
				target: input.target,
				kind: input.kind,
				prompt: input.prompt,
				cwd: input.cwd,
				timeoutMs: input.timeout_ms,
				caller: "ipo-ui",
			},
			input.allow_write === undefined ? {} : { allowWrite: input.allow_write },
		);
		return {
			ok: result.ok,
			call_id: result.callId,
			target: result.target,
			kind: result.kind,
			answer: result.answer,
			error: result.error,
			duration_ms: result.durationMs,
			partial: result.partial,
		};
	};

	const harness_bridge_calls_list: Handler<
		"harness_bridge_calls_list"
	> = async (_event, input) => {
		const limit = Math.min(Math.max(input.limit ?? 50, 1), 300);
		const args: (string | number)[] = [];
		let where = "";
		if (input.target) {
			where = "WHERE target = ?";
			args.push(input.target);
		}
		args.push(limit);
		const res = await db.client.execute({
			sql: `SELECT id, caller, target, target_kind, prompt, cwd, response,
			             status, error, duration_ms, created_at, finished_at
			      FROM harness_bridge_calls ${where}
			      ORDER BY created_at DESC LIMIT ?`,
			args,
		});
		return {
			calls: res.rows.map((raw) => {
				const row = raw as Record<string, unknown>;
				return {
					id: String(row.id),
					caller: String(row.caller ?? ""),
					target: String(row.target ?? ""),
					target_kind: String(row.target_kind ?? ""),
					prompt: (row.prompt as string) ?? null,
					cwd: (row.cwd as string) ?? null,
					response: (row.response as string) ?? null,
					status: String(row.status ?? ""),
					error: (row.error as string) ?? null,
					duration_ms: Number(row.duration_ms ?? 0),
					created_at: Number(row.created_at ?? 0),
					finished_at: row.finished_at ? Number(row.finished_at) : null,
				} satisfies HarnessBridgeCallRow;
			}),
		};
	};

	// ---------------------------------------------------------
	// 反向 MCP
	// ---------------------------------------------------------

	const readMcpStatus = async (): Promise<HarnessMcpStatusRow> => {
		const running = getHarnessMcpStatus();
		const enabled = await isMcpEnabled(db);
		return {
			running: Boolean(running),
			enabled,
			port: running?.port ?? null,
			endpoint: running?.endpoint ?? null,
			token: running?.token ?? null,
			install_commands:
				running && running.token
					? buildInstallCommands(running.endpoint, running.token)
					: [],
			tools: listMcpToolSummaries(),
		};
	};

	const harness_mcp_status: Handler<"harness_mcp_status"> = async () =>
		await readMcpStatus();

	const harness_mcp_set_enabled: Handler<"harness_mcp_set_enabled"> = async (
		_event,
		input,
	) => {
		await setMcpEnabled(db, input.enabled === true);
		return await readMcpStatus();
	};

	const harness_mcp_rotate_token: Handler<
		"harness_mcp_rotate_token"
	> = async () => {
		const token = await rotateMcpToken(db);
		// 服务实例持有 token 的内存副本，不同步就会继续接受旧 token
		updateHarnessMcpToken(token);
		return await readMcpStatus();
	};

	// ---------------------------------------------------------
	// 议会
	// ---------------------------------------------------------

	const harness_council_run: Handler<"harness_council_run"> = async (
		_event,
		input,
	) => {
		const result = await runCouncil(db, {
			question: input.question,
			members: input.members,
			cwd: input.cwd ?? null,
			timeoutMs: input.timeout_ms,
			skipVerdict: input.skip_verdict === true,
			onProgress: (payload) => {
				try {
					deps.getMainWindow()?.webContents.send("harness-council-event", {
						phase: payload.phase,
						harness: payload.harness ?? null,
						finished: payload.finished,
						total: payload.total,
					});
				} catch {
					// 窗口已销毁
				}
			},
		});
		return {
			run_id: result.runId,
			answers: result.answers.map(
				(a) =>
					({
						id: a.id,
						harness: a.harness,
						label: a.label,
						answer: a.answer,
						status: a.status,
						error: a.error,
						duration_ms: a.durationMs,
					}) satisfies HarnessCouncilAnswerRow,
			),
			verdict: result.verdict,
			status: result.status,
			error: result.error,
		};
	};

	const harness_council_list: Handler<"harness_council_list"> = async (
		_event,
		input,
	) => {
		const runs = await listCouncilRuns(db, input.limit ?? 30);
		return {
			runs: runs.map((r) => ({
				id: r.id,
				question: r.question,
				cwd: r.cwd,
				participants: r.participants,
				status: r.status,
				verdict: r.verdict,
				error: r.error,
				created_at: r.createdAt,
				finished_at: r.finishedAt,
			})),
		};
	};

	const harness_council_get: Handler<"harness_council_get"> = async (
		_event,
		input,
	) => {
		const { answers } = await getCouncilRun(db, input.run_id);
		return {
			answers: answers.map((a) => ({
				id: a.id,
				harness: a.harness,
				label: a.label,
				answer: a.answer,
				status: a.status,
				error: a.error,
				duration_ms: a.durationMs,
			})),
		};
	};

	// ---------------------------------------------------------
	// 共享白板
	// ---------------------------------------------------------

	const harness_board_list: Handler<"harness_board_list"> = async (
		_event,
		input,
	) => {
		const scope = normalizeScope(input.cwd);
		const entries = await listBoardEntries(db, input.cwd, {
			includeDone: input.include_done !== false,
		});
		return {
			entries: entries.map(toBoardRow),
			markdown: renderBoardMarkdown(entries, scope),
			file_path:
				scope && path.isAbsolute(scope)
					? path.join(scope, BOARD_DIR, BOARD_FILE)
					: null,
		};
	};

	const harness_board_add: Handler<"harness_board_add"> = async (
		_event,
		input,
	) => {
		const entry = await addBoardEntry(db, {
			cwd: input.cwd,
			kind: input.kind,
			content: input.content,
			author: input.author ?? "user",
			sessionId: input.session_id ?? null,
		});
		return { entry: toBoardRow(entry) };
	};

	const harness_board_update: Handler<"harness_board_update"> = async (
		_event,
		input,
	) => {
		return {
			success: await updateBoardEntry(db, {
				id: input.id,
				content: input.content,
				state: input.state,
			}),
		};
	};

	const harness_board_remove: Handler<"harness_board_remove"> = async (
		_event,
		input,
	) => {
		return { success: await removeBoardEntry(db, input.id) };
	};

	// ---------------------------------------------------------
	// 能力路由
	// ---------------------------------------------------------

	const harness_routes_list: Handler<"harness_routes_list"> = async () => {
		const routes = await listRoutes(db);
		return {
			routes: routes.map(toRouteRow),
			capabilities: BUILTIN_CAPABILITIES.map((c) => ({
				capability: c.capability,
				label: c.label,
				description: c.description,
			})),
		};
	};

	const harness_route_save: Handler<"harness_route_save"> = async (
		_event,
		input,
	) => {
		await saveRoute(db, {
			capability: input.capability,
			harnesses: input.harnesses,
			enabled: input.enabled,
		});
		return { routes: (await listRoutes(db)).map(toRouteRow) };
	};

	const harness_route_reset: Handler<"harness_route_reset"> = async (
		_event,
		input,
	) => {
		await resetRoute(db, input.capability);
		return { routes: (await listRoutes(db)).map(toRouteRow) };
	};

	const harness_route_resolve: Handler<"harness_route_resolve"> = async (
		_event,
		input,
	) => {
		const resolved = await resolveRoute(db, input.capability);
		return {
			capability: resolved.capability,
			label: resolved.label,
			candidates: resolved.candidates.map((c) => ({
				harness: c.harness,
				label: c.label,
				kind: c.kind,
				available: c.available,
				reason: c.reason,
				blocked_by_quota: c.blockedByQuota,
			})),
		};
	};

	// ---------------------------------------------------------
	// 额度
	// ---------------------------------------------------------

	const harness_quota_list: Handler<"harness_quota_list"> = async () => {
		return { quotas: (await listQuotaStates(db)).map(toQuotaRow) };
	};

	const harness_quota_refresh: Handler<"harness_quota_refresh"> = async () => {
		return { quotas: (await refreshQuotaStates(db)).map(toQuotaRow) };
	};

	const harness_quota_set_block: Handler<"harness_quota_set_block"> = async (
		_event,
		input,
	) => {
		return {
			quota: toQuotaRow(
				await setManualBlock(db, input.harness, input.blocked === true),
			),
		};
	};

	const harness_quota_clear: Handler<"harness_quota_clear"> = async (
		_event,
		input,
	) => {
		return { quota: toQuotaRow(await clearQuotaSignal(db, input.harness)) };
	};

	// ---------------------------------------------------------
	// 设置
	// ---------------------------------------------------------

	const harness_settings_get: Handler<"harness_settings_get"> = async () => {
		return toSettingsRow(await loadHarnessHubSettings(db));
	};

	const harness_settings_save: Handler<"harness_settings_save"> = async (
		_event,
		input,
	) => {
		const saved = await saveHarnessHubSettings(db, {
			bridgeEnabled: input.bridge_enabled,
			bridgeAllowWrite: input.bridge_allow_write,
			bridgeCliTimeoutMs: input.bridge_cli_timeout_ms,
			bridgeWebTimeoutMs: input.bridge_web_timeout_ms,
			handoffPolicy: input.handoff_policy,
			autoBoardSync: input.auto_board_sync,
			automationEnabled: input.automation_enabled,
			automationMaxConcurrent: input.automation_max_concurrent,
			automationPreventSleep: input.automation_prevent_sleep,
			automationSkipOnBattery: input.automation_skip_on_battery,
			automationStalledThresholdMs: input.automation_stalled_threshold_ms,
			automationDefaultMaxAttempts: input.automation_default_max_attempts,
			automationNotifyOnFailure: input.automation_notify_on_failure,
		});
		// 卡死阈值改了要立刻对监测层生效，否则得等重启才认新值
		if (input.automation_stalled_threshold_ms !== undefined) {
			harnessRuntimeMonitor.setStallThreshold(
				saved.automationStalledThresholdMs,
			);
		}
		return toSettingsRow(saved);
	};

	return {
		harness_bridge_call,
		harness_bridge_calls_list,
		harness_mcp_status,
		harness_mcp_set_enabled,
		harness_mcp_rotate_token,
		harness_council_run,
		harness_council_list,
		harness_council_get,
		harness_board_list,
		harness_board_add,
		harness_board_update,
		harness_board_remove,
		harness_routes_list,
		harness_route_save,
		harness_route_reset,
		harness_route_resolve,
		harness_quota_list,
		harness_quota_refresh,
		harness_quota_set_block,
		harness_quota_clear,
		harness_settings_get,
		harness_settings_save,
	};
}

/** 应用启动后台阶段：重扫一次限额信号，让路由一开始就用得上。 */
export async function warmupHarnessQuota(db: DbContext): Promise<void> {
	await refreshQuotaStates(db).catch(() => undefined);
}

/** 供 app-lifecycle 在工作目录变化时主动同步一次白板文件。 */
export async function syncHarnessBoardFile(
	db: DbContext,
	cwd: string,
): Promise<void> {
	await syncBoardFile(db, cwd).catch(() => undefined);
}
