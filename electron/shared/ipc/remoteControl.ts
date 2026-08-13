// 本文件由 scripts/split-ipc-schema.mjs 从 electron/shared/ipc-schema.ts 机械拆分而来。
// 域：remoteControl（共 21 条命令）。新增命令请直接改这里，然后跑 `npm run generate:ipc`。

import type {
	CloudNodeRoutingMode,
	RemoteChannelFeatureConfig,
	RemoteChannelId,
	RemoteGatewayScope,
	RemotePairingRecordStatus,
	RemotePairingStatus,
	RemoteQqbotIpc,
	RemoteSessionState,
	RemoteTerminalIpc,
	RemoteTerminalSessionIpc,
	RemoteWechatIpc,
} from "./common";

export interface RemoteControlIpcSchema {
	get_remote_control_config: {
		input: Record<string, never>;
		output: {
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
				qqbot: RemoteQqbotIpc;
				wechat: RemoteWechatIpc;
				generic_webhook: { enabled: boolean; note?: string };
			};
			security: {
				interactionTimeoutSec: number;
				defaultScopes: RemoteGatewayScope[];
			};
			mobileGateway: {
				enabled: boolean;
				port: number;
				host: string;
				requirePairing: boolean;
			};
			terminal: RemoteTerminalIpc;
		};
	};
	set_remote_control_config: {
		input: {
			config: {
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
					qqbot: RemoteQqbotIpc;
					wechat: RemoteWechatIpc;
					generic_webhook: { enabled: boolean; note?: string };
				};
				security: {
					interactionTimeoutSec: number;
					defaultScopes: RemoteGatewayScope[];
				};
				mobileGateway: {
					enabled: boolean;
					port: number;
					host: string;
					requirePairing: boolean;
				};
				terminal: RemoteTerminalIpc;
			};
		};
		output: { success: boolean };
	};
	get_remote_control_runtime_status: {
		input: Record<string, never>;
		output: {
			enabled: boolean;
			started_at?: number;
			channels: Array<{
				channel_id: RemoteChannelId;
				enabled: boolean;
				running: boolean;
				connected: boolean;
				mode?: string;
				last_inbound_at?: number;
				last_outbound_at?: number;
				last_error?: string;
			}>;
			active_runs: number;
			pending_pairings: number;
		};
	};
	list_remote_channels: {
		input: Record<string, never>;
		output: Array<{
			channel_id: RemoteChannelId;
			enabled: boolean;
			running: boolean;
			connected: boolean;
			mode?: string;
			last_inbound_at?: number;
			last_outbound_at?: number;
			last_error?: string;
		}>;
	};
	list_remote_channel_capabilities: {
		input: Record<string, never>;
		output: Array<{
			channel: RemoteChannelId;
			label: string;
			status: "legacy" | "sdk" | "placeholder";
			capabilities: {
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
			};
		}>;
	};
	list_remote_pairings: {
		input: Record<string, never>;
		output: {
			pending_requests: Array<{
				request_id: string;
				channel_id: RemoteChannelId;
				peer_id: string;
				peer_name?: string;
				code: string;
				requested_at: number;
				expires_at: number;
				status: RemotePairingStatus;
				reason?: string;
			}>;
			records: Array<{
				pairing_id: string;
				channel_id: RemoteChannelId;
				peer_id: string;
				peer_name?: string;
				approved_at: number;
				approved_by: string;
				status: RemotePairingRecordStatus;
				revoked_at?: number;
				revoked_reason?: string;
			}>;
		};
	};
	approve_remote_pairing: {
		input: { request_id: string; approved_by?: string };
		output: { success: boolean };
	};
	reject_remote_pairing: {
		input: { request_id: string; reason?: string };
		output: { success: boolean };
	};
	revoke_remote_pairing: {
		input: { channel_id: RemoteChannelId; peer_id: string; reason?: string };
		output: { success: boolean };
	};
	list_remote_sessions: {
		input: { limit?: number };
		output: Array<{
			session_id: string;
			channel_id: RemoteChannelId;
			peer_id: string;
			peer_name?: string;
			target_id: string;
			run_id?: string;
			prompt_preview: string;
			state: RemoteSessionState;
			last_message_at: number;
			created_at: number;
			updated_at: number;
			last_error?: string;
		}>;
	};
	terminate_remote_session: {
		input: { run_id: string };
		output: { success: boolean };
	};
	remote_terminal_list_sessions: {
		input: Record<string, never>;
		output: { sessions: RemoteTerminalSessionIpc[] };
	};
	remote_terminal_terminate_session: {
		input: { session_id: string };
		output: { success: boolean };
	};
	test_remote_channel: {
		input: { channel_id: RemoteChannelId };
		output: { ok: boolean; message: string };
	};
	list_remote_event_logs: {
		input: { limit?: number };
		output: Array<{
			timestamp: number;
			level: "info" | "warn" | "error";
			source: string;
			message: string;
		}>;
	};
	feishu_begin_app_registration: {
		input: { domain?: "feishu" | "lark" };
		output: {
			sessionId: string;
			deviceCode: string;
			qrUrl: string;
			qrDataUrl: string;
			userCode: string;
			intervalSec: number;
			expireInSec: number;
		};
	};
	feishu_poll_app_registration: {
		input: {
			deviceCode: string;
			currentDomain: "feishu" | "lark";
			intervalSec: number;
		};
		output:
			| {
					status: "pending";
					domain: "feishu" | "lark";
					intervalSec: number;
			  }
			| {
					status: "success";
					appId: string;
					appSecret: string;
					domain: "feishu" | "lark";
					openId?: string;
			  }
			| { status: "access_denied" }
			| { status: "expired" }
			| { status: "error"; message: string };
	};
	cloud_node_get_status: {
		input: Record<string, never>;
		output: {
			config: {
				enabled: boolean;
				relayUrl: string;
				nodeId?: string;
				nodeToken?: string;
				nodeName: string;
				heartbeatSec: number;
				routingMode: CloudNodeRoutingMode;
			};
			status: {
				enabled: boolean;
				configured: boolean;
				connected: boolean;
				relayUrl: string;
				nodeId?: string;
				nodeName: string;
				heartbeatSec: number;
				routingMode: CloudNodeRoutingMode;
				pendingRuns: number;
				lastConnectedAt?: number;
				lastHeartbeatAt?: number;
				lastError?: string;
			};
		};
	};
	cloud_node_set_config: {
		input: {
			config: {
				enabled: boolean;
				relayUrl: string;
				nodeId?: string;
				nodeToken?: string;
				nodeName: string;
				heartbeatSec: number;
				routingMode: CloudNodeRoutingMode;
			};
		};
		output: { success: boolean };
	};
	cloud_node_bind: {
		input: {
			relay_url: string;
			email: string;
			password: string;
			node_name?: string;
		};
		output: { success: boolean; node_id: string };
	};
	cloud_node_unbind: {
		input: Record<string, never>;
		output: { success: boolean };
	};
}
