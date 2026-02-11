import type {
	RemoteChannelId,
	RemoteSession,
	RemoteSessionState,
} from "../core/types";
import { nowTs } from "../core/utils";

export class RemoteSessionStore {
	private readonly byId = new Map<string, RemoteSession>();
	private readonly runToSession = new Map<string, string>();

	create(input: {
		session_id: string;
		channel_id: RemoteChannelId;
		peer_id: string;
		peer_name?: string;
		target_id: string;
		prompt_preview: string;
		run_id?: string;
		agent_session_id?: string;
		task_id?: string;
		sandbox_dir?: string;
	}): RemoteSession {
		const ts = nowTs();
		const session: RemoteSession = {
			session_id: input.session_id,
			channel_id: input.channel_id,
			peer_id: input.peer_id,
			peer_name: input.peer_name,
			target_id: input.target_id,
			run_id: input.run_id,
			agent_session_id: input.agent_session_id,
			task_id: input.task_id,
			sandbox_dir: input.sandbox_dir,
			prompt_preview: input.prompt_preview,
			state: "running",
			last_message_at: ts,
			created_at: ts,
			updated_at: ts,
		};
		this.byId.set(session.session_id, session);
		if (session.run_id) {
			this.runToSession.set(session.run_id, session.session_id);
		}
		return session;
	}

	bindRun(sessionId: string, runId: string): void {
		const session = this.byId.get(sessionId);
		if (!session) return;
		session.run_id = runId;
		session.updated_at = nowTs();
		this.runToSession.set(runId, sessionId);
	}

	updateByRun(runId: string, patch: Partial<RemoteSession>): void {
		const sessionId = this.runToSession.get(runId);
		if (!sessionId) return;
		this.update(sessionId, patch);
	}

	updateStateByRun(
		runId: string,
		state: RemoteSessionState,
		lastError?: string,
	): void {
		const sessionId = this.runToSession.get(runId);
		if (!sessionId) return;
		this.update(sessionId, {
			state,
			last_error: lastError,
			last_message_at: nowTs(),
		});
	}

	update(sessionId: string, patch: Partial<RemoteSession>): void {
		const current = this.byId.get(sessionId);
		if (!current) return;
		const next: RemoteSession = {
			...current,
			...patch,
			updated_at: nowTs(),
		};
		this.byId.set(sessionId, next);
	}

	getByRunId(runId: string): RemoteSession | null {
		const sessionId = this.runToSession.get(runId);
		if (!sessionId) return null;
		return this.byId.get(sessionId) ?? null;
	}

	list(limit = 50): RemoteSession[] {
		return [...this.byId.values()]
			.sort((a, b) => b.updated_at - a.updated_at)
			.slice(0, limit);
	}

	removeByRunId(runId: string): void {
		const sessionId = this.runToSession.get(runId);
		if (!sessionId) return;
		this.runToSession.delete(runId);
		const session = this.byId.get(sessionId);
		if (!session) return;
		session.run_id = undefined;
		session.updated_at = nowTs();
		this.byId.set(sessionId, session);
	}
}
