import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const TOOL_CALL_TIMEOUT_MS = 60_000;
const TOOL_CACHE_TTL_MS = 30_000;

export type McpRuntimeServerConfig = {
	id: string;
	command: string;
	args: string[];
	env: Record<string, string>;
};

export type McpRuntimeTool = {
	name: string;
	description?: string | null;
	inputSchema?: unknown;
};

export type McpRuntimeToolResult = {
	content: Array<{
		type: string;
		text?: string | null;
		data?: string | null;
		mimeType?: string | null;
	}>;
	isError?: boolean | null;
};

type JsonRpcError = {
	code?: number;
	message?: string;
	data?: unknown;
};

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
};

function makeConfigSignature(config: McpRuntimeServerConfig): string {
	return JSON.stringify({
		command: config.command,
		args: config.args,
		env: config.env,
	});
}

function normalizeToolList(raw: unknown): McpRuntimeTool[] {
	if (!Array.isArray(raw)) return [];
	const out: McpRuntimeTool[] = [];
	for (const item of raw) {
		if (!item || typeof item !== "object") continue;
		const record = item as Record<string, unknown>;
		const name = typeof record.name === "string" ? record.name.trim() : "";
		if (!name) continue;
		const description =
			typeof record.description === "string" ? record.description : null;
		const inputSchema =
			record.inputSchema ??
			(record.input_schema && typeof record.input_schema === "object"
				? record.input_schema
				: undefined);
		out.push({ name, description, inputSchema });
	}
	return out;
}

function normalizeToolResult(raw: unknown): McpRuntimeToolResult {
	const record =
		raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
	const source = Array.isArray(record.content) ? record.content : [];
	const content = source
		.map((item) => {
			if (!item || typeof item !== "object") return null;
			const c = item as Record<string, unknown>;
			const type = typeof c.type === "string" ? c.type : "";
			if (!type) return null;
			return {
				type,
				text: typeof c.text === "string" ? c.text : null,
				data: typeof c.data === "string" ? c.data : null,
				mimeType:
					typeof c.mimeType === "string"
						? c.mimeType
						: typeof c.mime_type === "string"
							? c.mime_type
							: null,
			};
		})
		.filter((item): item is NonNullable<typeof item> => Boolean(item));

	const isError =
		typeof record.isError === "boolean"
			? record.isError
			: typeof record.is_error === "boolean"
				? record.is_error
				: null;
	return { content, isError };
}

class McpStdioSession {
	private readonly child: ChildProcessWithoutNullStreams;
	private readonly signature: string;
	private readonly pending = new Map<number, PendingRequest>();
	private readonly onClosed: (serverId: string) => void;
	private stdoutBuffer = Buffer.alloc(0);
	private seq = 0;
	private closed = false;
	private initialized = false;
	private cachedToolsAt = 0;
	private cachedTools: McpRuntimeTool[] = [];

	public constructor(
		private readonly config: McpRuntimeServerConfig,
		onClosed: (serverId: string) => void,
	) {
		this.signature = makeConfigSignature(config);
		this.onClosed = onClosed;
		this.child = spawn(config.command, config.args, {
			stdio: "pipe",
			env: config.env as NodeJS.ProcessEnv,
		});

		this.child.stdout.on("data", (chunk) => this.handleStdoutChunk(chunk));
		this.child.stderr.on("data", () => {
			// Ignore server stderr logs here; request-level errors are handled via JSON-RPC.
		});
		this.child.on("error", (error) => {
			this.rejectAllPending(
				new Error(
					`MCP server process error (${this.config.id}): ${error.message}`,
				),
			);
		});
		this.child.on("close", (code, signal) => {
			if (this.closed) return;
			this.closed = true;
			const message =
				code !== null
					? `MCP server exited with code ${code}`
					: `MCP server closed by signal ${String(signal)}`;
			this.rejectAllPending(new Error(`${message} (${this.config.id})`));
			this.onClosed(this.config.id);
		});
	}

	public isSameConfig(config: McpRuntimeServerConfig): boolean {
		return this.signature === makeConfigSignature(config);
	}

	public stop() {
		if (this.closed) return;
		this.closed = true;
		this.rejectAllPending(new Error(`MCP server stopped (${this.config.id})`));
		if (!this.child.killed) this.child.kill();
		this.onClosed(this.config.id);
	}

	public async listTools(forceRefresh = false): Promise<McpRuntimeTool[]> {
		if (
			!forceRefresh &&
			this.cachedTools.length > 0 &&
			Date.now() - this.cachedToolsAt < TOOL_CACHE_TTL_MS
		) {
			return this.cachedTools;
		}
		await this.ensureInitialized();
		const response = await this.request<{ tools?: unknown[] }>(
			"tools/list",
			{},
		);
		const tools = normalizeToolList(response?.tools);
		this.cachedTools = tools;
		this.cachedToolsAt = Date.now();
		return tools;
	}

	public async callTool(
		toolName: string,
		argumentsJson: Record<string, unknown>,
	): Promise<McpRuntimeToolResult> {
		await this.ensureInitialized();
		const response = await this.request<unknown>(
			"tools/call",
			{
				name: toolName,
				arguments: argumentsJson,
			},
			TOOL_CALL_TIMEOUT_MS,
		);
		return normalizeToolResult(response);
	}

