import { useCallback, useEffect, useState } from "react";
import type { ChatSession } from "../../../lib/chat/types";

const STORAGE_KEY = "thread_group_overflow_expanded";

export const DEFAULT_VISIBLE_THREAD_COUNT = 6;

function canUseStorage() {
	return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readExpandedGroupKeys(): Set<string> {
	if (!canUseStorage()) return new Set();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return new Set();
		return new Set(
			parsed.filter((item): item is string => typeof item === "string"),
		);
	} catch (error) {
		console.warn("[ThreadsView] 读取组内展开状态失败:", error);
		return new Set();
	}
}

function writeExpandedGroupKeys(keys: Set<string>) {
	if (!canUseStorage()) return;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(keys)));
	} catch (error) {
		console.warn("[ThreadsView] 保存组内展开状态失败:", error);
	}
}

export function useThreadGroupVisibility() {
	const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(() =>
		readExpandedGroupKeys(),
	);

	useEffect(() => {
		writeExpandedGroupKeys(expandedGroupKeys);
	}, [expandedGroupKeys]);

	const toggleExpandedGroup = useCallback((groupKey: string) => {
		setExpandedGroupKeys((prev) => {
			const next = new Set(prev);
			if (next.has(groupKey)) next.delete(groupKey);
			else next.add(groupKey);
			return next;
		});
	}, []);

	return { expandedGroupKeys, toggleExpandedGroup };
}

export function getVisibleSessionsForGroup(input: {
	sessions: ChatSession[];
	activeSessionId?: string;
	expanded: boolean;
	searching: boolean;
}): ChatSession[] {
	const { sessions, activeSessionId, expanded, searching } = input;
	if (
		expanded ||
		searching ||
		sessions.length <= DEFAULT_VISIBLE_THREAD_COUNT
	) {
		return sessions;
	}

	const visibleCount = Math.min(DEFAULT_VISIBLE_THREAD_COUNT, sessions.length);
	const previewSessions = sessions.slice(0, visibleCount);
	if (
		!activeSessionId ||
		previewSessions.some((item) => item.id === activeSessionId)
	) {
		return previewSessions;
	}

	const activeSession = sessions.find((item) => item.id === activeSessionId);
	if (!activeSession) return previewSessions;

	const preferredIds = new Set(
		sessions
			.slice(0, Math.max(visibleCount - 1, 0))
			.map((session) => session.id),
	);
	preferredIds.add(activeSession.id);

	const nextSessions: ChatSession[] = [];
	for (const session of sessions) {
		if (!preferredIds.has(session.id)) continue;
		nextSessions.push(session);
		if (nextSessions.length >= visibleCount) break;
	}
	return nextSessions;
}
