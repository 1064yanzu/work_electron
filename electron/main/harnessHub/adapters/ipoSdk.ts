/**
 * 本应用 Agent SDK adapter —— 把 `chat_sessions` / `chat_messages`（v4 表）
 * 映射进 canonical 格式，使本应用自己的会话与外部 CLI 会话对称可迁移。
 *
 * 与文件型 adapter 的差异：数据源是 SQLite 而非 JSONL，没有 byte_offset 概念，
 * 每次按 updated_at 水位做增量（只重摄取有变化的会话）。
 *
 * 注：SDK 的运行时隔离现状（配置目录副本 + 本地代理 + 鉴权剥离，与用户 ~/.claude
 * 互不干扰）保持不变，本 adapter 只读它落库后的会话数据。
 */
import type { DbContext } from "../../db/client";
import type {
	AdapterParseResult,
	CanonicalBlock,
	CanonicalMessage,
	CanonicalSession,
} from "../types";
import { asRecord, asString, flattenBlocks } from "./shared";

/** 把 chat_messages.blocks_json 归一成 CanonicalBlock[]。 */
function normalizeBlocks(
	blocksJson: string | null,
	content: string,
): CanonicalBlock[] {
	if (blocksJson) {
		try {
			const parsed = JSON.parse(blocksJson) as unknown;
			if (Array.isArray(parsed)) {
				const blocks: CanonicalBlock[] = [];
				for (const raw of parsed) {
					const b = asRecord(raw);
					if (!b) continue;
					const t = asString(b.type);
					if (t === "text") {
						const text = asString(b.text) || asString(b.content);
						if (text.trim()) blocks.push({ type: "text", text });
					} else if (t === "thinking") {
						const text = asString(b.thinking) || asString(b.text);
						if (text.trim()) blocks.push({ type: "thinking", text });
					} else if (t === "tool_use" || t === "tool-call") {
						blocks.push({
							type: "tool_use",
							name: asString(b.name) || "unknown",
							input: b.input,
							id: asString(b.id) || undefined,
						});
					} else if (t === "tool_result" || t === "tool-result") {
						const out =
							typeof b.content === "string"
								? b.content
								: asString(b.output) || JSON.stringify(b.content ?? "");
						if (out.trim()) {
							blocks.push({
								type: "tool_result",
								output: out,
								id: asString(b.tool_use_id) || asString(b.id) || undefined,
								isError: b.is_error === true,
							});
						}
					}
				}
				if (blocks.length) return blocks;
			}
		} catch {
			// blocks_json 损坏：回落纯文本
		}
	}
	return content.trim() ? [{ type: "text", text: content }] : [];
}

/**
 * 摄取本应用的一个会话。
 *
 * @param sessionId chat_sessions.id
 */
export async function parseIpoSdkSession(
	db: DbContext,
	sessionId: string,
): Promise<AdapterParseResult | null> {
	const sessionRes = await db.client.execute({
		sql: `SELECT id, title, cwd, agent_session_id, meta_json, created_at, updated_at
		      FROM chat_sessions WHERE id = ?`,
		args: [sessionId],
	});
	const row = sessionRes.rows[0] as Record<string, unknown> | undefined;
	if (!row) return null;

	const msgRes = await db.client.execute({
		sql: `SELECT id, role, content, blocks_json, seq, created_at
		      FROM chat_messages WHERE session_id = ? ORDER BY seq ASC`,
		args: [sessionId],
	});

	const messages: CanonicalMessage[] = [];
	let tokenEstimate = 0;
	for (const r0 of msgRes.rows) {
		const r = r0 as Record<string, unknown>;
		const role = asString(r.role);
		const canonicalRole: CanonicalMessage["role"] =
			role === "user" ? "user" : role === "system" ? "system" : "assistant";
		const rawContent = asString(r.content);
		const blocks = normalizeBlocks(
			(r.blocks_json as string) ?? null,
			rawContent,
		);
		if (!blocks.length) continue;
		const content = flattenBlocks(blocks);
		tokenEstimate += Math.round(content.length / 4);
		messages.push({
			id: asString(r.id) || `${sessionId}:${messages.length}`,
			role: canonicalRole,
			content,
			blocks,
			seq: Number(r.seq ?? messages.length),
			createdAt: Number(r.created_at ?? 0) || Date.now(),
		});
	}

	if (!messages.length) return null;

	let meta: Record<string, unknown> = {};
	try {
		meta = row.meta_json ? JSON.parse(row.meta_json as string) : {};
	} catch {
		meta = {};
	}
	const agentSessionId = asString(row.agent_session_id);
	if (agentSessionId) meta.agentSessionId = agentSessionId;

	const title =
		asString(row.title) ||
		messages.find((m) => m.role === "user")?.content.slice(0, 60) ||
		null;

	const session: CanonicalSession = {
		id: `ipo-sdk:${sessionId}`,
		harness: "ipo-sdk",
		externalId: sessionId,
		cwd: asString(row.cwd) || null,
		title,
		summary: null,
		status: "idle",
		originPath: null,
		byteOffset: 0,
		messageCount: messages.length,
		tokenEstimate,
		meta,
		createdAt: Number(row.created_at ?? 0) || Date.now(),
		updatedAt: Number(row.updated_at ?? 0) || Date.now(),
	};

	return { session, messages, skippedLines: 0 };
}

/**
 * 列出本应用中不早于给定水位的���话 id（增量摄取用）。
 *
 * 用 `>=` 而非 `>`：水位取自已摄取会话的 MAX(updated_at)，若某个会话恰好
 * 卡在水位上且当次解析失败，严格大于会让它永远不再被重试。
 * `since = 0` 时退化为全量（同时覆盖 updated_at 为 NULL/0 的历史会话）。
 */
export async function listIpoSdkSessionIds(
	db: DbContext,
	since = 0,
): Promise<string[]> {
	const res = await db.client.execute({
		sql: `SELECT id FROM chat_sessions WHERE COALESCE(updated_at, 0) >= ?
		      ORDER BY updated_at DESC`,
		args: [since],
	});
	return res.rows
		.map((r) => (r as Record<string, unknown>).id as string)
		.filter(Boolean);
}
