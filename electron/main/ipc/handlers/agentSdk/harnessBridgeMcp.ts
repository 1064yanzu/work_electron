/**
 * Harness Bridge MCP —— 把「其他 AI 入口」作为工具挂给本应用自己的 Agent。
 *
 * 本应用的 Copilot 由此获得三类它自身没有的能力：
 * - Web 端订阅制产品（ChatGPT 深度研究 / Gemini 超长上下文 / 中文站点检索），
 *   走用户已付费的订阅额度，不烧 API token；
 * - 本机其他 coding agent 的第二意见（不同模型家族的判断差异本身就是信息）；
 * - 跨入口的历史会话检索与共享白板（"上次这个问题是怎么解决的"）。
 *
 * 与反向 MCP Server（`http/routers/harnessMcpRouter.ts`）是同一套底层能力的
 * 两个方向：那边给外部 CLI 用，这边给本应用 Agent 用。工具语义刻意保持一致，
 * 免得同一件事在两个方向上行为不同。
 */
import { z } from "zod";
import type { DbContext } from "../../../db/client";
import { runBridgeCall } from "../../../harnessHub/bridge";
import {
	addBoardEntry,
	listBoardEntries,
	normalizeScope,
	renderBoardMarkdown,
} from "../../../harnessHub/board";
import { detectHarnesses } from "../../../harnessHub/detect";
import { runCouncil } from "../../../harnessHub/council";
import { findWebSite, loadWebSites } from "../../../harnessHub/webSites";

const SERVER_NAME = "ipo_harness_bridge";

/** 工具全名（allowedTools / 系统提示里要点名时用）。 */
export const HARNESS_BRIDGE_TOOLS = {
	askWeb: `mcp__${SERVER_NAME}__ask_web_ai`,
	askAgent: `mcp__${SERVER_NAME}__ask_agent`,
	searchSessions: `mcp__${SERVER_NAME}__search_sessions`,
	boardRead: `mcp__${SERVER_NAME}__board_read`,
	boardWrite: `mcp__${SERVER_NAME}__board_write`,
	council: `mcp__${SERVER_NAME}__council`,
} as const;

type ClaudeAgentSdkLike = {
	createSdkMcpServer: (options: unknown) => unknown;
	tool: (
		name: string,
		description: string,
		inputSchema: Record<string, unknown>,
		handler: (args: Record<string, unknown>) => Promise<unknown>,
		extras?: Record<string, unknown>,
	) => unknown;
};

function text(value: string) {
	return { content: [{ type: "text", text: value }] };
}

