import type { RemoteInboundMessage } from "./types";

export type ParsedRemoteCommand =
	| { kind: "chat"; prompt: string }
	| { kind: "help" }
	| { kind: "status" }
	| { kind: "sessions" }
	| { kind: "model" }
	| { kind: "stop"; runId?: string }
	| { kind: "approve"; requestId: string; message?: string }
	| { kind: "reject"; requestId: string; message?: string };

function normalizeInput(input: string): string {
	return String(input || "").trim();
}

function parseSlashCommand(text: string): ParsedRemoteCommand | null {
	const normalized = normalizeInput(text);
	if (!normalized.startsWith("/")) return null;
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
			const requestId = tokens[1] ?? "";
			if (!requestId) return { kind: "help" };
			const message = tokens.slice(2).join(" ");
			return { kind: "approve", requestId, message: message || undefined };
		}
		case "/reject": {
			const requestId = tokens[1] ?? "";
			if (!requestId) return { kind: "help" };
			const message = tokens.slice(2).join(" ");
			return { kind: "reject", requestId, message: message || undefined };
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
		"/approve <requestId> [message] 批准交互请求",
		"/reject <requestId> [message] 拒绝交互请求",
		"直接发送文本会触发 Agent 运行",
	].join("\n");
}
