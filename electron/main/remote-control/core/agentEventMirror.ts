import type { AgentSdkBusEvent } from "./agentSdkEventBus";
import type { RemoteOutboundMessage } from "./types";
import type { RemoteSessionStore } from "../store/sessionStore";
import type { RemoteCommandRouter } from "./commandRouter";
import { clampString, nowTs } from "./utils";

type StreamBuffer = {
	text: string;
	lastFlushAt: number;
};

export type AgentEventMirrorDeps = {
	sessionStore: RemoteSessionStore;
	router: RemoteCommandRouter;
	sendToChannel: (message: RemoteOutboundMessage) => Promise<void>;
};

export class AgentEventMirror {
	private readonly streamBufferByRun = new Map<string, StreamBuffer>();

	constructor(private readonly deps: AgentEventMirrorDeps) {}

	private flushBuffer(runId: string): string {
		const buffer = this.streamBufferByRun.get(runId);
		if (!buffer || !buffer.text) return "";
		const text = buffer.text;
		this.streamBufferByRun.set(runId, {
			text: "",
			lastFlushAt: nowTs(),
		});
		return text;
	}

	private appendBuffer(runId: string, delta: string): string | null {
		const current = this.streamBufferByRun.get(runId) ?? {
			text: "",
			lastFlushAt: nowTs(),
		};
		current.text += delta;
		const shouldFlush =
			current.text.length >= 200 ||
			delta.includes("\n") ||
			nowTs() - current.lastFlushAt >= 1200;
		if (shouldFlush) {
			const text = current.text;
			this.streamBufferByRun.set(runId, {
				text: "",
				lastFlushAt: nowTs(),
			});
			return text;
		}
		this.streamBufferByRun.set(runId, current);
		return null;
	}

	private async sendRunMessage(runId: string, text: string): Promise<void> {
		const session = this.deps.sessionStore.getByRunId(runId);
		if (!session || !text.trim()) return;
		await this.deps.sendToChannel({
			channel_id: session.channel_id,
			target_id: session.target_id,
			text,
		});
		this.deps.sessionStore.update(session.session_id, {
			last_message_at: nowTs(),
		});
	}

	async handle(event: AgentSdkBusEvent): Promise<void> {
		const runId = event.runId;
		if (!runId) return;
		if (event.type === "interaction_request" && event.request) {
			const session = this.deps.sessionStore.getByRunId(runId);
			if (!session) return;
			this.deps.sessionStore.updateStateByRun(runId, "waiting_interaction");
			this.deps.router.bindInteraction({
				run_id: runId,
				request_id: event.request.requestId,
				channel_id: session.channel_id,
				peer_id: session.peer_id,
				created_at: nowTs(),
			});
			await this.sendRunMessage(
				runId,
				[
					"收到交互审批请求：",
					`requestId=${event.request.requestId}`,
					`tool=${event.request.toolName}`,
					"可用命令：",
					`/approve ${event.request.requestId}`,
					`/reject ${event.request.requestId} <reason>`,
				].join("\n"),
			);
			return;
		}

		if (event.type === "transformed" && Array.isArray(event.events)) {
			const deltas: string[] = [];
			for (const item of event.events as Array<Record<string, unknown>>) {
				if (item.type === "text_delta" && typeof item.content === "string") {
					deltas.push(item.content);
				}
				if (item.type === "thought_delta" && typeof item.content === "string") {
					deltas.push(`\n[thinking] ${item.content}`);
				}
			}
			if (deltas.length > 0) {
				this.deps.sessionStore.updateStateByRun(runId, "running");
				for (const delta of deltas) {
					const flushed = this.appendBuffer(runId, delta);
					if (flushed) {
						await this.sendRunMessage(runId, flushed);
					}
				}
			}
			return;
		}

		if (event.type === "done") {
			const tail = this.flushBuffer(runId);
			if (tail) {
				await this.sendRunMessage(runId, tail);
			}
			const resultText =
				typeof (event.result as Record<string, unknown> | undefined)?.result ===
				"string"
					? ((event.result as Record<string, unknown>).result as string)
					: "";
			if (resultText.trim()) {
				await this.sendRunMessage(
					runId,
					`\n[done]\n${clampString(resultText, 2000)}`,
				);
			}
			this.deps.sessionStore.updateStateByRun(runId, "completed");
			this.deps.sessionStore.removeByRunId(runId);
			return;
		}

		if (event.type === "error") {
			const tail = this.flushBuffer(runId);
			if (tail) {
				await this.sendRunMessage(runId, tail);
			}
			const errorText = event.error || "Unknown error";
			await this.sendRunMessage(runId, `\n[error] ${errorText}`);
			this.deps.sessionStore.updateStateByRun(runId, "error", errorText);
			this.deps.sessionStore.removeByRunId(runId);
		}
	}
}
