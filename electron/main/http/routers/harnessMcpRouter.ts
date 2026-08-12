/**
 * 反向 MCP Server —— 把本应用暴露成一个 MCP 工具服务器，让外部 CLI（Claude Code /
 * Codex / Gemini CLI）反过来调用我们。
 *
 * ## 为什么这是最有价值的一层
 *
 * Claude Code 和 Codex 都上不了 ChatGPT 的深度研究、Gemini 的超长上下文——
 * 而这些是用户**已经按月付过费**的订阅额度，不额外烧 API token。把它们包装成
 * MCP 工具挂给 CLI，等于给每个 coding agent 装上了别家的独门能力。
 * 顺带还有跨入口的会话检索与共享白板。
 *
 * ## 为什么手写 JSON-RPC 而不引 @modelcontextprotocol/sdk
 *
 * 本仓库没有这个依赖。而 MCP 的 streamable-HTTP 服务端在「无状态 + 只提供
 * tools」这个子集下，就是五个 JSON-RPC 2.0 方法：
 *   initialize / notifications/initialized / tools/list / tools/call / ping
 * 手写约两百行且完全可控，不值得为此新增一个运行时依赖与它的版本升级负担。
 *
 * ## 安全
 *
 * 只绑 127.0.0.1 **并且**要求 Bearer token。回环地址不是安全边界——本机任意
 * 进程（包括浏览器里任意网页发起的跨域请求）都能访问它。token 存 app_config，
 * 一键接入命令由 `harness_mcp_status` 带出来给用户复制。
 */
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import express from "express";
import type { DbContext } from "../../db/client";
import type { Logger } from "../../logging/types";
import { runBridgeCall } from "../../harnessHub/bridge";
import {
	addBoardEntry,
	listBoardEntries,
	renderBoardMarkdown,
	normalizeScope,
} from "../../harnessHub/board";
import { runCouncil } from "../../harnessHub/council";
import { detectHarnesses } from "../../harnessHub/detect";
import { loadSessionTranscript } from "../../harnessHub/handoff";
import {
	pickForCapability,
	BUILTIN_CAPABILITIES,
} from "../../harnessHub/router";
import { findWebSite, loadWebSites } from "../../harnessHub/webSites";

/** MCP 协议版本（与 Claude Code / Codex 当前实现对齐）。 */
const PROTOCOL_VERSION = "2025-06-18";

/** app_config 里存 token 的 key。 */
export const MCP_TOKEN_CONFIG_KEY = "harness_mcp_token";
/** app_config 里存开关的 key。 */
export const MCP_ENABLED_CONFIG_KEY = "harness_mcp_enabled";

