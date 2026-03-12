/**
 * 编程线程 Store
 * 管理多个 CodingThread 的 CRUD、持久化（localStorage）、当前活跃线程切换
 */

import { useSyncExternalStore } from 'react';
import type { CodingThread, CodingThreadPersist } from './codingThreadTypes';
import type { CodingBackend, CodingMode } from './codingAgentStore';
import type { RecentCodingProject } from './codingWorkspaceStore';
import type {
	BackendCapabilityMatrix,
	CodingApprovalMode,
} from '../../../electron/shared/coding-workspace';

// === Constants ===

const STORAGE_KEY = 'ipo-coding-threads';

// === State ===

interface CodingThreadState {
	/** 所有线程 */
	threads: CodingThread[];
	/** 当前活跃线程 ID */
	activeThreadId: string | null;
}

export interface CodingProjectThreadGroup {
	projectPath: string;
	projectName: string;
	threads: CodingThread[];
	hasThreads: boolean;
	lastActivityAt: number;
}

type CodingThreadUpdates = Partial<
	Pick<
		CodingThread,
		| 'title'
		| 'codingMode'
		| 'backend'
		| 'providerId'
		| 'model'
		| 'approvalMode'
		| 'workspaceProfileId'
		| 'capabilitiesSnapshot'
		| 'status'
		| 'sdkSessionId'
		| 'runtimeSessionId'
		| 'lastRunAt'
		| 'lastRunStatus'
		| 'lastRunSummary'
		| 'diffStats'
	>
>;

// === Helpers ===

function genThreadId(): string {
	return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractProjectName(projectPath: string): string {
	return projectPath.split('/').pop() || projectPath;
}

function getDefaultModel(backend: CodingBackend): string {
	return backend === 'codex' ? 'gpt-5-codex' : 'claude-sonnet-4-6';
}

function getDefaultApprovalMode(backend: CodingBackend): CodingApprovalMode {
	return backend === 'codex' ? 'on-request' : 'acceptEdits';
}

function normalizeThread(thread: CodingThreadPersist): CodingThread {
	const backend = thread.backend ?? 'claude-code';
	return {
		...thread,
		backend,
		model: thread.model ?? getDefaultModel(backend),
		approvalMode: thread.approvalMode ?? getDefaultApprovalMode(backend),
		status: 'idle',
		diffStats: thread.diffStats ?? { additions: 0, deletions: 0 },
	};
}

function loadThreads(): CodingThread[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const persisted: CodingThreadPersist[] = JSON.parse(raw);
		// 恢复时状态统一为 idle
		return persisted.map(normalizeThread);
	} catch {
		return [];
	}
}

function persistThreads(threads: CodingThread[]) {
	try {
		// 只持久化元数据，不存 status
		const data: CodingThreadPersist[] = threads.map(({ status: _status, ...rest }) => rest);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	} catch {
		// ignore
	}
}

// === Store ===

class CodingThreadStore {
	private state: CodingThreadState = {
		threads: loadThreads(),
		activeThreadId: null,
	};

	private listeners = new Set<() => void>();

	getState = (): CodingThreadState => this.state;

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private emit() {
		for (const listener of this.listeners) listener();
	}

	// === 查询方法 ===

	/** 获取当前活跃线程 */
	getActiveThread(): CodingThread | null {
		if (!this.state.activeThreadId) return null;
		return this.state.threads.find((t) => t.id === this.state.activeThreadId) ?? null;
	}

	/** 按 ID 获取线程 */
	getThread(threadId: string): CodingThread | null {
		return this.state.threads.find((t) => t.id === threadId) ?? null;
	}

	// === 创建线程 ===

	createThread(
		projectPath: string,
		options?: {
			backend?: CodingBackend;
			codingMode?: CodingMode;
			title?: string;
			model?: string;
			approvalMode?: CodingApprovalMode;
			workspaceProfileId?: string;
			capabilitiesSnapshot?: BackendCapabilityMatrix;
		},
	): CodingThread {
		const now = Date.now();
		const projectName = extractProjectName(projectPath);
		const backend = options?.backend || 'claude-code';
		const thread: CodingThread = {
			id: genThreadId(),
			title: options?.title || projectName,
			projectPath,
			projectName,
			createdAt: now,
			updatedAt: now,
			backend,
			model: options?.model || getDefaultModel(backend),
			approvalMode: options?.approvalMode || getDefaultApprovalMode(backend),
			workspaceProfileId: options?.workspaceProfileId,
			capabilitiesSnapshot: options?.capabilitiesSnapshot,
			codingMode: options?.codingMode || 'code',
			status: 'idle',
			diffStats: { additions: 0, deletions: 0 },
		};

		this.state = {
			...this.state,
			threads: [thread, ...this.state.threads],
			activeThreadId: thread.id,
		};

		persistThreads(this.state.threads);
		this.emit();
		return thread;
	}

