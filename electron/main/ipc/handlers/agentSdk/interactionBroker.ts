export type InteractionDecision =
	| {
			behavior: "allow";
			updatedInput?: Record<string, unknown>;
			updatedPermissions?: unknown[];
	  }
	| {
			behavior: "deny";
			message?: string;
			updatedInput?: Record<string, unknown>;
			updatedPermissions?: unknown[];
			interrupt?: boolean;
	  };

type PendingInteraction = {
	resolve: (decision: InteractionDecision) => void;
	timeoutId: NodeJS.Timeout;
};

export class AgentSdkInteractionBroker {
	private byRun = new Map<string, Map<string, PendingInteraction>>();

	createRequest(
		runId: string,
		requestId: string,
		timeoutMs: number,
	): Promise<InteractionDecision> {
		const runMap =
			this.byRun.get(runId) ?? new Map<string, PendingInteraction>();
		this.byRun.set(runId, runMap);

		return new Promise<InteractionDecision>((resolve) => {
			const timeoutId = setTimeout(
				() => {
					this.resolve(runId, requestId, {
						behavior: "deny",
						message: "Interaction timed out",
					});
				},
				Math.max(1, timeoutMs),
			);

			runMap.set(requestId, {
				resolve,
				timeoutId,
			});
		});
	}

	resolve(
		runId: string,
		requestId: string,
		decision: InteractionDecision,
	): boolean {
		const runMap = this.byRun.get(runId);
		const pending = runMap?.get(requestId);
		if (!pending) return false;
		clearTimeout(pending.timeoutId);
		runMap?.delete(requestId);
		if (runMap && runMap.size === 0) {
			this.byRun.delete(runId);
		}
		pending.resolve(decision);
		return true;
	}

	clearRun(runId: string) {
		const runMap = this.byRun.get(runId);
		if (!runMap) return;
		for (const [requestId, pending] of runMap.entries()) {
			clearTimeout(pending.timeoutId);
			pending.resolve({
				behavior: "deny",
				message: "Run aborted",
			});
			runMap.delete(requestId);
		}
		this.byRun.delete(runId);
	}
}

export const interactionBroker = new AgentSdkInteractionBroker();