	private async ensureInitialized() {
		if (this.initialized) return;
		await this.request("initialize", {
			protocolVersion: MCP_PROTOCOL_VERSION,
			capabilities: {},
			clientInfo: {
				name: "ipo-workbench",
				version: "0.1.0",
			},
		});
		this.sendNotification("notifications/initialized", {});
		this.initialized = true;
	}

	private sendNotification(method: string, params: Record<string, unknown>) {
		this.send({
			jsonrpc: "2.0",
			method,
			params,
		});
	}

	private request<TResult>(
		method: string,
		params: Record<string, unknown>,
		timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
	): Promise<TResult> {
		if (this.closed) {
			return Promise.reject(
				new Error(`MCP server session is closed (${this.config.id})`),
			);
		}
		const id = ++this.seq;
		return new Promise<TResult>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`MCP request timeout: ${method}`));
			}, timeoutMs);

			this.pending.set(id, {
				resolve: (value) => resolve(value as TResult),
				reject,
				timer,
			});
			try {
				this.send({
					jsonrpc: "2.0",
					id,
					method,
					params,
				});
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	private send(payload: Record<string, unknown>) {
		const body = JSON.stringify(payload);
		const frame = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
		if (!this.child.stdin.writable) {
			throw new Error(`MCP server stdin is not writable (${this.config.id})`);
		}
		this.child.stdin.write(frame, "utf8");
	}

	private handleStdoutChunk(chunk: Buffer | string) {
		const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
		this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, part]);
		while (true) {
			const frame = this.tryReadFrame();
			if (!frame) break;
			this.handleRpcMessage(frame);
		}
	}

	private tryReadFrame(): string | null {
		const markerCrlf = "\r\n\r\n";
		const markerLf = "\n\n";
		let headerEnd = this.stdoutBuffer.indexOf(markerCrlf);
		let markerLength = markerCrlf.length;
		if (headerEnd === -1) {
			headerEnd = this.stdoutBuffer.indexOf(markerLf);
			markerLength = markerLf.length;
		}
		if (headerEnd === -1) return null;

		const header = this.stdoutBuffer.slice(0, headerEnd).toString("utf8");
		const match = header.match(/content-length:\s*(\d+)/i);
		if (!match) {
			this.stdoutBuffer = this.stdoutBuffer.slice(headerEnd + markerLength);
			return null;
		}
		const bodyLength = Number.parseInt(match[1], 10);
		const bodyStart = headerEnd + markerLength;
		const bodyEnd = bodyStart + bodyLength;
		if (this.stdoutBuffer.length < bodyEnd) return null;
		const body = this.stdoutBuffer.slice(bodyStart, bodyEnd).toString("utf8");
		this.stdoutBuffer = this.stdoutBuffer.slice(bodyEnd);
		return body;
	}

	private handleRpcMessage(raw: string) {
		let message: Record<string, unknown>;
		try {
			message = JSON.parse(raw) as Record<string, unknown>;
		} catch {
			return;
		}
		const idRaw = message.id;
		if (typeof idRaw !== "number") return;
		const pending = this.pending.get(idRaw);
		if (!pending) return;
		this.pending.delete(idRaw);
		clearTimeout(pending.timer);

		const error = message.error as JsonRpcError | undefined;
		if (error && (error.message || error.code)) {
			pending.reject(
				new Error(
					`MCP RPC error (${error.code ?? "unknown"}): ${error.message ?? "unknown error"}`,
				),
			);
			return;
		}
		pending.resolve(message.result);
	}

	private rejectAllPending(error: Error) {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
	}
}

export class McpRuntimeService {
	private readonly sessions = new Map<string, McpStdioSession>();

	public async listTools(
		config: McpRuntimeServerConfig,
		forceRefresh = false,
	): Promise<McpRuntimeTool[]> {
		const session = this.getOrCreateSession(config);
		try {
			return await session.listTools(forceRefresh);
		} catch (error) {
			this.stopServer(config.id);
			throw error;
		}
	}

	public async callTool(
		config: McpRuntimeServerConfig,
		toolName: string,
		argumentsJson: Record<string, unknown>,
	): Promise<McpRuntimeToolResult> {
		const session = this.getOrCreateSession(config);
		try {
			return await session.callTool(toolName, argumentsJson);
		} catch (error) {
			this.stopServer(config.id);
			throw error;
		}
	}

	public stopServer(serverId: string): boolean {
		const session = this.sessions.get(serverId);
		if (!session) return false;
		session.stop();
		this.sessions.delete(serverId);
		return true;
	}

	private getOrCreateSession(config: McpRuntimeServerConfig): McpStdioSession {
		const existing = this.sessions.get(config.id);
		if (existing && existing.isSameConfig(config)) return existing;
		if (existing) {
			existing.stop();
			this.sessions.delete(config.id);
		}
		const session = new McpStdioSession(config, (serverId) => {
			const current = this.sessions.get(serverId);
			if (current === session) this.sessions.delete(serverId);
		});
		this.sessions.set(config.id, session);
		return session;
	}
}
