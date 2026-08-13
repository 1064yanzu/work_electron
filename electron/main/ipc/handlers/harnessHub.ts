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
import { tmpdir } from "node:os";
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
import { HARNESS_SPECS, detectHarnesses } from "../../harnessHub/detect";
import {
	distillHandoff,
	loadSessionBrief,
	loadSessionTranscript,
} from "../../harnessHub/handoff";
import {
	buildExchangeDocument,
	listChatgptConversations,
	newImportedSessionId,
	parseExchangeFile,
	parseExchangeText,
	renderExchangeMarkdown,
	suggestExchangeFileName,
} from "../../harnessHub/exchange";
import {
	buildRawHandoff,
	nativeResumeAvailable,
	pickHandoffMode,
} from "../../harnessHub/rawHandoff";
import { buildResumeCommand } from "../../harnessHub/resume";
import { loadHarnessHubSettings } from "../../harnessHub/settings";
import {
	harnessIngestWatcher,
	scanAll,
	scanIpoSdk,
} from "../../harnessHub/ingest";
import {
	closeHarnessPty,
	launchHarnessWithHandoff,
} from "../../harnessHub/ptyLauncher";
import type {
	CanonicalMessage,
	HarnessKind,
	WebSiteConfig,
} from "../../harnessHub/types";
import {
	findWebSite,
	loadWebSites,
	WEB_SITES_CONFIG_KEY,
} from "../../harnessHub/webSites";
import { createLogger } from "../../logging/logger";
import {
	getAiHubViewService,
	aiHubPartition,
} from "../../services/aiHubViewService";
import {
	countValidCookies,
	detectBrowserUserAgent,
	importCookiesForSite,
	listCookieSources,
} from "../../services/browserCookieImport";
import { createFsSafeHandlers } from "./fsSafe";
import { sendToLiveWebContents } from "../../utils/safeWebContentsSend";

const logger = createLogger();

/** app_config 中存放「站点 → 来源浏览器 UA」的 key。 */
const SITE_USER_AGENTS_CONFIG_KEY = "harness_hub_site_user_agents";

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
		mode: (row.mode as string) ?? null,
		payload_path: (row.payload_path as string) ?? null,
		source_cwd: (row.source_cwd as string) ?? null,
	};
}

