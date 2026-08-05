/**
 * 摄取引擎 —— 扫描 / 增量续读各 harness 的会话文件，写入 canonical 表。
 *
 * 两条路径：
 * 1. `scanAll()`：全量扫描（首次启动、用户手动刷新）。按 mtime 倒序，只处理有变化的文件。
 * 2. `startWatching()`：chokidar 增量 watcher。JSONL 是追加写，按 byte_offset 只读新增字节。
 *
 * 为什么不用 fileWatcherService：其 DEFAULT_IGNORED 硬编码了 `**\/projects\/**`
 * （fileWatcherService.ts L35），会把 ~/.claude/projects 整棵树吞掉；且 depth 限制为 5。
 * 这里参照 agentSdk/memoryFileWatcher.ts 的轻量写法自建。
 */
import type { FSWatcher } from "chokidar";
import type { BrowserWindow } from "electron";
import type { InStatement } from "@libsql/client";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { chunkArray, withBatch, yieldToEventLoop } from "../db/batch";
import type { DbContext } from "../db/client";
import { createLogger } from "../logging/logger";
import {
	claudeCodeSessionDir,
	isClaudeCodeSessionFile,
	parseClaudeCodeSession,
} from "./adapters/claudeCode";
import {
	codexSessionDir,
	isCodexSessionFile,
	parseCodexSession,
} from "./adapters/codex";
import { listIpoSdkSessionIds, parseIpoSdkSession } from "./adapters/ipoSdk";
import type {
	AdapterParseResult,
	CanonicalSession,
	HarnessKind,
} from "./types";

const logger = createLogger();

/** 单事务最大语句数（照 chatHistory.ts 的口径，防主进程停顿）。 */
const MAX_STATEMENTS_PER_BATCH = 400;

/** 摄取进度事件（推给渲染端做进度条）。 */
export interface IngestProgress {
	phase: "scanning" | "parsing" | "done";
	harness: HarnessKind | null;
	processed: number;
	total: number;
	/** 本轮新增/更新的会话数 */
	updated: number;
	skippedLines: number;
}

/** 支持增量摄取的来源定义。 */
interface IngestSource {
	harness: HarnessKind;
	rootDir: () => string;
	match: (filePath: string) => boolean;
	parse: (
		filePath: string,
		fromOffset: number,
		prev?: Partial<CanonicalSession>,
	) => Promise<AdapterParseResult | null>;
}

const SOURCES: IngestSource[] = [
	{
		harness: "claude-code",
		rootDir: claudeCodeSessionDir,
		match: isClaudeCodeSessionFile,
		parse: parseClaudeCodeSession,
	},
	{
		harness: "codex",
		rootDir: codexSessionDir,
		match: isCodexSessionFile,
		parse: parseCodexSession,
	},
];

/** 递归收集目录下匹配的文件（含 mtime，用于跳过无变化文件）。 */
async function collectFiles(
	dir: string,
	match: (p: string) => boolean,
	out: { path: string; mtimeMs: number; size: number }[] = [],
	depth = 0,
): Promise<{ path: string; mtimeMs: number; size: number }[]> {
	if (depth > 6) return out;
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return out;
	}
	for (const entry of entries) {
		if (entry.startsWith(".")) continue;
		const full = path.join(dir, entry);
		try {
			const st = await stat(full);
			if (st.isDirectory()) {
				await collectFiles(full, match, out, depth + 1);
			} else if (match(full)) {
				out.push({ path: full, mtimeMs: st.mtimeMs, size: st.size });
			}
		} catch {
			// 权限/软链失效等：跳过单个条目，不中断整体扫描
		}
	}
	return out;
}

/** 已摄取会话的续读游标。 */
interface SessionCursor {
	id: string;
	byteOffset: number;
	messageCount: number;
	tokenEstimate: number;
	title: string | null;
	summary: string | null;
	createdAt: number;
	updatedAt: number;
	meta: Record<string, unknown>;
	externalId: string;
	cwd: string | null;
}