/** 取（必要时生成）本机 MCP token。 */
export async function ensureMcpToken(db: DbContext): Promise<string> {
	const res = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ?`,
		args: [MCP_TOKEN_CONFIG_KEY],
	});
	const existing = (res.rows[0] as Record<string, unknown> | undefined)?.value;
	if (typeof existing === "string" && existing.length >= 32) return existing;

	const token = randomBytes(24).toString("base64url");
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
		      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [MCP_TOKEN_CONFIG_KEY, token, Date.now()],
	});
	return token;
}

/** 重新生成 token（用户怀疑泄漏时）。 */
export async function rotateMcpToken(db: DbContext): Promise<string> {
	const token = randomBytes(24).toString("base64url");
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
		      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [MCP_TOKEN_CONFIG_KEY, token, Date.now()],
	});
	return token;
}

/** 反向 MCP 是否启用（默认关——对外开端口这种事必须用户显式同意）。 */
export async function isMcpEnabled(db: DbContext): Promise<boolean> {
	const res = await db.client.execute({
		sql: `SELECT value FROM app_config WHERE key = ?`,
		args: [MCP_ENABLED_CONFIG_KEY],
	});
	const value = (res.rows[0] as Record<string, unknown> | undefined)?.value;
	return value === "1" || value === "true";
}

/** 设置开关。 */
export async function setMcpEnabled(
	db: DbContext,
	enabled: boolean,
): Promise<void> {
	await db.client.execute({
		sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)
		      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
		args: [MCP_ENABLED_CONFIG_KEY, enabled ? "1" : "0", Date.now()],
	});
}

// ============================================================
// 工具定义
// ============================================================

interface McpTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	handler: (db: DbContext, args: Record<string, unknown>) => Promise<string>;
}

function str(
	args: Record<string, unknown>,
	key: string,
	fallback = "",
): string {
	const value = args[key];
	return typeof value === "string" ? value.trim() : fallback;
}

function num(
	args: Record<string, unknown>,
	key: string,
	fallback: number,
): number {
	const value = args[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

const TOOLS: McpTool[] = [
	{
		name: "ask_web_ai",
		description:
			"Ask a logged-in web AI product (ChatGPT / Gemini / Kimi / Doubao / GLM / DeepSeek) running inside IPO Workbench's embedded browser, and return its answer. Use this to reach capabilities the local CLI does not have: live web research, very long context windows, or the user's paid subscription quota (which costs no API tokens). The question must be self-contained — the web session has no access to your local files.",
		inputSchema: {
			type: "object",
			properties: {
				site: {
					type: "string",
					description:
						"Site id: chatgpt | gemini | kimi | doubao | glm | deepseek (or a custom site id configured by the user)",
				},
				prompt: {
					type: "string",
					description: "The self-contained question to ask",
				},
				timeout_seconds: {
					type: "number",
					description: "Max seconds to wait for the answer (default 180)",
				},
			},
			required: ["site", "prompt"],
		},
		handler: async (db, args) => {
			const site = str(args, "site");
			const prompt = str(args, "prompt");
			if (!site || !prompt) throw new Error("site 与 prompt 均为必填");
			const result = await runBridgeCall(db, {
				target: site,
				kind: "web",
				prompt,
				timeoutMs: Math.round(num(args, "timeout_seconds", 180) * 1000),
				caller: "external:mcp",
			});
			if (!result.ok) throw new Error(result.error ?? "调用失败");
			return result.partial
				? `（注意：等待超时，以下为已产出的部分回答）\n\n${result.answer}`
				: result.answer;
		},
	},
	{
		name: "ask_agent",
		description:
			"Ask another local coding agent (claude-code / codex / gemini-cli) a question in headless mode and return its answer. Useful for a second opinion from a different model family, or to delegate work to an agent that is better at it. Read-only by default.",
		inputSchema: {
			type: "object",
			properties: {
				agent: {
					type: "string",
					description: "Agent id: claude-code | codex | gemini-cli",
				},
				prompt: { type: "string", description: "The question or task" },
				cwd: {
					type: "string",
					description: "Working directory for the agent (absolute path)",
				},
				allow_write: {
					type: "boolean",
					description:
						"Allow the target agent to modify files. Defaults to false (read-only).",
				},
				timeout_seconds: { type: "number", description: "Default 300" },
			},
			required: ["agent", "prompt"],
		},
		handler: async (db, args) => {
			const agent = str(args, "agent");
			const prompt = str(args, "prompt");
			if (!agent || !prompt) throw new Error("agent 与 prompt 均为必填");
			const result = await runBridgeCall(
				db,
				{
					target: agent,
					kind: "cli",
					prompt,
					cwd: str(args, "cwd") || undefined,
					timeoutMs: Math.round(num(args, "timeout_seconds", 300) * 1000),
					caller: "external:mcp",
				},
				{ allowWrite: args.allow_write === true },
			);
			if (!result.ok) throw new Error(result.error ?? "调用失败");
			return result.answer;
		},
	},
	{
		name: "search_sessions",
		description:
			"Full-text search across ALL of the user's AI sessions — Claude Code, Codex, this app's agent, and imported web chats. Use it to answer 'how did we solve this before' / 'what did I decide about X'. Returns matching snippets with their session ids.",
		inputSchema: {
			type: "object",
			properties: {
				query: { type: "string", description: "Search keywords" },
				harness: {
					type: "string",
					description:
						"Optional filter: claude-code | codex | ipo-sdk | web-chatgpt | …",
				},
				limit: { type: "number", description: "Max hits, default 20" },
			},
			required: ["query"],
		},
		handler: async (db, args) => {
			const query = str(args, "query");
			if (!query) throw new Error("query 为必填");
			const limit = Math.min(Math.max(num(args, "limit", 20), 1), 100);
			const harness = str(args, "harness");
			const sqlArgs: (string | number)[] = [`"${query.replace(/"/g, '""')}"`];
			let filter = "";
			if (harness) {
				filter = "AND s.harness = ?";
				sqlArgs.push(harness);
			}
			sqlArgs.push(limit);
			const res = await db.client.execute({
				sql: `SELECT m.session_id, s.harness, s.title, s.cwd, m.role, m.created_at,
				             snippet(harness_messages_fts, 0, '**', '**', '…', 28) AS snippet
				      FROM harness_messages_fts f
				      JOIN harness_messages m ON m.rowid = f.rowid
				      JOIN harness_sessions s ON s.id = m.session_id
				      WHERE harness_messages_fts MATCH ? ${filter}
				      ORDER BY rank LIMIT ?`,
				args: sqlArgs,
			});
			if (!res.rows.length) return `没有找到匹配「${query}」的会话内容。`;
			const lines = res.rows.map((raw) => {
				const row = raw as Record<string, unknown>;
				const when = new Date(Number(row.created_at ?? 0)).toLocaleString(
					"zh-CN",
				);
				return [
					`- [${row.harness}] ${row.title ?? "(无标题)"} · ${when}`,
					`  session_id: ${row.session_id}`,
					row.cwd ? `  cwd: ${row.cwd}` : "",
					`  ${String(row.snippet ?? "").replace(/\n/g, " ")}`,
				]
					.filter(Boolean)
					.join("\n");
			});
			return `找到 ${res.rows.length} 条匹配：\n\n${lines.join("\n\n")}`;
		},
	},
	{
		name: "get_session",
		description:
			"Read the full transcript of one session returned by search_sessions. Use it when a snippet looks relevant and you need the surrounding context.",
		inputSchema: {
			type: "object",
			properties: {
				session_id: { type: "string" },
				limit: {
					type: "number",
					description: "Max messages from the end of the session, default 100",
				},
			},
			required: ["session_id"],
		},
		handler: async (db, args) => {
			const sessionId = str(args, "session_id");
			if (!sessionId) throw new Error("session_id 为必填");
			const limit = Math.min(Math.max(num(args, "limit", 100), 1), 500);
			const messages = await loadSessionTranscript(db, sessionId, limit);
			if (!messages.length) return `会话 ${sessionId} 没有可读转录。`;
			return messages
				.map((m) => {
					const label =
						m.role === "user"
							? "用户"
							: m.role === "assistant"
								? "助手"
								: "系统";
					return `**${label}**：${m.content}`;
				})
				.join("\n\n");
		},
	},
	{
		name: "board_read",
		description:
			"Read the shared work board for a working directory — the goal, decisions already made, pitfalls already hit, and open TODOs, written by whichever agent worked here before you. ALWAYS read this before starting work in an unfamiliar directory: it is how you avoid redoing decisions or repeating known mistakes.",
		inputSchema: {
			type: "object",
			properties: {
				cwd: {
					type: "string",
					description:
						"Absolute path of the working directory. Omit for the global board.",
				},
			},
		},
		handler: async (db, args) => {
			const cwd = str(args, "cwd");
			const entries = await listBoardEntries(db, cwd);
			if (!entries.length) {
				return cwd ? `${cwd} 的共享白板还是空的。` : "全局共享白板还是空的。";
			}
			return renderBoardMarkdown(entries, normalizeScope(cwd));
		},
	},
	{
		name: "board_write",
		description:
			"Append an entry to the shared work board so other agents (and future sessions) can see it. Write a 'decision' when you settle an approach, a 'pitfall' when something failed and you learned why, a 'next' for remaining work, a 'goal' to state the overall objective. Keep each entry to one sentence.",
		inputSchema: {
			type: "object",
			properties: {
				cwd: {
					type: "string",
					description: "Absolute working directory this entry belongs to",
				},
				kind: {
					type: "string",
					enum: ["goal", "decision", "pitfall", "next", "note"],
				},
				content: { type: "string", description: "One-sentence entry" },
				author: {
					type: "string",
					description: "Who is writing (e.g. claude-code, codex)",
				},
			},
			required: ["kind", "content"],
		},
		handler: async (db, args) => {
			const content = str(args, "content");
			if (!content) throw new Error("content 为必填");
			const entry = await addBoardEntry(db, {
				cwd: str(args, "cwd"),
				kind: str(args, "kind", "note"),
				content,
				author: str(args, "author") || "external",
			});
			return `已写入共享白板（${entry.kind}）：${entry.content}`;
		},
	},
	{
		name: "council",
		description:
			"Ask the SAME question to several AI entries at once and get a synthesized verdict that explicitly separates consensus from disagreement. Use this for high-stakes judgement calls (architecture choices, root-cause disputes) where one model's answer is not enough. Slower and more expensive than a single ask — do not use it for routine questions.",
		inputSchema: {
			type: "object",
			properties: {
				question: { type: "string" },
				members: {
					type: "array",
					items: { type: "string" },
					description:
						"Entry ids to consult, e.g. ['claude-code','codex','chatgpt','gemini']. Omit to let the app pick available ones.",
				},
				cwd: { type: "string" },
			},
			required: ["question"],
		},
		handler: async (db, args) => {
			const question = str(args, "question");
			if (!question) throw new Error("question 为必填");

			const requested = Array.isArray(args.members)
				? (args.members as unknown[]).filter(
						(x): x is string => typeof x === "string",
					)
				: [];

			const [detections, sites] = await Promise.all([
				detectHarnesses(),
				loadWebSites(db),
			]);

			const members: {
				harness: string;
				kind: "cli" | "web" | "app";
				label: string;
			}[] = [];
			const ids = requested.length
				? requested
				: [
						...detections.filter((d) => d.canInject).map((d) => d.harness),
						...sites
							.filter((s) => s.enabled)
							.slice(0, 2)
							.map((s) => s.id),
					];

			for (const id of ids) {
				const cli = detections.find((d) => d.harness === id);
				if (cli?.canInject) {
					members.push({ harness: id, kind: "cli", label: cli.label });
					continue;
				}
				const site = findWebSite(sites, id);
				if (site?.enabled) {
					members.push({ harness: site.id, kind: "web", label: site.label });
					continue;
				}
				if (id === "ipo-sdk" || id === "app") {
					members.push({ harness: "ipo-sdk", kind: "app", label: "本应用" });
				}
			}

			if (!members.length) {
				throw new Error("没有可参与议会的入口（CLI 未安装且 Web 站点未启用）");
			}

			const result = await runCouncil(db, {
				question,
				members,
				cwd: str(args, "cwd") || null,
			});

			const detail = result.answers
				.map((a) =>
					a.status === "succeeded"
						? `### ${a.label}\n\n${a.answer}`
						: `### ${a.label}\n\n未作答：${a.error ?? "无内容"}`,
				)
				.join("\n\n---\n\n");
			return result.verdict
				? `## 裁决结论\n\n${result.verdict}\n\n---\n\n## 各路原始回答\n\n${detail}`
				: `裁决未能生成（${result.error ?? "未知原因"}）。以下是各路原始回答：\n\n${detail}`;
		},
	},
	{
		name: "route_capability",
		description:
			"Ask which AI entry the user has configured as best for a kind of task, taking into account what is installed and what is currently rate-limited. Capabilities: long-context, research, refactor, quick, chinese.",
		inputSchema: {
			type: "object",
			properties: {
				capability: {
					type: "string",
					enum: BUILTIN_CAPABILITIES.map((c) => c.capability),
				},
			},
			required: ["capability"],
		},
		handler: async (db, args) => {
			const capability = str(args, "capability");
			const picked = await pickForCapability(db, capability);
			if (!picked) {
				return `能力「${capability}」当前没有可用入口（都未安装、被禁用或处于限额中）。`;
			}
			return `推荐入口：${picked.label}（${picked.harness}，类型 ${picked.kind}）。可用 ask_web_ai 或 ask_agent 调用它。`;
		},
	},
];