	// === 切换线程 ===

	switchThread(threadId: string) {
		if (this.state.activeThreadId === threadId) return;
		const exists = this.state.threads.find((t) => t.id === threadId);
		if (!exists) return;

		this.state = {
			...this.state,
			activeThreadId: threadId,
		};
		this.emit();
	}

	// === 更新线程 ===

	updateThread(threadId: string, updates: CodingThreadUpdates) {
		this.state = {
			...this.state,
			threads: this.state.threads.map((t) =>
				t.id === threadId
					? {
							...t,
							...updates,
							diffStats: updates.diffStats ?? t.diffStats ?? { additions: 0, deletions: 0 },
							updatedAt: Date.now(),
						}
					: t,
			),
		};
		persistThreads(this.state.threads);
		this.emit();
	}

	// === 删除线程 ===

	deleteThread(threadId: string) {
		const wasActive = this.state.activeThreadId === threadId;
		const remaining = this.state.threads.filter((t) => t.id !== threadId);

		this.state = {
			...this.state,
			threads: remaining,
			activeThreadId: wasActive
				? (remaining[0]?.id ?? null)
				: this.state.activeThreadId,
		};

		persistThreads(this.state.threads);
		this.emit();
	}

	// === 取消激活 ===

	deactivateThread() {
		this.state = {
			...this.state,
			activeThreadId: null,
		};
		this.emit();
	}

	// === 辅助：获取按更新时间排序的线程 ===

	getSortedThreads(): CodingThread[] {
		return [...this.state.threads].sort((a, b) => b.updatedAt - a.updatedAt);
	}

	getProjectGroups(
		recentProjects: RecentCodingProject[],
		searchQuery = '',
	): CodingProjectThreadGroup[] {
		const query = searchQuery.trim().toLowerCase();
		const groups = new Map<
			string,
			{
				projectPath: string;
				projectName: string;
				recentLastOpenedAt: number;
				threads: CodingThread[];
			}
		>();

		for (const project of recentProjects) {
			groups.set(project.path, {
				projectPath: project.path,
				projectName: project.name,
				recentLastOpenedAt: project.lastOpenedAt,
				threads: [],
			});
		}

		for (const thread of this.state.threads) {
			const existing = groups.get(thread.projectPath);
			if (existing) {
				existing.threads.push(thread);
				existing.projectName = existing.projectName || thread.projectName;
				continue;
			}

			groups.set(thread.projectPath, {
				projectPath: thread.projectPath,
				projectName: thread.projectName,
				recentLastOpenedAt: 0,
				threads: [thread],
			});
		}

		return Array.from(groups.values())
			.map((group) => {
				const threads = [...group.threads].sort((a, b) => b.updatedAt - a.updatedAt);
				const projectMatched =
					query.length === 0 ||
					group.projectName.toLowerCase().includes(query) ||
					group.projectPath.toLowerCase().includes(query);
				const visibleThreads = projectMatched || query.length === 0
					? threads
					: threads.filter((thread) => thread.title.toLowerCase().includes(query));
				if (!projectMatched && visibleThreads.length === 0) {
					return null;
				}

				return {
					projectPath: group.projectPath,
					projectName: group.projectName,
					threads: visibleThreads,
					hasThreads: group.threads.length > 0,
					lastActivityAt: visibleThreads[0]?.updatedAt
						?? threads[0]?.updatedAt
						?? group.recentLastOpenedAt,
				} satisfies CodingProjectThreadGroup;
			})
			.filter((group): group is CodingProjectThreadGroup => group !== null)
			.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
	}
}

export const codingThreadStore = new CodingThreadStore();

// === React Hooks ===

export function useCodingThreadSelector<T>(
	selector: (state: CodingThreadState) => T,
): T {
	return useSyncExternalStore(
		codingThreadStore.subscribe,
		() => selector(codingThreadStore.getState()),
		() => selector(codingThreadStore.getState()),
	);
}
