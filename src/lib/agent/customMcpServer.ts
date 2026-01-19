/**
 * Custom MCP Server for Codex Tools
 *
 * Registers our custom tools (doc_create, kb_search, code_execute, etc.) as MCP tools
 * that the Claude Agent SDK can use.
 */

import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { type KbSearchChunksPayload, kbSearchChunks } from "../api";
// Import existing tool implementations
import { EVENTS, events } from "../events";
import { workspaceStore } from "../workspaceStore";

// Helper function
function normalizeText(s: unknown): string {
	return typeof s === "string" ? s : "";
}

function extractTitleAndContent(content: string): {
	title: string;
	content: string;
} {
	const trimmed = content.trim();
	const lines = trimmed.split("\n");
	const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);
	const first = firstNonEmptyIdx >= 0 ? lines[firstNonEmptyIdx].trim() : "";
	const headingMatch = first.match(/^(#{1,6})\s+(.+)$/);
	if (headingMatch && headingMatch[2]) {
		const title = headingMatch[2].trim().slice(0, 80) || "新文档";
		const body =
			lines
				.slice(firstNonEmptyIdx + 1)
				.join("\n")
				.trim() || trimmed;
		return { title, content: body };
	}
	return { title: (first || "新文档").slice(0, 80), content: trimmed };
}

function extractSummary(content: string): string {
	const cleaned = content
		.replace(/^#{1,6}\s+.*$/gm, "")
		.replace(/\s+/g, " ")
		.trim();
	if (!cleaned) return "";
	const m = cleaned.match(/^(.{30,160}?)([。！？.!?]|$)/);
	return (m?.[1] || cleaned.slice(0, 120)).trim();
}

/**
 * Create the Codex custom tools MCP server
 */
type ClaudeAgentSdk = typeof import("@anthropic-ai/claude-agent-sdk");
type McpServer = NonNullable<Options["mcpServers"]>[string];

async function createCodexMcpServer(): Promise<McpServer> {
	const isNodeRuntime =
		typeof process !== "undefined" &&
		typeof process.versions !== "undefined" &&
		typeof process.versions.node === "string";

	if (!isNodeRuntime) {
		throw new Error(
			"Claude Agent SDK 的 MCP server 需要 Node.js 运行时；当前为浏览器/Tauri WebView 环境。",
		);
	}

	const sdk = (await import(
		"@anthropic-ai/claude-agent-sdk"
	)) as ClaudeAgentSdk;
	const { tool, createSdkMcpServer } = sdk;

	return createSdkMcpServer({
		name: "codex-tools",
		version: "1.0.0",
		tools: [
			// ==================== 文档操作工具 ====================

			tool(
				"doc_create",
				"在编辑器中创建一个新文档（Markdown格式）",
				{
					title: z
						.string()
						.optional()
						.describe("文档标题（可选，会自动从内容提取）"),
					summary: z.string().optional().describe("摘要（可选）"),
					content: z.string().describe("文档正文（Markdown）"),
				},
				async (args) => {
					const rawContent = normalizeText(args.content);
					if (!rawContent.trim()) {
						return {
							content: [{ type: "text", text: "Error: content 不能为空" }],
							isError: true,
						};
					}

					const inferred = extractTitleAndContent(rawContent);
					const title =
						normalizeText(args.title).trim() || inferred.title || "新文档";
					const content = inferred.content.trim()
						? rawContent.trim()
						: rawContent.trim();
					const summary =
						normalizeText(args.summary).trim() || extractSummary(rawContent);

					// Emit event to create document in editor
					events.emit(EVENTS.AI_DOC_CREATE_END, {
						title,
						summary,
						content,
						prompt: title,
					});

					return {
						content: [
							{
								type: "text",
								text: `成功创建文档: "${title}" (${content.length} 字符)`,
							},
						],
					};
				},
			),

			tool(
				"doc_update",
				"更新编辑器中当前打开的文档",
				{
					content: z.string().describe("新的完整文档内容（Markdown）"),
				},
				async (args) => {
					const suggestedContent = normalizeText(args.content).trim();
					if (!suggestedContent) {
						return {
							content: [{ type: "text", text: "Error: content 不能为空" }],
							isError: true,
						};
					}

					const originalContent = workspaceStore.getActiveDocContent() || "";

					events.emit(EVENTS.AI_DOC_UPDATE_END, {
						originalContent,
						suggestedContent,
						prompt: "doc_update",
					});

					return {
						content: [
							{
								type: "text",
								text: `成功更新文档 (${suggestedContent.length} 字符)`,
							},
						],
					};
				},
			),

			// ==================== 知识库搜索 ====================

			tool(
				"kb_search",
				"从本地知识库检索相关内容",
				{
					query: z.string().describe("检索关键词"),
					limit: z.number().optional().default(8).describe("返回结果数量上限"),
					source_id: z.string().optional().describe("可选：限定某个 source_id"),
				},
				async (args) => {
					const { query, limit = 8, source_id } = args;

					if (!query) {
						return {
							content: [{ type: "text", text: "Error: 检索关键词不能为空" }],
							isError: true,
						};
					}

					try {
						const payload: KbSearchChunksPayload = { query, limit };
						if (source_id?.trim()) {
							payload.source_id = source_id.trim();
						}

						const hits = await kbSearchChunks(payload);

						if (hits.length === 0) {
							return {
								content: [
									{ type: "text", text: `未找到与 "${query}" 相关的内容` },
								],
							};
						}

						// Format results
						const resultsText = hits
							.map((hit, i) => {
								const title = hit.source_title || `分块 #${hit.chunk_index}`;
								return `${i + 1}. **${title}** (相关度: ${(hit.score * 100).toFixed(1)}%)\n${hit.snippet}`;
							})
							.join("\n\n---\n\n");

						return {
							content: [
								{
									type: "text",
									text: `找到 ${hits.length} 条相关内容:\n\n${resultsText}`,
								},
							],
						};
					} catch (error) {
						const errMsg =
							error instanceof Error ? error.message : "知识库检索失败";
						return {
							content: [{ type: "text", text: `Error: ${errMsg}` }],
							isError: true,
						};
					}
				},
			),

			// ==================== 代码执行 (委托给 SDK 的 Bash) ====================
			// Note: SDK has built-in Bash tool, so we don't need to implement code_execute
			// The SDK's Bash tool is more robust with sandboxing
		],
	}) as McpServer;
}

let codexMcpServerPromise: Promise<McpServer> | null = null;
export function getCodexMcpServer(): Promise<McpServer> {
	codexMcpServerPromise ??= createCodexMcpServer();
	return codexMcpServerPromise;
}

// Export tool names for allowedTools configuration
export const CODEX_TOOL_NAMES = [
	"mcp__codex-tools__doc_create",
	"mcp__codex-tools__doc_update",
	"mcp__codex-tools__kb_search",
] as const;
