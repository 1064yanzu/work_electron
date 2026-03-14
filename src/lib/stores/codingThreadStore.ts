/**
 * 编程线程 Store
 * 管理多个 CodingThread 的 CRUD、持久化（localStorage）、当前活跃线程切换
 */

import { useCallback, useRef, useSyncExternalStore } from "react";
import type {
	CodingThread,
	CodingThreadPersist,
	CodingThreadSource,
} from "./codingThreadTypes";
import type { CodingBackend, CodingMode } from "./codingAgentStore";
import type { RecentCodingProject } from "./codingWorkspaceStore";
import type {
	BackendCapabilityMatrix,
	CodingApprovalMode,
} from "../../../electron/shared/coding-workspace";
import type { ExternalThreadMeta } from "../../../electron/shared/external-history-types";
import { DEFAULT_AI_CODING_SETTINGS } from "../coding/codingSettings";
import { normalizePath, findMatchingPathKey } from "../coding/pathUtils";

// === Constants ===

const STORAGE_KEY = "ipo-coding-threads";

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
	/** 尚未导入的外部 CLI 历史线程 */
	externalThreads: ExternalThreadMeta[];
	hasThreads: boolean;
	lastActivityAt: number;
}

type CodingThreadUpdates = Partial<
	Pick<
		CodingThread,
		| "title"
		| "codingMode"
		| "backend"
		| "providerId"
		| "model"
		| "approvalMode"
		| "workspaceProfileId"
		| "capabilitiesSnapshot"
		| "status"
		| "sdkSessionId"
		| "runtimeSessionId"
		| "lastRunAt"
		| "lastRunStatus"
		| "lastRunSummary"
		| "diffStats"
		| "source"
		| "externalThreadId"
	>
>;

// === Helpers ===

function genThreadId(): string {
	return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractProjectName(projectPath: string): string {
	return projectPath.split("/").pop() || projectPath;
}

function getDefaultModel(backend: CodingBackend): string {
	return backend === "codex"
		? DEFAULT_AI_CODING_SETTINGS.codexDefaultModel
		: DEFAULT_AI_CODING_SETTINGS.claudeDefaultModel;
}

function getDefaultApprovalMode(backend: CodingBackend): CodingApprovalMode {
	return backend === "codex"
		? DEFAULT_AI_CODING_SETTINGS.codexDefaultApprovalMode
		: DEFAULT_AI_CODING_SETTINGS.claudeDefaultApprovalMode;
}

function normalizeThread(thread: CodingThreadPersist): CodingThread {
	const backend = thread.backend ?? "claude-code";
	return {
		...thread,
		backend,
		model: thread.model ?? getDefaultModel(backend),
		approvalMode: thread.approvalMode ?? getDefaultApprovalMode(backend),
		status: "idle",
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
		const data: CodingThreadPersist[] = threads.map(
			({ status: _status, ...rest }) => rest,
		);
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
		return (
			this.state.threads.find((t) => t.id === this.state.activeThreadId) ?? null
		);
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
			source?: CodingThreadSource;
			externalThreadId?: string;
			forkedFrom?: string;
		},
	): CodingThread {
		const now = Date.now();
		const projectName = extractProjectName(projectPath);
		const backend = options?.backend || "claude-code";
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
			codingMode: options?.codingMode || "code",
			status: "idle",
			diffStats: { additions: 0, deletions: 0 },
			source: options?.source || "local",
			externalThreadId: options?.externalThreadId,
			forkedFrom: options?.forkedFrom,
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
							diffStats: updates.diffStats ??
								t.diffStats ?? { additions: 0, deletions: 0 },
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
		searchQuery = "",
		externalThreads: ExternalThreadMeta[] = [],
		localThreadsOverride?: CodingThread[],
	): CodingProjectThreadGroup[] {
		const query = searchQuery.trim().toLowerCase();
		const localThreads = localThreadsOverride ?? this.state.threads;

		// 已导入的外部线程 ID 集合（用于去重，始终基于全量本地线程）
		const importedExternalKeys = new Set(
			this.state.threads
				.filter((t) => t.externalThreadId && t.source)
				.map((t) => `${t.source}-${t.externalThreadId}`),
		);

		const groups = new Map<
			string,
			{
				projectPath: string;
				projectName: string;
				recentLastOpenedAt: number;
				threads: CodingThread[];
				externalThreads: ExternalThreadMeta[];
			}
		>();

		for (const project of recentProjects) {
			groups.set(project.path, {
				projectPath: project.path,
				projectName: project.name,
				recentLastOpenedAt: project.lastOpenedAt,
				threads: [],
				externalThreads: [],
			});
		}

		for (const thread of localThreads) {
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
				externalThreads: [],
			});
		}

		// 合并外部 CLI 历史到对应的项目分组（跳过已导入的）
		for (const ext of externalThreads) {
			const key = `${ext.source}-${ext.id}`;
			if (importedExternalKeys.has(key)) continue;

			// 使用规范化路径匹配已有分组
			const matchingKey = findMatchingPathKey(groups, ext.cwd);
			if (matchingKey) {
				const existing = groups.get(matchingKey);
				if (existing) {
					existing.externalThreads.push(ext);
				}
			} else {
				groups.set(normalizePath(ext.cwd), {
					projectPath: ext.cwd,
					projectName: ext.projectName || extractProjectName(ext.cwd),
					recentLastOpenedAt: 0,
					threads: [],
					externalThreads: [ext],
				});
			}
		}

		return Array.from(groups.values())
			.map((group) => {
				const threads = [...group.threads].sort(
					(a, b) => b.updatedAt - a.updatedAt,
				);
				const extThreads = [...group.externalThreads].sort(
					(a, b) => b.updatedAt - a.updatedAt,
				);
				const projectMatched =
					query.length === 0 ||
					group.projectName.toLowerCase().includes(query) ||
					group.projectPath.toLowerCase().includes(query);
				const visibleThreads =
					projectMatched || query.length === 0
						? threads
						: threads.filter((thread) =>
								thread.title.toLowerCase().includes(query),
							);
				const visibleExternal =
					projectMatched || query.length === 0
						? extThreads
						: extThreads.filter((ext) =>
								ext.title.toLowerCase().includes(query),
							);

				if (
					!projectMatched &&
					visibleThreads.length === 0 &&
					visibleExternal.length === 0
				) {
					return null;
				}

				const latestLocalAt =
					visibleThreads[0]?.updatedAt ?? threads[0]?.updatedAt ?? 0;
				const latestExternalAt = visibleExternal[0]?.updatedAt ?? 0;

				return {
					projectPath: group.projectPath,
					projectName: group.projectName,
					threads: visibleThreads,
					externalThreads: visibleExternal,
					hasThreads:
						group.threads.length > 0 || group.externalThreads.length > 0,
					lastActivityAt: Math.max(
						latestLocalAt,
						latestExternalAt,
						group.recentLastOpenedAt,
					),
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
	const selectorRef = useRef(selector);
	const lastStateRef = useRef<CodingThreadState | null>(null);
	const lastSelectedRef = useRef<T | null>(null);
	selectorRef.current = selector;

	const getSnapshot = useCallback(() => {
		const nextState = codingThreadStore.getState();
		if (
			lastStateRef.current === nextState &&
			lastSelectedRef.current !== null
		) {
			return lastSelectedRef.current;
		}

		const nextSelected = selectorRef.current(nextState);
		lastStateRef.current = nextState;
		lastSelectedRef.current = nextSelected;
		return nextSelected;
	}, []);

	return useSyncExternalStore(
		codingThreadStore.subscribe,
		getSnapshot,
		getSnapshot,
	);
}
