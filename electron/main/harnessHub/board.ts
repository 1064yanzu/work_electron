/**
 * 共享白板 —— 按工作目录作用域的跨 agent 长期工作记忆。
 *
 * 一次性的 HANDOFF 是「接力棒」：搬完就完了。白板是「共享黑板」：目标、已定的
 * 决策、踩过的坑、待办，所有入口都能读能写，谁改了什么其他人下次进来就看得见。
 * 跨 agent 协作真正缺的是这个，而不是更精细的一次性摘要。
 *
 * 真相源是 DB（`harness_board_entries`）；同时把它整体渲染成
 * `<scope>/.aihub/BOARD.md` —— 这样即使某个 agent 没接 MCP、没走本应用，
 * 它只要能读文件就能看到白板。文件是**渲染产物**，每次写入整体重写，
 * 不做增量 patch（增量 patch 与 DB 不一致时无法判定谁对）。
 *
 * 文件写入统一走 `*_safe` 体系（项目硬规则：绝对路径 + 原子写）。
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../db/client";
import { createLogger } from "../logging/logger";
import { createFsSafeHandlers } from "../ipc/handlers/fsSafe";
import type { BoardEntry, BoardEntryKind } from "./types";

const logger = createLogger();

/**
 * fsSafe 的 handler 签名带 IpcMainInvokeEvent，但实现里全部是 `_event`（未使用）。
 * 主进程内部调用没有真实 event，传 null 并在此处一次性说明，好过在每个调用点
 * 各自造一个假 event 对象。
 */
const NO_EVENT = null as unknown as IpcMainInvokeEvent;

const fsSafe = createFsSafeHandlers();

/** 白板文件相对 scope 的路径。 */
export const BOARD_DIR = ".aihub";
export const BOARD_FILE = "BOARD.md";

/** 各类型的展示名与排序权重（渲染 markdown 时按此分节）。 */
const KIND_META: Record<BoardEntryKind, { label: string; order: number }> = {
	goal: { label: "任务目标", order: 0 },
	decision: { label: "已定决策", order: 1 },
	pitfall: { label: "踩过的坑", order: 2 },
	next: { label: "待办", order: 3 },
	note: { label: "备注", order: 4 },
};

const VALID_KINDS = Object.keys(KIND_META) as BoardEntryKind[];

/** 宽松校验条目类型，非法值回落到 note（宁可归错类也不丢内容）。 */
export function normalizeBoardKind(raw: unknown): BoardEntryKind {
	const value = String(raw ?? "").trim() as BoardEntryKind;
	return VALID_KINDS.includes(value) ? value : "note";
}

function parseRow(row: Record<string, unknown>): BoardEntry {
	return {
		id: String(row.id ?? ""),
		scope: String(row.scope ?? ""),
		kind: normalizeBoardKind(row.kind),
		content: String(row.content ?? ""),
		author: (row.author as string) ?? null,
		sessionId: (row.session_id as string) ?? null,
		state: row.state === "done" ? "done" : "open",
		createdAt: Number(row.created_at ?? 0),
		updatedAt: Number(row.updated_at ?? 0),
	};
}

/**
 * 规范化作用域。
 *
 * 空 / 未传 → 空串（全局白板）。绝对路径去掉尾部分隔符，避免
 * `/a/b` 与 `/a/b/` 被当成两个不同的白板。
 */
export function normalizeScope(cwd: string | null | undefined): string {
	const raw = (cwd ?? "").trim();
	if (!raw) return "";
	return raw.length > 1 ? raw.replace(/[/\\]+$/, "") : raw;
}

/** 列出某作用域的白板条目（全局条目一并返回，全局是所有作用域的公共前缀）。 */
export async function listBoardEntries(
	db: DbContext,
	cwd: string | null | undefined,
	options: { includeGlobal?: boolean; includeDone?: boolean } = {},
): Promise<BoardEntry[]> {
	const scope = normalizeScope(cwd);
	const { includeGlobal = true, includeDone = true } = options;

	const scopes = includeGlobal && scope ? [scope, ""] : [scope];
	const placeholders = scopes.map(() => "?").join(", ");
	const stateFilter = includeDone ? "" : "AND state != 'done'";

	const res = await db.client.execute({
		sql: `SELECT id, scope, kind, content, author, session_id, state, created_at, updated_at
		      FROM harness_board_entries
		      WHERE scope IN (${placeholders}) ${stateFilter}
		      ORDER BY created_at ASC`,
		args: scopes,
	});
	const entries = res.rows.map((r) => parseRow(r as Record<string, unknown>));
	// 按类型分组顺序排，同组内保持时间顺序
	return entries.sort(
		(a, b) =>
			KIND_META[a.kind].order - KIND_META[b.kind].order ||
			a.createdAt - b.createdAt,
	);
}

