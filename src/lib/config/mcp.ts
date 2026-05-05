import { invoke } from "../tauriCompat";
import { getConfig, setConfig } from "./core";

export interface MCPServer {
	id: string;
	name: string;
	command: string;
	args: string[];
	env?: Record<string, string>;
	enabled: boolean;
}

export interface McpTestResult {
	tool_count: number;
	tool_names: string[];
}

export interface MCPTool {
	name: string;
	description?: string | null;
	inputSchema?: any;
}

export interface MCPToolResultContent {
	type: string;
	text?: string | null;
	data?: string | null;
	mimeType?: string | null;
}

export interface MCPToolResult {
	content: MCPToolResultContent[];
	isError?: boolean | null;
}

export interface EnvCheckResult {
	node_version: string | null;
	npx_version: string | null;
	path: string;
	shell: string | null;
	valid: boolean;
}

export async function listMcpServers(): Promise<MCPServer[]> {
	return invoke("list_mcp_servers");
}

export async function addMcpServer(server: MCPServer): Promise<void> {
	await invoke("create_mcp_server", {
		name: server.name,
		command: server.command,
		args: server.args,
		env: server.env ?? {},
		enabled: server.enabled,
	});
}

export async function updateMcpServer(server: MCPServer): Promise<void> {
	await invoke("update_mcp_server", {
		id: server.id,
		name: server.name,
		command: server.command,
		args: server.args,
		env: server.env ?? {},
		enabled: server.enabled,
	});
}

export async function deleteMcpServer(id: string): Promise<void> {
	await invoke("delete_mcp_server", { id });
}

export async function testMcpServer(
	_server: MCPServer,
): Promise<McpTestResult> {
	throw new Error(
		"当前版本暂不支持在设置页直接测试 MCP（请在 Agent 对话中实际调用工具验证）。",
	);
}

export async function mcpCheckEnv(): Promise<EnvCheckResult> {
	return invoke("mcp_check_env");
}

export async function mcpListTools(
	serverId: string,
	forceRefresh = false,
): Promise<MCPTool[]> {
	return invoke("mcp_list_tools", {
		server_id: serverId,
		force_refresh: forceRefresh,
	});
}

export async function mcpCallTool(
	serverId: string,
	toolName: string,
	argumentsJson: Record<string, any> = {},
): Promise<MCPToolResult> {
	return invoke("mcp_call_tool", {
		server_id: serverId,
		tool_name: toolName,
		arguments: argumentsJson,
	});
}

export async function mcpStopServer(serverId: string): Promise<void> {
	return invoke("mcp_stop_server", { server_id: serverId });
}

// 占位：保持向后兼容 (原 config.ts 引用 getConfig/setConfig 供外部扩展)
export { getConfig, setConfig };
