import { safeInvoke } from "../tauriBridge";

/**
 * 渠道通用能力开关（阶段 3 启用，阶段 4 UI 暴露给用户）。
 * 与 electron/main/remote-control/core/types.ts 的 RemoteChannelFeatureConfig 对齐。
 */
export interface RemoteChannelFeatureConfig {
	streaming: {
		/** off: 关闭流式；edit: 通过 editMessage 编辑实现；card: 飞书 CardKit 卡片流式 */
		mode: "off" | "edit" | "card";
	};
	typing: {
		enabled: boolean;
	};
	interactive: {
		enabled: boolean;
	};
	dedupe: {
		persistent: boolean;
	};
	sequential_delivery: boolean;
}

export interface RemoteControlConfig {
	enabled: boolean;
	channels: {
		feishu: {
			enabled: boolean;
			appId?: string;
			appSecret?: string;
			domain: "feishu" | "lark";
			connectionMode: "websocket" | "webhook";
			webhookPath: string;
			webhookPort?: number;
			dmPolicy: "pairing" | "allowlist" | "open";
			allowFrom: string[];
			groupPolicy: "disabled" | "allowlist" | "open";
			groupAllowFrom: string[];
			requireMention: boolean;
			enableAttachmentMerge: boolean;
			attachmentMergeWindowSec: number;
			enableDocLinkPrefetch: boolean;
			enableDocxMcp: boolean;
			enableDocWriteOps: boolean;
			enableDocFileDelete: boolean;
			enableLegacyDocsRead: boolean;
			enableDocCommandFallback: boolean;
			textChunkLimit: number;
			rateLimitPerMinute: number;
			features?: RemoteChannelFeatureConfig;
		};
		telegram: {
			enabled: boolean;
			botToken?: string;
			dmPolicy: "pairing" | "allowlist" | "open";
			allowFrom: string[];
			groupPolicy: "disabled" | "allowlist" | "open";
			groupAllowFrom: string[];
			requireMention: boolean;
			textChunkLimit: number;
			rateLimitPerMinute: number;
			features?: RemoteChannelFeatureConfig;
		};
		slack: {
			enabled: boolean;
			botToken?: string;
			appToken?: string;
			signingSecret?: string;
			dmPolicy: "pairing" | "allowlist" | "open";
			allowFrom: string[];
			groupPolicy: "disabled" | "allowlist" | "open";
			groupAllowFrom: string[];
			requireMention: boolean;
			textChunkLimit: number;
			rateLimitPerMinute: number;
			features?: RemoteChannelFeatureConfig;
		};
		discord: {
			enabled: boolean;
			botToken?: string;
			applicationId?: string;
			dmPolicy: "pairing" | "allowlist" | "open";
			allowFrom: string[];
			groupPolicy: "disabled" | "allowlist" | "open";
			groupAllowFrom: string[];
			requireMention: boolean;
			textChunkLimit: number;
			rateLimitPerMinute: number;
			features?: RemoteChannelFeatureConfig;
		};
		qqbot?: {
			enabled: boolean;
			appId?: string;
			clientSecret?: string;
			environment: "prod" | "sandbox";
			enableGuild: boolean;
			enableGroup: boolean;
			enableC2c: boolean;
			dmPolicy: "pairing" | "allowlist" | "open";
			allowFrom: string[];
			groupPolicy: "disabled" | "allowlist" | "open";
			groupAllowFrom: string[];
			requireMention: boolean;
			textChunkLimit: number;
			rateLimitPerMinute: number;
			features?: RemoteChannelFeatureConfig;
		};
		wechat?: {
			enabled: boolean;
			puppet: "xp" | "padlocal" | "service";
			token?: string;
			endpoint?: string;
			enableDm: boolean;
			enableGroup: boolean;
			allowFrom: string[];
			groupAllowFrom: string[];
			requireMention: boolean;
			textChunkLimit: number;
			rateLimitPerMinute: number;
			features?: RemoteChannelFeatureConfig;
			acknowledgedRisk: boolean;
		};
		generic_webhook: { enabled: boolean; note?: string };
	};
	security: {
		interactionTimeoutSec: number;
		defaultScopes: string[];
	};
	mobileGateway: {
		enabled: boolean;
		port: number;
		host: string;
		requirePairing: boolean;
	};
}

