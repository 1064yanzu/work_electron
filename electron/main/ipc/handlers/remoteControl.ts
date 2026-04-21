import type { IpcMainInvokeEvent } from "electron";
import type { IPCSchema } from "../../../shared/ipc-schema";
import {
	beginAppRegistration,
	initAppRegistration,
	pollAppRegistrationOnce,
} from "../../remote-control/channels/feishu/appRegistration";
import { getRemoteControlOrchestrator } from "../../remote-control/core/service";
import type {
	RemoteChannelId,
	RemoteControlConfig,
} from "../../remote-control/core/types";
import type { RemoteGatewayScope } from "../../../shared/remote-control-schema";

type Handler<K extends keyof IPCSchema> = (
	event: IpcMainInvokeEvent,
	input: IPCSchema[K]["input"],
) => Promise<IPCSchema[K]["output"]>;

const REMOTE_CHANNEL_IDS: RemoteChannelId[] = [
	"feishu",
	"telegram",
	"slack",
	"discord",
	"qqbot",
	"wechat",
	"generic_webhook",
];

const REMOTE_SCOPES: RemoteGatewayScope[] = [
	"operator.read",
	"operator.write",
	"operator.approvals",
	"operator.pairing",
	"operator.admin",
];

function parseChannelId(raw: string): RemoteChannelId {
	if (REMOTE_CHANNEL_IDS.includes(raw as RemoteChannelId)) {
		return raw as RemoteChannelId;
	}
	throw new Error(`Unsupported remote channel: ${raw}`);
}

function normalizeScopes(scopes: string[]): RemoteGatewayScope[] {
	return scopes.filter((scope): scope is RemoteGatewayScope =>
		REMOTE_SCOPES.includes(scope as RemoteGatewayScope),
	);
}

function toRemoteControlConfig(
	input: IPCSchema["set_remote_control_config"]["input"]["config"],
): RemoteControlConfig {
	return {
		...input,
		security: {
			...input.security,
			defaultScopes: normalizeScopes(input.security.defaultScopes),
		},
	};
}

export function createRemoteControlHandlers() {
	const get_remote_control_config: Handler<
		"get_remote_control_config"
	> = async () => {
		return getRemoteControlOrchestrator().getConfig();
	};

	const set_remote_control_config: Handler<
		"set_remote_control_config"
	> = async (_event, input) => {
		await getRemoteControlOrchestrator().setConfig(
			toRemoteControlConfig(input.config),
		);
		return { success: true };
	};

	const get_remote_control_runtime_status: Handler<
		"get_remote_control_runtime_status"
	> = async () => {
		return getRemoteControlOrchestrator().getRuntimeStatus();
	};

	const list_remote_channels: Handler<"list_remote_channels"> = async () => {
		return getRemoteControlOrchestrator().listChannels();
	};

	const list_remote_channel_capabilities: Handler<
		"list_remote_channel_capabilities"
	> = async () => {
		return getRemoteControlOrchestrator().listChannelCapabilities();
	};

	const list_remote_pairings: Handler<"list_remote_pairings"> = async () => {
		const orchestrator = getRemoteControlOrchestrator();
		const [pendingRequests, records] = await Promise.all([
			orchestrator.listPendingPairings(),
			orchestrator.listPairingRecords(),
		]);
		return {
			pending_requests: pendingRequests,
			records,
		};
	};

	const approve_remote_pairing: Handler<"approve_remote_pairing"> = async (
		_event,
		input,
	) => {
		const approved = await getRemoteControlOrchestrator().approvePairing(
			input.request_id,
			input.approved_by,
		);
		return { success: !!approved };
	};

	const reject_remote_pairing: Handler<"reject_remote_pairing"> = async (
		_event,
		input,
	) => {
		const success = await getRemoteControlOrchestrator().rejectPairing(
			input.request_id,
			input.reason,
		);
		return { success };
	};

	const revoke_remote_pairing: Handler<"revoke_remote_pairing"> = async (
		_event,
		input,
	) => {
		const success = await getRemoteControlOrchestrator().revokePairing(
			parseChannelId(input.channel_id),
			input.peer_id,
			input.reason,
		);
		return { success };
	};

	const list_remote_sessions: Handler<"list_remote_sessions"> = async (
		_event,
		input,
	) => {
		const limit = typeof input.limit === "number" ? input.limit : 50;
		return getRemoteControlOrchestrator().listSessions(limit);
	};

	const terminate_remote_session: Handler<"terminate_remote_session"> = async (
		_event,
		input,
	) => {
		const success = await getRemoteControlOrchestrator().terminateSession(
			input.run_id,
		);
		return { success };
	};

	const test_remote_channel: Handler<"test_remote_channel"> = async (
		_event,
		input,
	) => {
		return getRemoteControlOrchestrator().testChannel(
			parseChannelId(input.channel_id),
		);
	};

	const list_remote_event_logs: Handler<"list_remote_event_logs"> = async (
		_event,
		input,
	) => {
		const limit = typeof input.limit === "number" ? input.limit : 50;
		return getRemoteControlOrchestrator().listEventLogs(limit);
	};

	const feishu_begin_app_registration: Handler<
		"feishu_begin_app_registration"
	> = async (_event, input) => {
		const domain = input.domain ?? "feishu";
		await initAppRegistration(domain);
		return beginAppRegistration(domain);
	};

	const feishu_poll_app_registration: Handler<
		"feishu_poll_app_registration"
	> = async (_event, input) => {
		return pollAppRegistrationOnce({
			deviceCode: input.deviceCode,
			currentDomain: input.currentDomain,
			intervalSec: input.intervalSec,
		});
	};

	return {
		get_remote_control_config,
		set_remote_control_config,
		get_remote_control_runtime_status,
		list_remote_channels,
		list_remote_channel_capabilities,
		list_remote_pairings,
		approve_remote_pairing,
		reject_remote_pairing,
		revoke_remote_pairing,
		list_remote_sessions,
		terminate_remote_session,
		test_remote_channel,
		list_remote_event_logs,
		feishu_begin_app_registration,
		feishu_poll_app_registration,
	};
}
