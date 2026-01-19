import { listMcpServers, mcpCallTool, mcpListTools } from "../../config";
import { createArtifact, type ToolDefinition } from "../types";

function coerceObject(value: unknown): Record<string, any> {
	if (value && typeof value === "object" && !Array.isArray(value))
		return value as Record<string, any>;
	return {};
}

export const mcpCallToolDef: ToolDefinition = {
	type: "mcp_call",
	name: "MCP 调用",
	description:
		"调用 MCP 服务器上的工具（input: server_id, tool_name, arguments）",
	inputSchema: {
		type: "object",
		properties: {
			server_id: {
				type: "string",
				description: "MCP 服务器 ID（来自 MCP 配置）",
			},
			tool_name: {
				type: "string",
				description: "MCP 工具名（例如 tavily_search 等）",
			},
			arguments: {
				type: "object",
				description: "传给工具的 arguments（JSON object）",
			},
		},
		required: ["server_id", "tool_name"],
	},
	execute: async (input) => {
		const serverId = String(input?.server_id || "").trim();
		const toolName = String(input?.tool_name || "").trim();
		const args = coerceObject(input?.arguments);

		if (!serverId) return { success: false, error: "缺少参数: server_id" };
		if (!toolName) return { success: false, error: "缺少参数: tool_name" };

		// 友好错误：如果 serverId 不存在，提示可选项
		const servers = await listMcpServers().catch(() => []);
		if (Array.isArray(servers) && servers.length > 0) {
			const found = servers.find((s) => s.id === serverId);
			if (!found) {
				return {
					success: false,
					error: `未知 MCP server_id: ${serverId}（可用: ${servers.map((s) => s.id).join(", ")}）`,
				};
			}
			if (!found.enabled) {
				return { success: false, error: `MCP 服务器已禁用: ${serverId}` };
			}
		}

		// 尝试在失败时给出工具名提示（仅用于报错增强）
		try {
			const res = await mcpCallTool(serverId, toolName, args);
			const text = (res?.content || [])
				.filter((c) => c?.type === "text" && typeof c.text === "string")
				.map((c) => c.text)
				.join("\n")
				.trim();

			return {
				success: true,
				data: res,
				artifacts: text
					? [createArtifact("text", `MCP: ${serverId}/${toolName}`, text)]
					: undefined,
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const tools = await mcpListTools(serverId).catch(() => []);
			const hint =
				Array.isArray(tools) && tools.length > 0
					? `（可用工具示例: ${tools
							.slice(0, 12)
							.map((t) => t.name)
							.join(", ")}）`
					: "";
			return { success: false, error: `${message}${hint ? " " + hint : ""}` };
		}
	},
};
