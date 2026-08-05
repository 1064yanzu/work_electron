/**
 * AI Harness Hub IPC Handlers
 *
 * 覆盖三层：
 * - 提取：探测 harness、全量/增量摄取、会话列表与全文检索
 * - 蒸馏：把长转录压成结构化 HANDOFF 交接包
 * - 注入：App 内 pty 起 CLI 并注入交接包 / Web 站点 DOM 注入
 *
 * 施工与格式说明见 docs/harness-hub-施工文档.md，IPC 契约见 docs/api/harness-hub.md。
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import type {
	AiHubSiteRow,
	HarnessHandoffPackage,
	HarnessHandoffRow,
	HarnessMessageRow,
	HarnessSessionRow,
	IPCSchema,
} from "../../../shared/ipc-schema";
import { withBatch } from "../../db/batch";
import type { DbContext } from "../../db/client";
import { detectHarnesses } from "../../harnessHub/detect";
import { distillHandoff } from "../../harnessHub/handoff";
import {
	harnessIngestWatcher,
	scanAll,
	scanIpoSdk,
} from "../../harnessHub/ingest";
import {
	closeHarnessPty,
	launchHarnessWithHandoff,
} from "../../harnessHub/ptyLauncher";
import type { CanonicalMessage, HarnessKind } from "../../harnessHub/types";
import { mergeWebSites, WEB_SITES_CONFIG_KEY } from "../../harnessHub/webSites";
import { createLogger } from "../../logging/logger";
import { getAiHubViewService } from "../../services/aiHubViewService";
import { createFsSafeHandlers } from "./fsSafe";

const logger = createLogger();

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

/** 会话列表默认页大小。 */
const DEFAULT_LIST_LIMIT = 100;
/** 单次检索返回上限。 */
const DEFAULT_SEARCH_LIMIT = 50;
/** 单次拉取转录的默认条数。 */
const DEFAULT_MESSAGE_LIMIT = 500;

function parseSessionRow(row: Record<string, unknown>): HarnessSessionRow {
	return {
		id: row.id as string,
		harness: (row.harness as string) ?? "",
		external_id: (row.external_id as string) ?? "",
		cwd: (row.cwd as string) ?? null,
		title: (row.title as string) ?? null,
		summary: (row.summary as string) ?? null,
		status: (row.status as string) ?? "unknown",
		origin_path: (row.origin_path as string) ?? null,
		message_count: Number(row.message_count ?? 0),
		token_estimate: Number(row.token_estimate ?? 0),
		meta_json: (row.meta_json as string) ?? null,
		created_at: Number(row.created_at ?? 0),
		updated_at: Number(row.updated_at ?? 0),
	};
}

function parseHandoffRow(row: Record<string, unknown>): HarnessHandoffRow {
	return {
		id: row.id as string,
		source_session_id: (row.source_session_id as string) ?? "",
		target_harness: (row.target_harness as string) ?? "",
		package_md: (row.package_md as string) ?? "",
		status: (row.status as string) ?? "created",
		pty_id: (row.pty_id as string) ?? null,
		result_session_id: (row.result_session_id as string) ?? null,
		created_at: Number(row.created_at ?? 0),
	};
}

/** 站点配置 canonical → IPC 行。 */
function toSiteRow(
	site: ReturnType<typeof mergeWebSites>[number],
): AiHubSiteRow {
	return {
		id: site.id,
		harness: site.harness,
		label: site.label,
		url: site.url,
		input_selectors: site.inputSelectors,
		submit_selectors: site.submitSelectors,
		message_selectors: site.messageSelectors,
		builtin: site.builtin,
		enabled: site.enabled,
	};
}

