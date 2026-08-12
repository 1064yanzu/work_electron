/**
 * ThreadsView 渲染治理（F5）：
 *
 * - useThreadSessionsSnapshot：签名缓存的窄订阅。只把线程列表真正消费的
 *   元数据字段（id/title/updatedAt 分钟桶/isPinned/isArchived/cwd/agentSessionId/
 *   threadSource/messageCount/预览/流式标记）拼进签名；签名不变 ⇒ 返回旧引用，
 *   Agent 流式期间（仅活跃会话消息内容变化、元数据不变）列表零重渲染。
 * - useThreadFullTextSearch：sqlite 后端全文搜索（chat_history_search IPC，防抖 250ms）。
 * - filterAndSortVisibleSessions：可见会话过滤 + 排序（与旧逻辑一致，叠加 FTS 命中集）。
 * - buildThreadRows：分组结构拍平成一维行数组（标题行/会话行/展开更多行混排），
 *   供 @tanstack/react-virtual 虚拟化渲染。
 */
import { useEffect, useRef, useState } from "react";
import { searchChatHistory } from "../../../lib/chat/historyBackend";
import { chatStore, useChatStoreSelector } from "../../../lib/chat/store";
import type { ChatSession } from "../../../lib/chat/types";
import { getSessionMessageCount } from "../../../lib/chat/types";
import {
	DEFAULT_VISIBLE_THREAD_COUNT,
	getVisibleSessionsForGroup,
} from "./threadGroupVisibility";
import { getSessionPreview, type ThreadFolderGroup } from "./threadGrouping";

/** 检测 session 是否正在流式输出（agent 正在工作） */
export function isSessionStreaming(session: ChatSession): boolean {
	const lastMsg = session.messages.at(-1);
	return lastMsg?.role === "assistant" && lastMsg.isStreaming === true;
}

// ==================
// 订阅收窄：签名缓存
// ==================

const SIG_FIELD = "\u0001";
const SIG_ROW = "\u0002";

/**
 * 单会话签名：只包含线程列表渲染 / 分组 / 排序真正读取的字段。
 * updatedAt 量化到分钟桶——流式期间 updateMessage 每个 chunk 都会刷新
 * updatedAt，但列表展示的相对时间是分钟粒度，量化后 chunk 更新不再打穿签名。
 */
function computeSessionSig(session: ChatSession): string {
	return [
		session.id,
		session.title,
		Math.floor(session.updatedAt / 60000),
		session.isPinned ? 1 : 0,
		session.isArchived ? 1 : 0,
		session.cwd ?? "",
		session.agentSessionId ?? "",
		session.threadSource?.type ?? "",
		getSessionMessageCount(session),
		getSessionPreview(session),
		isSessionStreaming(session) ? 1 : 0,
	].join(SIG_FIELD);
}

/**
 * 会话对象 → 签名的 WeakMap 缓存。
 * chatStore 的更新是不可变式的（未变更的会话保持同一对象引用），
 * 因此流式期间每次 emit 只有活跃会话对象是新的，其余全部命中缓存。
 */
const sessionSigCache = new WeakMap<ChatSession, string>();

function getSessionSig(session: ChatSession): string {
	const cached = sessionSigCache.get(session);
	if (cached !== undefined) return cached;
	const sig = computeSessionSig(session);
	sessionSigCache.set(session, sig);
	return sig;
}

function computeThreadListSig(sessions: ChatSession[]): string {
	const parts = new Array<string>(sessions.length);
	for (let i = 0; i < sessions.length; i++) {
		parts[i] = getSessionSig(sessions[i]);
	}
	return parts.join(SIG_ROW);
}

/**
 * 窄订阅所有会话的列表元数据。签名不变时返回上一次的数组引用
 * （useSyncExternalStore 以 Object.is 比较 snapshot ⇒ 组件不重渲染）。
 */
export function useThreadSessionsSnapshot(): ChatSession[] {
	const cacheRef = useRef<{ sig: string; value: ChatSession[] } | null>(null);
	return useChatStoreSelector((state) => {
		const sig = computeThreadListSig(state.sessions);
		const cached = cacheRef.current;
		if (cached && cached.sig === sig) return cached.value;
		cacheRef.current = { sig, value: state.sessions };
		return state.sessions;
	});
}

// ==================
// 全文搜索（sqlite 后端）
// ==================

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_RESULT_LIMIT = 200;

/**
 * sqlite 后端全文搜索：防抖 250ms 调 chat_history_search，返回命中会话 id 集合。
 * 返回 null = FTS 不参与（空查询 / localstorage 后端 / IPC 失败），
 * 调用方保持现状的内存兜底逻辑（已加载消息 + lastPreview / lastUserPreview）。
 */