// ============================================================
// JSON-RPC
// ============================================================

interface JsonRpcRequest {
	jsonrpc?: string;
	id?: string | number | null;
	method?: string;
	params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
	return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(
	id: string | number | null | undefined,
	code: number,
	message: string,
) {
	return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/**
 * 创建 MCP 路由。
 *
 * 无状态实现：不维护 session，每个 POST 独立处理。MCP 规范允许服务端不返回
 * `Mcp-Session-Id`，客户端据此按无状态模式工作。
 */
export function createHarnessMcpRouter(options: {
	db: DbContext;
	logger: Logger;
	getToken: () => string;
	isEnabled: () => Promise<boolean>;
}) {
	const router = express.Router();
	const { db, logger } = options;

	// 鉴权：回环地址不是安全边界，本机任意进程都能访问
	router.use((req: Request, res: Response, next: () => void) => {
		const header = String(req.headers.authorization ?? "");
		const provided = header.startsWith("Bearer ")
			? header.slice(7).trim()
			: String(req.headers["x-aihub-token"] ?? "").trim();
		if (!provided || provided !== options.getToken()) {
			res.status(401).json(rpcError(null, -32001, "Unauthorized"));
			return;
		}
		next();
	});

	router.post("/", async (req: Request, res: Response) => {
		if (!(await options.isEnabled())) {
			res.status(503).json(rpcError(null, -32002, "AI Hub MCP 服务未启用"));
			return;
		}

		const body = req.body as JsonRpcRequest | JsonRpcRequest[];
		// 批量请求：MCP 客户端很少用，但规范允许，逐个处理
		if (Array.isArray(body)) {
			const results = await Promise.all(
				body.map((item) => handleOne(item, db, logger)),
			);
			res.json(results.filter((r) => r !== null));
			return;
		}

		const result = await handleOne(body, db, logger);
		if (result === null) {
			// 通知（没有 id）：按规范返回 202 且无正文
			res.status(202).end();
			return;
		}
		res.json(result);
	});

	// 部分客户端会先 GET 探活；无状态实现没有 SSE 通道，明确回 405
	router.get("/", (_req: Request, res: Response) => {
		res
			.status(405)
			.json(rpcError(null, -32000, "此服务为无状态实现，仅支持 POST"));
	});

	return router;
}

async function handleOne(
	request: JsonRpcRequest,
	db: DbContext,
	logger: Logger,
): Promise<unknown | null> {
	const method = String(request?.method ?? "");
	const id = request?.id;
	const isNotification = id === undefined || id === null;

	if (method === "initialize") {
		return rpcResult(id, {
			protocolVersion: PROTOCOL_VERSION,
			capabilities: { tools: { listChanged: false } },
			serverInfo: { name: "ipo-aihub", version: "1.0.0" },
		instructions:
			"IPO Workbench 的 Agent 接力层（Harness 互通）。可以让你调用用户已登录的 Web AI 产品、其他本地 coding agent、跨入口检索历史会话，以及读写跨 agent 共享的工作白板。在陌生目录开工前先调 board_read。",
		});
	}

	if (
		method === "notifications/initialized" ||
		method.startsWith("notifications/")
	) {
		return null;
	}

	if (method === "ping") {
		return rpcResult(id, {});
	}

	if (method === "tools/list") {
		return rpcResult(id, {
			tools: TOOLS.map((t) => ({
				name: t.name,
				description: t.description,
				inputSchema: t.inputSchema,
			})),
		});
	}

	if (method === "tools/call") {
		const params = request.params ?? {};
		const name = String(params.name ?? "");
		const args = (params.arguments ?? {}) as Record<string, unknown>;
		const tool = TOOLS.find((t) => t.name === name);
		if (!tool) {
			return rpcError(id, -32602, `未知工具：${name}`);
		}
		try {
			const text = await tool.handler(db, args);
			return rpcResult(id, {
				content: [{ type: "text", text }],
				isError: false,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.warn({ msg: "MCP 工具执行失败", tool: name, error: message });
			// 工具级错误按 MCP 规范用 isError 返回，而不是 JSON-RPC error——
			// 后者会让客户端认为是协议问题而不是「这次调用失败了，可以重试/换路」
			return rpcResult(id, {
				content: [{ type: "text", text: `调用失败：${message}` }],
				isError: true,
			});
		}
	}

	if (isNotification) return null;
	return rpcError(id, -32601, `不支持的方法：${method}`);
}

/** 供设置面板展示的工具清单（名称 + 一句话说明）。 */
export function listMcpToolSummaries(): { name: string; summary: string }[] {
	return TOOLS.map((t) => ({
		name: t.name,
		summary: t.description.split(/(?<=\.)\s/)[0] ?? t.description,
	}));
}
