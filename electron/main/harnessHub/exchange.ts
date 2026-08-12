/**
 * 会话交换格式 —— 让「上下文」变成一个可以在任意入口之间搬运的文件。
 *
 * 一期的接力只有「文本注入」一条路：内容长了塞不进输入框，Web 侧回流也只有
 * DOM 抓取这一条不稳定的通道。本模块定义 `.aihub-session.json`，一个文件即完整
 * 上下文（元信息 + 全量转录 + 可选交接包），CLI 端 agent 直接读文件，
 * Web 端作为附件上传。
 *
 * 导入侧支持四种**真实存在的**来源格式，按内容嗅探：
 *   1. 本格式 `.aihub-session.json`
 *   2. ChatGPT 官方数据导出 `conversations.json`（mapping 树 → 线性化）
 *   3. Claude Code 原生 `*.jsonl`
 *   4. Codex 原生 `rollout-*.jsonl`
 *
 * 嗅探不出来就报明确错误——**绝不猜测、绝不静默产出空会话**。用户拿到一个
 * "导入成功但里面什么都没有"的会话，比拿到一句"这个文件我不认识"糟糕得多。
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { parseClaudeCodeSession } from "./adapters/claudeCode";
import { parseCodexSession } from "./adapters/codex";
import type {
	CanonicalBlock,
	CanonicalMessage,
	CanonicalRole,
	ExchangeDocument,
	HandoffPackage,
} from "./types";

/** 导出文件的扩展名。 */
export const EXCHANGE_EXT = ".aihub-session.json";

/** 单条消息在导出文件里的最大长度（防止一条巨型 tool_result 把文件撑到几十 MB）。 */
const EXPORT_PER_MESSAGE_LIMIT = 60_000;

/** 导入时最多接收的消息条数。 */
const IMPORT_MAX_MESSAGES = 4_000;

// ============================================================
// 导出
// ============================================================

/** 为一段会话组装交换文档。 */
export function buildExchangeDocument(input: {
	harness: string;
	sessionId: string;
	externalId: string | null;
	cwd: string | null;
	title: string | null;
	messages: CanonicalMessage[];
	handoff?: Omit<HandoffPackage, "markdown"> | null;
}): ExchangeDocument {
	return {
		format: "aihub-session",
		version: 1,
		exportedAt: Date.now(),
		source: {
			harness: input.harness,
			sessionId: input.sessionId,
			externalId: input.externalId,
			cwd: input.cwd,
			title: input.title,
			messageCount: input.messages.length,
		},
		messages: input.messages.map((m) => ({
			role: m.role,
			content:
				m.content.length > EXPORT_PER_MESSAGE_LIMIT
					? `${m.content.slice(0, EXPORT_PER_MESSAGE_LIMIT)}\n…（本条已截断）`
					: m.content,
			...(m.blocks?.length ? { blocks: m.blocks } : {}),
			createdAt: m.createdAt,
		})),
		handoff: input.handoff ?? null,
	};
}

