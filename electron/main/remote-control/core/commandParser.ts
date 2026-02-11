import type { RemoteInboundMessage } from "./types";

export type ParsedRemoteCommand =
	| { kind: "chat"; prompt: string }
	| { kind: "help" }
	| { kind: "status" }
	| { kind: "sessions" }
	| { kind: "model" }
	| { kind: "stop"; runId?: string }
	| { kind: "approve"; requestId?: string; message?: string }
	| { kind: "reject"; requestId?: string; message?: string }
	| { kind: "doc_call"; toolName?: string; jsonArgsText?: string };

function normalizeInput(input: string): string {
	return String(input || "").trim();
}

function looksLikeRequestId(value: string | undefined): boolean {
	if (!value) return false;
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		value,
	);
}

function parseDocCallCommand(text: string): ParsedRemoteCommand | null {
	const matched = text.match(/^\/doc\.call(?:\s+([\s\S]+))?$/i);
	if (!matched) return null;
	const rest = (matched[1] || "").trim();
	if (!rest) {
		return { kind: "doc_call" };
	}
	const split = rest.match(/^(\S+)(?:\s+([\s\S]+))?$/);
	if (!split) {
		return { kind: "doc_call" };
	}
	return {
		kind: "doc_call",
		toolName: split[1],
		jsonArgsText: split[2]?.trim(),
	};
}

function parseSlashCommand(text: string): ParsedRemoteCommand | null {
	const normalized = normalizeInput(text);
	if (!normalized.startsWith("/")) return null;
	const docCall = parseDocCallCommand(normalized);
	if (docCall) return docCall;
	const tokens = normalized.split(/\s+/).filter(Boolean);
	const command = tokens[0]?.toLowerCase();
	if (!command) return null;

	switch (command) {
		case "/help":
			return { kind: "help" };
		case "/status":
			return { kind: "status" };
		case "/sessions":
			return { kind: "sessions" };
		case "/model":
			return { kind: "model" };
		case "/stop":
			return { kind: "stop", runId: tokens[1] };
		case "/approve": {
			const token1 = tokens[1];
			const requestId = looksLikeRequestId(token1) ? token1 : undefined;
			const message = requestId
				? tokens.slice(2).join(" ")
				: tokens.slice(1).join(" ");
			return {
				kind: "approve",
				requestId: requestId || undefined,
				message: message || undefined,
			};
		}
		case "/reject": {
			const token1 = tokens[1];
			const requestId = looksLikeRequestId(token1) ? token1 : undefined;
			const message = requestId
				? tokens.slice(2).join(" ")
				: tokens.slice(1).join(" ");
			return {
				kind: "reject",
				requestId: requestId || undefined,
				message: message || undefined,
			};
		}
		default:
			return null;
	}
}

export function parseRemoteInboundCommand(
	message: RemoteInboundMessage,
): ParsedRemoteCommand {
	const text = normalizeInput(message.text);
	const slash = parseSlashCommand(text);
	if (slash) return slash;
	return {
		kind: "chat",
		prompt: text,
	};
}

export function getRemoteHelpText(): string {
	return [
		"远程控制命令：",
		"/help 查看帮助",
		"/status 查看运行状态",
		"/sessions 查看会话",
		"/model 查看当前模型",
		"/stop [runId] 停止运行",
		"/approve [requestId] [message] 批准交互请求（省略 requestId 时默认最近一条）",
		"/reject [requestId] [message] 拒绝交互请求（省略 requestId 时默认最近一条）",
		"/doc.call <tool_name> <json_args> 直接调用 Feishu 文档工具（仅 Feishu 通道）",
		'示例：/doc.call docx_create_document {"title":"远控创建文档"}',
		"直接发送文本会触发 Agent 运行",
	].join("\n");
}
