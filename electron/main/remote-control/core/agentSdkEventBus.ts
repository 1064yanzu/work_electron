export type AgentSdkBusEvent = {
	runId: string;
	type: string;
	message?: unknown;
	result?: unknown;
	error?: string;
	events?: unknown;
	request?: {
		requestId: string;
		toolName: string;
		toolInput: Record<string, unknown>;
		expiresAt: number;
	};
};

type Listener = (event: AgentSdkBusEvent) => void;

const listeners = new Set<Listener>();

export function publishAgentSdkBusEvent(event: AgentSdkBusEvent): void {
	for (const listener of listeners) {
		try {
			listener(event);
		} catch {
			// ignore listener errors
		}
	}
}

export function subscribeAgentSdkBusEvent(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