export function createHarnessBridgeMcpServer(
	sdk: ClaudeAgentSdkLike,
	db: DbContext,
) {
	return sdk.createSdkMcpServer({
		name: SERVER_NAME,
		version: "1.0.0",
		tools: [
			sdk.tool(
				"ask_web_ai",
				"向用户已登录的 Web AI 产品（ChatGPT / Gemini / Kimi / 豆包 / GLM / DeepSeek）提问并取回答案。适用于本地做不到的事：实时联网研究、超长上下文、以及用户已付费的订阅额度（不消耗 API token）。问题必须自包含——Web 端读不到本地文件。",
				{
					site: z
						.string()
						.min(1)
						.describe(
							"站点 id：chatgpt / gemini / kimi / doubao / glm / deepseek",
						),
					prompt: z.string().min(1).describe("自包含的问题"),
					timeout_seconds: z
						.number()
						.int()
						.min(10)
						.max(600)
						.optional()
						.describe("等待回答的最长秒数，默认 180"),
				},
				async (args) => {
					const result = await runBridgeCall(db, {
						target: String(args.site ?? ""),
						kind: "web",
						prompt: String(args.prompt ?? ""),
						timeoutMs:
							typeof args.timeout_seconds === "number"
								? Math.round(args.timeout_seconds * 1000)
								: undefined,
						caller: "ipo-sdk",
					});
					if (!result.ok) {
						return text(`调用失败：${result.error ?? "未知原因"}`);
					}
					return text(
						result.partial
							? `（等待超时，以下为已产出的部分回答）\n\n${result.answer}`
							: result.answer,
					);
				},
				{
					searchHint:
						"web AI, ChatGPT, Gemini, 深度研究, 联网搜索, 超长上下文, 订阅额度",
					annotations: {
						title: "调用 Web AI",
						readOnlyHint: true,
						openWorldHint: true,
					},
				},
			),

			sdk.tool(
				"ask_agent",
				"以 headless 模式向本机另一个 coding agent（claude-code / codex / gemini-cli）提问并取回答案。用于获取不同模型家族的第二意见，或把它更擅长的活派给它。默认只读，不会改文件。",
				{
					agent: z
						.enum(["claude-code", "codex", "gemini-cli"])
						.describe("目标 agent"),
					prompt: z.string().min(1).describe("问题或任务"),
					cwd: z.string().optional().describe("工作目录绝对路径"),
					allow_write: z
						.boolean()
						.optional()
						.describe("是否允许目标 agent 修改文件，默认 false"),
					timeout_seconds: z.number().int().min(10).max(900).optional(),
				},
				async (args) => {
					const result = await runBridgeCall(
						db,
						{
							target: String(args.agent ?? ""),
							kind: "cli",
							prompt: String(args.prompt ?? ""),
							cwd:
								typeof args.cwd === "string" && args.cwd.trim()
									? args.cwd.trim()
									: undefined,
							timeoutMs:
								typeof args.timeout_seconds === "number"
									? Math.round(args.timeout_seconds * 1000)
									: undefined,
							caller: "ipo-sdk",
						},
						{ allowWrite: args.allow_write === true },
					);
					return text(
						result.ok
							? result.answer
							: `调用失败：${result.error ?? "未知原因"}`,
					);
				},
				{
					searchHint: "另一个 agent, 第二意见, claude code, codex, 委派任务",
					annotations: { title: "调用其他 Agent", openWorldHint: true },
				},
			),

			sdk.tool(
				"search_sessions",
				"跨全部 AI 入口全文检索用户的历史会话（Claude Code / Codex / 本应用 / 已导入的 Web 对话）。回答「这个问题以前是怎么解决的」「当时为什么这么定」时先查这里。",
				{
					query: z.string().min(1).describe("检索关键词"),
					harness: z.string().optional().describe("可选：只查某个入口"),
					limit: z.number().int().min(1).max(50).optional(),
				},
				async (args) => {
					const query = String(args.query ?? "").trim();
					if (!query) return text("query 为空");
					const limit =
						typeof args.limit === "number"
							? Math.min(Math.max(Math.floor(args.limit), 1), 50)
							: 20;
					const sqlArgs: (string | number)[] = [
						`"${query.replace(/"/g, '""')}"`,
					];
					let filter = "";
					if (typeof args.harness === "string" && args.harness.trim()) {
						filter = "AND s.harness = ?";
						sqlArgs.push(args.harness.trim());
					}
					sqlArgs.push(limit);
					const res = await db.client.execute({
						sql: `SELECT m.session_id, s.harness, s.title, s.cwd, m.created_at,
						             snippet(harness_messages_fts, 0, '**', '**', '…', 28) AS snippet
						      FROM harness_messages_fts f
						      JOIN harness_messages m ON m.rowid = f.rowid
						      JOIN harness_sessions s ON s.id = m.session_id
						      WHERE harness_messages_fts MATCH ? ${filter}
						      ORDER BY rank LIMIT ?`,
						args: sqlArgs,
					});
					if (!res.rows.length) {
						return text(`没有找到匹配「${query}」的历史会话。`);
					}
					const lines = res.rows.map((raw) => {
						const row = raw as Record<string, unknown>;
						const when = new Date(Number(row.created_at ?? 0)).toLocaleString(
							"zh-CN",
						);
						return `- [${row.harness}] ${row.title ?? "(无标题)"} · ${when}\n  ${String(
							row.snippet ?? "",
						).replace(/\n/g, " ")}`;
					});
					return text(`找到 ${res.rows.length} 条：\n\n${lines.join("\n\n")}`);
				},
				{
					searchHint: "历史会话, 以前怎么做的, 跨入口检索",
					annotations: { title: "检索历史会话", readOnlyHint: true },
				},
			),

			sdk.tool(
				"board_read",
				"读取某个工作目录的共享白板：任务目标、已定决策、踩过的坑、待办。这些是之前在此目录工作过的其他 agent 留下的。在不熟悉的目录开工前先读它，避免重复决策或重蹈覆辙。",
				{
					cwd: z
						.string()
						.optional()
						.describe("工作目录绝对路径；不传读全局白板"),
				},
				async (args) => {
					const cwd = typeof args.cwd === "string" ? args.cwd : "";
					const entries = await listBoardEntries(db, cwd);
					if (!entries.length) {
						return text(cwd ? `${cwd} 的共享白板为空。` : "全局共享白板为空。");
					}
					return text(renderBoardMarkdown(entries, normalizeScope(cwd)));
				},
				{
					searchHint: "共享白板, 之前的决策, 踩过的坑, 待办",
					annotations: { title: "读共享白板", readOnlyHint: true },
				},
			),

			sdk.tool(
				"board_write",
				"往共享白板追加一条，让其他 agent 与后续会话能看到。定下方案写 decision，踩坑并搞清原因写 pitfall，剩余工作写 next，整体目标写 goal。每条一句话。",
				{
					kind: z.enum(["goal", "decision", "pitfall", "next", "note"]),
					content: z.string().min(1).describe("一句话内容"),
					cwd: z.string().optional().describe("所属工作目录绝对路径"),
				},
				async (args) => {
					const entry = await addBoardEntry(db, {
						cwd: typeof args.cwd === "string" ? args.cwd : "",
						kind: String(args.kind ?? "note"),
						content: String(args.content ?? ""),
						author: "ipo-sdk",
					});
					return text(`已写入共享白板（${entry.kind}）：${entry.content}`);
				},
				{
					searchHint: "记录决策, 记录踩坑, 共享给其他 agent",
					annotations: { title: "写共享白板" },
				},
			),

			sdk.tool(
				"council",
				"把同一个问题同时问多个 AI 入口，返回一份区分「共识」与「分歧」的合并结论。用于高风险判断（架构选型、根因争议），一家之言不够时才用。比单次提问慢且贵，日常问题不要用。",
				{
					question: z.string().min(1),
					members: z
						.array(z.string())
						.optional()
						.describe(
							"参与的入口 id，如 ['claude-code','codex','chatgpt']；不传则自动挑可用的",
						),
					cwd: z.string().optional(),
				},
				async (args) => {
					const question = String(args.question ?? "").trim();
					if (!question) return text("question 为空");

					const [detections, sites] = await Promise.all([
						detectHarnesses(),
						loadWebSites(db),
					]);
					const requested = Array.isArray(args.members)
						? (args.members as unknown[]).filter(
								(x): x is string => typeof x === "string",
							)
						: [];
					const ids = requested.length
						? requested
						: [
								...detections.filter((d) => d.canInject).map((d) => d.harness),
								...sites
									.filter((s) => s.enabled)
									.slice(0, 2)
									.map((s) => s.id),
							];

					const members: {
						harness: string;
						kind: "cli" | "web" | "app";
						label: string;
					}[] = [];
					for (const id of ids) {
						const cli = detections.find((d) => d.harness === id);
						if (cli?.canInject) {
							members.push({ harness: id, kind: "cli", label: cli.label });
							continue;
						}
						const site = findWebSite(sites, id);
						if (site?.enabled) {
							members.push({
								harness: site.id,
								kind: "web",
								label: site.label,
							});
						}
					}
					if (!members.length) {
						return text("没有可参与议会的入口（CLI 未安装且 Web 站点未启用）");
					}

					const result = await runCouncil(db, {
						question,
						members,
						cwd: typeof args.cwd === "string" ? args.cwd : null,
					});
					const detail = result.answers
						.map((a) =>
							a.status === "succeeded"
								? `### ${a.label}\n\n${a.answer}`
								: `### ${a.label}\n\n未作答：${a.error ?? "无内容"}`,
						)
						.join("\n\n---\n\n");
					return text(
						result.verdict
							? `## 裁决结论\n\n${result.verdict}\n\n---\n\n## 各路原始回答\n\n${detail}`
							: `裁决未生成（${result.error ?? "未知原因"}）。各路原始回答：\n\n${detail}`,
					);
				},
				{
					searchHint: "多模型对比, 第二意见, 架构选型, 有分歧",
					annotations: { title: "多模型议会", openWorldHint: true },
				},
			),
		],
	});
}

/** 挂载后要追加到 system prompt 的说明。 */
export const HARNESS_BRIDGE_PROMPT = [
	"跨入口协作说明：本应用提供 ipo_harness_bridge MCP 工具组，你可以调用用户的其他 AI 入口。",
	`需要实时联网研究、超长上下文、或用户已订阅的 Web AI 能力时，用 ${HARNESS_BRIDGE_TOOLS.askWeb}。`,
	`需要另一个模型家族的第二意见、或把活派给更擅长的 coding agent 时，用 ${HARNESS_BRIDGE_TOOLS.askAgent}。`,
	`回答「以前是怎么解决的」这类问题前，先用 ${HARNESS_BRIDGE_TOOLS.searchSessions} 查历史会话。`,
	`在不熟悉的工作目录开工前，先用 ${HARNESS_BRIDGE_TOOLS.boardRead} 读共享白板；定下重要决策或踩到坑之后用 ${HARNESS_BRIDGE_TOOLS.boardWrite} 记下来。`,
	"这些调用有真实成本（子进程、网页等待），不要在日常问答里滥用。",
].join(" ");