/** 按 origin_path 批量取已摄取游标。 */
async function loadCursors(
	db: DbContext,
	harness: HarnessKind,
): Promise<Map<string, SessionCursor>> {
	const result = await db.client.execute({
		sql: `SELECT id, external_id, cwd, title, summary, origin_path, byte_offset,
		             message_count, token_estimate, meta_json, created_at, updated_at
		      FROM harness_sessions WHERE harness = ? AND origin_path IS NOT NULL`,
		args: [harness],
	});
	const map = new Map<string, SessionCursor>();
	for (const row of result.rows) {
		const r = row as Record<string, unknown>;
		const originPath = r.origin_path as string;
		if (!originPath) continue;
		let meta: Record<string, unknown> = {};
		try {
			meta = r.meta_json ? JSON.parse(r.meta_json as string) : {};
		} catch {
			meta = {};
		}
		map.set(originPath, {
			id: r.id as string,
			externalId: (r.external_id as string) ?? "",
			cwd: (r.cwd as string) ?? null,
			title: (r.title as string) ?? null,
			summary: (r.summary as string) ?? null,
			byteOffset: Number(r.byte_offset ?? 0),
			messageCount: Number(r.message_count ?? 0),
			tokenEstimate: Number(r.token_estimate ?? 0),
			createdAt: Number(r.created_at ?? 0),
			updatedAt: Number(r.updated_at ?? 0),
			meta,
		});
	}
	return map;
}

/** 把一次解析结果落库（会话 upsert + 新增消息 insert）。 */
function buildStatements(
	result: AdapterParseResult,
	restarted: boolean,
): InStatement[] {
	const s = result.session;
	const statements: InStatement[] = [];

	// 不连续重读：先清掉该会话的旧消息，避免与重新编号的 seq 并存
	// （codex 的消息 id 含 seq，续写会直接产生重复转录）。
	if (restarted) {
		statements.push({
			sql: `DELETE FROM harness_messages WHERE session_id = ?`,
			args: [s.id],
		});
	}

	statements.push({
		sql: `INSERT INTO harness_sessions
			        (id, harness, external_id, cwd, title, summary, status, origin_path,
			         byte_offset, message_count, token_estimate, meta_json, created_at, updated_at)
			      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			      ON CONFLICT(id) DO UPDATE SET
			        cwd = excluded.cwd,
			        title = excluded.title,
			        status = excluded.status,
			        origin_path = excluded.origin_path,
			        byte_offset = excluded.byte_offset,
			        message_count = excluded.message_count,
			        token_estimate = excluded.token_estimate,
			        meta_json = excluded.meta_json,
			        updated_at = excluded.updated_at`,
		args: [
			s.id,
			s.harness,
			s.externalId,
			s.cwd,
			s.title,
			s.summary,
			s.status,
			s.originPath,
			s.byteOffset,
			s.messageCount,
			s.tokenEstimate,
			JSON.stringify(s.meta ?? {}),
			s.createdAt,
			s.updatedAt,
		],
	});

	for (const m of result.messages) {
		statements.push({
			sql: `INSERT INTO harness_messages
			        (id, session_id, role, content, blocks_json, seq, created_at)
			      VALUES (?, ?, ?, ?, ?, ?, ?)
			      ON CONFLICT(id) DO UPDATE SET
			        content = excluded.content,
			        blocks_json = excluded.blocks_json,
			        seq = excluded.seq`,
			args: [
				`${s.id}#${m.id}`,
				s.id,
				m.role,
				m.content,
				m.blocks ? JSON.stringify(m.blocks) : null,
				m.seq,
				m.createdAt,
			],
		});
	}
	return statements;
}

async function flushStatements(
	db: DbContext,
	statements: InStatement[],
): Promise<void> {
	if (!statements.length) return;
	const chunks = chunkArray(statements, MAX_STATEMENTS_PER_BATCH);
	for (let i = 0; i < chunks.length; i++) {
		await withBatch(db, chunks[i]);
		if (i < chunks.length - 1) await yieldToEventLoop();
	}
}

/**
 * 摄取单个文件（增量）。返回是否有实际更新。
 */
