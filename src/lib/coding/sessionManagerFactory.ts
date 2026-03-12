/**
 * Session Manager 工厂
 * 按 threadId 索引管理 Session Manager 实例
 * 每个线程拥有独立的 manager 实例
 */

import type { ICodingSessionManager } from './types';
import { ClaudeCodeSessionManager } from './claudeCodeSessionManager';
import { CodexSessionManager } from './codexSessionManager';
import type { CodingBackend } from '../stores/codingAgentStore';

/** threadId → manager 实例 */
const managers = new Map<string, ICodingSessionManager>();

/** 创建指定后端的 manager */
function createManager(backend: CodingBackend): ICodingSessionManager {
	switch (backend) {
		case 'claude-code':
			return new ClaudeCodeSessionManager();
		case 'codex':
			return new CodexSessionManager();
	}
}

/** 获取或创建指定线程的 Session Manager */
export function getOrCreateSessionManager(
	threadId?: string,
	backend?: CodingBackend,
): ICodingSessionManager {
	// 兼容旧的无 threadId 调用（fallback 到默认 key）
	const key = threadId || '__default__';
	const requestedBackend = backend || 'claude-code';

	const existing = managers.get(key);
	if (existing) {
		// 如果后端类型不匹配，释放旧 manager 重建
		if (backend && existing.backend !== backend) {
			existing.dispose();
			managers.delete(key);
		} else {
			return existing;
		}
	}

	const manager = createManager(requestedBackend);
	managers.set(key, manager);
	return manager;
}

/** 释放指定线程的 manager */
export function disposeSessionManager(threadId?: string): void {
	const key = threadId || '__default__';
	const manager = managers.get(key);
	if (manager) {
		manager.dispose();
		managers.delete(key);
	}
}

/** 释放所有 manager（应用退出时调用） */
export function disposeAll(): void {
	for (const [, manager] of managers) {
		manager.dispose();
	}
	managers.clear();
}

/** 获取当前 manager（不创建） */
export function getCurrentSessionManager(threadId?: string): ICodingSessionManager | null {
	const key = threadId || '__default__';
	return managers.get(key) ?? null;
}
