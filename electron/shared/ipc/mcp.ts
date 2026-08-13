// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：mcp（共 10 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

export interface McpIpcSchema {
	// ==================
	// MCP Servers
	// ==================
	list_mcp_servers: {
		input: Record<string, never>;
		output: Array<{
			id: string;
			name: string;
			command: string;
			args: string[];
			env: Record<string, string>;
			enabled: boolean;
			created_at: number;
			updated_at: number;
		}>;
	};
	get_mcp_server: {
		input: { id: string };
		output: {
			id: string;
			name: string;
			command: string;
			args: string[];
			env: Record<string, string>;
			enabled: boolean;
			created_at: number;
			updated_at: number;
		} | null;
	};
	create_mcp_server: {
		input: {
			name: string;
			command: string;
			args?: string[];
			env?: Record<string, string>;
			enabled?: boolean;
		};
		output: {
			id: string;
			name: string;
			command: string;
			args: string[];
			env: Record<string, string>;
			enabled: boolean;
			created_at: number;
			updated_at: number;
		};
	};
	update_mcp_server: {
		input: {
			id: string;
			name?: string;
			command?: string;
			args?: string[];
			env?: Record<string, string>;
			enabled?: boolean;
		};
		output: {
			id: string;
			name: string;
			command: string;
			args: string[];
			env: Record<string, string>;
			enabled: boolean;
			created_at: number;
			updated_at: number;
		};
	};
	delete_mcp_server: {
		input: { id: string };
		output: { success: boolean };
	};
	toggle_mcp_server: {
		input: { id: string; enabled: boolean };
		output: { success: boolean };
	};
	mcp_check_env: {
		input: Record<string, never>;
		output: {
			node_version: string | null;
			npx_version: string | null;
			path: string;
			shell: string | null;
			valid: boolean;
		};
	};
	mcp_list_tools: {
		input: { server_id: string; force_refresh?: boolean };
		output: Array<{
			name: string;
			description?: string | null;
			inputSchema?: unknown;
		}>;
	};
	mcp_call_tool: {
		input: {
			server_id: string;
			tool_name: string;
			arguments?: Record<string, unknown>;
		};
		output: {
			content: Array<{
				type: string;
				text?: string | null;
				data?: string | null;
				mimeType?: string | null;
			}>;
			isError?: boolean | null;
		};
	};
	mcp_stop_server: {
		input: { server_id: string };
		output: { success: boolean };
	};
}
