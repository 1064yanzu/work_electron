import type { DbContext } from "../../db/client";
import {
	DEFAULT_PAIRING_EXPIRE_MS,
	REMOTE_CONTROL_PAIRINGS_KEY,
} from "../core/defaults";
import type {
	RemoteChannelId,
	RemotePairingRecord,
	RemotePairingRequest,
} from "../core/types";
import { nowTs, parseJsonSafely } from "../core/utils";

type PairingPersistedState = {
	pending_requests: RemotePairingRequest[];
	records: RemotePairingRecord[];
};

const EMPTY_STATE: PairingPersistedState = {
	pending_requests: [],
	records: [],
};

function parseState(raw: unknown): PairingPersistedState {
	if (!raw || typeof raw !== "object") return EMPTY_STATE;
	const input = raw as Record<string, unknown>;
	const pending = Array.isArray(input.pending_requests)
		? input.pending_requests.filter(
				(v): v is RemotePairingRequest => !!v && typeof v === "object",
			)
		: [];
	const records = Array.isArray(input.records)
		? input.records.filter(
				(v): v is RemotePairingRecord => !!v && typeof v === "object",
			)
		: [];
	return {
		pending_requests: pending,
		records,
	};
}

export class RemotePairingStore {
	constructor(private readonly db: DbContext) {}

	private async loadState(): Promise<PairingPersistedState> {
		const row = await this.db.client.execute({
			sql: "SELECT value FROM app_config WHERE key = ?",
			args: [REMOTE_CONTROL_PAIRINGS_KEY],
		});
		const value = row.rows[0]?.value;
		const parsed = parseJsonSafely<unknown>(
			typeof value === "string" ? value : null,
		);
		const state = parseState(parsed);
		const ts = nowTs();
		const pending = state.pending_requests.filter(
			(item) => item.expires_at > ts,
		);
		if (pending.length !== state.pending_requests.length) {
			await this.saveState({ ...state, pending_requests: pending });
			return { ...state, pending_requests: pending };
		}
		return state;
	}

	private async saveState(state: PairingPersistedState): Promise<void> {
		await this.db.client.execute({
			sql: `INSERT INTO app_config (key, value, updated_at) VALUES (?, ?, ?)\n      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
			args: [REMOTE_CONTROL_PAIRINGS_KEY, JSON.stringify(state), Date.now()],
		});
	}

	async listPending(): Promise<RemotePairingRequest[]> {
		const state = await this.loadState();
		return state.pending_requests.sort(
			(a, b) => b.requested_at - a.requested_at,
		);
	}

	async listRecords(): Promise<RemotePairingRecord[]> {
		const state = await this.loadState();
		return state.records.sort((a, b) => b.approved_at - a.approved_at);
	}

	async findApproved(
		channelId: RemoteChannelId,
		peerId: string,
	): Promise<RemotePairingRecord | null> {
		const state = await this.loadState();
		return (
			state.records.find(
				(item) =>
					item.channel_id === channelId &&
					item.peer_id === peerId &&
					item.status === "approved",
			) ?? null
		);
	}

	async createPending(input: {
		request_id: string;
		channel_id: RemoteChannelId;
		peer_id: string;
		peer_name?: string;
		code: string;
		expiresInMs?: number;
	}): Promise<RemotePairingRequest> {
		const state = await this.loadState();
		const ts = nowTs();
		const expiresAt = ts + (input.expiresInMs ?? DEFAULT_PAIRING_EXPIRE_MS);
		const request: RemotePairingRequest = {
			request_id: input.request_id,
			channel_id: input.channel_id,
			peer_id: input.peer_id,
			peer_name: input.peer_name,
			code: input.code,
			requested_at: ts,
			expires_at: expiresAt,
			status: "pending",
		};
		const pendingRequests = state.pending_requests.filter(
			(item) =>
				!(
					item.channel_id === request.channel_id &&
					item.peer_id === request.peer_id &&
					item.status === "pending"
				),
		);
		pendingRequests.push(request);
		await this.saveState({ ...state, pending_requests: pendingRequests });
		return request;
	}

	async approve(input: {
		request_id: string;
		approved_by: string;
	}): Promise<RemotePairingRecord | null> {
		const state = await this.loadState();
		const target = state.pending_requests.find(
			(item) => item.request_id === input.request_id,
		);
		if (!target || target.status !== "pending") return null;
		target.status = "approved";
		const record: RemotePairingRecord = {
			pairing_id: `${target.channel_id}:${target.peer_id}`,
			channel_id: target.channel_id,
			peer_id: target.peer_id,
			peer_name: target.peer_name,
			approved_at: nowTs(),
			approved_by: input.approved_by,
			status: "approved",
		};
		const records = state.records.filter(
			(item) =>
				!(
					item.channel_id === record.channel_id &&
					item.peer_id === record.peer_id
				),
		);
		records.push(record);
		const pendingRequests = state.pending_requests.filter(
			(item) => item.request_id !== input.request_id,
		);
		await this.saveState({
			pending_requests: pendingRequests,
			records,
		});
		return record;
	}

	async reject(input: {
		request_id: string;
		reason?: string;
	}): Promise<boolean> {
		const state = await this.loadState();
		const target = state.pending_requests.find(
			(item) => item.request_id === input.request_id,
		);
		if (!target || target.status !== "pending") return false;
		target.status = "rejected";
		target.reason = input.reason;
		const pendingRequests = state.pending_requests.filter(
			(item) => item.request_id !== input.request_id,
		);
		await this.saveState({
			...state,
			pending_requests: pendingRequests,
		});
		return true;
	}

	async revoke(input: {
		channel_id: RemoteChannelId;
		peer_id: string;
		reason?: string;
	}): Promise<boolean> {
		const state = await this.loadState();
		const records = state.records.map((item) => {
			if (
				item.channel_id === input.channel_id &&
				item.peer_id === input.peer_id &&
				item.status === "approved"
			) {
				return {
					...item,
					status: "revoked" as const,
					revoked_at: nowTs(),
					revoked_reason: input.reason,
				};
			}
			return item;
		});
		const changed = records.some(
			(item) =>
				item.channel_id === input.channel_id &&
				item.peer_id === input.peer_id &&
				item.status === "revoked",
		);
		if (!changed) return false;
		await this.saveState({ ...state, records });
		return true;
	}
}
