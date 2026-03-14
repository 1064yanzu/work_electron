/**
 * 外部 CLI 历史同步 Store
 * 管理从 Codex CLI / Claude Code CLI 同步来的历史会话数据
 */
import { useCallback, useRef, useSyncExternalStore } from "react";
import type {
	ExternalThreadMeta,
	ExternalThreadSource,
} from "../../../electron/shared/external-history-types";
import { invoke as desktopInvoke } from "../tauriCompat";
import { pathsEqual } from "../coding/pathUtils";

async function invoke<T>(command: string, args?: Record<string, unknown>) {
	return desktopInvoke<T>(command, args);
}

export interface ExternalHistoryState {
	/** 同步状态 */
	syncStatus: "idle" | "syncing" | "error";
	/** 上次同步时间 */
	lastSyncAt: number | null;
	/** 同步错误信息 */
	syncError: string | null;
	/** Codex CLI 历史线程 */
	codexThreads: ExternalThreadMeta[];
	/** Claude Code CLI 历史线程 */
	claudeCodeThreads: ExternalThreadMeta[];
	/** CLI 后端可用性 */
	availability: { codex: boolean; claudeCode: boolean };
}

type Listener = () => void;

const initialState: ExternalHistoryState = {
	syncStatus: "idle",
	lastSyncAt: null,
	syncError: null,
	codexThreads: [],
	claudeCodeThreads: [],
	availability: { codex: false, claudeCode: false },
};

let state: ExternalHistoryState = { ...initialState };
const listeners = new Set<Listener>();

function notify() {
	for (const fn of listeners) fn();
}

function setState(partial: Partial<ExternalHistoryState>) {
	state = { ...state, ...partial };
	notify();
}

// ==================
// Public API
// ==================

export const externalHistoryStore = {
	getState: () => state,
	subscribe: (listener: Listener) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},

	/** 检查 CLI 后端可用性 */
	async checkAvailability(): Promise<{ codex: boolean; claudeCode: boolean }> {
		try {
			const result = await invoke("cli_history_check_available", {});
			setState({
				availability: result as { codex: boolean; claudeCode: boolean },
			});
			return result as { codex: boolean; claudeCode: boolean };
		} catch {
			return { codex: false, claudeCode: false };
		}
	},

	/** 同步所有 CLI 历史 */
	async syncAll(options?: { cwd?: string; limit?: number }): Promise<void> {
		setState({ syncStatus: "syncing", syncError: null });

		try {
			const params = {
				limit: options?.limit ?? 30,
				cwd: options?.cwd,
			};

			// 并行获取两个后端的历史
			const [codexResult, claudeResult] = await Promise.allSettled([
				invoke("cli_history_codex_list", params),
				invoke("cli_history_claude_code_list", params),
			]);

			const codexThreads =
				codexResult.status === "fulfilled"
					? ((codexResult.value as { threads: ExternalThreadMeta[] }).threads ??
						[])
					: [];

			const claudeCodeThreads =
				claudeResult.status === "fulfilled"
					? ((claudeResult.value as { threads: ExternalThreadMeta[] })
							.threads ?? [])
					: [];

			setState({
				syncStatus: "idle",
				lastSyncAt: Date.now(),
				codexThreads,
				claudeCodeThreads,
				availability: {
					codex:
						codexResult.status === "fulfilled" &&
						(codexResult.value as { available: boolean }).available,
					claudeCode:
						claudeResult.status === "fulfilled" &&
						(claudeResult.value as { available: boolean }).available,
				},
			});
		} catch (err) {
			setState({
				syncStatus: "error",
				syncError: err instanceof Error ? err.message : String(err),
			});
		}
	},

	/** 获取所有外部线程（合并排序） */
	getAllThreads(): ExternalThreadMeta[] {
		const all = [...state.codexThreads, ...state.claudeCodeThreads];
		return all.sort((a, b) => b.updatedAt - a.updatedAt);
	},

	/** 按项目过滤外部线程（使用路径规范化比较） */
	getThreadsByProject(cwd: string): ExternalThreadMeta[] {
		return externalHistoryStore
			.getAllThreads()
			.filter((t) => pathsEqual(t.cwd, cwd));
	},

	/** 按来源过滤外部线程 */
	getThreadsBySource(source: ExternalThreadSource): ExternalThreadMeta[] {
		return source === "codex-cli"
			? state.codexThreads
			: state.claudeCodeThreads;
	},

	/** 清空缓存 */
	clear() {
		setState({ ...initialState });
	},
};

// React hook
export function useExternalHistorySelector<T>(
	selector: (state: ExternalHistoryState) => T,
): T {
	const selectorRef = useRef(selector);
	const lastStateRef = useRef<ExternalHistoryState | null>(null);
	const lastSelectedRef = useRef<T | null>(null);
	selectorRef.current = selector;

	const getSnapshot = useCallback(() => {
		const nextState = externalHistoryStore.getState();
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
		externalHistoryStore.subscribe,
		getSnapshot,
		getSnapshot,
	);
}
