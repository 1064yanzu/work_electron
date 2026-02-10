import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";

export type AgentSdkHandlersLike = {
	agent_sdk_start: (
		event: IpcMainInvokeEvent,
		input: IPCSchema["agent_sdk_start"]["input"],
	) => Promise<IPCSchema["agent_sdk_start"]["output"]>;
	agent_sdk_abort: (
		event: IpcMainInvokeEvent,
		input: IPCSchema["agent_sdk_abort"]["input"],
	) => Promise<IPCSchema["agent_sdk_abort"]["output"]>;
	agent_sdk_resolve_interaction: (
		event: IpcMainInvokeEvent,
		input: IPCSchema["agent_sdk_resolve_interaction"]["input"],
	) => Promise<IPCSchema["agent_sdk_resolve_interaction"]["output"]>;
};

export class AgentSdkExecutor {
	private handlers: AgentSdkHandlersLike | null = null;

	bindHandlers(handlers: AgentSdkHandlersLike): void {
		this.handlers = handlers;
	}

	get ready(): boolean {
		return this.handlers !== null;
	}

	async start(input: IPCSchema["agent_sdk_start"]["input"]): Promise<string> {
		if (!this.handlers) {
			throw new Error("Agent SDK handlers not bound");
		}
		return this.handlers.agent_sdk_start({} as IpcMainInvokeEvent, input);
	}

	async abort(runId: string): Promise<boolean> {
		if (!this.handlers) {
			throw new Error("Agent SDK handlers not bound");
		}
		const result = await this.handlers.agent_sdk_abort(
			{} as IpcMainInvokeEvent,
			{
				runId,
			},
		);
		return result.success;
	}

	async resolveInteraction(input: {
		runId: string;
		requestId: string;
		decision: IPCSchema["agent_sdk_resolve_interaction"]["input"]["decision"];
	}): Promise<boolean> {
		if (!this.handlers) {
			throw new Error("Agent SDK handlers not bound");
		}
		const result = await this.handlers.agent_sdk_resolve_interaction(
			{} as IpcMainInvokeEvent,
			input,
		);
		return result.success;
	}
}