/** 站点配置 canonical → IPC 行。 */
function toSiteRow(site: WebSiteConfig): AiHubSiteRow {
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
	const loadSites = async () => await loadWebSites(db);

	/**
	 * siteId → UA 覆盖。
	 *
	 * 从本机浏览器导入登录态时会把来源浏览器的真实 UA 存下来，之后该站点的内嵌
	 * 视图一律用它发请求——Cloudflare 的 `cf_clearance` 绑 IP + UA，UA 对不上
	 * 等于 cookie 白搬。持久化是必需的：重启后不恢复，登录态第二天就又失效了。
	 */
	const loadSiteUserAgents = async (): Promise<Record<string, string>> => {
		const res = await db.client.execute({
			sql: `SELECT value FROM app_config WHERE key = ?`,
			args: [SITE_USER_AGENTS_CONFIG_KEY],
		});
		const raw = (res.rows[0] as Record<string, unknown> | undefined)?.value;
		if (typeof raw !== "string") return {};
		try {
			const parsed: unknown = JSON.parse(raw);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return {};
			}
			const out: Record<string, string> = {};
			for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
				if (typeof v === "string" && v) out[k] = v;
			}
			return out;
		} catch {
			return {};
		}
	};

	const saveSiteUserAgent = async (siteId: string, ua: string) => {
		const map = await loadSiteUserAgents();
		map[siteId] = ua;
		await db.client.execute({
			sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
			      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			args: [SITE_USER_AGENTS_CONFIG_KEY, JSON.stringify(map), Date.now()],
		});
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
				launch_command: d.launchCommand,
				session_count: d.sessionCount,
			})),
		};
	};

	/**
	 * 跨入口用量统计。
	 *
	 * 全部来自 `harness_sessions` / `harness_messages` 里已摄取的真实数据——
	 * 没有任何补零、外推或占位数字。口径上的不精确（token 是估算、Web 只覆盖
	 * 主动导入的会话）通过返回值里的 `token_basis` / `partial_coverage` 如实
	 * 传给 UI，由 UI 标注，而不是在这里粉饰。
	 */
	const harness_usage_stats: Handler<"harness_usage_stats"> = async () => {
		const now = Date.now();
		const DAY = 24 * 60 * 60 * 1000;
		const cutoffs = {
			today: now - DAY,
			week: now - 7 * DAY,
			month: now - 30 * DAY,
		};

		const aggSql = (where: string) =>
			`SELECT harness,
			        COUNT(*) AS sessions,
			        COALESCE(SUM(message_count), 0) AS messages,
			        COALESCE(SUM(token_estimate), 0) AS tokens,
			        MAX(updated_at) AS last_active
			 FROM harness_sessions ${where}
			 GROUP BY harness`;

		const [totalRes, todayRes, weekRes, monthRes, dailyRes, sites] =
			await Promise.all([
				db.client.execute(aggSql("")),
				db.client.execute({
					sql: aggSql("WHERE updated_at >= ?"),
					args: [cutoffs.today],
				}),
				db.client.execute({
					sql: aggSql("WHERE updated_at >= ?"),
					args: [cutoffs.week],
				}),
				db.client.execute({
					sql: aggSql("WHERE updated_at >= ?"),
					args: [cutoffs.month],
				}),
				db.client.execute({
					sql: `SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS d,
					             COUNT(*) AS c
					      FROM harness_messages
					      WHERE created_at >= ?
					      GROUP BY d ORDER BY d`,
					args: [cutoffs.month],
				}),
				loadSites(),
			]);

		const emptyBucket = () => ({
			sessions: 0,
			messages: 0,
			token_estimate: 0,
		});
		const readBucket = (
			res: Awaited<ReturnType<typeof db.client.execute>>,
		): Map<string, ReturnType<typeof emptyBucket> & { last: number }> => {
			const map = new Map<
				string,
				ReturnType<typeof emptyBucket> & { last: number }
			>();
			for (const raw of res.rows) {
				const r = raw as Record<string, unknown>;
				map.set(String(r.harness), {
					sessions: Number(r.sessions ?? 0),
					messages: Number(r.messages ?? 0),
					token_estimate: Number(r.tokens ?? 0),
					last: Number(r.last_active ?? 0),
				});
			}
			return map;
		};

		const totals = readBucket(totalRes);
		const today = readBucket(todayRes);
		const week = readBucket(weekRes);
		const month = readBucket(monthRes);

		// harness id → 展示名：CLI 走探测规格，Web 走站点配置，兜底用 id 本身
		const siteLabelByHarness = new Map<string, string>();
		for (const site of sites) siteLabelByHarness.set(site.harness, site.label);

		const harnesses = [...totals.entries()]
			.map(([harness, total]) => {
				const isWeb = harness.startsWith("web-");
				const isApp = harness === "ipo-sdk";
				const label =
					siteLabelByHarness.get(harness) ??
					(isApp
						? "本应用 Agent"
						: (HARNESS_SPECS.find((s) => s.harness === harness)?.label ??
							harness));
				return {
					harness,
					label,
					kind: (isWeb ? "web" : isApp ? "app" : "cli") as
						| "cli"
						| "web"
						| "app",
					token_basis: (isWeb ? "chars" : "usage") as "usage" | "chars",
					partial_coverage: isWeb,
					last_active_at: total.last > 0 ? total.last : null,
					total: {
						sessions: total.sessions,
						messages: total.messages,
						token_estimate: total.token_estimate,
					},
					today: today.get(harness) ?? emptyBucket(),
					week: week.get(harness) ?? emptyBucket(),
					month: month.get(harness) ?? emptyBucket(),
				};
			})
			.sort((a, b) => b.total.messages - a.total.messages);

		const daily = dailyRes.rows.map((raw) => {
			const r = raw as Record<string, unknown>;
			return { date: String(r.d), messages: Number(r.c ?? 0) };
		});

		return { harnesses, daily, generated_at: now };
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
				sendToLiveWebContents(deps.getMainWindow(), "harness-ingest-progress", {
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

	/**
	 * 目标入口在本机是否可启动（原生续接必须能真的把 CLI 拉起来）。
	 * 探测一次开销不小，但只在接力路径上调用，不在列表刷新的热路径。
	 */
	const targetInstalled = async (harness: string): Promise<boolean> => {
		const detections = await detectHarnesses();
		return detections.some((d) => d.harness === harness && d.canInject);
	};

	/** 选档：把用户设置里的默认策略与本次调用的显式指定合并。 */
	const decideMode = async (input: {
		session_id: string;
		target_harness: string;
		mode?: "auto" | "native" | "raw" | "distill";
	}) => {
		const brief = await loadSessionBrief(db, input.session_id);
		const settings = await loadHarnessHubSettings(db).catch(() => null);
		const force =
			input.mode && input.mode !== "auto"
				? input.mode
				: input.mode === "auto"
					? "auto"
					: (settings?.handoffPolicy ?? "auto");
		const decision = await pickHandoffMode(db, {
			sessionId: input.session_id,
			sourceHarness: brief.harness,
			targetHarness: input.target_harness,
			externalId: brief.externalId,
			targetInstalled: await targetInstalled(input.target_harness),
			force,
		});
		return { brief, decision };
	};

	const harness_handoff_plan: Handler<"harness_handoff_plan"> = async (
		_event,
		input,
	) => {
		const { brief, decision } = await decideMode(input);
		return {
			mode: decision.mode,
			reason: decision.reason,
			resume_command: decision.resumeCommand ?? null,
			transcript_chars: decision.transcriptChars,
			native_available: nativeResumeAvailable(
				brief.harness,
				input.target_harness,
				brief.externalId,
			),
		};
	};

	const harness_handoff_create: Handler<"harness_handoff_create"> = async (
		_event,
		input,
	) => {
		const { brief, decision } = await decideMode(input);

		let pkg: Awaited<ReturnType<typeof distillHandoff>>;
		if (decision.mode === "native") {
			// 原生续接不需要交接包本身，但仍落一条记录并给出可读说明——
			// 用户在「迁移历史」里要看得到这次接力发生过、走的是哪一档。
			const command = decision.resumeCommand ?? "";
			pkg = {
				goal: brief.title ?? "",
				done: [],
				inProgress: [],
				decisions: [],
				files: [],
				nextSteps: [],
				markdown: [
					"# 会话交接（原生续接）",
					"",
					`> 入口：${brief.harness}`,
					brief.cwd ? `> 工作目录：${brief.cwd}` : "",
					`> 原生会话 id：\`${brief.externalId ?? ""}\``,
					"",
					"本次接力不生成交接包：目标入口支持原生续接，会直接载入原会话，上下文完全无损。",
					"",
					"```bash",
					command,
					"```",
				]
					.filter((line) => line !== "")
					.join("\n"),
			};
		} else if (decision.mode === "raw") {
			const messages = await loadSessionTranscript(db, input.session_id);
			pkg = await buildRawHandoff(db, {
				sessionId: input.session_id,
				sourceHarness: brief.harness,
				targetHarness: input.target_harness,
				title: brief.title,
				cwd: brief.cwd,
				messages,
			});
		} else {
			pkg = await distillHandoff(db, {
				sessionId: input.session_id,
				targetHarness: input.target_harness as HarnessKind,
				model: input.model,
				onProgress: (p) => {
					try {
						sendToLiveWebContents(
							deps.getMainWindow(),
							"harness-handoff-event",
							{
								phase: p.phase,
								current: p.current,
								total: p.total,
							},
						);
					} catch {
						// 窗口已销毁
					}
				},
			});
		}

		const handoffId = randomUUID();
		await db.client.execute({
			sql: `INSERT INTO harness_handoffs
			        (id, source_session_id, target_harness, package_md, status, pty_id,
			         result_session_id, created_at, mode, payload_path, source_cwd)
			      VALUES (?, ?, ?, ?, 'created', NULL, NULL, ?, ?, NULL, ?)`,
			args: [
				handoffId,
				input.session_id,
				input.target_harness,
				pkg.markdown,
				Date.now(),
				decision.mode,
				brief.cwd,
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
		return {
			handoff_id: handoffId,
			package: outPackage,
			mode: decision.mode,
			reason: decision.reason,
			resume_command: decision.resumeCommand ?? null,
		};
	};

	/**
	 * 原生续接：直接起 pty 跑 `claude --resume` / `codex resume`。
	 *
	 * 刻意**不注入任何首条指令**——会话已经完整载入，替用户发一句"继续"
	 * 等于擅自替他开了一轮新对话。用户看到 TUI 恢复原状后自己接着说。
	 */
	const harness_resume_launch: Handler<"harness_resume_launch"> = async (
		_event,
		input,
	) => {
		const brief = await loadSessionBrief(db, input.session_id);
		const command = buildResumeCommand(brief.harness, brief.externalId, {
			fork: input.fork === true,
		});
		if (!command) {
			throw new Error(
				`${brief.harness} 不支持原生续接（缺少原生会话 id 或该入口没有 resume 命令）`,
			);
		}
		const cwd = input.cwd || brief.cwd || "";
		if (!cwd) {
			throw new Error("无法确定工作目录：源会话没有记录 cwd，请手动指定");
		}

		const launched = await launchHarnessWithHandoff({
			harness: brief.harness,
			cwd,
			handoffPath: null,
			instruction: null,
			commandOverride: command,
			tabName: `↺ ${brief.title ?? brief.harness}`,
			getMainWindow: deps.getMainWindow,
		});

		return {
			pty_id: launched.ptyId,
			command,
			ready_detected: launched.readyDetected,
		};
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
			             pty_id, result_session_id, created_at, mode, payload_path, source_cwd
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
			             pty_id, result_session_id, created_at, mode, payload_path, source_cwd
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
		// UA 必须在 attach 之前恢复：晚一步首个导航就已经用默认 UA 发出去了，
		// 带过去的 cf_clearance 会当场作废
		const uaMap = await loadSiteUserAgents();
		getAiHubViewService().setSiteUserAgent(site.id, uaMap[site.id] ?? null);
		getAiHubViewService().attach(win, site.id, site, input.bounds);
		return { success: true };
	};

	const aihub_set_bounds: Handler<"aihub_set_bounds"> = async (
		_event,
		input,
	) => {
		getAiHubViewService().setBounds(input.site_id, input.bounds);
		return { success: true };
	};

	const aihub_close: Handler<"aihub_close"> = async (_event, input) => {
		if (input?.site_id) {
			getAiHubViewService().detach(input.site_id);
		} else {
			getAiHubViewService().detachAll();
		}
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

	const aihub_cookie_sources: Handler<"aihub_cookie_sources"> = async (
		_event,
		input,
	) => {
		const sources = listCookieSources();
		const siteId = input?.site_id;
		if (!siteId) {
			return {
				sources: sources.map((s) => ({
					browser: s.browser,
					label: s.label,
					profile: s.profile,
				})),
			};
		}

		// 带 site_id 时统计每个 profile 的有效 cookie 条数，让用户能一眼看出
		// 哪个 profile 真的登录过。只读行不解密，不会弹钥匙串。
		const site = (await loadSites()).find((s) => s.id === siteId);
		const counted = await Promise.all(
			sources.map(async (s) => ({
				browser: s.browser,
				label: s.label,
				profile: s.profile,
				valid_cookies: site
					? await countValidCookies({
							source: s,
							siteUrl: site.url,
							authDomains: site.authDomains,
						})
					: 0,
			})),
		);
		// 有效条数多的排前面：用户十有八九要选的就是它
		counted.sort((a, b) => b.valid_cookies - a.valid_cookies);
		return { sources: counted };
	};

	const aihub_reload: Handler<"aihub_reload"> = async (_event, input) => {
		return { ok: getAiHubViewService().reload(input.site_id) };
	};

	const aihub_import_cookies: Handler<"aihub_import_cookies"> = async (
		_event,
		input,
	) => {
		const sites = await loadSites();
		const site = sites.find((s) => s.id === input.site_id);
		if (!site) {
			return { ok: false, imported: 0, skipped: 0, error: "站点不存在" };
		}
		const source = listCookieSources().find(
			(s) => s.browser === input.browser && s.profile === input.profile,
		);
		if (!source) {
			return {
				ok: false,
				imported: 0,
				skipped: 0,
				error: "浏览器 profile 不存在",
			};
		}
		const result = await importCookiesForSite({
			source,
			siteUrl: site.url,
			partition: aiHubPartition(site.id),
			authDomains: site.authDomains,
		});

		// 光搬 cookie 不够：cf_clearance 绑 IP + User-Agent，用 Electron 自带
		// Chromium 的 UA 发请求会被 Cloudflare 判定不匹配而作废。把来源浏览器的
		// 真实 UA 一并对齐并持久化，页面 reload 时就带着正确的 UA 走。
		if (result.ok) {
			const ua = await detectBrowserUserAgent(input.browser);
			if (ua) {
				await saveSiteUserAgent(site.id, ua);
				getAiHubViewService().setSiteUserAgent(site.id, ua);
				logger.info({
					msg: "已对齐内嵌视图 UA 到来源浏览器",
					siteId: site.id,
					browser: input.browser,
					userAgent: ua,
				});
			} else {
				// 探测不到就保持原样：拼一条半真半假的 UA 比不改更容易被风控
				logger.warn({
					msg: "读不到来源浏览器版本，UA 未对齐（cf_clearance 可能失效）",
					siteId: site.id,
					browser: input.browser,
				});
			}
		}

		return result;
	};

	// ==================
	// 会话交换（导出 / 导入 / 附件送进 Web 端）
	// ==================

	/** 取会话最近一次交接包（导出时可选带上）。 */
	const latestHandoffPackage = async (sessionId: string) => {
		const res = await db.client.execute({
			sql: `SELECT package_md FROM harness_handoffs
			      WHERE source_session_id = ? ORDER BY created_at DESC LIMIT 1`,
			args: [sessionId],
		});
		const row = res.rows[0] as Record<string, unknown> | undefined;
		if (!row?.package_md) return null;
		// 存的是渲染好的 markdown 而不是结构体，导出时按「决策区放全文」处理，
		// 不做二次解析——解析自己渲染出来的 markdown 是一条极易腐坏的回路。
		return {
			goal: "",
			done: [],
			inProgress: [],
			decisions: [String(row.package_md)],
			files: [],
			nextSteps: [],
		};
	};

	/** 组装一段会话的交换文档。 */
	const buildDocFor = async (sessionId: string, includeHandoff: boolean) => {
		const brief = await loadSessionBrief(db, sessionId);
		const messages = await loadSessionTranscript(db, sessionId, 2000);
		if (!messages.length) {
			throw new Error("该会话没有可导出的转录内容");
		}
		return buildExchangeDocument({
			harness: brief.harness,
			sessionId: brief.id,
			externalId: brief.externalId,
			cwd: brief.cwd,
			title: brief.title,
			messages,
			handoff: includeHandoff ? await latestHandoffPackage(sessionId) : null,
		});
	};

	const harness_session_export: Handler<"harness_session_export"> = async (
		event,
		input,
	) => {
		const doc = await buildDocFor(
			input.session_id,
			input.include_handoff !== false,
		);
		const asMarkdown = input.format === "markdown";
		const baseName = suggestExchangeFileName(doc);
		const fileName = asMarkdown
			? baseName.replace(/\.aihub-session\.json$/, ".md")
			: baseName;
		const dir = input.dir?.trim() || tmpdir();
		const filePath = path.join(dir, fileName);
		const content = asMarkdown
			? renderExchangeMarkdown(doc)
			: JSON.stringify(doc, null, 2);

		await fsSafe.write_file_safe(event, {
			path: filePath,
			content,
			create_dirs: true,
		});

		return {
			path: filePath,
			file_name: fileName,
			bytes: Buffer.byteLength(content, "utf-8"),
			message_count: doc.messages.length,
		};
	};

	/** 把解析结果写进 canonical 表。 */
	const persistImported = async (parsed: {
		harness: string;
		externalId: string | null;
		cwd: string | null;
		title: string | null;
		messages: CanonicalMessage[];
		detectedFormat: string;
	}) => {
		const now = Date.now();
		const sessionId = newImportedSessionId(parsed.harness);
		const title =
			parsed.title?.trim() ||
			parsed.messages.find((m) => m.role === "user")?.content.slice(0, 60) ||
			"导入的会话";

		await withBatch(db, [
			{
				sql: `INSERT INTO harness_sessions
				        (id, harness, external_id, cwd, title, summary, status, origin_path,
				         byte_offset, message_count, token_estimate, meta_json, created_at, updated_at)
				      VALUES (?, ?, ?, ?, ?, NULL, 'idle', NULL, 0, ?, ?, ?, ?, ?)`,
				args: [
					sessionId,
					parsed.harness,
					parsed.externalId ?? sessionId,
					parsed.cwd,
					title,
					parsed.messages.length,
					Math.round(
						parsed.messages.reduce((n, m) => n + m.content.length, 0) / 4,
					),
					JSON.stringify({
						importedFrom: parsed.detectedFormat,
						importedAt: now,
					}),
					parsed.messages[0]?.createdAt || now,
					parsed.messages[parsed.messages.length - 1]?.createdAt || now,
				],
			},
			...parsed.messages.map((m, i) => ({
				sql: `INSERT INTO harness_messages
				        (id, session_id, role, content, blocks_json, seq, created_at)
				      VALUES (?, ?, ?, ?, ?, ?, ?)`,
				args: [
					`${sessionId}#${i}`,
					sessionId,
					m.role,
					m.content,
					m.blocks?.length ? JSON.stringify(m.blocks) : null,
					i,
					m.createdAt,
				],
			})),
		]);

		return { sessionId, title };
	};

	const harness_session_import: Handler<"harness_session_import"> = async (
		_event,
		input,
	) => {
		const parsed = input.path
			? await parseExchangeFile(input.path, { index: input.index })
			: parseExchangeText(input.text ?? "", { index: input.index });

		const { sessionId, title } = await persistImported(parsed);
		return {
			session_id: sessionId,
			detected_format: parsed.detectedFormat,
			message_count: parsed.messages.length,
			sibling_count: parsed.siblingCount,
			title,
		};
	};

	const harness_import_candidates: Handler<
		"harness_import_candidates"
	> = async (event, input) => {
		const read = await fsSafe.read_file_safe(event, { path: input.path });
		return {
			conversations: listChatgptConversations(read.content).map((c) => ({
				index: c.index,
				title: c.title,
				message_count: c.messageCount,
				updated_at: c.updatedAt,
			})),
		};
	};

	/**
	 * 把一段会话作为附件送进 Web 站点。
	 *
	 * 降级链条是明示的三档：附件 → 正文 → 剪贴板。每一档都在返回值里如实标注，
	 * UI 据此告诉用户「上下文进去了几成」——静默降级会让人以为长上下文
	 * 已经完整送达，而实际上只塞进去一个开头。
	 */
	const aihub_send_session: Handler<"aihub_send_session"> = async (
		event,
		input,
	) => {
		const sites = await loadSites();
		const site = findWebSite(sites, input.site_id);
		if (!site) {
			return {
				ok: false,
				method: "clipboard" as const,
				path: null,
				error: `找不到站点 ${input.site_id}`,
			};
		}

		const doc = await buildDocFor(
			input.session_id,
			input.include_handoff !== false,
		);
		const markdown = renderExchangeMarkdown(doc);
		const fileName = suggestExchangeFileName(doc).replace(
			/\.aihub-session\.json$/,
			".md",
		);
		const filePath = path.join(tmpdir(), fileName);
		await fsSafe.write_file_safe(event, {
			path: filePath,
			content: markdown,
			create_dirs: true,
		});

		const prompt =
			input.prompt?.trim() ||
			`我把之前在 ${doc.source.harness} 上的完整会话上下文作为附件发给你（${doc.messages.length} 条消息）。请先读完附件，理解任务目标、已完成的部分和关键决策，然后接手继续。有不清楚的地方直接问我。`;

		// 站点视图必须先存在，附件与文本都要往里塞
		const view = await getAiHubViewService().ensureView(site);
		if (!view) {
			return {
				ok: false,
				method: "clipboard" as const,
				path: filePath,
				error: `无法加载 ${site.label}`,
			};
		}

		const uploaded = await getAiHubViewService().uploadAttachment(site, {
			fileName,
			mimeType: "text/markdown",
			base64: Buffer.from(markdown, "utf-8").toString("base64"),
		});

		if (uploaded) {
			const injected = await getAiHubViewService().inject(site, prompt);
			return {
				ok: true,
				method: injected.method === "dom" ? "attachment" : "clipboard",
				path: filePath,
				error: null,
			};
		}

		// 附件通道不通：退而求其次，把全文当正文填进去
		const injected = await getAiHubViewService().inject(
			site,
			`${prompt}\n\n---\n\n${markdown}`,
		);
		return {
			ok: injected.method === "dom",
			method: injected.method === "dom" ? "inline" : "clipboard",
			path: filePath,
			error:
				injected.method === "dom"
					? null
					: `${site.label} 的输入框选择器已失效，内容已复制到剪贴板`,
		};
	};

	return {
		harness_detect,
		harness_usage_stats,
		harness_sessions_list,
		harness_session_get,
		harness_sessions_search,
		harness_ingest_scan,
		harness_session_delete,
		harness_handoff_plan,
		harness_handoff_create,
		harness_handoff_update,
		harness_handoff_launch,
		harness_resume_launch,
		harness_pty_close,
		harness_handoff_list,
		harness_handoff_get,
		harness_session_export,
		harness_session_import,
		harness_import_candidates,
		aihub_sites_list,
		aihub_sites_save,
		aihub_open,
		aihub_set_bounds,
		aihub_close,
		aihub_inject,
		aihub_extract,
		aihub_import_session,
		aihub_send_session,
		aihub_cookie_sources,
		aihub_import_cookies,
		aihub_reload,
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
