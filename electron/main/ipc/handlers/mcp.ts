/**
 * MCP Server 管理 IPC Handlers
 */
import os from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import type { DbContext } from "../../db/client";
import {
	McpRuntimeService,
	type McpRuntimeServerConfig,
} from "../../services/mcpRuntimeService";

const now = () => Date.now();

const execFileAsync = promisify(execFile);

async function resolveUserPathFromShell(
	shell: string | null,
): Promise<string | null> {
	const s = (shell || "").trim();
	if (!s) return null;

	const attempts: string[][] = [
		["-ilc", "echo -n $PATH"],
		["-lc", "echo -n $PATH"],
		["-c", "echo -n $PATH"],
	];

	for (const args of attempts) {
		try {
			const { stdout } = await execFileAsync(s, args, {
				env: process.env,
				timeout: 2000,
				maxBuffer: 1024 * 1024,
			});
			const out = String(stdout || "").trim();
			if (out && out.includes(":")) return out;
		} catch {
			// ignore and fallback
		}
	}

	return null;
}

async function readVersion(
	cmd: string,
	args: string[],
	envPath: string | undefined,
) {
	try {
		const { stdout } = await execFileAsync(cmd, args, {
			env: {
				...process.env,
				...(envPath ? { PATH: envPath } : null),
			},
			timeout: 2000,
			maxBuffer: 1024 * 1024,
		});
		const line = String(stdout || "")
			.trim()
			.split("\n")[0]
			?.trim();
		return line || null;
	} catch {
		return null;
	}
}

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

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

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

