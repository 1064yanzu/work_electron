import { randomUUID } from "node:crypto";
import type {
	RemoteChannelId,
	RemotePairingRecord,
	RemotePairingRequest,
} from "./types";
import { RemotePairingStore } from "../store/pairingStore";

function generateCode(length = 6): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < length; i += 1) {
		code += chars[Math.floor(Math.random() * chars.length)] ?? "X";
	}
	return code;
}

export class PairingService {
	constructor(private readonly store: RemotePairingStore) {}

	async ensurePairing(input: {
		channelId: RemoteChannelId;
		peerId: string;
		peerName?: string;
	}): Promise<
		| { status: "approved"; record: RemotePairingRecord }
		| { status: "pending"; request: RemotePairingRequest }
	> {
		const approved = await this.store.findApproved(
			input.channelId,
			input.peerId,
		);
		if (approved && approved.status === "approved") {
			return { status: "approved", record: approved };
		}
		const request = await this.store.createPending({
			request_id: randomUUID(),
			channel_id: input.channelId,
			peer_id: input.peerId,
			peer_name: input.peerName,
			code: generateCode(),
		});
		return { status: "pending", request };
	}

	async listPending(): Promise<RemotePairingRequest[]> {
		return this.store.listPending();
	}

	async listRecords(): Promise<RemotePairingRecord[]> {
		return this.store.listRecords();
	}

	async approve(
		requestId: string,
		approvedBy: string,
	): Promise<RemotePairingRecord | null> {
		return this.store.approve({
			request_id: requestId,
			approved_by: approvedBy,
		});
	}

	async reject(requestId: string, reason?: string): Promise<boolean> {
		return this.store.reject({ request_id: requestId, reason });
	}

	async revoke(
		channelId: RemoteChannelId,
		peerId: string,
		reason?: string,
	): Promise<boolean> {
		return this.store.revoke({
			channel_id: channelId,
			peer_id: peerId,
			reason,
		});
	}
}