export function useThreadFullTextSearch(query: string): Set<string> | null {
	const [matched, setMatched] = useState<Set<string> | null>(null);

	useEffect(() => {
		const q = query.trim();
		if (!q || chatStore.getHistoryBackend() !== "sqlite") {
			setMatched(null);
			return;
		}
		let cancelled = false;
		const timer = window.setTimeout(() => {
			searchChatHistory(q, SEARCH_RESULT_LIMIT)
				.then((results) => {
					if (cancelled) return;
					setMatched(new Set(results.map((item) => item.session_id)));
				})
				.catch((error) => {
					console.warn(
						"[ThreadsView] chat_history_search 失败，回落内存搜索:",
						error,
					);
					if (!cancelled) setMatched(null);
				});
		}, SEARCH_DEBOUNCE_MS);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [query]);

	// 查询清空后立即失效旧结果，避免陈旧命中集应用到空查询
	if (!query.trim()) return null;
	return matched;
}

// ==================
// 可见会话过滤 + 排序
// ==================

/**
 * 是否该出现在对话列表里。
 * 隐藏完全没有归属的临时空白会话；已有 cwd/来源/agent 绑定的空对话要立即显示。
 * sqlite 后端：未加载全文的会话按 DB 派生消息数判断。
 */
export function isListableSession(session: ChatSession): boolean {
	if (getSessionMessageCount(session) > 0) return true;
	return Boolean(
		session.cwd || session.agentSessionId || session.threadSource?.type,
	);
}

export function filterAndSortVisibleSessions(
	sessions: ChatSession[],
	query: string,
	ftsMatchedIds: Set<string> | null,
): ChatSession[] {
	let filtered = sessions.filter(isListableSession);

	const q = query.trim().toLowerCase();
	if (q) {
		filtered = filtered.filter(
			(s) =>
				// 标题匹配：常驻内存的元数据，始终同步可查
				s.title.toLowerCase().includes(q) ||
				// sqlite 后端全文命中（chat_history_search）
				ftsMatchedIds?.has(s.id) ||
				// 内存兜底：已加载会话的消息全文（含尚未落库的流式内容）
				s.messages.some((m) => m.content.toLowerCase().includes(q)) ||
				// sqlite 后端：未加载全文时匹配 DB 派生的末条消息预览
				(s.lastPreview?.content ?? "")
					.toLowerCase()
					.includes(q) ||
				(s.lastUserPreview ?? "").toLowerCase().includes(q),
		);
	}

	return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
}

// ==================
// 虚拟化行模型：分组拍平成一维 rows
// ==================

export type ThreadRow =
	| {
			kind: "group-header";
			group: ThreadFolderGroup;
			isCollapsed: boolean;
			groupHasActive: boolean;
			/** 该行是否为所属组的最后一行（用于补组间距） */
			isGroupEnd: boolean;
	  }
	| {
			kind: "session";
			group: ThreadFolderGroup;
			session: ChatSession;
			isGroupEnd: boolean;
	  }
	| {
			kind: "overflow";
			group: ThreadFolderGroup;
			hiddenCount: number;
			expanded: boolean;
			isGroupEnd: boolean;
	  };

export function buildThreadRows(input: {
	groups: ThreadFolderGroup[];
	collapsedGroupKeys: Set<string>;
	expandedGroupKeys: Set<string>;
	activeSessionId: string | null;
	searching: boolean;
}): ThreadRow[] {
	const rows: ThreadRow[] = [];
	for (const group of input.groups) {
		const isCollapsed = input.collapsedGroupKeys.has(group.key);
		const groupHasActive = group.sessions.some(
			(s) => s.id === input.activeSessionId,
		);
		rows.push({
			kind: "group-header",
			group,
			isCollapsed,
			groupHasActive,
			isGroupEnd: isCollapsed,
		});
		if (isCollapsed) continue;

		const isOverflowExpanded = input.expandedGroupKeys.has(group.key);
		const visibleSessions = getVisibleSessionsForGroup({
			sessions: group.sessions,
			activeSessionId: input.activeSessionId || undefined,
			expanded: isOverflowExpanded,
			searching: input.searching,
		});
		const canToggleOverflow =
			!input.searching && group.sessions.length > DEFAULT_VISIBLE_THREAD_COUNT;

		visibleSessions.forEach((session, index) => {
			rows.push({
				kind: "session",
				group,
				session,
				isGroupEnd: !canToggleOverflow && index === visibleSessions.length - 1,
			});
		});
		if (canToggleOverflow) {
			rows.push({
				kind: "overflow",
				group,
				hiddenCount: group.sessions.length - visibleSessions.length,
				expanded: isOverflowExpanded,
				isGroupEnd: true,
			});
		}
	}
	return rows;
}