/** FTS5 查询串转义：把用户输入当字面量短语，避免 MATCH 语法报错。 */
function escapeFtsQuery(raw: string): string {
	// trigram 分词下，双引号包裹的短语查询最稳；内部双引号翻倍转义
	const cleaned = raw.replace(/"/g, '""').trim();
	return cleaned ? `"${cleaned}"` : "";
}

export function createHarnessHubHandlers(
	db: DbContext,
	deps: { getMainWindow: () => BrowserWindow | null },
) {
	// 文件写入统一走 *_safe 体系（项目硬规则：绝对路径 + 原子写 + 空覆盖保护）
	const fsSafe = createFsSafeHandlers();

	/** 读取用户的站点覆盖配置。 */
	const loadSites = async () => {
		const res = await db.client.execute({
			sql: `SELECT value FROM app_config WHERE key = ?`,
			args: [WEB_SITES_CONFIG_KEY],
		});
		const raw = (res.rows[0] as Record<string, unknown> | undefined)?.value;
		return mergeWebSites(typeof raw === "string" ? raw : null);
	};

	const harness_detect: Handler<"harness_detect"> = async () => {
		// 各 harness 已摄取的会话数
		const counts = await db.client.execute(
			`SELECT harness, COUNT(*) AS c FROM harness_sessions GROUP BY harness`,
		);
		const countMap: Partial<Record<HarnessKind, number>> = {};
		for (const row of counts.rows) {
			const r = row as Record<string, unknown>;
			countMap[r.harness as HarnessKind] = Number(r.c ?? 0);
		}

		const detections = await detectHarnesses(countMap);
		return {
			harnesses: detections.map((d) => ({
				harness: d.harness,
				label: d.label,
				installed: d.installed,
				bin_path: d.binPath,
				session_dir: d.sessionDir,
				can_read: d.canRead,
				can_inject: d.canInject,
				session_count: d.sessionCount,
			})),
		};
	};

	const harness_sessions_list: Handler<"harness_sessions_list"> = async (
		_event,
		input,
	) => {
		const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIST_LIMIT, 1), 500);
		const offset = Math.max(input.offset ?? 0, 0);
		const where: string[] = [];
		const args: (string | number)[] = [];
		if (input.harness) {
			where.push("harness = ?");
			args.push(input.harness);
		}
		if (input.cwd) {
			where.push("cwd = ?");
			args.push(input.cwd);
		}
		const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

		const [rows, totalRes] = await Promise.all([
			db.client.execute({
				sql: `SELECT id, harness, external_id, cwd, title, summary, status, origin_path,
				             message_count, token_estimate, meta_json, created_at, updated_at
				      FROM harness_sessions ${whereSql}
				      ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
				args: [...args, limit, offset],
			}),
			db.client.execute({
				sql: `SELECT COUNT(*) AS c FROM harness_sessions ${whereSql}`,
				args,
			}),
		]);

		return {
			sessions: rows.rows.map((r) =>
				parseSessionRow(r as Record<string, unknown>),
			),
			total: Number(
				(totalRes.rows[0] as Record<string, unknown> | undefined)?.c ?? 0,
			),
		};
	};

	const harness_session_get: Handler<"harness_session_get"> = async (
		_event,
		input,
	) => {
		const limit = Math.min(
			Math.max(input.limit ?? DEFAULT_MESSAGE_LIMIT, 1),
			2000,
		);
		const offset = Math.max(input.offset ?? 0, 0);
		const [sessionRes, msgRes] = await Promise.all([
			db.client.execute({
				sql: `SELECT id, harness, external_id, cwd, title, summary, status, origin_path,
				             message_count, token_estimate, meta_json, created_at, updated_at
				      FROM harness_sessions WHERE id = ?`,
				args: [input.session_id],
			}),
			db.client.execute({
				sql: `SELECT id, session_id, role, content, blocks_json, seq, created_at
				      FROM harness_messages WHERE session_id = ?
				      ORDER BY seq ASC LIMIT ? OFFSET ?`,
				args: [input.session_id, limit, offset],
			}),
		]);

		const sessionRow = sessionRes.rows[0] as
			| Record<string, unknown>
			| undefined;
		return {
			session: sessionRow ? parseSessionRow(sessionRow) : null,
			messages: msgRes.rows.map((r0) => {
				const r = r0 as Record<string, unknown>;
				return {
					id: r.id as string,
					session_id: r.session_id as string,
					role: (r.role as string) ?? "assistant",
					content: (r.content as string) ?? "",
					blocks_json: (r.blocks_json as string) ?? null,
					seq: Number(r.seq ?? 0),
					created_at: Number(r.created_at ?? 0),
				} satisfies HarnessMessageRow;
			}),
		};
	};

	const harness_sessions_search: Handler<"harness_sessions_search"> = async (
		_event,
		input,
	) => {
		const query = escapeFtsQuery(input.query ?? "");
		if (!query) return { hits: [] };
		const limit = Math.min(
			Math.max(input.limit ?? DEFAULT_SEARCH_LIMIT, 1),
			200,
		);

		const args: (string | number)[] = [query];
		let harnessFilter = "";
		if (input.harness) {
			harnessFilter = "AND s.harness = ?";
			args.push(input.harness);
		}
		args.push(limit);

		try {
			const res = await db.client.execute({
				sql: `SELECT m.session_id, m.role, m.seq, m.created_at,
				             s.harness, s.title, s.cwd,
				             snippet(harness_messages_fts, 0, '<mark>', '</mark>', '…', 24) AS snippet
				      FROM harness_messages_fts f
				      JOIN harness_messages m ON m.rowid = f.rowid
				      JOIN harness_sessions s ON s.id = m.session_id
				      WHERE harness_messages_fts MATCH ? ${harnessFilter}
				      ORDER BY rank LIMIT ?`,
				args,
			});
			return {
				hits: res.rows.map((r0) => {
					const r = r0 as Record<string, unknown>;
					return {
						session_id: (r.session_id as string) ?? "",
						harness: (r.harness as string) ?? "",
						title: (r.title as string) ?? null,
						cwd: (r.cwd as string) ?? null,
						role: (r.role as string) ?? "assistant",
						seq: Number(r.seq ?? 0),
						snippet: (r.snippet as string) ?? "",
						created_at: Number(r.created_at ?? 0),
					};
				}),
			};
		} catch (error) {
			logger.warn({
				msg: "harness 全文检索失败",
				error: error instanceof Error ? error.message : String(error),
			});
			return { hits: [] };
		}
	};

	const harness_ingest_scan: Handler<"harness_ingest_scan"> = async (
		_event,
		input,
	) => {
		const result = await scanAll(db, (progress) => {
			try {
				deps.getMainWindow()?.webContents.send("harness-ingest-progress", {
					phase: progress.phase,
					harness: progress.harness,
					processed: progress.processed,
					total: progress.total,
					updated: progress.updated,
					skipped_lines: progress.skippedLines,
				});
			} catch {
				// 窗口已销毁
			}
		});

		let updated = result.updated;
		if (input.include_ipo_sdk !== false) {
			const sdk = await scanIpoSdk(db);
			updated += sdk.updated;
		}

		return {
			updated,
			scanned: result.scanned,
			skipped_lines: result.skippedLines,
		};
	};

	const harness_session_delete: Handler<"harness_session_delete"> = async (
		_event,
		input,
	) => {
		// 只删本地 canonical 记录，不动用户的原始 JSONL 文件
		await withBatch(db, [
			{
				sql: `DELETE FROM harness_messages WHERE session_id = ?`,
				args: [input.session_id],
			},
			{
				sql: `DELETE FROM harness_sessions WHERE id = ?`,
				args: [input.session_id],
			},
		]);
		return { success: true };
	};

	const harness_handoff_create: Handler<"harness_handoff_create"> = async (
		_event,
		input,
	) => {
		const pkg = await distillHandoff(db, {
			sessionId: input.session_id,
			targetHarness: input.target_harness as HarnessKind,
			model: input.model,
			onProgress: (p) => {
				try {
					deps.getMainWindow()?.webContents.send("harness-handoff-event", {
						phase: p.phase,
						current: p.current,
						total: p.total,
					});
				} catch {
					// 窗口已销毁
				}
			},
		});

		const handoffId = randomUUID();
		await db.client.execute({
			sql: `INSERT INTO harness_handoffs
			        (id, source_session_id, target_harness, package_md, status, pty_id, result_session_id, created_at)
			      VALUES (?, ?, ?, ?, 'created', NULL, NULL, ?)`,
			args: [
				handoffId,
				input.session_id,
				input.target_harness,
				pkg.markdown,
				Date.now(),
			],
		});

		const outPackage: HarnessHandoffPackage = {
			goal: pkg.goal,
			done: pkg.done,
			in_progress: pkg.inProgress,
			decisions: pkg.decisions,
			files: pkg.files,
			next_steps: pkg.nextSteps,
			markdown: pkg.markdown,
		};
		return { handoff_id: handoffId, package: outPackage };
	};

	const harness_handoff_update: Handler<"harness_handoff_update"> = async (
		_event,
		input,
	) => {
		await db.client.execute({
			sql: `UPDATE harness_handoffs SET package_md = ? WHERE id = ?`,
			args: [input.package_md, input.handoff_id],
		});
		return { success: true };
	};

	const harness_handoff_launch: Handler<"harness_handoff_launch"> = async (
		event,
		input,
	) => {
		const res = await db.client.execute({
			sql: `SELECT h.id, h.source_session_id, h.target_harness, h.package_md,
			             s.cwd AS source_cwd
			      FROM harness_handoffs h
			      LEFT JOIN harness_sessions s ON s.id = h.source_session_id
			      WHERE h.id = ?`,
			args: [input.handoff_id],
		});
		const row = res.rows[0] as Record<string, unknown> | undefined;
		if (!row) throw new Error(`交接包不存在：${input.handoff_id}`);

		const cwd = input.cwd || (row.source_cwd as string) || "";
		if (!cwd) {
			throw new Error("无法确定工作目录：源会话没有记录 cwd，请手动指定");
		}
		const targetHarness = row.target_harness as string as HarnessKind;
		const packageMd = (row.package_md as string) ?? "";

		// 写 HANDOFF.md 供 CLI 读取（走 *_safe 体系，绝对路径 + 原子写）
		let handoffPath: string | null = null;
		if (input.write_file !== false) {
			handoffPath = path.join(cwd, "HANDOFF.md");
			await fsSafe.write_file_safe(event, {
				path: handoffPath,
				content: packageMd,
				create_dirs: true,
			});
		}

		const launched = await launchHarnessWithHandoff({
			harness: targetHarness,
			cwd,
			handoffPath,
			instruction: input.instruction,
			getMainWindow: deps.getMainWindow,
		});

		await db.client.execute({
			sql: `UPDATE harness_handoffs SET status = 'launched', pty_id = ? WHERE id = ?`,
			args: [launched.ptyId, input.handoff_id],
		});

		return {
			pty_id: launched.ptyId,
			handoff_path: handoffPath,
			ready_detected: launched.readyDetected,
		};
	};

	const harness_pty_close: Handler<"harness_pty_close"> = async (
		_event,
		input,
	) => {
		return { success: closeHarnessPty(input.pty_id) };
	};

	const harness_handoff_list: Handler<"harness_handoff_list"> = async (
		_event,
		input,
	) => {
		const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
		const args: (string | number)[] = [];
		let where = "";
		if (input.session_id) {
			where = "WHERE source_session_id = ?";
			args.push(input.session_id);
		}
		args.push(limit);
		const res = await db.client.execute({
			sql: `SELECT id, source_session_id, target_harness, package_md, status,
			             pty_id, result_session_id, created_at
			      FROM harness_handoffs ${where}
			      ORDER BY created_at DESC LIMIT ?`,
			args,
		});
		return {
			handoffs: res.rows.map((r) =>
				parseHandoffRow(r as Record<string, unknown>),
			),
		};
	};

	const harness_handoff_get: Handler<"harness_handoff_get"> = async (
		_event,
		input,
	) => {
		const res = await db.client.execute({
			sql: `SELECT id, source_session_id, target_harness, package_md, status,
			             pty_id, result_session_id, created_at
			      FROM harness_handoffs WHERE id = ?`,
			args: [input.handoff_id],
		});
		const row = res.rows[0] as Record<string, unknown> | undefined;
		return { handoff: row ? parseHandoffRow(row) : null };
	};

	// ==================
	// AI Hub（内嵌 Web 站点）
	// ==================

	const aihub_sites_list: Handler<"aihub_sites_list"> = async () => {
		const sites = await loadSites();
		return { sites: sites.map(toSiteRow) };
	};

	const aihub_sites_save: Handler<"aihub_sites_save"> = async (
		_event,
		input,
	) => {
		const payload = input.sites.map((s) => ({
			id: s.id,
			harness: s.harness,
			label: s.label,
			url: s.url,
			inputSelectors: s.input_selectors,
			submitSelectors: s.submit_selectors,
			messageSelectors: s.message_selectors,
			builtin: s.builtin,
			enabled: s.enabled,
		}));
		await db.client.execute({
			sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
			      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			args: [WEB_SITES_CONFIG_KEY, JSON.stringify(payload), Date.now()],
		});
		const sites = await loadSites();
		return { success: true, sites: sites.map(toSiteRow) };
	};

	const aihub_open: Handler<"aihub_open"> = async (_event, input) => {
		const win = deps.getMainWindow();
		if (!win) return { success: false };
		const sites = await loadSites();
		const site = sites.find((s) => s.id === input.site_id);
		if (!site) return { success: false };
		getAiHubViewService().attach(win, site.id, site, input.bounds);
		return { success: true };
	};

	const aihub_set_bounds: Handler<"aihub_set_bounds"> = async (
		_event,
		input,
	) => {
		getAiHubViewService().setBounds(input.bounds);
		return { success: true };
	};

	const aihub_close: Handler<"aihub_close"> = async () => {
		getAiHubViewService().detach();
		return { success: true };
	};

	const aihub_inject: Handler<"aihub_inject"> = async (_event, input) => {
		const sites = await loadSites();
		const site = sites.find((s) => s.id === input.site_id);
		if (!site) return { ok: false, method: "clipboard" as const };
		return await getAiHubViewService().inject(site, input.text);
	};

	const aihub_extract: Handler<"aihub_extract"> = async (_event, input) => {
		const sites = await loadSites();
		const site = sites.find((s) => s.id === input.site_id);
		if (!site) return { ok: false, messages: [] };
		return await getAiHubViewService().extract(site);
	};

	const aihub_import_session: Handler<"aihub_import_session"> = async (
		_event,
		input,
	) => {
		const sites = await loadSites();
		const site = sites.find((s) => s.id === input.site_id);
		const harness = site?.harness ?? "web-chatgpt";
		const now = Date.now();
		const sessionId = `${harness}:${randomUUID()}`;

		const messages: CanonicalMessage[] = input.messages.map((m, i) => ({
			id: `${sessionId}:${i}`,
			role: m.role === "user" ? "user" : "assistant",
			content: m.content,
			seq: i,
			createdAt: now + i,
		}));
		if (!messages.length) throw new Error("没有可导入的消息");

		const title =
			input.title?.trim() ||
			messages.find((m) => m.role === "user")?.content.slice(0, 60) ||
			site?.label ||
			"Web 会话";

		await withBatch(db, [
			{
				sql: `INSERT INTO harness_sessions
				        (id, harness, external_id, cwd, title, summary, status, origin_path,
				         byte_offset, message_count, token_estimate, meta_json, created_at, updated_at)
				      VALUES (?, ?, ?, NULL, ?, NULL, 'idle', NULL, 0, ?, ?, ?, ?, ?)`,
				args: [
					sessionId,
					harness,
					sessionId,
					title,
					messages.length,
					Math.round(messages.reduce((n, m) => n + m.content.length, 0) / 4),
					JSON.stringify({ siteId: input.site_id, importedFrom: "web" }),
					now,
					now,
				],
			},
			...messages.map((m) => ({
				sql: `INSERT INTO harness_messages
				        (id, session_id, role, content, blocks_json, seq, created_at)
				      VALUES (?, ?, ?, ?, NULL, ?, ?)`,
				args: [
					`${sessionId}#${m.id}`,
					sessionId,
					m.role,
					m.content,
					m.seq,
					m.createdAt,
				],
			})),
		]);

		return { session_id: sessionId };
	};

	return {
		harness_detect,
		harness_sessions_list,
		harness_session_get,
		harness_sessions_search,
		harness_ingest_scan,
		harness_session_delete,
		harness_handoff_create,
		harness_handoff_update,
		harness_handoff_launch,
		harness_pty_close,
		harness_handoff_list,
		harness_handoff_get,
		aihub_sites_list,
		aihub_sites_save,
		aihub_open,
		aihub_set_bounds,
		aihub_close,
		aihub_inject,
		aihub_extract,
		aihub_import_session,
	};
}

/** 启动增量 watcher（app-lifecycle 在 idle 阶段调用）。 */
export async function startHarnessIngestWatcher(
	db: DbContext,
	getMainWindow: () => BrowserWindow | null,
): Promise<void> {
	await harnessIngestWatcher.start(db, getMainWindow);
}

/** 停止增量 watcher（应用退出时调用）。 */
export async function stopHarnessIngestWatcher(): Promise<void> {
	await harnessIngestWatcher.stop();
}