export async function ingestFile(
	db: DbContext,
	source: IngestSource,
	filePath: string,
	cursor?: SessionCursor,
): Promise<{ updated: boolean; skippedLines: number }> {
	const prev: Partial<CanonicalSession> | undefined = cursor
		? {
				externalId: cursor.externalId,
				cwd: cursor.cwd,
				title: cursor.title,
				summary: cursor.summary,
				messageCount: cursor.messageCount,
				tokenEstimate: cursor.tokenEstimate,
				createdAt: cursor.createdAt,
				updatedAt: cursor.updatedAt,
				meta: cursor.meta,
			}
		: undefined;

	const result = await source.parse(filePath, cursor?.byteOffset ?? 0, prev);
	if (!result) return { updated: false, skippedLines: 0 };
	// 无新增消息且 offset 没动 → 无需写库（重读场景除外：要清旧消息）
	if (
		!result.restarted &&
		!result.messages.length &&
		cursor &&
		result.session.byteOffset === cursor.byteOffset
	) {
		return { updated: false, skippedLines: result.skippedLines };
	}

	await flushStatements(db, buildStatements(result, result.restarted === true));
	return { updated: true, skippedLines: result.skippedLines };
}

/**
 * 全量扫描所有来源。
 *
 * @param onProgress 进度回调（推给渲染端）
 */
export async function scanAll(
	db: DbContext,
	onProgress?: (p: IngestProgress) => void,
): Promise<{ updated: number; scanned: number; skippedLines: number }> {
	let updated = 0;
	let scanned = 0;
	let skippedLines = 0;

	for (const source of SOURCES) {
		const root = source.rootDir();
		onProgress?.({
			phase: "scanning",
			harness: source.harness,
			processed: 0,
			total: 0,
			updated,
			skippedLines,
		});

		const [files, cursors] = await Promise.all([
			collectFiles(root, source.match),
			loadCursors(db, source.harness),
		]);
		// 新文件优先（mtime 倒序），让用户最近的会话最先出现在 UI 上
		files.sort((a, b) => b.mtimeMs - a.mtimeMs);

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const cursor = cursors.get(file.path);
			// 文件大小没变且已摄取过 → 跳过（避免重复解析 600+ 文件）
			if (cursor && cursor.byteOffset >= file.size) {
				scanned += 1;
				continue;
			}
			try {
				const r = await ingestFile(db, source, file.path, cursor);
				if (r.updated) updated += 1;
				skippedLines += r.skippedLines;
			} catch (error) {
				logger.warn({
					msg: "harness 会话摄取失败",
					file: file.path,
					error: error instanceof Error ? error.message : String(error),
				});
			}
			scanned += 1;
			// 每 20 个文件让出一次事件循环 + 报一次进度
			if (i % 20 === 0) {
				await yieldToEventLoop();
				onProgress?.({
					phase: "parsing",
					harness: source.harness,
					processed: i + 1,
					total: files.length,
					updated,
					skippedLines,
				});
			}
		}
	}

	onProgress?.({
		phase: "done",
		harness: null,
		processed: scanned,
		total: scanned,
		updated,
		skippedLines,
	});
	logger.info({ msg: "harness 全量扫描完成", scanned, updated, skippedLines });
	return { updated, scanned, skippedLines };
}

/**
 * 摄取本应用自己的会话（ipo-sdk）。
 *
 * 与文件型来源不同，这里的增量水位是 chat_sessions.updated_at：
 * 只重摄取比 canonical 表里已记录的 updated_at 更新的会话。
 */
