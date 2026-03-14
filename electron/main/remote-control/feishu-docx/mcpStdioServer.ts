import { FeishuDocxToolExecutor } from "./toolExecutor";
import type { FeishuDocxExecutionConfig } from "./types";

const MCP_PROTOCOL_VERSION = "2024-11-05";

function envBool(key: string, fallback: boolean): boolean {
	const raw = String(process.env[key] || "")
		.trim()
		.toLowerCase();
	if (!raw) return fallback;
	return raw === "1" || raw === "true" || raw === "yes";
}

function buildConfigFromEnv(): FeishuDocxExecutionConfig {
	const appId = String(process.env.REMOTE_FEISHU_APP_ID || "").trim();
	const appSecret = String(process.env.REMOTE_FEISHU_APP_SECRET || "").trim();
	const domainRaw = String(process.env.REMOTE_FEISHU_DOMAIN || "feishu").trim();
	if (!appId || !appSecret) {
		throw new Error("REMOTE_FEISHU_APP_ID / REMOTE_FEISHU_APP_SECRET 未配置");
	}
	return {
		appId,
		appSecret,
		domain: domainRaw === "lark" ? "lark" : "feishu",
		enableDocWriteOps: envBool("REMOTE_FEISHU_ENABLE_DOC_WRITE_OPS", true),
		enableDocFileDelete: envBool("REMOTE_FEISHU_ENABLE_DOC_FILE_DELETE", false),
		enableLegacyDocsRead: envBool(
			"REMOTE_FEISHU_ENABLE_LEGACY_DOCS_READ",
			true,
		),
	};
}

function toErrorPayload(error: unknown): {
	code: number;
	message: string;
	data?: unknown;
} {
	if (error && typeof error === "object") {
		const record = error as Record<string, unknown>;
		const message =
			typeof record.message === "string" ? record.message : "unknown error";
		return {
			code: -32000,
			message,
			data: record,
		};
	}
	return {
		code: -32000,
		message: error instanceof Error ? error.message : String(error),
	};
}

function sendJsonRpc(payload: Record<string, unknown>): void {
	const body = JSON.stringify(payload);
	const frame = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
	process.stdout.write(frame, "utf8");
}

export function startFeishuDocxMcpServerFromEnv(): void {
	const config = buildConfigFromEnv();
	const executor = new FeishuDocxToolExecutor(config);

	let buffer = Buffer.alloc(0);
	process.stdin.on("data", async (chunk: Buffer | string) => {
		buffer = Buffer.concat([
			buffer,
			Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8"),
		]);
		while (true) {
			const marker = buffer.indexOf("\r\n\r\n");
			if (marker < 0) break;
			const header = buffer.slice(0, marker).toString("utf8");
			const lengthMatch = header.match(/content-length:\s*(\d+)/i);
			if (!lengthMatch) {
				buffer = buffer.slice(marker + 4);
				continue;
			}
			const bodyLength = Number.parseInt(lengthMatch[1], 10);
			const bodyStart = marker + 4;
			const bodyEnd = bodyStart + bodyLength;
			if (buffer.length < bodyEnd) break;
			const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");
			buffer = buffer.slice(bodyEnd);

			let message: Record<string, unknown>;
			try {
				message = JSON.parse(body) as Record<string, unknown>;
			} catch {
				continue;
			}

			const id = message.id;
			const method = typeof message.method === "string" ? message.method : "";
			const params =
				message.params && typeof message.params === "object"
					? (message.params as Record<string, unknown>)
					: {};

			if (!method) continue;
			if (id === undefined || id === null) {
				if (method === "notifications/initialized") {
					continue;
				}
				continue;
			}

			try {
				if (method === "initialize") {
					sendJsonRpc({
						jsonrpc: "2.0",
						id,
						result: {
							protocolVersion: MCP_PROTOCOL_VERSION,
							capabilities: {
								tools: {},
							},
							serverInfo: {
								name: "ipo-workbench-feishu-docx",
								version: "0.1.0",
							},
						},
					});
					continue;
				}

				if (method === "tools/list") {
					sendJsonRpc({
						jsonrpc: "2.0",
						id,
						result: {
							tools: executor.listTools().map((tool) => ({
								name: tool.name,
								description: tool.description,
								inputSchema: tool.inputSchema,
							})),
						},
					});
					continue;
				}

				if (method === "tools/call") {
					const toolName = typeof params.name === "string" ? params.name : "";
					if (!toolName) {
						throw new Error("tools/call 缺少 name");
					}
					const toolArgs =
						params.arguments && typeof params.arguments === "object"
							? params.arguments
							: {};
					const data = await executor.executeTool(toolName, toolArgs);
					sendJsonRpc({
						jsonrpc: "2.0",
						id,
						result: {
							content: [
								{
									type: "text",
									text: JSON.stringify(data),
								},
							],
							isError: false,
						},
					});
					continue;
				}

				sendJsonRpc({
					jsonrpc: "2.0",
					id,
					error: {
						code: -32601,
						message: `Method not found: ${method}`,
					},
				});
			} catch (error) {
				if (method === "tools/call") {
					sendJsonRpc({
						jsonrpc: "2.0",
						id,
						result: {
							content: [
								{
									type: "text",
									text: JSON.stringify(toErrorPayload(error)),
								},
							],
							isError: true,
						},
					});
					continue;
				}
				sendJsonRpc({
					jsonrpc: "2.0",
					id,
					error: toErrorPayload(error),
				});
			}
		}
	});

	process.stdin.resume();
}
