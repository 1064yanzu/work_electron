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

/**
 * 侧栏窄，时间戳用短格式（省掉"前"字），完整时间挂在 title 上。
 */
export function formatRelativeTime(timestamp: number): string {
	const diffMs = Date.now() - timestamp;
	const diffMins = Math.floor(diffMs / 60000);
	if (diffMins < 1) return "刚刚";
	if (diffMins < 60) return `${diffMins} 分`;
	const diffHours = Math.floor(diffMins / 60);
	if (diffHours < 24) return `${diffHours} 小时`;
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays < 7) return `${diffDays} 天`;
	const diffWeeks = Math.floor(diffDays / 7);
	if (diffWeeks <= 4) return `${diffWeeks} 周`;
	const diffMonths = Math.floor(diffDays / 30);
	if (diffMonths < 12) return `${diffMonths} 个月`;
	return `${Math.floor(diffMonths / 12)} 年`;
}

/** 条目 hover 时的完整时间（YYYY-MM-DD HH:mm） */
export function formatAbsoluteTime(timestamp: number): string {
	const date = new Date(timestamp);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
		date.getDate(),
	)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

/**
 * 列表里真正显示的标题。
 *
 * 1. 远程会话的原始标题是 `远程 · 飞书 · ou_d59fd9711c2de90c65d63…`——
 *    "远程"和分组名重复，末尾的长 ID 更是纯噪音。有对端昵称就用昵称，
 *    没有就把 ID 压成 8 位。
 * 2. 自动生成的占位标题（"XX - 新对话" / "未命名对话" / "Untitled Chat"）
 *    会让同一目录下的条目长得一模一样，此时改用首条用户消息——和 Codex 侧栏一样，
 *    让"你当时问了什么"直接成为条目标题。
 */
const PLACEHOLDER_TITLE_RE =
	/^(新对话|未命名对话|新会话|untitled chat|untitled|new chat)$|[-—·]\s*(新对话|未命名对话|新会话)\s*$/i;
const REMOTE_TITLE_PREFIX_RE = /^远程\s*·\s*/;
const OPAQUE_ID_RE = /^[A-Za-z0-9_-]{12,}$/;

/** `远程 · 飞书 · ou_d59fd97…` → `飞书 · ou_d59fd9…` */
function compactRemoteTitle(title: string): string {
	const rest = title.replace(REMOTE_TITLE_PREFIX_RE, "");
	const parts = rest.split(/\s*·\s*/).filter(Boolean);
	const last = parts.at(-1);
	if (last && OPAQUE_ID_RE.test(last)) {
		parts[parts.length - 1] = `${last.slice(0, 8)}…`;
	}
	return parts.join(" · ") || title;
}

export function getSessionDisplayTitle(session: ChatSession): string {
	const title = session.title?.trim() ?? "";

	// 远程会话：昵称优先，其次压缩 ID
	if (
		session.threadSource?.type === "remote" ||
		REMOTE_TITLE_PREFIX_RE.test(title)
	) {
		const peer = session.threadSource?.peerName?.trim();
		const channel = title
			.replace(REMOTE_TITLE_PREFIX_RE, "")
			.split(/\s*·\s*/)[0]
			?.trim();
		if (peer)
			return channel && channel !== peer ? `${channel} · ${peer}` : peer;
		if (title) return compactRemoteTitle(title);
	}

	if (title && !PLACEHOLDER_TITLE_RE.test(title)) return title;
	const preview = getSessionPreview(session);
	if (preview) return preview;
	// 占位标题里的前缀通常就是所在目录名（`视频制作 - 新对话`），而组名已经写着它了，
	// 这里只留下末段，避免整列重复同一个词
	const tail = title
		.split(/\s*[-—·]\s*/)
		.at(-1)
		?.trim();
	return tail || title || "新对话";
}

/** 还没说过一句话的空白对话——列表里用淡色标示，避免和真实内容抢注意力 */
export function isEmptyDraftSession(session: ChatSession): boolean {
	if (getSessionPreview(session)) return false;
	const title = session.title?.trim() ?? "";
	return !title || PLACEHOLDER_TITLE_RE.test(title);
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
