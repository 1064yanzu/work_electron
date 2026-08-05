/**
 * Claude Code adapter —— 解析 `~/.claude/projects/<slug>/<session-uuid>.jsonl`。
 *
 * 实测格式要点（2026-08 实机采样，CLI v2.1.x）：
 * - 每行一个 JSON 对象，`type` ∈ user / assistant / mode / ai-title / last-prompt /
 *   file-history-snapshot / attachment / system
 * - `user.message.content`：string 或 block 数组（含 tool_result）
 * - `assistant.message.content`：block 数组，type ∈ text / thinking / tool_use
 * - `assistant.message.usage`：完整 token 明细
 * - `ai-title` 行携带 AI 生成的会话标题，取最后一条即当前标题
 * - `isMeta: true` 的 user 行是本地命令回显（<local-command-caveat> 等），跳过
 *
 * slug 目录名是 cwd 把 `/` 和空格都换成 `-` 的结果，**不可逆**，
 * 因此 cwd 一律从行内 `cwd` 字段读，不从目录名反解。
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
	titleFromUserText,
} from "./shared";

/** 会话根目录。 */
export function claudeCodeSessionDir(): string {
	return path.join(homedir(), ".claude", "projects");
}

/** 该 adapter 关心的文件：projects 下任意 slug 目录里的 *.jsonl。 */
export function isClaudeCodeSessionFile(filePath: string): boolean {
	return filePath.endsWith(".jsonl");
}

/** 把 assistant/user 的原始 content 归一成 CanonicalBlock[]。 */
function normalizeBlocks(content: unknown): CanonicalBlock[] {
	// user 消息常见是裸字符串
	if (typeof content === "string") {
		return content.trim() ? [{ type: "text", text: content }] : [];
	}
	if (!Array.isArray(content)) return [];

	const blocks: CanonicalBlock[] = [];
	for (const raw of content) {
		const b = asRecord(raw);
		if (!b) continue;
		switch (b.type) {
			case "text": {
				const text = asString(b.text);
				if (text) blocks.push({ type: "text", text });
				break;
			}
			case "thinking": {
				const text = asString(b.thinking);
				if (text) blocks.push({ type: "thinking", text });
				break;
			}
			case "tool_use": {
				blocks.push({
					type: "tool_use",
					name: asString(b.name) || "unknown",
					input: b.input,
					id: asString(b.id) || undefined,
				});
				break;
			}
			case "tool_result": {
				// tool_result 的 content 可能是 string���也可能是 block 数组
				const out =
					typeof b.content === "string"
						? b.content
						: flattenBlocks(normalizeBlocks(b.content));
				blocks.push({
					type: "tool_result",
					output: out,
					id: asString(b.tool_use_id) || undefined,
					isError: b.is_error === true,
				});
				break;
			}
			default:
				// 未知 block 类型：忽略而非报错（格式演进容忍）
				break;
		}
	}
	return blocks;
}

/**
 * 增量解析一个 claude-code 会话文件。
 *
 * @param filePath JSONL 绝对路径
 * @param fromOffset 上次已读到的字节位置（0 = 全量）
 * @param prev 上次的会话状态（增量时用于承接 title/createdAt 等）
 */
export async function parseClaudeCodeSession(
	filePath: string,
	fromOffset: number,
	prev?: Partial<CanonicalSession>,
): Promise<AdapterParseResult | null> {
	const scan = await parseJsonLines(filePath, fromOffset);
	if (!scan) return null;

	// 不连续重读（文件被截断/重写，或超大文件只读了尾部）：
	// 之前累计的 seq / 计数不��对应文件内容，必须归零重来，
	// 否则 seq 会整体错位、message_count 与 token 会翻倍累加。
	const base = scan.restarted ? undefined : prev;

	const externalId = path.basename(filePath, ".jsonl");
	const messages: CanonicalMessage[] = [];
	let seq = base?.messageCount ?? 0;
	let cwd = base?.cwd ?? null;
	let title = base?.title ?? null;
	let firstUserText = "";
	let createdAt = base?.createdAt ?? 0;
	let updatedAt = base?.updatedAt ?? 0;
	let tokenEstimate = base?.tokenEstimate ?? 0;
	let lastInputTokens = Number(base?.meta?.contextTokens ?? 0);
	const meta: Record<string, unknown> = { ...(base?.meta ?? {}) };

	for (const obj of scan.objects) {
		const type = asString(obj.type);

		// 会话级元数据行
		if (type === "ai-title") {
			const t = asString(obj.aiTitle);
			if (t) title = t;
			continue;
		}
		if (type === "mode") {
			const m = asString(obj.mode);
			if (m) meta.mode = m;
			continue;
		}
		if (type !== "user" && type !== "assistant") continue;

		// 本地命令回显 / 侧链（子 agent）不计入主线转录
		if (obj.isMeta === true || obj.isSidechain === true) continue;

		const message = asRecord(obj.message);
		if (!message) continue;

		if (!cwd) cwd = asString(obj.cwd) || null;
		const branch = asString(obj.gitBranch);
		if (branch) meta.gitBranch = branch;
		const version = asString(obj.version);
		if (version) meta.cliVersion = version;

		const usage = asRecord(message.usage);
		if (usage) {
			// 只累加 output_tokens：input_tokens 每次调用都是「整段上下文重放」，
			// 逐条累加会得到数百万的荒谬值（实测 394 条消息累计出 4.8M）。
			// 输入侧成本用最后一条的 input+cache 值近似（即当前上下文规模）。
			tokenEstimate += Number(usage.output_tokens ?? 0);
			lastInputTokens =
				Number(usage.input_tokens ?? 0) +
				Number(usage.cache_read_input_tokens ?? 0) +
				Number(usage.cache_creation_input_tokens ?? 0);
			const model = asString(message.model);
			if (model) meta.model = model;
		}

		const blocks = normalizeBlocks(message.content);
		const content = flattenBlocks(blocks);
		// 纯工具噪声（无任何文本）也保留，UI 需要完整转录；但全空对象跳过
		if (!blocks.length) continue;

		const ts = Date.parse(asString(obj.timestamp) || "") || Date.now();
		if (!createdAt) createdAt = ts;
		updatedAt = Math.max(updatedAt, ts);

		if (type === "user" && !firstUserText) {
			// 剥掉斜杠命令回显等注入块后才算真实意图
			const candidate = titleFromUserText(content);
			if (candidate) firstUserText = candidate;
		}

		messages.push({
			id: asString(obj.uuid) || `${externalId}:${seq}`,
			role: type === "user" ? "user" : "assistant",
			content,
			blocks,
			seq,
			createdAt: ts,
		});
		seq += 1;
	}

	// 标题兜底：没有 ai-title 行时用首条用户消息（已剥注入块）
	if (!title && firstUserText) {
		title = firstUserText.replace(/\s+/g, " ");
	}
	if (lastInputTokens > 0) meta.contextTokens = lastInputTokens;

	// 空转录（`agent-*.jsonl` 子 agent 侧链文件、或整文件都是元数据行）
	// 不构成一个可迁移的会话资产，直接判为无效来源，避免建出空壳会话。
	if (seq === 0) return null;

	const now = Date.now();
	const session: CanonicalSession = {
		id: `claude-code:${externalId}`,
		harness: "claude-code",
		externalId,
		cwd,
		title,
		summary: prev?.summary ?? null,
		// 5 分钟内仍有写入视为活跃
		status: now - (scan.mtimeMs || 0) < 5 * 60 * 1000 ? "active" : "idle",
		originPath: filePath,
		byteOffset: scan.endOffset,
		messageCount: seq,
		tokenEstimate,
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