export async function scanIpoSdk(
	db: DbContext,
): Promise<{ updated: number; scanned: number }> {
	// 取本应用会话在 canonical 表里的最新水位。
	// 用 >= 而非 >（见 listIpoSdkSessionIds）：严格大于会让「水位那一刻解析失败的
	// 会话」永远不再重试；重复摄取一两个会话的代价远小于永久漏掉。
	const waterRes = await db.client.execute({
		sql: `SELECT COALESCE(MAX(updated_at), 0) AS w FROM harness_sessions WHERE harness = 'ipo-sdk'`,
		args: [],
	});
	const since = Number(
		(waterRes.rows[0] as Record<string, unknown> | undefined)?.w ?? 0,
	);

	const ids = await listIpoSdkSessionIds(db, since);
	let updated = 0;
	for (let i = 0; i < ids.length; i++) {
		try {
			const result = await parseIpoSdkSession(db, ids[i]);
			if (!result) continue;
			// ipo-sdk 每次都是整会话重解析（数据源是 SQLite 不是追加写文件），
			// 必须按重读处理先清旧消息，否则删掉的消息会残留在 canonical 表里。
			await flushStatements(db, buildStatements(result, true));
			updated += 1;
		} catch (error) {
			logger.warn({
				msg: "ipo-sdk 会话摄取失败",
				sessionId: ids[i],
				error: error instanceof Error ? error.message : String(error),
			});
		}
		if (i % 20 === 0) await yieldToEventLoop();
	}
	return { updated, scanned: ids.length };
}

/**
 * 增量 watcher（单例）。
 *
 * chokidar 的 awaitWriteFinish 会等文件写稳定再触发，配合路径粒度 debounce，
 * 避免 CLI 高频追加时把主进程打满。
 */
class HarnessIngestWatcher {
	private watchers: FSWatcher[] = [];
	private timers = new Map<string, NodeJS.Timeout>();
	private db: DbContext | null = null;
	private getMainWindow: (() => BrowserWindow | null | undefined) | null = null;
	private starting = false;

	async start(
		db: DbContext,
		getMainWindow: () => BrowserWindow | null | undefined,
	): Promise<void> {
		if (this.watchers.length || this.starting) return;
		this.starting = true;
		this.db = db;
		this.getMainWindow = getMainWindow;

		try {
			const { watch } = await import("chokidar");
			for (const source of SOURCES) {
				const root = source.rootDir();
				const watcher = watch(root, {
					ignoreInitial: true,
					awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 300 },
					persistent: true,
					// 会话目录层级：claude-code 2 层、codex 4 层（Y/M/D/file）
					depth: 5,
				});
				watcher.on("all", (_event: string, filePath: string) => {
					if (!source.match(filePath)) return;
					this.schedule(source, filePath);
				});
				watcher.on("error", (error: unknown) => {
					logger.warn({
						msg: "harness watcher 错误",
						harness: source.harness,
						error: error instanceof Error ? error.message : String(error),
					});
				});
				this.watchers.push(watcher);
			}
			logger.info({ msg: "harness 增量 watcher 已启动" });
		} catch (error) {
			logger.warn({
				msg: "harness watcher 启动失败",
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			this.starting = false;
		}
	}

	/** 路径粒度 debounce：活跃 CLI 会连续追加，攒 800ms 再摄取一次。 */
	private schedule(source: IngestSource, filePath: string): void {
		const existing = this.timers.get(filePath);
		if (existing) clearTimeout(existing);
		this.timers.set(
			filePath,
			setTimeout(() => {
				this.timers.delete(filePath);
				void this.run(source, filePath);
			}, 800),
		);
	}

	private async run(source: IngestSource, filePath: string): Promise<void> {
		const db = this.db;
		if (!db) return;
		try {
			const cursors = await loadCursors(db, source.harness);
			const r = await ingestFile(db, source, filePath, cursors.get(filePath));
			if (!r.updated) return;
			try {
				this.getMainWindow?.()?.webContents.send("harness-session-updated", {
					harness: source.harness,
					origin_path: filePath,
				});
			} catch {
				// 窗口已销毁：忽略
			}
		} catch (error) {
			logger.warn({
				msg: "harness 增量摄取失败",
				file: filePath,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	async stop(): Promise<void> {
		for (const timer of this.timers.values()) clearTimeout(timer);
		this.timers.clear();
		await Promise.all(
			this.watchers.map((w) => w.close().catch(() => undefined)),
		);
		this.watchers = [];
		this.db = null;
		this.getMainWindow = null;
	}
}

export const harnessIngestWatcher = new HarnessIngestWatcher();