/**
 * 渠道能力矩阵条目（对应 channelCapabilityRegistry）。
 */
export interface RemoteChannelCapabilities {
	text: boolean;
	card: boolean;
	streaming: boolean;
	typing: boolean;
	interactive: boolean;
	editMessage: boolean;
	deleteMessage: boolean;
	reactions: boolean;
	pin: boolean;
	media: boolean;
}

export interface RemoteChannelCapabilityEntry {
	channel: string;
	label: string;
	status: "legacy" | "sdk" | "placeholder";
	capabilities: RemoteChannelCapabilities;
}

export interface RemoteChannelStatus {
	channel_id: string;
	enabled: boolean;
	running: boolean;
	connected: boolean;
	mode?: string;
	last_inbound_at?: number;
	last_outbound_at?: number;
	last_error?: string;
}

export interface RemoteRuntimeStatus {
	enabled: boolean;
	started_at?: number;
	channels: RemoteChannelStatus[];
	active_runs: number;
	pending_pairings: number;
}

export interface RemotePairingRequest {
	request_id: string;
	channel_id: string;
	peer_id: string;
	peer_name?: string;
	code: string;
	requested_at: number;
	expires_at: number;
	status: string;
	reason?: string;
}

export interface RemotePairingRecord {
	pairing_id: string;
	channel_id: string;
	peer_id: string;
	peer_name?: string;
	approved_at: number;
	approved_by: string;
	status: string;
	revoked_at?: number;
	revoked_reason?: string;
}

export interface RemoteSessionInfo {
	session_id: string;
	channel_id: string;
	peer_id: string;
	peer_name?: string;
	target_id: string;
	run_id?: string;
	prompt_preview: string;
	state: string;
	last_message_at: number;
	created_at: number;
	updated_at: number;
	last_error?: string;
}

export interface RemoteEventLog {
	timestamp: number;
	level: "info" | "warn" | "error";
	source: string;
	message: string;
}

export async function getRemoteControlConfig(): Promise<RemoteControlConfig> {
	return await safeInvoke("get_remote_control_config");
}

export async function setRemoteControlConfig(
	config: RemoteControlConfig,
): Promise<{ success: boolean }> {
	return await safeInvoke("set_remote_control_config", { config });
}

export async function getRemoteControlRuntimeStatus(): Promise<RemoteRuntimeStatus> {
	return await safeInvoke("get_remote_control_runtime_status");
}

export async function listRemoteChannels(): Promise<RemoteChannelStatus[]> {
	return await safeInvoke("list_remote_channels");
}

export async function listRemoteChannelCapabilities(): Promise<
	RemoteChannelCapabilityEntry[]
> {
	return await safeInvoke("list_remote_channel_capabilities");
}

export async function listRemotePairings(): Promise<{
	pending_requests: RemotePairingRequest[];
	records: RemotePairingRecord[];
}> {
	return await safeInvoke("list_remote_pairings");
}

export async function approveRemotePairing(
	requestId: string,
	approvedBy?: string,
): Promise<{ success: boolean }> {
	return await safeInvoke("approve_remote_pairing", {
		request_id: requestId,
		approved_by: approvedBy,
	});
}

export async function rejectRemotePairing(
	requestId: string,
	reason?: string,
): Promise<{ success: boolean }> {
	return await safeInvoke("reject_remote_pairing", {
		request_id: requestId,
		reason,
	});
}

export async function revokeRemotePairing(payload: {
	channel_id: string;
	peer_id: string;
	reason?: string;
}): Promise<{ success: boolean }> {
	return await safeInvoke("revoke_remote_pairing", payload);
}

export async function listRemoteSessions(
	limit = 50,
): Promise<RemoteSessionInfo[]> {
	return await safeInvoke("list_remote_sessions", { limit });
}

export async function terminateRemoteSession(
	runId: string,
): Promise<{ success: boolean }> {
	return await safeInvoke("terminate_remote_session", { run_id: runId });
}

export async function testRemoteChannel(
	channelId: string,
): Promise<{ ok: boolean; message: string }> {
	return await safeInvoke("test_remote_channel", { channel_id: channelId });
}

export async function listRemoteEventLogs(
	limit = 50,
): Promise<RemoteEventLog[]> {
	return await safeInvoke("list_remote_event_logs", { limit });
}
