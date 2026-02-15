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

function tokenizeIntent(text: string): string[] {
	const lower = String(text || "").toLowerCase();
	const raw = lower.match(/[a-z0-9_]+|[\u4e00-\u9fa5]+/g) || [];
	const out: string[] = [];
	for (const token of raw) {
		const t = token.trim();
		if (!t || t.length < 2) continue;
		if (!out.includes(t)) out.push(t);
	}
	return out;
}

function intentScore(taskPrompt: string, haystack: string): number {
	const tokens = tokenizeIntent(taskPrompt);
	if (tokens.length === 0) return 0;
	let score = 0;
	for (const token of tokens) {
		if (haystack.includes(token)) score += 2;
	}
	if (
		/(search|搜索|检索|crawl|fetch|网页|web)/i.test(taskPrompt) &&
		/(search|crawl|fetch|web|browser)/i.test(haystack)
	) {
		score += 3;
	}
	if (
		/(sql|query|database|db|数据|表|查询)/i.test(taskPrompt) &&
		/(sql|database|db|postgres|mysql|sqlite)/i.test(haystack)
	) {
		score += 3;
	}
	if (
		/(figma|设计|ui|ux|组件|前端)/i.test(taskPrompt) &&
		/(figma|design|ui|ux|component|frontend)/i.test(haystack)
	) {
		score += 2;
	}
	return score;
}

export async function getMcpConfigForSdk(options?: {
	taskPrompt?: string;
	maxServers?: number;
}): Promise<SdkMcpServers> {
	const maxServers = Number.isFinite(options?.maxServers)
		? Math.max(0, Math.floor(options?.maxServers || 0))
		: undefined;
	if (maxServers === 0) return {};
	const servers = await listMcpServers().catch(() => []);
	const sorted = [...servers]
		.filter((s) => s.enabled !== false)
		.map((s, index) => {
			const haystack = [
				String(s.name || ""),
				String(s.command || ""),
				Array.isArray(s.args) ? s.args.join(" ") : "",
			]
				.join(" ")
				.toLowerCase();
			return {
				server: s,
				index,
				score: options?.taskPrompt
					? intentScore(options.taskPrompt, haystack)
					: 0,
			};
		})
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return a.index - b.index;
		});
	const selected =
		typeof maxServers === "number" ? sorted.slice(0, maxServers) : sorted;
	const out: SdkMcpServers = {};
	const usedKeys = new Set<string>();

	for (const item of selected) {
		const s = item.server;
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
