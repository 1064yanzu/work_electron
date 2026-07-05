import type { ChatSession } from "../../../lib/chat/types";
import type { AgentSession as RuntimeAgentSession } from "../../../lib/agent/sessionManager";

export interface BackendThreadMetadata {
	cwd?: string;
	source?: "local" | "remote";
	remoteSessionId?: string;
	channelId?: string;
	peerName?: string;
	peerId?: string;
}

export interface ThreadResolution {
	cwd?: string;
	source: "local" | "remote";
}

export interface ThreadFolderGroup {
	key: string;
	folderName: string;
	folderPath: string;
	source: "local" | "remote" | "general" | "archive";
	isPinned?: boolean;
	sessions: (ChatSession & { resolvedCwd?: string })[];
}

export function extractFolderName(cwdPath: string): string {
	const normalized = cwdPath.replace(/\\/g, "/");
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] || cwdPath;
}

export function formatRelativeTime(timestamp: number): string {
	const diffMs = Date.now() - timestamp;
	const diffMins = Math.floor(diffMs / 60000);
	if (diffMins < 1) return "刚刚";
	if (diffMins < 60) return `${diffMins} 分钟前`;
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24) return `${diffHours} 小时前`;
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays === 1) return "1 天前";
	if (diffDays < 7) return `${diffDays} 天前`;
	const diffWeeks = Math.floor(diffDays / 7);
	if (diffWeeks <= 4) return `${diffWeeks} 周`;
	const diffMonths = Math.floor(diffDays / 30);
	return `${diffMonths} 个月前`;
}

export function getSessionPreview(session: ChatSession): string {
	const msgs = session.messages;
	for (let i = msgs.length - 1; i >= 0; i--) {
		if (msgs[i].role === "user") {
			const text = msgs[i].content.trim();
			return text.length > 48 ? `${text.slice(0, 48)}…` : text;
		}
	}
	// sqlite 后端：未加载全文的会话用 DB 派生的末条 user 消息预览
	const preview = (session.lastUserPreview ?? "").trim();
	if (preview) {
		return preview.length > 48 ? `${preview.slice(0, 48)}…` : preview;
	}
	return "";
}

function isLegacyRemoteSession(session: ChatSession): boolean {
	if (session.title.trim().startsWith("远程 ·")) return true;
	return session.messages.some((message) => {
		const taskId = message.metadata?.taskId;
		return typeof taskId === "string" && taskId.startsWith("remote-");
	});
}

export function resolveThreadMetadata(
	session: ChatSession,
	input: {
		runtimeSessions: RuntimeAgentSession[];
		backendMetadataBySessionId: Map<string, BackendThreadMetadata>;
	},
): ThreadResolution {
	const backendMetadata = session.agentSessionId
		? input.backendMetadataBySessionId.get(session.agentSessionId)
		: undefined;
	if (
		session.threadSource?.type === "remote" ||
		backendMetadata?.source === "remote" ||
		isLegacyRemoteSession(session)
	) {
		return { source: "remote" };
	}

	if (session.cwd) return { source: "local", cwd: session.cwd };
	if (backendMetadata?.cwd) {
		return { source: "local", cwd: backendMetadata.cwd };
	}

	if (session.agentSessionId) {
		const runtimeSession = input.runtimeSessions.find(
			(item) => item.id === session.agentSessionId,
		);
		if (runtimeSession?.cwd)
			return { source: "local", cwd: runtimeSession.cwd };
	}

	return { source: "local" };
}

export function groupThreadsByFolder(
	sessions: ChatSession[],
	input: {
		runtimeSessions: RuntimeAgentSession[];
		backendMetadataBySessionId: Map<string, BackendThreadMetadata>;
		pinnedProjectKeys?: Set<string>;
	},
): ThreadFolderGroup[] {
	const map = new Map<string, ThreadFolderGroup>();

	for (const session of sessions) {
		const resolution = resolveThreadMetadata(session, input);
		const key = session.isArchived
			? "__archive__"
			: resolution.source === "remote"
				? "__remote__"
				: resolution.cwd || "__general__";
		const folderName = session.isArchived
			? "归档对话"
			: resolution.source === "remote"
				? "远程对话"
				: resolution.cwd
					? extractFolderName(resolution.cwd)
					: "通用对话";

		if (!map.has(key)) {
			map.set(key, {
				key,
				folderName,
				folderPath: resolution.cwd || "",
				source: session.isArchived
					? "archive"
					: resolution.source === "remote"
						? "remote"
						: resolution.cwd
							? "local"
							: "general",
				isPinned: input.pinnedProjectKeys?.has(key),
				sessions: [],
			});
		}
		map.get(key)!.sessions.push({ ...session, resolvedCwd: resolution.cwd });
	}

	for (const group of map.values()) {
		group.sessions.sort((a, b) => {
			if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
			return b.updatedAt - a.updatedAt;
		});
	}

	return Array.from(map.values()).sort((a, b) => {
		if (a.source === "archive" && b.source !== "archive") return 1;
		if (b.source === "archive" && a.source !== "archive") return -1;
		if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
		if (a.key === "__remote__" && b.key !== "__remote__") return -1;
		if (b.key === "__remote__" && a.key !== "__remote__") return 1;
		if (a.key === "__general__" && b.key !== "__general__") return 1;
		if (b.key === "__general__" && a.key !== "__general__") return -1;
		const aLatest = a.sessions[0]?.updatedAt ?? 0;
		const bLatest = b.sessions[0]?.updatedAt ?? 0;
		return bLatest - aLatest;
	});
}
