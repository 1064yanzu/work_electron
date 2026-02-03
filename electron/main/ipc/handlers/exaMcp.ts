import type { IpcMainInvokeEvent } from "electron";
import { net } from "electron";

import type { IPCSchema } from "../../../shared/ipc-schema";

type Handler<K extends keyof IPCSchema> = (
	_event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

type ExaMcpResult = {
	title?: string;
	url?: string;
	text?: string;
	publishedDate?: string;
};

const EXA_MCP_API_HOST = "https://mcp.exa.ai/mcp";

function parseExaMcpText(raw: string): ExaMcpResult[] {
	const items: ExaMcpResult[] = [];
	for (const chunk of raw.split("\n\n")) {
		const lines = chunk.split("\n");
		let title = "";
		let url = "";
		let text = "";
		let textStartIndex = -1;
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i];
			if (line.startsWith("Title:")) {
				title = line.replace(/^Title:\s*/, "");
				continue;
			}
			if (line.startsWith("URL:")) {
				url = line.replace(/^URL:\s*/, "");
				continue;
			}
			if (line.startsWith("Text:") && textStartIndex === -1) {
				textStartIndex = i;
				text = line.replace(/^Text:\s*/, "");
			}
		}
		if (textStartIndex !== -1) {
			const rest = lines.slice(textStartIndex + 1).join("\n");
			if (rest.trim().length > 0) {
				text = text ? `${text}\n${rest}` : rest;
			}
		}
		if (title || url || text) {
			items.push({ title, url, text });
		}
	}
	return items;
}

function parseExaMcpResponse(
	text: string,
): IPCSchema["exa_mcp_search"]["output"] {
	const lines = text.split("\n");
	for (const line of lines) {
		if (!line.startsWith("data: ")) continue;
		try {
			const data = JSON.parse(line.slice(6)) as {
				result?: { content?: Array<{ type: string; text?: string }> };
			};
			const contentText = data.result?.content?.[0]?.text;
			if (contentText) {
				return parseExaMcpText(contentText).map((item) => ({
					title: item.title?.trim() || item.url?.trim() || "Untitled",
					url: item.url?.trim() || "",
					snippet: item.text?.trim() || "",
					screenshot: undefined,
				}));
			}
		} catch {
			continue;
		}
	}
	try {
		const data = JSON.parse(text) as {
			result?: { content?: Array<{ type: string; text?: string }> };
		};
		const contentText = data.result?.content?.[0]?.text;
		if (contentText) {
			return parseExaMcpText(contentText).map((item) => ({
				title: item.title?.trim() || item.url?.trim() || "Untitled",
				url: item.url?.trim() || "",
				snippet: item.text?.trim() || "",
				screenshot: undefined,
			}));
		}
	} catch {
		return [];
	}
	return [];
}

export function createExaMcpHandlers() {
	const exa_mcp_search: Handler<"exa_mcp_search"> = async (_event, input) => {
		const query = String(input.query || "").trim();
		if (!query) return [];

		const limit =
			typeof input.limit === "number" && input.limit > 0
				? Math.min(50, Math.floor(input.limit))
				: 10;

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 25_000);
		try {
			const response = await net.fetch(EXA_MCP_API_HOST, {
				method: "POST",
				headers: {
					accept: "application/json, text/event-stream",
					"content-type": "application/json",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "tools/call",
					params: {
						name: "web_search_exa",
						arguments: {
							query,
							type: "auto",
							numResults: limit,
							livecrawl: "fallback",
						},
					},
				}),
				signal: controller.signal,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(
					`Exa MCP ${response.status}: ${errorText.slice(0, 200)}`,
				);
			}

			const text = await response.text();
			const normalized = parseExaMcpResponse(text);
			return normalized
				.filter((r) => r.url && r.url.startsWith("http"))
				.slice(0, limit);
		} finally {
			clearTimeout(timer);
		}
	};

	return { exa_mcp_search };
}
