/**
 * MCP Server Configuration (for Claude Agent SDK)
 *
 * MCP servers are managed in the app settings (DB via IPC). This helper
 * converts enabled servers into the Claude Agent SDK `mcpServers` shape.
 */

import { listMcpServers } from "../config";

export type SdkMcpServers = Record<
	string,
	{ command: string; args?: string[]; env?: Record<string, string> }
>;

export async function getMcpConfigForSdk(): Promise<SdkMcpServers> {
	const servers = await listMcpServers().catch(() => []);
	const out: SdkMcpServers = {};
	const usedKeys = new Set<string>();

	for (const s of servers) {
		if (s.enabled === false) continue;
		const baseKey = String(s.name || "").trim() || `mcp-${s.id}`;
		let key = baseKey;
		let i = 1;
		while (usedKeys.has(key)) {
			i += 1;
			key = `${baseKey}-${i}`;
		}
		usedKeys.add(key);

		out[key] = {
			command: String(s.command || "").trim(),
			args: Array.isArray(s.args) ? s.args : undefined,
			env: s.env && typeof s.env === "object" ? s.env : undefined,
		};
	}

	return out;
}
