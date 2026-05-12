type QueryControl = {
	interrupt?: () => Promise<void>;
	setPermissionMode?: (mode: string) => Promise<void>;
	setModel?: (model?: string) => Promise<void>;
	mcpServerStatus?: () => Promise<unknown>;
	reconnectMcpServer?: (serverName: string) => Promise<void>;
	toggleMcpServer?: (serverName: string, enabled: boolean) => Promise<void>;
	setMcpServers?: (servers: Record<string, unknown>) => Promise<unknown>;
	/** SDK 0.2.139+：停止 `/goal` 或 Task 工作流。 */
	stopTask?: (taskId: string) => Promise<void>;
};

export interface PushController {
	push: (msg: unknown) => void;
	close: () => void;
	readonly closed: boolean;
}

export type AgentSdkRunState = {
	abortController: AbortController;
	query?: QueryControl;
	completedAt?: number;
	pushController?: PushController;
	alive?: boolean;
};

const MAX_REGISTRY_SIZE = 100;
const CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes
const ALIVE_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes for alive runs

export class AgentSdkRunRegistry {
	private runs = new Map<string, AgentSdkRunState>();
	private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

	set(runId: string, state: AgentSdkRunState) {
		// 如果达到上限，清理最早完成的运行
		if (this.runs.size >= MAX_REGISTRY_SIZE) {
			this.evictOldest();
		}
		this.runs.set(runId, state);
	}

	get(runId: string): AgentSdkRunState | undefined {
		return this.runs.get(runId);
	}

	updateQuery(runId: string, query: QueryControl) {
		const current = this.runs.get(runId);
		if (!current) return;
		this.runs.set(runId, { ...current, query });
	}

	markAlive(runId: string, pushController: PushController) {
		const current = this.runs.get(runId);
		if (!current) return;
		this.runs.set(runId, { ...current, alive: true, pushController });
		this.resetIdleTimer(runId);
	}

	isAlive(runId: string): boolean {
		const run = this.runs.get(runId);
		return !!run?.alive && !run.abortController.signal.aborted;
	}

	delete(runId: string) {
		const run = this.runs.get(runId);
		if (run?.pushController && !run.pushController.closed) {
			run.pushController.close();
		}
		this.runs.delete(runId);
		const timer = this.cleanupTimers.get(runId);
		if (timer) {
			clearTimeout(timer);
			this.cleanupTimers.delete(runId);
		}
	}

	/** 标记运行完成，启动延迟清理 */
	markCompleted(runId: string) {
		const current = this.runs.get(runId);
		if (!current) return;
		if (current.alive) {
			// alive run 完成一轮后不清理，重置 idle timer
			this.resetIdleTimer(runId);
			return;
		}
		this.runs.set(runId, { ...current, completedAt: Date.now() });
		this.cleanupTimers.set(
			runId,
			setTimeout(() => {
				this.runs.delete(runId);
				this.cleanupTimers.delete(runId);
			}, CLEANUP_DELAY_MS),
		);
	}

	/** 终止 alive run 并标记为已完成 */
	terminateAlive(runId: string) {
		const current = this.runs.get(runId);
		if (!current) return;
		if (current.pushController && !current.pushController.closed) {
			current.pushController.close();
		}
		this.runs.set(runId, {
			...current,
			alive: false,
			completedAt: Date.now(),
		});
		this.cleanupTimers.set(
			runId,
			setTimeout(() => {
				this.runs.delete(runId);
				this.cleanupTimers.delete(runId);
			}, CLEANUP_DELAY_MS),
		);
	}

	private resetIdleTimer(runId: string) {
		const existing = this.cleanupTimers.get(runId);
		if (existing) clearTimeout(existing);
		this.cleanupTimers.set(
			runId,
			setTimeout(() => {
				this.terminateAlive(runId);
			}, ALIVE_IDLE_TIMEOUT_MS),
		);
	}

	private evictOldest() {
		let oldestId: string | null = null;
		let oldestTime = Number.POSITIVE_INFINITY;

		for (const [id, state] of this.runs) {
			if (state.completedAt && state.completedAt < oldestTime) {
				oldestTime = state.completedAt;
				oldestId = id;
			}
		}

		if (oldestId) {
			this.delete(oldestId);
		} else {
			// 没有已完成的可清理，删除第一个条目
			const firstKey = this.runs.keys().next().value;
			if (firstKey) this.delete(firstKey);
		}
	}
}

export const runRegistry = new AgentSdkRunRegistry();