function splitCommandLine(input: string): string[] {
	const line = input.trim();
	if (!line) return [];

	const tokens: string[] = [];
	let current = "";
	let quote: '"' | "'" | null = null;
	let escaped = false;

	for (const ch of line) {
		if (escaped) {
			current += ch;
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (ch === quote) {
				quote = null;
			} else {
				current += ch;
			}
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (/\s/.test(ch)) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += ch;
	}

	if (current) {
		tokens.push(current);
	}
	return tokens;
}

function normalizeRuntimeCommand(
	command: string,
	args: string[] | null | undefined,
): { command: string; args: string[] } {
	const explicitArgs = Array.isArray(args) ? args.filter(Boolean) : [];
	const parsed = splitCommandLine(command);
	if (parsed.length <= 1) {
		return {
			command: (parsed[0] || command || "").trim(),
			args: explicitArgs,
		};
	}
	const [cmd, ...inlineArgs] = parsed;
	return {
		command: cmd,
		args: [...inlineArgs, ...explicitArgs],
	};
}

export function createMcpHandlers(db: DbContext) {
	const runtime = new McpRuntimeService();

	const getServerById = async (id: string): Promise<McpServer | null> => {
		const rows = await db.client.execute({
			sql: `SELECT * FROM mcp_servers WHERE id = ?`,
			args: [id],
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

	const resolveRuntimeServer = async (serverId: string) => {
		const server = await getServerById(serverId);
		if (!server) {
			throw new Error(`MCP server not found: ${serverId}`);
		}
		if (!server.enabled) {
			throw new Error(`MCP server is disabled: ${server.name}`);
		}

		const shell =
			typeof process.env.SHELL === "string" ? process.env.SHELL : null;
		const pathFromShell = await resolveUserPathFromShell(shell);
		const envPath = pathFromShell || process.env.PATH || "";
		const baseEnv: Record<string, string> = {};
		for (const [key, value] of Object.entries(process.env)) {
			if (typeof value === "string") {
				baseEnv[key] = value;
			}
		}
		if (envPath) {
			baseEnv.PATH = envPath;
		}
		const serverEnv: Record<string, string> = {};
		for (const [key, value] of Object.entries(server.env)) {
			if (typeof value === "string") {
				serverEnv[key] = value;
			}
		}
		const mergedEnv: Record<string, string> = {
			...baseEnv,
			...serverEnv,
		};

		const normalized = normalizeRuntimeCommand(server.command, server.args);
		if (!normalized.command) {
			throw new Error(`MCP server command is empty: ${server.name}`);
		}

		const runtimeServer: McpRuntimeServerConfig = {
			id: server.id,
			command: normalized.command,
			args: normalized.args,
			env: mergedEnv,
			// Use the user's home directory as a safe default cwd.
			// In production Electron, process.cwd() defaults to "/" on macOS
			// (root) which is meaningless for most MCP servers and can cause
			// relative-path resolution failures.
			cwd: os.homedir(),
		};
		return runtimeServer;
	};

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
		return getServerById(input.id);
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
		const normalized = normalizeRuntimeCommand(input.command, input.args ?? []);
		if (!normalized.command) {
			throw new Error("MCP server command is required");
		}

		await db.client.execute({
			sql: `INSERT INTO mcp_servers (id, name, command, args, env, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [
				id,
				input.name,
				normalized.command,
				JSON.stringify(normalized.args),
				JSON.stringify(input.env ?? {}),
				(input.enabled ?? true) ? 1 : 0,
				timestamp,
				timestamp,
			],
		});

		return {
			id,
			name: input.name,
			command: normalized.command,
			args: normalized.args,
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
		let argsHandledByCommand = false;

		if (input.name !== undefined) {
			updates.push("name = ?");
			args.push(input.name);
		}
		if (input.command !== undefined) {
			const commandTokens = splitCommandLine(input.command);
			const normalized = normalizeRuntimeCommand(
				input.command,
				input.args ?? undefined,
			);
			if (!normalized.command) {
				throw new Error("MCP server command is required");
			}
			updates.push("command = ?");
			args.push(normalized.command);
			if (input.args !== undefined || commandTokens.length > 1) {
				argsHandledByCommand = true;
				updates.push("args = ?");
				args.push(JSON.stringify(normalized.args));
			}
		}
		if (input.args !== undefined && !argsHandledByCommand) {
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

		runtime.stopServer(input.id);
		const result = await getServerById(input.id);
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
		runtime.stopServer(input.id);
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
		if (!input.enabled) {
			runtime.stopServer(input.id);
		}
		return { success: true };
	};

	// 检查MCP环境配置
	const mcpCheckEnv = async (
		_event: IpcMainInvokeEvent,
		_input: Record<string, never>,
	): Promise<{
		node_version: string | null;
		npx_version: string | null;
		path: string;
		shell: string | null;
		valid: boolean;
	}> => {
		const shell =
			typeof process.env.SHELL === "string" ? process.env.SHELL : null;
		const pathFromShell = await resolveUserPathFromShell(shell);
		const envPath = pathFromShell || process.env.PATH || "";

		const node_version = await readVersion("node", ["-v"], envPath);
		const npx_version = await readVersion("npx", ["-v"], envPath);
		return {
			node_version,
			npx_version,
			path: envPath,
			shell,
			valid: Boolean(node_version && npx_version),
		};
	};

	const mcpListTools: Handler<"mcp_list_tools"> = async (_event, input) => {
		const forceRefresh = input.force_refresh === true;
		try {
			const server = await resolveRuntimeServer(input.server_id);
			return await runtime.listTools(server, forceRefresh);
		} catch (error) {
			if (forceRefresh) {
				throw error;
			}
			return [];
		}
	};

	const mcpCallTool: Handler<"mcp_call_tool"> = async (_event, input) => {
		const server = await resolveRuntimeServer(input.server_id);
		const toolName = String(input.tool_name || "").trim();
		if (!toolName) {
			throw new Error("tool_name is required");
		}
		const args =
			input.arguments && typeof input.arguments === "object"
				? (input.arguments as Record<string, unknown>)
				: {};
		return runtime.callTool(server, toolName, args);
	};

	const mcpStopServer: Handler<"mcp_stop_server"> = async (_event, input) => {
		return { success: runtime.stopServer(input.server_id) };
	};

	return {
		list_mcp_servers: listMcpServers,
		get_mcp_server: getMcpServer,
		create_mcp_server: createMcpServer,
		update_mcp_server: updateMcpServer,
		delete_mcp_server: deleteMcpServer,
		toggle_mcp_server: toggleMcpServer,
		mcp_check_env: mcpCheckEnv,
		mcp_list_tools: mcpListTools,
		mcp_call_tool: mcpCallTool,
		mcp_stop_server: mcpStopServer,
	};
}
