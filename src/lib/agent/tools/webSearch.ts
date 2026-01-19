// 网络搜索工具（策略可配置：本地抓取 / MCP Tavily）

import {
	getSearchHealth,
	getSearchStrategy,
	type SearchStrategy,
	smartWebSearch,
} from "../../config";
import {
	createArtifact,
	type ToolContext,
	type ToolDefinition,
	type ToolResult,
} from "../types";

export const webSearchTool: ToolDefinition = {
	type: "web_search",
	name: "网络搜索",
	description: "网络搜索（遵循可配置策略：本地/浏览器抓取与 MCP Tavily 兜底）",
	icon: "Search",
	inputSchema: {
		type: "object",
		properties: {
			query: { type: "string", description: "搜索关键词" },
			engine: {
				type: "string",
				enum: ["auto", "tavily", "duckduckgo", "bing", "google"],
				default: "auto",
			},
			limit: { type: "number", default: 10 },
		},
		required: ["query"],
	},
	execute: async (
		input: Record<string, any>,
		context: ToolContext,
	): Promise<ToolResult> => {
		const { query, engine = "auto", limit = 10 } = input;

		if (!query) {
			return { success: false, error: "搜索关键词不能为空" };
		}

		try {
			context.onProgress?.(10, "正在搜索...");

			const strategy = await getSearchStrategy();
			const strategyOverride: SearchStrategy | undefined =
				engine === "tavily" ? "mcp_only" : undefined;
			const results = await smartWebSearch({
				query,
				engine: engine === "auto" ? undefined : engine,
				limit,
				strategy: strategyOverride ?? strategy,
			});

			context.onProgress?.(
				100,
				`找到 ${results.length} 条结果（策略: ${strategyOverride ?? strategy}）`,
			);

			return {
				success: true,
				data: {
					query,
					engine: engine === "auto" ? "auto" : engine,
					results: results.slice(0, limit),
					totalResults: results.length,
					strategy: strategyOverride ?? strategy,
				},
				artifacts: results
					.slice(0, limit)
					.map((result) =>
						createArtifact("url", result.title, result.snippet, result.url),
					),
			};
		} catch (error) {
			const health = getSearchHealth();
			return {
				success: false,
				error:
					(error instanceof Error ? error.message : "搜索失败") +
					`（策略健康：本地成功${health.local.successCount}/失败${health.local.failCount}，MCP成功${health.mcp.successCount}/失败${health.mcp.failCount}）`,
			};
		}
	},
};
