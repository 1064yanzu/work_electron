/**
 * MCP Server 管理 IPC Handlers
 */
import { randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import type { DbContext } from "../../db/client";

const now = () => Date.now();

interface McpServer {
	id: string;
	name: string;
	command: string;
	args: string[];
	env: Record<string, string>;
	enabled: boolean;
	created_at: number;
	updated_at: number;
}

function parseJsonArray(str: string | null | undefined): string[] {
	if (!str) return [];
	try {
		return JSON.parse(str) as string[];
	} catch {
		return [];
	}
}

function parseJsonObject(
	str: string | null | undefined,
): Record<string, string> {
	if (!str) return {};
	try {
		return JSON.parse(str) as Record<string, string>;
	} catch {
		return {};
	}
}

export function createMcpHandlers(db: DbContext) {
	const listMcpServers = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<McpServer[]> => {
		const rows = await db.client.execute(
			`SELECT * FROM mcp_servers ORDER BY name ASC`,
		);
		return rows.rows.map((row) => ({
			id: row.id as string,
			name: row.name as string,
			command: row.command as string,
			args: parseJsonArray(row.args as string),
			env: parseJsonObject(row.env as string),
			enabled: Boolean(row.enabled),
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		}));
	};

	const getMcpServer = async (
		_event: IpcMainInvokeEvent,
		input: { id: string },
	): Promise<McpServer | null> => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM mcp_servers WHERE id = ?`,
			args: [input.id],
		});
		if (rows.rows.length === 0) return null;
		const row = rows.rows[0];
		return {
			id: row.id as string,
			name: row.name as string,
			command: row.command as string,
			args: parseJsonArray(row.args as string),
			env: parseJsonObject(row.env as string),
			enabled: Boolean(row.enabled),
			created_at: row.created_at as number,
			updated_at: row.updated_at as number,
		};
	};

	const createMcpServer = async (
		_event: IpcMainInvokeEvent,
		input: {
			name: string;
			command: string;
			args?: string[];
			env?: Record<string, string>;
			enabled?: boolean;
		},
	): Promise<McpServer> => {
		const id = randomUUID();
		const timestamp = now();

		await db.client.execute({
			sql: `INSERT INTO mcp_servers (id, name, command, args, env, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.name,
				input.command,
				JSON.stringify(input.args ?? []),
				JSON.stringify(input.env ?? {}),
				(input.enabled ?? true) ? 1 : 0,
				timestamp,
				timestamp,
			],
		});

		return {
			id,
			name: input.name,
			command: input.command,
			args: input.args ?? [],
			env: input.env ?? {},
			enabled: input.enabled ?? true,
			created_at: timestamp,
			updated_at: timestamp,
		};
	};

	const updateMcpServer = async (
		_event: IpcMainInvokeEvent,
		input: {
			id: string;
			name?: string;
			command?: string;
			args?: string[];
			env?: Record<string, string>;
			enabled?: boolean;
		},
	): Promise<McpServer> => {
		const updates: string[] = [];
		const args: (string | number | null)[] = [];

		if (input.name !== undefined) {
			updates.push("name = ?");
			args.push(input.name);
		}
		if (input.command !== undefined) {
			updates.push("command = ?");
			args.push(input.command);
		}
		if (input.args !== undefined) {
			updates.push("args = ?");
			args.push(JSON.stringify(input.args));
		}
		if (input.env !== undefined) {
			updates.push("env = ?");
			args.push(JSON.stringify(input.env));
		}
		if (input.enabled !== undefined) {
			updates.push("enabled = ?");
			args.push(input.enabled ? 1 : 0);
		}

		updates.push("updated_at = ?");
		args.push(now());
		args.push(input.id);

		await db.client.execute({
			sql: `UPDATE mcp_servers SET ${updates.join(", ")} WHERE id = ?`,
			args,
		});

		const result = await getMcpServer({} as IpcMainInvokeEvent, {
			id: input.id,
		});
		if (!result) throw new Error(`MCP server not found: ${input.id}`);
		return result;
	};

	const deleteMcpServer = async (
		_event: IpcMainInvokeEvent,
		input: { id: string },
	): Promise<{ success: boolean }> => {
		await db.client.execute({
			sql: `DELETE FROM mcp_servers WHERE id = ?`,
			args: [input.id],
		});
		return { success: true };
	};

	const toggleMcpServer = async (
		_event: IpcMainInvokeEvent,
		input: { id: string; enabled: boolean },
	): Promise<{ success: boolean }> => {
		await db.client.execute({
			sql: `UPDATE mcp_servers SET enabled = ?, updated_at = ? WHERE id = ?`,
			args: [input.enabled ? 1 : 0, now(), input.id],
		});
		return { success: true };
	};

	// 检查MCP环境配置
	const mcpCheckEnv = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<{
		nodeInstalled: boolean;
		uvxInstalled: boolean;
		npxInstalled: boolean;
	}> => {
		// 简单返回环境检查状态（可以后续扩展实际检查逻辑）
		return {
			nodeInstalled: true, // Node.js 在 Electron 环境中肯定存在
			uvxInstalled: false, // 需要实际检查
			npxInstalled: true, // 通常和 Node.js 一起安装
		};
	};

	return {
		list_mcp_servers: listMcpServers,
		get_mcp_server: getMcpServer,
		create_mcp_server: createMcpServer,
		update_mcp_server: updateMcpServer,
		delete_mcp_server: deleteMcpServer,
		toggle_mcp_server: toggleMcpServer,
		mcp_check_env: mcpCheckEnv,
	};
}