/** 交换文档 → 建议的文件名（不含目录）。 */
export function suggestExchangeFileName(doc: ExchangeDocument): string {
	const safeTitle = (doc.source.title ?? doc.source.harness)
		.replace(/[\\/:*?"<>|\n\r\t]/g, "")
		.trim()
		.slice(0, 48);
	const stamp = new Date(doc.exportedAt)
		.toISOString()
		.replace(/[:.]/g, "-")
		.slice(0, 19);
	return `${safeTitle || doc.source.harness}-${stamp}${EXCHANGE_EXT}`;
}

/**
 * 把交换文档渲染成给 Web 端读的 markdown。
 *
 * Web 站点对 `.json` 附件的解析能力参差不齐（有的只当纯文本、有的直接拒收），
 * markdown 是所有站点都吃得下的最大公约数。
 */
export function renderExchangeMarkdown(doc: ExchangeDocument): string {
	const lines: string[] = [
		`# 会话上下文包 · ${doc.source.title ?? doc.source.harness}`,
		"",
		`> 来源入口：${doc.source.harness}`,
		doc.source.cwd ? `> 工作目录：${doc.source.cwd}` : "",
		`> 消息条数：${doc.source.messageCount}`,
		`> 导出时间：${new Date(doc.exportedAt).toLocaleString("zh-CN")}`,
		"",
		"读完本文件后，请接手其中未完成的工作；需要更多细节时直接向我提问。",
		"",
	].filter((line) => line !== "");

	if (doc.handoff) {
		const h = doc.handoff;
		const section = (heading: string, items: string[]) =>
			items.length
				? `\n## ${heading}\n\n${items.map((i) => `- ${i}`).join("\n")}\n`
				: "";
		lines.push(
			"## 任务目标",
			"",
			h.goal || "（未提炼）",
			section("已完成", h.done),
			section("进行中", h.inProgress),
			section("关键决策与踩坑", h.decisions),
			section("涉及文件", h.files),
			section("下一步", h.nextSteps),
		);
	}

	lines.push("", "## 完整转录", "");
	for (const m of doc.messages) {
		const label =
			m.role === "user" ? "用户" : m.role === "assistant" ? "助手" : "系统";
		lines.push(`**${label}**：${m.content}`, "");
	}
	return lines.join("\n");
}

// ============================================================
// 导入
// ============================================================

/** 导入结果：统一成 canonical 消息 + 元信息。 */
export interface ParsedExchange {
	/** 识别出的来源格式（回显给用户，让人知道我们按什么解析的） */
	detectedFormat:
		| "aihub-session"
		| "chatgpt-export"
		| "claude-code-jsonl"
		| "codex-jsonl";
	harness: string;
	externalId: string | null;
	cwd: string | null;
	title: string | null;
	messages: CanonicalMessage[];
	handoff: Omit<HandoffPackage, "markdown"> | null;
	/** 一个 ChatGPT 导出包里可能有几百段会话，这里报告总数 */
	siblingCount: number;
}

function toRole(raw: unknown): CanonicalRole {
	const value = String(raw ?? "").toLowerCase();
	if (value === "user" || value === "human") return "user";
	if (value === "system" || value === "developer") return "system";
	return "assistant";
}

function toMessages(raw: unknown, baseTime: number): CanonicalMessage[] {
	if (!Array.isArray(raw)) return [];
	const out: CanonicalMessage[] = [];
	for (const item of raw.slice(0, IMPORT_MAX_MESSAGES)) {
		if (!item || typeof item !== "object") continue;
		const rec = item as Record<string, unknown>;
		const content = typeof rec.content === "string" ? rec.content.trim() : "";
		if (!content) continue;
		out.push({
			id: `${out.length}`,
			role: toRole(rec.role),
			content,
			blocks: Array.isArray(rec.blocks)
				? (rec.blocks as CanonicalBlock[])
				: undefined,
			seq: out.length,
			createdAt:
				typeof rec.createdAt === "number" && rec.createdAt > 0
					? rec.createdAt
					: baseTime + out.length,
		});
	}
	return out;
}

/** 解析本格式。 */
function parseAihubSession(parsed: Record<string, unknown>): ParsedExchange {
	const source = (parsed.source ?? {}) as Record<string, unknown>;
	const messages = toMessages(parsed.messages, Date.now());
	if (!messages.length) {
		throw new Error("交换文件里没有可导入的消息");
	}
	const handoffRaw = parsed.handoff;
	return {
		detectedFormat: "aihub-session",
		harness: String(source.harness ?? "web-import"),
		externalId: source.externalId ? String(source.externalId) : null,
		cwd: source.cwd ? String(source.cwd) : null,
		title: source.title ? String(source.title) : null,
		messages,
		handoff:
			handoffRaw && typeof handoffRaw === "object"
				? (handoffRaw as Omit<HandoffPackage, "markdown">)
				: null,
		siblingCount: 1,
	};
}

/**
 * 解析 ChatGPT 官方数据导出的 `conversations.json`。
 *
 * 结构：顶层是会话数组，每个会话的 `mapping` 是一棵消息树（node.id → {message, parent,
 * children}）。线性化的正确做法是从 `current_node` 沿 parent 回溯到根再反转——
 * 按 create_time 排序会把「重新生成」的多个分支混在一起，产出一段前后矛盾的对话。
 */
function parseChatgptExport(
	parsed: unknown,
	options: { index: number },
): ParsedExchange {
	const conversations = Array.isArray(parsed)
		? (parsed as Record<string, unknown>[])
		: [parsed as Record<string, unknown>];
	const target = conversations[options.index] ?? conversations[0];
	if (!target || typeof target !== "object") {
		throw new Error("ChatGPT 导出文件里没有会话");
	}

	const mapping = target.mapping as Record<string, unknown> | undefined;
	if (!mapping || typeof mapping !== "object") {
		throw new Error("ChatGPT 导出文件缺少 mapping 字段");
	}

	// 从 current_node 回溯到根，得到用户实际看到的那条分支
	const chain: Record<string, unknown>[] = [];
	let cursor =
		typeof target.current_node === "string" ? target.current_node : null;
	if (!cursor) {
		// 没有 current_node（部分老导出）：取任意叶子节点
		const nodes = Object.values(mapping) as Record<string, unknown>[];
		const leaf = nodes.find(
			(n) => Array.isArray(n?.children) && n.children.length === 0,
		);
		cursor = leaf ? String(leaf.id ?? "") : null;
	}
	const guard = new Set<string>();
	while (cursor && !guard.has(cursor)) {
		guard.add(cursor);
		const node = mapping[cursor] as Record<string, unknown> | undefined;
		if (!node) break;
		chain.push(node);
		cursor = typeof node.parent === "string" ? node.parent : null;
	}
	chain.reverse();

	const messages: CanonicalMessage[] = [];
	for (const node of chain) {
		const message = node.message as Record<string, unknown> | undefined;
		if (!message) continue;
		const author = message.author as Record<string, unknown> | undefined;
		const role = toRole(author?.role);
		// system 角色在 ChatGPT 导出里几乎全是隐藏的元数据节点，跳过
		if (role === "system") continue;
		const content = message.content as Record<string, unknown> | undefined;
		const parts = Array.isArray(content?.parts) ? content.parts : [];
		const text = parts
			.map((p) => (typeof p === "string" ? p : ""))
			.filter(Boolean)
			.join("\n")
			.trim();
		if (!text) continue;
		const createTime =
			typeof message.create_time === "number" ? message.create_time * 1000 : 0;
		messages.push({
			id: String(node.id ?? messages.length),
			role,
			content: text,
			seq: messages.length,
			createdAt: createTime || Date.now() + messages.length,
		});
	}

	if (!messages.length) {
		throw new Error("这段 ChatGPT 会话里没有可导入的文本消息");
	}

	return {
		detectedFormat: "chatgpt-export",
		harness: "web-chatgpt",
		externalId:
			typeof target.conversation_id === "string"
				? target.conversation_id
				: typeof target.id === "string"
					? target.id
					: null,
		cwd: null,
		title: typeof target.title === "string" ? target.title : null,
		messages,
		handoff: null,
		siblingCount: conversations.length,
	};
}

/**
 * 从文件导入。支持 `.json`（本格式 / ChatGPT 导出）与 `.jsonl`（Claude Code / Codex）。
 *
 * @param index ChatGPT 导出包里选第几段会话（其余格式忽略）
 */
export async function parseExchangeFile(
	filePath: string,
	options: { index?: number } = {},
): Promise<ParsedExchange> {
	const ext = path.extname(filePath).toLowerCase();

	if (ext === ".jsonl") {
		// 两个 adapter 都是防御式解析，先按文件名特征选，再互相兜底
		const isCodex = /rollout-.*\.jsonl$/i.test(path.basename(filePath));
		const first = isCodex
			? await parseCodexSession(filePath, 0)
			: await parseClaudeCodeSession(filePath, 0);
		const result =
			first && first.messages.length
				? first
				: isCodex
					? await parseClaudeCodeSession(filePath, 0)
					: await parseCodexSession(filePath, 0);
		if (!result || !result.messages.length) {
			throw new Error(
				"这个 .jsonl 既不像 Claude Code 也不像 Codex 的会话文件，或里面没有可导入的消息",
			);
		}
		return {
			detectedFormat:
				result.session.harness === "codex"
					? "codex-jsonl"
					: "claude-code-jsonl",
			harness: result.session.harness,
			externalId: result.session.externalId || null,
			cwd: result.session.cwd,
			title: result.session.title,
			messages: result.messages.slice(0, IMPORT_MAX_MESSAGES),
			handoff: null,
			siblingCount: 1,
		};
	}

	const raw = await readFile(filePath, "utf-8");
	return parseExchangeText(raw, options);
}

/** 从文本内容导入（拖入 / 粘贴场景）。 */
export function parseExchangeText(
	raw: string,
	options: { index?: number } = {},
): ParsedExchange {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("不是合法的 JSON 文件，无法识别为会话交换格式");
	}

	if (
		parsed &&
		typeof parsed === "object" &&
		!Array.isArray(parsed) &&
		(parsed as Record<string, unknown>).format === "aihub-session"
	) {
		return parseAihubSession(parsed as Record<string, unknown>);
	}

	// ChatGPT 导出：顶层数组且元素带 mapping
	const looksLikeChatgpt =
		(Array.isArray(parsed) &&
			parsed.length > 0 &&
			typeof (parsed[0] as Record<string, unknown>)?.mapping === "object") ||
		(parsed !== null &&
			typeof parsed === "object" &&
			typeof (parsed as Record<string, unknown>).mapping === "object");
	if (looksLikeChatgpt) {
		return parseChatgptExport(parsed, { index: options.index ?? 0 });
	}

	throw new Error(
		"无法识别的文件格式。支持：.aihub-session.json、ChatGPT 导出的 conversations.json、Claude Code / Codex 的 .jsonl",
	);
}

/**
 * 列出 ChatGPT 导出包里的会话清单（供 UI 让用户挑一段导入）。
 * 非该格式时返回空数组，不抛错——调用方据此判断要不要显示选择器。
 */
export function listChatgptConversations(
	raw: string,
): { index: number; title: string; messageCount: number; updatedAt: number }[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const out: {
		index: number;
		title: string;
		messageCount: number;
		updatedAt: number;
	}[] = [];
	parsed.forEach((item, index) => {
		if (!item || typeof item !== "object") return;
		const rec = item as Record<string, unknown>;
		const mapping = rec.mapping;
		if (!mapping || typeof mapping !== "object") return;
		out.push({
			index,
			title: typeof rec.title === "string" ? rec.title : `会话 ${index + 1}`,
			messageCount: Object.keys(mapping as Record<string, unknown>).length,
			updatedAt:
				typeof rec.update_time === "number" ? rec.update_time * 1000 : 0,
		});
	});
	return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 生成一个 canonical 会话 id（导入的会话不来自任何原生文件，用随机 id）。 */
export function newImportedSessionId(harness: string): string {
	return `${harness}:${randomUUID()}`;
}
