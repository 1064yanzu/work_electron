/**
 * Codex adapter —— 解析 `~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<ISO>-<uuid>.jsonl`。
 *
 * 实测格式要点（2026-08 实机采样，codex CLI 0.81.x）：
 * - 每行 `{ timestamp, type, payload }`，type ∈ session_meta / response_item /
 *   event_msg / turn_context
 * - `session_meta.payload`：id / cwd / originator / cli_version / instructions /
 *   model_provider / git.{commit_hash,branch,repository_url}
 * - `response_item.payload.type` ∈ message / reasoning / function_call /
 *   function_call_output / image_generation_call / custom_tool_call(_output)
 * - message.role ∈ user / assistant / **developer**
 *   —— developer 是系统注入的 prompt（权限说明、collaboration_mode），必须跳过
 * - content block type：user 侧 `input_text`，assistant 侧 `output_text`
 * - user 消息里混有 <environment_context> / AGENTS.md 注入块，需 strip
 *
 * 无官方格式契约 → 全部防御式解析：未知字段忽略、坏行跳过并计数。
 */
import { homedir } from "node:os";
import path from "node:path";
import type {
	AdapterParseResult,
	CanonicalBlock,
	CanonicalMessage,
	CanonicalSession,
} from "../types";
import {
	asRecord,
	asString,
	flattenBlocks,
	parseJsonLines,
	stripInjectedContext,
	titleFromUserText,
} from "./shared";

/** 会话根目录。 */
export function codexSessionDir(): string {
	return path.join(homedir(), ".codex", "sessions");
}

/** 该 adapter 关心的文件：rollout-*.jsonl。 */
export function isCodexSessionFile(filePath: string): boolean {
	const base = path.basename(filePath);
	return base.startsWith("rollout-") && base.endsWith(".jsonl");
}

/** 从 rollout 文件名尾部提取会话 uuid（`rollout-<ISO>-<uuid>.jsonl`）。 */
function externalIdFromPath(filePath: string): string {
	const base = path.basename(filePath, ".jsonl");
	// uuid 是最后 5 段（8-4-4-4-12），ISO 时间戳里也有 `-`，故从尾部取
	const parts = base.split("-");
	if (parts.length >= 5) return parts.slice(-5).join("-");
	return base;
}

/** 把 codex 的 content 数组归一成 CanonicalBlock[]。 */
function normalizeContent(content: unknown): CanonicalBlock[] {
	if (typeof content === "string") {
		return content.trim() ? [{ type: "text", text: content }] : [];
	}
	if (!Array.isArray(content)) return [];

	const blocks: CanonicalBlock[] = [];
	for (const raw of content) {
		const b = asRecord(raw);
		if (!b) continue;
		const t = asString(b.type);
		// input_text（user）/ output_text（assistant）/ text（兜底）
		if (t === "input_text" || t === "output_text" || t === "text") {
			const text = asString(b.text);
			if (text.trim()) blocks.push({ type: "text", text });
		}
	}
	return blocks;
}

