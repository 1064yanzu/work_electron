type QueryControl = {
	interrupt?: () => Promise<void>;
	setPermissionMode?: (mode: string) => Promise<void>;
	setModel?: (model?: string) => Promise<void>;
	mcpServerStatus?: () => Promise<unknown>;
	reconnectMcpServer?: (serverName: string) => Promise<void>;
	toggleMcpServer?: (serverName: string, enabled: boolean) => Promise<void>;
	setMcpServers?: (servers: Record<string, unknown>) => Promise<unknown>;
};

export type AgentSdkRunState = {
	abortController: AbortController;
	query?: QueryControl;
};

export class AgentSdkRunRegistry {
	private runs = new Map<string, AgentSdkRunState>();

	set(runId: string, state: AgentSdkRunState) {
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

	delete(runId: string) {
		this.runs.delete(runId);
	}
}

export const runRegistry = new AgentSdkRunRegistry();
