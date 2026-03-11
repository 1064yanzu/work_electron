import { useSyncExternalStore } from "react";
import { createUseStoreSelector } from "../stores/createStore";

export type AskUserQuestionOption = {
	label: string;
	description: string;
};

export type AskUserQuestionItem = {
	question: string;
	header: string;
	options: AskUserQuestionOption[];
	multiSelect?: boolean;
	id?: string;
};

export type AskUserQuestionRequest = {
	requestId: string;
	runId: string;
	questions: AskUserQuestionItem[];
	expiresAt: number;
};

export type AskUserQuestionDecision =
	| {
			behavior: "allow";
			updatedInput: Record<string, unknown>;
	  }
	| {
			behavior: "deny";
			message: string;
	  };

type PendingRequest = {
	request: AskUserQuestionRequest;
	resolve: (decision: AskUserQuestionDecision) => void;
	timeoutId: ReturnType<typeof setTimeout>;
};

type AskUserQuestionState = {
	pending: Map<string, PendingRequest>;
};

class AskUserQuestionStore {
	private state: AskUserQuestionState = {
		pending: new Map(),
	};
	private listeners = new Set<() => void>();

	private emit() {
		for (const listener of this.listeners) listener();
	}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getState = () => this.state;

	async request(
		input: AskUserQuestionRequest,
	): Promise<AskUserQuestionDecision> {
		return new Promise<AskUserQuestionDecision>((resolve) => {
			const timeoutMs = Math.max(1, input.expiresAt - Date.now());
			const timeoutId = setTimeout(() => {
				this.resolve(input.requestId, {
					behavior: "deny",
					message: "AskUserQuestion timed out",
				});
			}, timeoutMs);

			const pending: PendingRequest = {
				request: input,
				resolve,
				timeoutId,
			};
			this.state = {
				...this.state,
				pending: new Map(this.state.pending).set(input.requestId, pending),
			};
			this.emit();
		});
	}

	resolve(requestId: string, decision: AskUserQuestionDecision) {
		const pending = this.state.pending.get(requestId);
		if (!pending) return;
		clearTimeout(pending.timeoutId);
		const nextPending = new Map(this.state.pending);
		nextPending.delete(requestId);
		this.state = { ...this.state, pending: nextPending };
		this.emit();
		pending.resolve(decision);
	}

	denyAllForRun(runId: string, reason = "Run aborted") {
		for (const [requestId, pending] of this.state.pending.entries()) {
			if (pending.request.runId !== runId) continue;
			this.resolve(requestId, {
				behavior: "deny",
				message: reason,
			});
		}
	}
}

export const askUserQuestionStore = new AskUserQuestionStore();

const useAskUserQuestionSelectorBase =
	createUseStoreSelector(askUserQuestionStore);

export function useAskUserQuestionStore() {
	const state = useSyncExternalStore(
		askUserQuestionStore.subscribe,
		askUserQuestionStore.getState,
		askUserQuestionStore.getState,
	);
	return {
		pending: state.pending,
		resolve: askUserQuestionStore.resolve.bind(askUserQuestionStore),
		denyAllForRun:
			askUserQuestionStore.denyAllForRun.bind(askUserQuestionStore),
	};
}

export function useAskUserQuestionStoreSelector<T>(
	selector: (state: AskUserQuestionState) => T,
): T {
	return useAskUserQuestionSelectorBase(selector);
}