export async function parseCodexSession(
	filePath: string,
	fromOffset: number,
	prev?: Partial<CanonicalSession>,
): Promise<AdapterParseResult | null> {
	const scan = await parseJsonLines(filePath, fromOffset);
	if (!scan) return null;

	// 不连续重读：累计状态归零（理由同 claudeCode adapter）。
	// codex 的消息 id 是 `${externalId}:${seq}`，续接旧 seq 会直接产生重复转录。
	const base = scan.restarted ? undefined : prev;

	let externalId = base?.externalId ?? "";
	const messages: CanonicalMessage[] = [];
	let seq = base?.messageCount ?? 0;
	let cwd = base?.cwd ?? null;
	let title = base?.title ?? null;
	let firstUserText = "";
	let createdAt = base?.createdAt ?? 0;
	let updatedAt = base?.updatedAt ?? 0;
	const meta: Record<string, unknown> = { ...(base?.meta ?? {}) };
	// function_call 与其 output 靠 call_id 关联，先缓存调用名
	const callNames = new Map<string, string>();

	for (const obj of scan.objects) {
		const type = asString(obj.type);
		const payload = asRecord(obj.payload);
		if (!payload) continue;
		const ts = Date.parse(asString(obj.timestamp) || "") || 0;
		if (ts) {
			if (!createdAt) createdAt = ts;
			updatedAt = Math.max(updatedAt, ts);
		}

		if (type === "session_meta") {
			externalId = asString(payload.id) || externalId;
			cwd = asString(payload.cwd) || cwd;
			const originator = asString(payload.originator);
			if (originator) meta.originator = originator;
			const cliVersion = asString(payload.cli_version);
			if (cliVersion) meta.cliVersion = cliVersion;
			const provider = asString(payload.model_provider);
			if (provider) meta.provider = provider;
			const git = asRecord(payload.git);
			if (git) {
				const branch = asString(git.branch);
				if (branch) meta.gitBranch = branch;
				const repo = asString(git.repository_url);
				if (repo) meta.repositoryUrl = repo;
			}
			continue;
		}

		if (type === "turn_context") {
			const model = asString(payload.model);
			if (model) meta.model = model;
			continue;
		}

		if (type !== "response_item") continue;

		const itemType = asString(payload.type);

		if (itemType === "message") {
			const role = asString(payload.role);
			// developer = 系统注入的 prompt，非用户/助手真实对话
			if (role !== "user" && role !== "assistant") continue;

			let blocks = normalizeContent(payload.content);
			if (role === "user") {
				// 剥掉 environment_context / AGENTS.md 等每轮固定注入
				blocks = blocks
					.map((b) =>
						b.type === "text"
							? ({ type: "text", text: stripInjectedContext(b.text) } as const)
							: b,
					)
					.filter((b) => b.type !== "text" || b.text.trim().length > 0);
			}
			if (!blocks.length) continue;

			const content = flattenBlocks(blocks);
			if (role === "user" && !firstUserText) {
				const candidate = titleFromUserText(content);
				if (candidate) firstUserText = candidate;
			}
			messages.push({
				id: `${externalId || "codex"}:${seq}`,
				role,
				content,
				blocks,
				seq,
				createdAt: ts || Date.now(),
			});
			seq += 1;
			continue;
		}

		if (itemType === "function_call" || itemType === "custom_tool_call") {
			const name = asString(payload.name) || "unknown";
			const callId = asString(payload.call_id);
			if (callId) callNames.set(callId, name);
			const rawInput =
				itemType === "function_call" ? payload.arguments : payload.input;
			const blocks: CanonicalBlock[] = [
				{ type: "tool_use", name, input: rawInput, id: callId || undefined },
			];
			messages.push({
				id: `${externalId || "codex"}:${seq}`,
				role: "assistant",
				content: flattenBlocks(blocks),
				blocks,
				seq,
				createdAt: ts || Date.now(),
			});
			seq += 1;
			continue;
		}

		if (
			itemType === "function_call_output" ||
			itemType === "custom_tool_call_output"
		) {
			const callId = asString(payload.call_id);
			// output 可能是字符串，也可能是 { output: "..." } 结构
			const rawOut = payload.output;
			const outText =
				typeof rawOut === "string"
					? rawOut
					: asString(asRecord(rawOut)?.output) ||
						(rawOut === undefined ? "" : JSON.stringify(rawOut));
			if (!outText.trim()) continue;
			const blocks: CanonicalBlock[] = [
				{ type: "tool_result", output: outText, id: callId || undefined },
			];
			messages.push({
				id: `${externalId || "codex"}:${seq}`,
				role: "user",
				content: flattenBlocks(blocks),
				blocks,
				seq,
				createdAt: ts || Date.now(),
			});
			seq += 1;
			const name = callId ? callNames.get(callId) : undefined;
			if (name) meta.lastTool = name;
			continue;
		}

		// reasoning / image_generation_call 等：不进转录（内部草稿 / 二进制产物）
	}

	if (!externalId) externalId = externalIdFromPath(filePath);
	if (!title && firstUserText) {
		title = firstUserText.replace(/\s+/g, " ");
	}

	// 空转录不构成可迁移的会话资产
	if (seq === 0) return null;

	const now = Date.now();
	const session: CanonicalSession = {
		id: `codex:${externalId}`,
		harness: "codex",
		externalId,
		cwd,
		title,
		summary: prev?.summary ?? null,
		status: now - (scan.mtimeMs || 0) < 5 * 60 * 1000 ? "active" : "idle",
		originPath: filePath,
		byteOffset: scan.endOffset,
		messageCount: seq,
		// codex rollout 不记录 token 用量，按字符粗估（~4 字符/token）
		tokenEstimate:
			(base?.tokenEstimate ?? 0) +
			Math.round(messages.reduce((n, m) => n + m.content.length, 0) / 4),
		meta,
		createdAt: createdAt || now,
		updatedAt: updatedAt || scan.mtimeMs || now,
	};

	return {
		session,
		messages,
		skippedLines: scan.skippedLines,
		restarted: scan.restarted,
	};
}