/** 新增一条白板条目，并同步白板文件。 */
export async function addBoardEntry(
	db: DbContext,
	input: {
		cwd: string | null | undefined;
		kind: BoardEntryKind | string;
		content: string;
		author?: string | null;
		sessionId?: string | null;
	},
): Promise<BoardEntry> {
	const content = input.content.trim();
	if (!content) throw new Error("白板条目内容为空");

	const scope = normalizeScope(input.cwd);
	const now = Date.now();
	const entry: BoardEntry = {
		id: randomUUID(),
		scope,
		kind: normalizeBoardKind(input.kind),
		content,
		author: input.author?.trim() || null,
		sessionId: input.sessionId?.trim() || null,
		state: "open",
		createdAt: now,
		updatedAt: now,
	};

	await db.client.execute({
		sql: `INSERT INTO harness_board_entries
		        (id, scope, kind, content, author, session_id, state, created_at, updated_at)
		      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			entry.id,
			entry.scope,
			entry.kind,
			entry.content,
			entry.author,
			entry.sessionId,
			entry.state,
			entry.createdAt,
			entry.updatedAt,
		],
	});

	await syncBoardFile(db, scope);
	return entry;
}

/** 更新条目内容 / 状态。 */
export async function updateBoardEntry(
	db: DbContext,
	input: { id: string; content?: string; state?: "open" | "done" },
): Promise<boolean> {
	const sets: string[] = [];
	const args: (string | number)[] = [];
	if (typeof input.content === "string" && input.content.trim()) {
		sets.push("content = ?");
		args.push(input.content.trim());
	}
	if (input.state === "open" || input.state === "done") {
		sets.push("state = ?");
		args.push(input.state);
	}
	if (!sets.length) return false;
	sets.push("updated_at = ?");
	args.push(Date.now(), input.id);

	const res = await db.client.execute({
		sql: `UPDATE harness_board_entries SET ${sets.join(", ")} WHERE id = ?`,
		args,
	});
	if (res.rowsAffected === 0) return false;

	const scopeRes = await db.client.execute({
		sql: `SELECT scope FROM harness_board_entries WHERE id = ?`,
		args: [input.id],
	});
	const scope = String(
		(scopeRes.rows[0] as Record<string, unknown> | undefined)?.scope ?? "",
	);
	await syncBoardFile(db, scope);
	return true;
}

/** 删除条目。 */
export async function removeBoardEntry(
	db: DbContext,
	id: string,
): Promise<boolean> {
	const scopeRes = await db.client.execute({
		sql: `SELECT scope FROM harness_board_entries WHERE id = ?`,
		args: [id],
	});
	const row = scopeRes.rows[0] as Record<string, unknown> | undefined;
	if (!row) return false;
	await db.client.execute({
		sql: `DELETE FROM harness_board_entries WHERE id = ?`,
		args: [id],
	});
	await syncBoardFile(db, String(row.scope ?? ""));
	return true;
}

/** 把白板渲染成 markdown（写文件与并入交接包共用）。 */
export function renderBoardMarkdown(
	entries: BoardEntry[],
	scope: string,
): string {
	if (!entries.length) {
		return [
			"# 共享白板（AI Hub）",
			"",
			scope ? `> 作用域：${scope}` : "> 作用域：全局",
			"",
			"（暂无内容）",
			"",
		].join("\n");
	}

	const grouped = new Map<BoardEntryKind, BoardEntry[]>();
	for (const entry of entries) {
		const list = grouped.get(entry.kind) ?? [];
		list.push(entry);
		grouped.set(entry.kind, list);
	}

	const lines: string[] = [
		"# 共享白板（AI Hub）",
		"",
		scope ? `> 作用域：${scope}` : "> 作用域：全局",
		"> 本文件由 IPO Workbench 的 AI Hub 自动生成，是数据库内容的渲染产物；",
		"> 直接编辑本文件不会回写，请通过 Hub 或 MCP 工具 `board_write` 修改。",
		"",
	];

	for (const kind of VALID_KINDS) {
		const list = grouped.get(kind);
		if (!list?.length) continue;
		lines.push(`## ${KIND_META[kind].label}`, "");
		for (const entry of list) {
			const mark =
				kind === "next" ? (entry.state === "done" ? "x" : " ") : null;
			const prefix = mark === null ? "-" : `- [${mark}]`;
			const author = entry.author ? ` _（${entry.author}）_` : "";
			lines.push(`${prefix} ${entry.content}${author}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

/**
 * 把某作用域的白板重渲染到 `<scope>/.aihub/BOARD.md`。
 *
 * 全局白板（scope 为空）没有落盘目标，直接跳过——写到哪个目录都是错的。
 * 写失败只记日志不抛：白板的真相源是 DB，文件写不了（目录只读、盘满）
 * 不应该让整个操作失败。
 */
export async function syncBoardFile(
	db: DbContext,
	scope: string,
): Promise<string | null> {
	const normalized = normalizeScope(scope);
	if (!normalized || !path.isAbsolute(normalized)) return null;

	try {
		const entries = await listBoardEntries(db, normalized, {
			includeGlobal: false,
		});
		const filePath = path.join(normalized, BOARD_DIR, BOARD_FILE);
		await fsSafe.write_file_safe(NO_EVENT, {
			path: filePath,
			content: renderBoardMarkdown(entries, normalized),
			create_dirs: true,
		});
		return filePath;
	} catch (error) {
		logger.warn({
			msg: "白板文件写入失败（DB 内容不受影响）",
			scope: normalized,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

/**
 * 白板的紧凑摘要，用于并进交接包。
 *
 * 只取真正会影响接手者行为的三类（决策 / 踩坑 / 未完成待办），
 * 目标与备注留给转录本身表达，避免交接包里出现两份相互矛盾的「任务目标」。
 */
export function summarizeBoardForHandoff(entries: BoardEntry[]): {
	decisions: string[];
	pitfalls: string[];
	nextSteps: string[];
} {
	return {
		decisions: entries
			.filter((e) => e.kind === "decision")
			.map((e) => e.content),
		pitfalls: entries.filter((e) => e.kind === "pitfall").map((e) => e.content),
		nextSteps: entries
			.filter((e) => e.kind === "next" && e.state !== "done")
			.map((e) => e.content),
	};
}
